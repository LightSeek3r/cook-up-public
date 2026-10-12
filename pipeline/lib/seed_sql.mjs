/**
 * Statement building shared by 06_seed_d1.mjs (local) and gen_remote_seed.mjs
 * (remote): batched INSERTs, chunk packing, the derived-table tails, the
 * translation-backup merge and the write estimate behind the reseed guard.
 *
 * A statement is `{ sql, writes }`, where `writes` is the rows D1 is expected
 * to bill for it. A unit is an array of statements that must land in the same
 * remote chunk (each chunk is one atomic `--command` call), e.g. an FTS
 * 'delete-all' and the insert that refills it.
 */

import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { esc } from './d1.mjs';
import { GENERIC_PAIRS_CLOSED } from './generic_ingredients.mjs';
import { nonStapleCounts } from './non_staple_count.mjs';
import { relatedRows } from './related_recipes.mjs';

export { esc };

export const ALLERGENS = ['gluten', 'dairy', 'nut', 'peanut', 'egg', 'soy', 'fish', 'shellfish', 'sesame'];

const INPUTS = {
	recipes: 'recipes.jsonl',
	ingredients: 'ingredients.jsonl',
	recipeIngredients: 'recipe_ingredients.jsonl',
	recipeGrams: 'recipe_ingredients.grams.jsonl',
	recipeDiets: 'recipe_diets.jsonl',
	recipeNutrition: 'recipes.nutrition.jsonl',
	ingredientNutrition: 'ingredient_nutrition.jsonl',
	ingredientMicros: 'ingredient_micronutrient.jsonl',
	recipeMicros: 'recipe_micronutrient.jsonl',
	recipeImages: 'recipe_images.jsonl'
};

/** Every pipeline/out input both seeds read, keyed as `seedRows` expects. */
export async function readSeedInputs(outDir = path.resolve('pipeline/out')) {
	const entries = await Promise.all(
		Object.entries(INPUTS).map(async ([key, file]) => {
			const raw = await readFile(path.join(outDir, file), 'utf8');
			return [key, raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l))];
		})
	);
	return Object.fromEntries(entries);
}

export const RECIPE_COLUMNS = [
	'id', 'source_url', 'source_lang', 'license', 'attribution', 'cuisine', 'meal_type',
	'difficulty', 'notes',
	'image_url', 'image_width', 'image_height', 'image_page', 'image_author', 'image_licence',
	'prep_minutes', 'total_minutes', 'servings', 'servings_assumed',
	'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg',
	'balance_grade', 'balance_score', 'nutrition_coverage', 'non_staple_count'
];

/**
 * The recipes columns a remote reseed UPDATEs in place. source_url, licence,
 * attribution, meal_type, servings and timing never change after the parse.
 * difficulty and notes are parse-time too but were added to the schema after
 * remote was populated, so remote rows would otherwise keep NULL forever.
 * non_staple_count (migrations/0009) follows recipe_ingredients and is_staple.
 */
export const RECIPE_UPDATE_COLUMNS = [
	'cuisine', 'difficulty',
	'image_url', 'image_width', 'image_height', 'image_page', 'image_author', 'image_licence',
	'notes', 'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg',
	'balance_grade', 'balance_score', 'nutrition_coverage', 'non_staple_count'
];

/**
 * Every row both seeds write, derived from the pipeline inputs. Ingredient ids
 * are positional in ingredients.jsonl, so they are only stable within one run.
 */
