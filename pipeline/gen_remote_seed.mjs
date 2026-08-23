/**
 * Generates a remote-safe, chunked seed for cook-up-db --remote.
 *
 * Differs from 06_seed_d1.mjs's seed.sql in two load-bearing ways, both
 * required for a remote apply (harmless but unnecessary for --local):
 *
 * 1. Never touches `recipe_i18n`. Remote accumulates machine-translated
 *    (`is_machine=1`) recipe_i18n rows over time via a daily job hitting the
 *    live `/api/translate` endpoint — content that only ever exists in the
 *    remote database and never flows back into this pipeline's inputs.
 *    06_seed_d1.mjs's own seed.sql unconditionally deletes and
 *    English-only-reinserts that table; applied to remote as-is it would
 *    destroy weeks of translation work.
 * 2. `recipes` rows that already exist on remote are UPDATE'd in place (only
 *    cuisine + nutrition columns — the only fields any pipeline stage
 *    actually changes after the initial parse) rather than deleted and
 *    reinserted. Deleting a recipe while recipe_i18n rows still FK-reference
 *    it fails with `SQLITE_CONSTRAINT_FOREIGNKEY` — confirmed the hard way.
 *    Recipe ids are stable Wikibooks pageids, so this is safe as long as the
 *    kept-recipe *set* hasn't changed — which it can (a pipeline fix can
 *    recover previously-dropped pages, as happened the first time this ran
 *    with a corpus expansion in flight). So: this script queries remote's
 *    *current* recipe ids live (via `wrangler d1 execute --remote --json`)
 *    and only UPDATEs ids that already exist there; a kept-locally id that
 *    remote has never seen gets a full INSERT instead, plus a same-language
 *    `recipe_i18n` row (nothing to protect for an id remote never had).
 *    A remote id no longer in the local kept set is deliberately left alone
 *    (not deleted) — it naturally stops appearing in ingredient-based
 *    matches once its `recipe_ingredients` rows are gone (see below), same
 *    outcome as a full delete, without reopening the FK problem for a
 *    two-line edge case.
 *
 * Output is chunked to ~20KB statement-text files (pipeline/out/remote-chunks/),
 * because a remote D1 write on this Windows/wrangler setup has two
 * independent ceilings, neither related to SQL correctness:
 *   - `wrangler d1 execute --remote --file=...` fails every time with
 *     `{"D1_RESET_DO":true}` via Cloudflare's bulk-import path, regardless
 *     of file size (reproduced from a few hundred bytes up to ~2MB).
 *   - `--command="..."` avoids that path, but is subject to the invoking
 *     shell's argv-length limit: `npx wrangler ...` inherits Windows
 *     cmd.exe's ~8KB ceiling; invoking wrangler's own entry point directly
 *     via `node node_modules/wrangler/bin/wrangler.js d1 execute ...`
 *     bypasses that shim and reliably handles up to ~30KB.
 * 20KB leaves comfortable margin under that ~30KB ceiling.
 *
 * Usage:
 *   node pipeline/gen_remote_seed.mjs
 *   for f in pipeline/out/remote-chunks/*.sql; do
 *     node node_modules/wrangler/bin/wrangler.js d1 execute cook-up-db --remote \
 *       --command "$(cat "$f")" || { echo "FAILED at $f"; break; }
 *   done
 * Each chunk is one `--command` call executing multiple `;`-separated
 * statements — confirmed atomic per chunk (a mid-chunk failure rolls the
 * whole chunk back, verified via row counts), so a failure at chunk N leaves
 * chunks 1..N-1 committed and N..last untouched; fix and resume from N.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GENERIC_PAIRS_CLOSED } from './lib/generic_ingredients.mjs';

const OUT_DIR = path.resolve('pipeline/out');
const CHUNK_DIR = path.resolve('pipeline/out/remote-chunks');
const WRANGLER = path.resolve('node_modules/wrangler/bin/wrangler.js');
const ALLERGENS = ['gluten', 'dairy', 'nut', 'peanut', 'egg', 'soy', 'fish', 'shellfish', 'sesame'];
const MAX_CHUNK_BYTES = 20_000;

/** Live read of remote's current recipe ids — argv, not a shell string, so
 *  no quoting/escaping concerns. Read-only; never mutates anything. */
function fetchRemoteRecipeIds() {
	const out = execFileSync(
		process.execPath,
		[WRANGLER, 'd1', 'execute', 'cook-up-db', '--remote', '--command', 'SELECT id FROM recipes', '--json'],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
	);
	const [{ results }] = JSON.parse(out);
	return new Set(results.map((r) => r.id));
}

function esc(v) {
	if (v === null || v === undefined) return 'NULL';
	if (typeof v === 'number') return String(v);
	return `'${String(v).replace(/'/g, "''")}'`;
}