export function seedRows(data) {
	const keptIds = new Set(data.recipeIngredients.map((r) => r.recipe_id));
	const keptRecipes = data.recipes.filter((r) => keptIds.has(r.id));
	const nutritionById = new Map(data.recipeNutrition.map((n) => [n.id, n]));
	const imageById = new Map(data.recipeImages.map((i) => [i.recipe_id, i]));
	const nonStaple = nonStapleCounts(data.ingredients, data.recipeIngredients);
	const ingredientId = new Map(data.ingredients.map((ing, i) => [ing.canonical_key, i + 1]));
	// (recipe_id, canonical_key) is unique per row after stage 03's dedup.
	const gramsByRow = new Map(data.recipeGrams.map((g) => [`${g.recipe_id}|${g.canonical_key}`, g.grams]));
	const allergenId = new Map(ALLERGENS.map((a, i) => [a, i + 1]));

	const recipes = keptRecipes.map((r) => {
		const n = nutritionById.get(r.id);
		const img = imageById.get(r.id);
		return {
			id: r.id,
			source_url: r.source_url,
			source_lang: r.source_lang,
			license: r.license,
			attribution: r.attribution,
			cuisine: r.cuisine,
			meal_type: r.meal_type,
			difficulty: r.difficulty ?? null,
			// Bullets joined with newlines, like `instructions`; NULL rather than ''
			// when there are none, so the UI branches on presence.
			notes: r.notes?.length ? r.notes.join('\n') : null,
			image_url: img?.url ?? null,
			image_width: img?.width ?? null,
			image_height: img?.height ?? null,
			image_page: img?.page ?? null,
			image_author: img?.author ?? null,
			image_licence: img?.licence ?? null,
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
			nutrition_coverage: n?.nutrition_coverage ?? 0,
			non_staple_count: nonStaple.get(r.id) ?? 0
		};
	});

	return {
		keptRecipes,
		ingredientId,
		recipes,
		allergens: ALLERGENS.map((key, i) => ({ id: i + 1, key })),
		ingredients: data.ingredients.map((ing) => ({
			id: ingredientId.get(ing.canonical_key),
			canonical_key: ing.canonical_key,
			category: ing.category,
			is_staple: ing.is_staple,
			beneficial: ing.beneficial,
			recipe_count: 0 // refreshed once recipe_ingredients is loaded
		})),
		ingredientAllergens: data.ingredients.flatMap((ing) =>
			ing.allergens.map((a) => ({ ingredient_id: ingredientId.get(ing.canonical_key), allergen_id: allergenId.get(a) }))
		),
		// Both endpoints of a curated pair must be in THIS corpus. Seeded from the
		// CLOSED set: match.ts joins ingredient_generic_of once, so multi-hop chains
		// only work if the table is transitively closed.
		genericOf: GENERIC_PAIRS_CLOSED.filter(([generic, specific]) => ingredientId.has(generic) && ingredientId.has(specific)).map(
			([generic, specific]) => ({ specific_id: ingredientId.get(specific), generic_id: ingredientId.get(generic) })
		),
		recipeIngredients: data.recipeIngredients.map((ri) => ({
			recipe_id: ri.recipe_id,
			ingredient_id: ingredientId.get(ri.canonical_key),
			raw_text: ri.raw_text,
			quantity: ri.quantity,
			unit: ri.unit,
			grams: gramsByRow.get(`${ri.recipe_id}|${ri.canonical_key}`) ?? null
		})),
		recipeDiets: data.recipeDiets,
		// migrations/0010: ranked here so D1 never has to (lib/related_recipes.mjs).
		recipeRelated: relatedRows(data.ingredients, data.recipeIngredients, keptRecipes.map((r) => r.id)),
		ingredientNutrition: data.ingredientNutrition.map((n) => ({
			ingredient_id: ingredientId.get(n.canonical_key),
			fdc_id: n.fdc_id,
			kcal: n.kcal, protein_g: n.protein_g, fat_g: n.fat_g, sat_fat_g: n.sat_fat_g,
			carb_g: n.carb_g, sugar_g: n.sugar_g, fiber_g: n.fiber_g, sodium_mg: n.sodium_mg
		})),
		ingredientMicros: data.ingredientMicros.map((m) => ({
			ingredient_id: ingredientId.get(m.canonical_key),
			nutrient_key: m.nutrient_key,
			amount: m.amount,
			unit: m.unit
		})),
		recipeMicros: data.recipeMicros
	};
}

/** Column lists per table, in the order both seeds have always written them. */
export const COLUMNS = {
	allergens: ['id', 'key'],
	ingredients: ['id', 'canonical_key', 'category', 'is_staple', 'beneficial', 'recipe_count'],
	ingredient_i18n: ['ingredient_id', 'lang', 'name'],
	ingredient_allergens: ['ingredient_id', 'allergen_id'],
	ingredient_generic_of: ['specific_id', 'generic_id'],
	recipes: RECIPE_COLUMNS,
	recipe_i18n: ['recipe_id', 'lang', 'title', 'instructions', 'is_machine'],
	recipe_ingredients: ['recipe_id', 'ingredient_id', 'raw_text', 'quantity', 'unit', 'grams'],
	recipe_diets: ['recipe_id', 'diet'],
	recipe_related: ['recipe_id', 'related_ids'],
	ingredient_nutrition: ['ingredient_id', 'fdc_id', 'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg'],
	ingredient_micronutrient: ['ingredient_id', 'nutrient_key', 'amount', 'unit'],
	recipe_micronutrient: ['recipe_id', 'nutrient_key', 'amount', 'unit', 'pct_nrv']
};

/** D1 rejects statements over 100 KB (SQLITE_TOOBIG); a margin for the INSERT prefix. */
export const MAX_STATEMENT_BYTES = 90_000;

export const stmt = (sql, writes = 0) => ({ sql, writes });

/**
 * Index list per table, as the migrations leave the schema: `{ table: [cols[]] }`,
 * one entry per index including SQLite's automatic PRIMARY KEY / UNIQUE ones.
 * The write estimate assumes remote has every migration in `dir` applied.
 */
export function schemaIndexes(dir = path.resolve('migrations')) {
	const lite = new DatabaseSync(':memory:');
	for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) lite.exec(readFileSync(path.join(dir, f), 'utf8'));
	const out = {};
	for (const { name, tbl_name } of lite.prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'`).all()) {
		const cols = lite.prepare(`SELECT name FROM pragma_index_info(?)`).all(name).map((r) => r.name);
		(out[tbl_name] ??= []).push(cols);
	}
	lite.close();
	return out;
}

/**
 * Rows D1 bills, as measured through Miniflare's D1 (the counters D1 bills):
 * an inserted row writes its table row plus one entry per index; an UPDATE
 * writes the row plus every index on a SET column, even when the value is
 * unchanged; an unqualified DELETE writes one per deleted row.
 */
export function writeCost(indexes) {
	const idx = (table) => indexes[table] ?? [];
	return {
		insert: (table, rows) => rows * (1 + idx(table).length),
		update: (table, rows, setColumns) =>
			rows * (1 + idx(table).filter((cols) => cols.some((c) => setColumns.includes(c))).length),
		deleteAll: (rows) => rows
	};
}

/**
 * Splits rows into multi-row INSERT statements of at most `batchSize` rows and
 * `maxBytes` bytes each (a single row larger than `maxBytes` still gets its own
 * statement). `writesPerRow` feeds the estimate.
 */
export function batchInsert(table, columns, rows, { batchSize = 200, maxBytes = MAX_STATEMENT_BYTES, verb = 'INSERT', writesPerRow = 1, sep = ',' } = {}) {
	const head = `${verb} INTO ${table} (${columns.join(',')}) VALUES${sep === ',' ? ' ' : '\n'}`;
	const out = [];
	let values = [];
	let bytes = Buffer.byteLength(head);
	const flush = () => {
		if (!values.length) return;
		out.push(stmt(`${head}${values.join(sep)};`, values.length * writesPerRow));
		values = [];
		bytes = Buffer.byteLength(head);
	};
	for (const row of rows) {
		const v = `(${columns.map((c) => esc(row[c])).join(',')})`;
		const vBytes = Buffer.byteLength(v) + sep.length;
		if (values.length && (values.length >= batchSize || bytes + vBytes > maxBytes)) flush();
		values.push(v);
		bytes += vBytes;
	}
	flush();
	return out;
}

/** Packs units into chunks of at most `maxBytes`, never splitting a unit or a statement. */
export function packChunks(units, maxBytes) {
	const chunks = [];
	let current = [];
	let bytes = 0;
	for (const unit of units) {
		const unitBytes = unit.reduce((s, st) => s + Buffer.byteLength(st.sql) + 1, 0);
		if (current.length && bytes + unitBytes > maxBytes) {
			chunks.push(current);
			current = [];
			bytes = 0;
		}
		current.push(...unit);
		bytes += unitBytes;
	}
	if (current.length) chunks.push(current);
	return chunks.map((list) => ({
		sql: list.map((s) => s.sql).join(' '),
		writes: list.reduce((s, st) => s + st.writes, 0),
		statements: list.length
	}));
}

/** `ingredients.recipe_count`, from the recipe_ingredients just written. */
export const recipeCountRefresh = (cost, ingredientRows) =>
	stmt(
		'UPDATE ingredients SET recipe_count = (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = ingredients.id);',
		cost.update('ingredients', ingredientRows, ['recipe_count'])
	);

/**
 * ingredient_fts is rebuilt whole because both seeds delete and reinsert
 * ingredient_i18n, renumbering every rowid it points at. 'rebuild' rather than
 * 'delete-all' + INSERT…SELECT: Miniflare's D1 bills 'rebuild' 0 read / 1
 * written against 16,624 / 16,625 for the equivalent pair, about a fifth of the
 * daily write budget on every reseed. Remote's billing of 'rebuild' has not been
 * measured; it reindexes ~12k short names, never recipe_i18n.
 */
export const ingredientFtsRefresh = () => [stmt(`INSERT INTO ingredient_fts(ingredient_fts) VALUES('rebuild');`, 1)];

/**
 * recipe_title_fts holds one entry per recipe, its source-language row
 * (migrations/0008). Cleared first: FTS5 never drops an entry on its own, so a
 * plain re-insert doubles the index on remote and, locally, where recipe_i18n
 * is reinserted under new rowids, leaves stale entries that match the wrong
 * rows. Never 'rebuild' here: it would index every language's row. CROSS JOIN
 * pins the plan to one recipes scan plus a primary-key probe per recipe (6,956
 * rows read on 3,478 recipes); the planner's own choice scans recipe_i18n
 * (~111k).
 */