// Splits one logical INSERT into several smaller INSERT statements so no
// single statement (and therefore no single chunk) is forced to exceed the
// byte budget on its own — batchSize is rows-per-statement, tuned per table
// below from the actual row shape, not a single global guess.
function batchInsert(sql, table, columns, rows, batchSize) {
	for (let i = 0; i < rows.length; i += batchSize) {
		const batch = rows.slice(i, i + batchSize);
		const values = batch.map((row) => `(${columns.map((c) => esc(row[c])).join(',')})`).join(',');
		sql.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values};`);
	}
}

async function readJsonl(name) {
	const raw = await readFile(path.join(OUT_DIR, name), 'utf8');
	return raw
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l));
}

async function main() {
	const [recipes, ingredients, recipeIngredients, recipeGrams, recipeDiets, recipeNutrition, ingredientNutrition, ingredientMicros, recipeMicros, recipeImages] =
		await Promise.all([
			readJsonl('recipes.jsonl'),
			readJsonl('ingredients.jsonl'),
			readJsonl('recipe_ingredients.jsonl'),
			readJsonl('recipe_ingredients.grams.jsonl'),
			readJsonl('recipe_diets.jsonl'),
			readJsonl('recipes.nutrition.jsonl'),
			readJsonl('ingredient_nutrition.jsonl'),
			readJsonl('ingredient_micronutrient.jsonl'),
			readJsonl('recipe_micronutrient.jsonl'),
			readJsonl('recipe_images.jsonl')
		]);

	const keptRecipeIds = new Set(recipeIngredients.map((r) => r.recipe_id));
	const keptRecipes = recipes.filter((r) => keptRecipeIds.has(r.id));
	const nutritionById = new Map(recipeNutrition.map((n) => [n.id, n]));
	const imageById = new Map(recipeImages.map((i) => [i.recipe_id, i]));
	const ingredientId = new Map(ingredients.map((ing, i) => [ing.canonical_key, i + 1]));
	// Resolved gram weights, keyed the same way 06_seed_d1.mjs keys them.
	const gramsByRow = new Map(
		recipeGrams.map((g) => [`${g.recipe_id}|${g.canonical_key}`, g.grams])
	);

	console.log('gen_remote_seed: checking remote for existing recipe ids...');
	const remoteRecipeIds = fetchRemoteRecipeIds();
	const existingRecipes = keptRecipes.filter((r) => remoteRecipeIds.has(r.id));
	const newRecipes = keptRecipes.filter((r) => !remoteRecipeIds.has(r.id));
	console.log(
		`gen_remote_seed: ${remoteRecipeIds.size} recipes on remote now; ${existingRecipes.length} will be updated in place, ${newRecipes.length} are new and will be inserted`
	);

	// One flat, ordered statement list — same table order/content as
	// 06_seed_d1.mjs, minus recipe_i18n and recipes' delete+insert (see file
	// header) — chunked purely by byte budget afterward.
	const sql = [];

	sql.push(
		'DELETE FROM recipe_micronutrient;',
		'DELETE FROM recipe_diets;',
		'DELETE FROM recipe_ingredients;',
		// 'DELETE FROM recipe_i18n;' and 'DELETE FROM recipes;' both omitted:
		// recipe_i18n rows (kept, see file header) FK-reference recipes(id), so
		// deleting recipes while they still exist violates the constraint.
		// recipes' id set is unchanged (same Wikibooks pageids, same 70% gate
		// outcome) — updated in place below instead of deleted+reinserted.
		'DELETE FROM ingredient_allergens;',
		// ingredient_generic_of has no remote-only accumulated data (unlike
		// recipe_i18n) — pipeline-computed only, safe to fully delete+reinsert.
		'DELETE FROM ingredient_generic_of;',
		'DELETE FROM ingredient_micronutrient;',
		'DELETE FROM ingredient_nutrition;',
		'DELETE FROM ingredient_i18n;',
		'DELETE FROM ingredients;',
		'DELETE FROM allergens;'
	);

	batchInsert(sql, 'allergens', ['id', 'key'], ALLERGENS.map((key, i) => ({ id: i + 1, key })), 200);

	batchInsert(
		sql,
		'ingredients',
		['id', 'canonical_key', 'category', 'is_staple', 'beneficial', 'recipe_count'],
		ingredients.map((ing) => ({
			id: ingredientId.get(ing.canonical_key),
			canonical_key: ing.canonical_key,
			category: ing.category,
			is_staple: ing.is_staple,
			beneficial: ing.beneficial,
			recipe_count: 0
		})),
		150
	);

	{
		const i18nRows = [];
		for (const ing of ingredients) {
			for (const [lang, name] of Object.entries(ing.names)) {
				i18nRows.push({ ingredient_id: ingredientId.get(ing.canonical_key), lang, name });
			}
		}
		batchInsert(sql, 'ingredient_i18n', ['ingredient_id', 'lang', 'name'], i18nRows, 300);
	}

	{
		const allergenId = new Map(ALLERGENS.map((a, i) => [a, i + 1]));
		const allergenRows = [];
		for (const ing of ingredients) {
			for (const a of ing.allergens) {
				allergenRows.push({ ingredient_id: ingredientId.get(ing.canonical_key), allergen_id: allergenId.get(a) });
			}
		}
		batchInsert(sql, 'ingredient_allergens', ['ingredient_id', 'allergen_id'], allergenRows, 400);
	}

	{
		const genericRows = GENERIC_PAIRS_CLOSED.filter(
			([generic, specific]) => ingredientId.has(generic) && ingredientId.has(specific)
		).map(([generic, specific]) => ({
			specific_id: ingredientId.get(specific),
			generic_id: ingredientId.get(generic)
		}));
		batchInsert(sql, 'ingredient_generic_of', ['specific_id', 'generic_id'], genericRows, 400);
	}

	// Recipes remote already has: UPDATE in place rather than delete+reinsert
	// (see the DELETE list comment above) — only the columns whose value can
	// differ from what remote already stores. source_url/license/attribution/
	// meal_type/servings/timing are never touched by later stages, so they are
	// left alone rather than rewritten for no reason.
	//
	// `difficulty` and `notes` are parse-time, not stage-derived, so by the rule
	// above they would be excluded — but they must be here: both were added to the
	// schema *after* remote was already populated, so every existing remote row
	// holds NULL and would keep holding it forever. The distinction that matters
	// is "can this column's value differ from remote's?", not "does a later stage
	// compute it".
	for (const r of existingRecipes) {
		const n = nutritionById.get(r.id);
		const set = [
			`cuisine=${esc(r.cuisine)}`,
			`difficulty=${esc(r.difficulty ?? null)}`,
			`image_url=${esc(imageById.get(r.id)?.url ?? null)}`,
			`image_width=${esc(imageById.get(r.id)?.width ?? null)}`,
			`image_height=${esc(imageById.get(r.id)?.height ?? null)}`,
			`image_page=${esc(imageById.get(r.id)?.page ?? null)}`,
			`image_author=${esc(imageById.get(r.id)?.author ?? null)}`,
			`image_licence=${esc(imageById.get(r.id)?.licence ?? null)}`,
			`notes=${esc(r.notes?.length ? r.notes.join('\n') : null)}`,
			`kcal=${esc(n?.kcal ?? null)}`,
			`protein_g=${esc(n?.protein_g ?? null)}`,
			`fat_g=${esc(n?.fat_g ?? null)}`,
			`sat_fat_g=${esc(n?.sat_fat_g ?? null)}`,
			`carb_g=${esc(n?.carb_g ?? null)}`,
			`sugar_g=${esc(n?.sugar_g ?? null)}`,
			`fiber_g=${esc(n?.fiber_g ?? null)}`,
			`sodium_mg=${esc(n?.sodium_mg ?? null)}`,
			`balance_grade=${esc(n?.balance_grade ?? null)}`,
			`balance_score=${esc(n?.balance_score ?? null)}`,
			`nutrition_coverage=${esc(n?.nutrition_coverage ?? 0)}`
		].join(',');
		sql.push(`UPDATE recipes SET ${set} WHERE id=${r.id};`);
	}

	// Recipes remote has never seen: a real INSERT (every column, same shape
	// as 06_seed_d1.mjs), plus a source-language recipe_i18n row — there is
	// nothing to protect for an id remote never had, so this is the one case
	// where writing recipe_i18n here is correct rather than dangerous.
	batchInsert(
		sql,
		'recipes',
		[
			'id', 'source_url', 'source_lang', 'license', 'attribution', 'cuisine', 'meal_type',
			'difficulty', 'notes',
			'image_url', 'image_width', 'image_height', 'image_page', 'image_author', 'image_licence',
			'prep_minutes', 'total_minutes', 'servings', 'servings_assumed',
			'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg',
			'balance_grade', 'balance_score', 'nutrition_coverage'
		],
		newRecipes.map((r) => {
			const n = nutritionById.get(r.id);
			return {
				id: r.id,
				source_url: r.source_url,
				source_lang: r.source_lang,
				license: r.license,
				attribution: r.attribution,
				cuisine: r.cuisine,
				meal_type: r.meal_type,
				difficulty: r.difficulty ?? null,
				notes: r.notes?.length ? r.notes.join('\n') : null,
				image_url: imageById.get(r.id)?.url ?? null,
				image_width: imageById.get(r.id)?.width ?? null,
				image_height: imageById.get(r.id)?.height ?? null,
				image_page: imageById.get(r.id)?.page ?? null,
				image_author: imageById.get(r.id)?.author ?? null,
				image_licence: imageById.get(r.id)?.licence ?? null,
				prep_minutes: r.prep_minutes,
				total_minutes: r.total_minutes,
				servings: r.servings,
				servings_assumed: r.servings ? 0 : 1,
				kcal: n?.kcal ?? null,
				protein_g: n?.protein_g ?? null,
				fat_g: n?.fat_g ?? null,
				sat_fat_g: n?.sat_fat_g ?? null,
				carb_g: n?.carb_g ?? null,
				sugar_g: n?.sugar_g ?? null,
				fiber_g: n?.fiber_g ?? null,
				sodium_mg: n?.sodium_mg ?? null,
				balance_grade: n?.balance_grade ?? null,
				balance_score: n?.balance_score ?? null,
				nutrition_coverage: n?.nutrition_coverage ?? 0
			};
		}),
		60
	);

	batchInsert(
		sql,
		'recipe_i18n',
		['recipe_id', 'lang', 'title', 'instructions', 'is_machine'],
		newRecipes.map((r) => ({
			recipe_id: r.id,
			lang: r.source_lang,
			title: r.title,
			instructions: r.instructions,
			is_machine: 0
		})),
		20
	);

	batchInsert(
		sql,
		'recipe_ingredients',
		['recipe_id', 'ingredient_id', 'raw_text', 'quantity', 'unit', 'grams'],
		recipeIngredients.map((ri) => ({
			recipe_id: ri.recipe_id,
			ingredient_id: ingredientId.get(ri.canonical_key),
			raw_text: ri.raw_text,
			quantity: ri.quantity,
			unit: ri.unit,
			grams: gramsByRow.get(`${ri.recipe_id}|${ri.canonical_key}`) ?? null
		})),
		300
	);

	batchInsert(sql, 'recipe_diets', ['recipe_id', 'diet'], recipeDiets, 400);

	batchInsert(
		sql,
		'ingredient_nutrition',
		['ingredient_id', 'fdc_id', 'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg'],
		ingredientNutrition.map((n) => ({
			ingredient_id: ingredientId.get(n.canonical_key),
			fdc_id: n.fdc_id,
			kcal: n.kcal, protein_g: n.protein_g, fat_g: n.fat_g, sat_fat_g: n.sat_fat_g,
			carb_g: n.carb_g, sugar_g: n.sugar_g, fiber_g: n.fiber_g, sodium_mg: n.sodium_mg
		})),
		300
	);

	batchInsert(
		sql,
		'ingredient_micronutrient',
		['ingredient_id', 'nutrient_key', 'amount', 'unit'],
		ingredientMicros.map((m) => ({
			ingredient_id: ingredientId.get(m.canonical_key),
			nutrient_key: m.nutrient_key,
			amount: m.amount,
			unit: m.unit
		})),
		400
	);

	batchInsert(
		sql,
		'recipe_micronutrient',
		['recipe_id', 'nutrient_key', 'amount', 'unit', 'pct_nrv'],
		recipeMicros,
		400
	);

	sql.push(
		"UPDATE ingredients SET recipe_count = (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = ingredients.id);",
		"INSERT INTO ingredient_fts(ingredient_fts) VALUES('rebuild');",
		"INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('rebuild');"
	);

	// Pack consecutive statements into ~MAX_CHUNK_BYTES files, never splitting
	// a single statement across two files.
	await rm(CHUNK_DIR, { recursive: true, force: true });
	await mkdir(CHUNK_DIR, { recursive: true });

	const files = [];
	let current = [];
	let currentBytes = 0;
	for (const stmt of sql) {
		const stmtBytes = Buffer.byteLength(stmt) + 1;
		if (current.length && currentBytes + stmtBytes > MAX_CHUNK_BYTES) {
			files.push(current);
			current = [];
			currentBytes = 0;
		}
		current.push(stmt);
		currentBytes += stmtBytes;
	}
	if (current.length) files.push(current);

	for (let i = 0; i < files.length; i++) {
		const name = `${String(i + 1).padStart(3, '0')}.sql`;
		await writeFile(path.join(CHUNK_DIR, name), files[i].join(' ') + '\n');
	}

	console.log(`gen_remote_seed: ${sql.length} statements -> ${files.length} chunk files (~${MAX_CHUNK_BYTES}B each) in pipeline/out/remote-chunks/`);
	console.log(
		`gen_remote_seed: ${keptRecipes.length} recipes (${existingRecipes.length} updated, ${newRecipes.length} inserted), ` +
			`${ingredients.length} ingredients, ${recipeIngredients.length} recipe_ingredients rows, ${recipeMicros.length} recipe_micronutrient rows`
	);
}

await main();