export const titleFtsRefresh = (recipeRows) => [
	stmt(`INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('delete-all');`, 1),
	stmt(
		`INSERT INTO recipe_title_fts(rowid, title) SELECT i.rowid, i.title FROM recipes r CROSS JOIN recipe_i18n i ON i.recipe_id = r.id AND i.lang = r.source_lang;`,
		recipeRows
	)
];

/**
 * migrations/0011's recipe_i18n_stats, recounted from recipe_i18n itself (one
 * read per row, ~55k on remote) so it is right whatever wrote the rows.
 */
export const i18nStatsRefresh = (langs = 16) => [
	stmt('DELETE FROM recipe_i18n_stats;', langs),
	stmt(
		'INSERT INTO recipe_i18n_stats (lang, translated, machine) SELECT lang, COUNT(*), COALESCE(SUM(is_machine), 0) FROM recipe_i18n GROUP BY lang;',
		langs
	)
];

/**
 * ingredient_i18n rows for this run's ingredients: the translation backup's
 * names (what remote serves, including names only remote has) win; the
 * pipeline's ingredients.jsonl fills languages the backup lacks. Rows are
 * keyed by canonical_key because ingredient ids are positional per run.
 */
export function mergeIngredientNames(ingredients, backupRows) {
	const pipelineKeys = new Set(ingredients.map((i) => i.canonical_key));
	const backup = new Map();
	let orphans = 0;
	for (const r of backupRows ?? []) {
		if (!pipelineKeys.has(r.canonical_key)) {
			orphans++;
			continue;
		}
		if (!backup.has(r.canonical_key)) backup.set(r.canonical_key, new Map());
		backup.get(r.canonical_key).set(r.lang, r.name);
	}
	const rows = [];
	const stats = { fromBackup: 0, fromPipeline: 0, differs: 0, orphans };
	for (const ing of ingredients) {
		const saved = backup.get(ing.canonical_key) ?? new Map();
		const langs = new Set([...Object.keys(ing.names), ...saved.keys()]);
		for (const lang of [...langs].sort()) {
			const fromBackup = saved.get(lang);
			if (fromBackup !== undefined) {
				stats.fromBackup++;
				if (ing.names[lang] !== undefined && ing.names[lang] !== fromBackup) stats.differs++;
			} else stats.fromPipeline++;
			rows.push({ canonical_key: ing.canonical_key, lang, name: fromBackup ?? ing.names[lang] });
		}
	}
	return { rows, stats };
}

/**
 * recipe_i18n rows for the kept recipes: every backed-up row of a kept recipe,
 * plus the pipeline's source-language row for a kept recipe the backup does
 * not have. Backed-up rows of recipes this run does not keep are left out
 * (their recipes row is not seeded, and the foreign key would reject them).
 */
export function mergeRecipeI18n(keptRecipes, backupRows) {
	const kept = new Map(keptRecipes.map((r) => [r.id, r]));
	const rows = [];
	const have = new Set();
	const stats = { fromBackup: 0, fromPipeline: 0, notKept: 0, sourceDiffers: 0 };
	for (const r of backupRows ?? []) {
		const recipe = kept.get(r.recipe_id);
		if (!recipe) {
			stats.notKept++;
			continue;
		}
		if (r.lang === recipe.source_lang && (r.title !== recipe.title || r.instructions !== recipe.instructions)) stats.sourceDiffers++;
		rows.push(r);
		have.add(`${r.recipe_id}|${r.lang}`);
		stats.fromBackup++;
	}
	for (const recipe of keptRecipes) {
		if (have.has(`${recipe.id}|${recipe.source_lang}`)) continue;
		rows.push({ recipe_id: recipe.id, lang: recipe.source_lang, title: recipe.title, instructions: recipe.instructions, is_machine: 0 });
		stats.fromPipeline++;
	}
	rows.sort((a, b) => a.recipe_id - b.recipe_id || (a.lang < b.lang ? -1 : a.lang > b.lang ? 1 : 0));
	return { rows, stats };
}

export class WriteBudgetExceeded extends Error {
	constructor(planned, budget) {
		super(
			`planned ${planned} rows written exceeds the ${budget}-row daily write budget. ` +
				`On the free plan D1 stops accepting writes at 100,000/day, partway through, and the site ` +
				`stays half-seeded until 00:00 UTC. Use --only=related / --only=stats for a partial refresh, ` +
				`or pass --paid-plan if the account is on Workers Paid.`
		);
		this.name = 'WriteBudgetExceeded';
		this.planned = planned;
		this.budget = budget;
	}
}

/** Throws WriteBudgetExceeded when `planned` is over `budget`, unless `paidPlan`. */
export function checkWriteBudget(planned, { budget, paidPlan = false }) {
	if (!paidPlan && planned > budget) throw new WriteBudgetExceeded(planned, budget);
}
