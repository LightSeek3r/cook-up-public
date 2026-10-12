/**
 * Generates a remote-safe, chunked seed for cook-up-db --remote.
 *
 * NOT FOR THE FREE PLAN AS A FULL RESEED. A full run writes ~270k rows (every
 * pipeline table deleted and reinserted; measured through Miniflare's D1 on a
 * 16-language copy with migrations/0011 applied, ~295k without it) and D1 Free
 * stops accepting writes at 100k/day, so it would halt partway with the site
 * missing ingredients until 00:00 UTC. The generator therefore refuses
 * when the estimated writes exceed --write-budget (default: pipeline/lib/d1.mjs's
 * 80% budget, 80,000), unless --paid-plan is passed. --only=related and
 * --only=stats are small partial refreshes and fit the free plan.
 *
 * Differs from 06_seed_d1.mjs's seed.sql in ways a remote apply needs:
 *
 * 1. Never deletes or overwrites recipe_i18n. Remote holds ~55k rows written
 *    by the translation tooling; their copy outside D1 is the translation
 *    backup (pipeline/data/i18n-backup, pipeline/tools/export_remote_i18n.mjs).
 *    A recipe remote has never seen gets its source-language row, INSERT OR
 *    IGNORE so that even a stale remote-id read cannot replace a row.
 * 2. ingredient_i18n is deleted and reinserted (ingredient ids are positional,
 *    see 4), so its rows come from the backup first and ingredients.jsonl
 *    second: remote holds names the pipeline files do not (890 jv names on
 *    2026-10-12). Before generating, the per-language counts on remote are
 *    compared with the backup and generation stops if they differ.
 * 3. `recipes` rows that already exist on remote are UPDATE'd in place
 *    (RECIPE_UPDATE_COLUMNS) rather than deleted and reinserted: recipe_i18n
 *    rows FK-reference them (SQLITE_CONSTRAINT_FOREIGNKEY, confirmed the hard
 *    way). Remote's current ids are read live; a kept id remote has never seen
 *    is INSERTed. A remote id no longer kept is left alone: it stops appearing
 *    in matches once its recipe_ingredients rows are gone.
 * 4. Statement order, and why a stop midway is not harmless. Each chunk is one
 *    atomic `--command` call (a mid-chunk failure rolls the whole chunk back,
 *    verified via row counts). Across chunks:
 *    - New recipes are inserted first (recipe_ingredients references them).
 *    - The ingredient-keyed tables cannot be replaced table by table: ingredient
 *      ids are positional per run and every child table has a foreign key to
 *      ingredients, so all of them are deleted, then ingredients, then all are
 *      reinserted. A stop inside this group leaves the mosaic or matches
 *      incomplete until it is resumed. Avoiding that needs stable ids and
 *      per-row deltas (data-layer review §3.2), not a reordering.
 *    - recipe_diets, recipe_micronutrient and recipe_related reference only
 *      recipes, so each one's DELETE shares a chunk with its first INSERT: a
 *      stop leaves it partly refilled, never empty.
 *    - FTS 'delete-all' and its refill share a chunk, as do the stats refresh.
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
 * 20KB leaves comfortable margin under that ~30KB ceiling. plan.json next to
 * the chunks lists each chunk's estimated writes.
 *
 * Usage:
 *   node pipeline/gen_remote_seed.mjs [--only=related|stats|fts] [--write-budget=N] [--paid-plan]
 *   node pipeline/tools/apply_remote_chunks.mjs --dir=pipeline/out/remote-chunks
 * The applier goes through pipeline/lib/d1.mjs (ledger, budget), stops before
 * a chunk that would cross today's write budget, and records each committed
 * chunk so a rerun resumes at the first uncommitted one. Re-applying a
 * committed chunk is not safe (its INSERTs would hit primary keys).
 *
 * `--only=related` writes chunks for `recipe_related` (migrations/0010) alone,
 * into pipeline/out/remote-chunks-related/: ~7,000 rows written and no remote
 * read. It ranks from pipeline/out, so it matches remote only while remote's
 * recipe_ingredients and ingredients came from that same pipeline/out.
 * `--only=stats` writes pipeline/out/remote-chunks-stats/: the admin
 * translation counts (migrations/0011) recounted on remote, ~55k rows read and
 * 32 written. Run it after a translation session. `--only=fts` writes
 * pipeline/out/remote-chunks-fts/: recipe_title_fts cleared and refilled
 * (~7k read, ~3.5k written), which compacts an index earlier reseeds appended
 * to without clearing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { d1, D1_WRITE_BUDGET } from './lib/d1.mjs';
import { readBackup, readManifest } from './lib/i18n_backup.mjs';
import {
	COLUMNS,
	RECIPE_UPDATE_COLUMNS,
	WriteBudgetExceeded,
	batchInsert,
	checkWriteBudget,
	esc,
	i18nStatsRefresh,
	ingredientFtsRefresh,
	mergeIngredientNames,
	packChunks,
	readSeedInputs,
	recipeCountRefresh,
	schemaIndexes,
	seedRows,
	stmt,
	titleFtsRefresh,
	writeCost
} from './lib/seed_sql.mjs';

const CHUNK_DIR = path.resolve('pipeline/out/remote-chunks');
const RELATED_CHUNK_DIR = path.resolve('pipeline/out/remote-chunks-related');
const STATS_CHUNK_DIR = path.resolve('pipeline/out/remote-chunks-stats');
const FTS_CHUNK_DIR = path.resolve('pipeline/out/remote-chunks-fts');
export const MAX_CHUNK_BYTES = 20_000;

// Rows per INSERT statement, tuned per table from the row shape; every
// statement is also capped at the chunk size.
const BATCH = {
	allergens: 200, ingredients: 150, ingredient_i18n: 300, ingredient_allergens: 400,
	ingredient_generic_of: 400, recipes: 60, recipe_i18n: 20, recipe_ingredients: 300,
	recipe_diets: 400, recipe_related: 400, ingredient_nutrition: 300,
	ingredient_micronutrient: 400, recipe_micronutrient: 400
};

function inserter(cost, maxBytes) {
	return (table, rows, verb = 'INSERT') =>
		batchInsert(table, COLUMNS[table], rows, {
			batchSize: BATCH[table],
			maxBytes,
			verb,
			writesPerRow: cost.insert(table, 1)
		});
}

/** DELETE + refill of a table nothing references, the DELETE bound to the first INSERT. */
function replaceUnits(insert, cost, table, rows) {
	const [first, ...rest] = insert(table, rows);
	const del = stmt(`DELETE FROM ${table};`, cost.deleteAll(rows.length));
	return [first ? [del, first] : [del], ...rest.map((s) => [s])];
}

export function buildRelatedUnits(data, { indexes, maxBytes = MAX_CHUNK_BYTES }) {
	const cost = writeCost(indexes);
	const rows = seedRows(data).recipeRelated;
	return replaceUnits(inserter(cost, maxBytes), cost, 'recipe_related', rows);
}

export function buildStatsUnits() {
	return [i18nStatsRefresh()];
}

/**
 * The full remote reseed as units (see the file header for the order).
 * `ingredientNames` are the backup's ingredient_i18n rows (or null);
 * `remoteRecipeIds` the ids remote holds now.
 */
export function buildRemoteSeed(data, { remoteRecipeIds, ingredientNames, indexes, maxBytes = MAX_CHUNK_BYTES }) {
	const cost = writeCost(indexes);
	const insert = inserter(cost, maxBytes);
	const rows = seedRows(data);
	const existing = rows.recipes.filter((r) => remoteRecipeIds.has(r.id));
	const fresh = rows.recipes.filter((r) => !remoteRecipeIds.has(r.id));
	const freshIds = new Set(fresh.map((r) => r.id));
	const names = mergeIngredientNames(data.ingredients, ingredientNames);
	const nameRows = names.rows.map((r) => ({ ingredient_id: rows.ingredientId.get(r.canonical_key), lang: r.lang, name: r.name }));
	const units = [];
	const one = (list) => list.map((s) => [s]);

	units.push(...one(insert('recipes', fresh)));
	units.push(
		...one(
			insert(
				'recipe_i18n',
				rows.keptRecipes
					.filter((r) => freshIds.has(r.id))
					.map((r) => ({ recipe_id: r.id, lang: r.source_lang, title: r.title, instructions: r.instructions, is_machine: 0 })),
				'INSERT OR IGNORE'
			)
		)
	);

	// Children of ingredients first, ingredients and allergens last (foreign keys).
	const ingredientGroup = [
		['recipe_ingredients', rows.recipeIngredients],
		['ingredient_allergens', rows.ingredientAllergens],
		['ingredient_generic_of', rows.genericOf],
		['ingredient_micronutrient', rows.ingredientMicros],
		['ingredient_nutrition', rows.ingredientNutrition],
		['ingredient_i18n', nameRows],
		['ingredients', rows.ingredients],
		['allergens', rows.allergens]
	];
	const deletes = ingredientGroup.map(([table, list]) => stmt(`DELETE FROM ${table};`, cost.deleteAll(list.length)));
	const [firstAllergens, ...moreAllergens] = insert('allergens', rows.allergens);
	units.push([...deletes, firstAllergens], ...one(moreAllergens));
	for (const table of ['ingredients', 'ingredient_i18n', 'ingredient_allergens', 'ingredient_generic_of', 'recipe_ingredients']) {
		units.push(...one(insert(table, Object.fromEntries(ingredientGroup)[table])));
	}
	units.push([recipeCountRefresh(cost, rows.ingredients.length), ...ingredientFtsRefresh()]);
	units.push(...one(insert('ingredient_nutrition', rows.ingredientNutrition)));
	units.push(...one(insert('ingredient_micronutrient', rows.ingredientMicros)));

	const updateWrites = cost.update('recipes', 1, RECIPE_UPDATE_COLUMNS);
	for (const r of existing) {
		const set = RECIPE_UPDATE_COLUMNS.map((c) => `${c}=${esc(r[c])}`).join(',');
		units.push([stmt(`UPDATE recipes SET ${set} WHERE id=${r.id};`, updateWrites)]);
	}

	// Remote-only orphan recipes (see the file header) get no recipe_related
	// row and rank live on their page, to an empty list.
	units.push(...replaceUnits(insert, cost, 'recipe_diets', rows.recipeDiets));
	units.push(...replaceUnits(insert, cost, 'recipe_micronutrient', rows.recipeMicros));
	units.push(...replaceUnits(insert, cost, 'recipe_related', rows.recipeRelated));

	units.push(titleFtsRefresh(remoteRecipeIds.size + fresh.length));
	units.push(i18nStatsRefresh());

	return { units, rows, existing, fresh, names: names.stats };
}

/**
 * Writes chunk files plus plan.json; returns the chunk list. Refuses to replace
 * a run that apply_remote_chunks.mjs has started but not finished: its
 * applied.json is the only record of which chunks remote already committed.
 */
async function writeChunks(dir, chunks, meta) {
	const progress = path.join(dir, 'applied.json');
	if (existsSync(progress)) {
		const applied = JSON.parse(readFileSync(progress, 'utf8')).applied.length;
		const total = JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8')).chunks.length;
		if (applied < total) {
			throw new Error(`${dir} holds a partly applied run (${applied}/${total} chunks committed): finish it with apply_remote_chunks.mjs first`);
		}
	}
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	const plan = { ...meta, generated_at: new Date().toISOString(), chunks: [] };
	for (let i = 0; i < chunks.length; i++) {
		const name = `${String(i + 1).padStart(3, '0')}.sql`;
		await writeFile(path.join(dir, name), chunks[i].sql + '\n');
		plan.chunks.push({ file: name, writes: chunks[i].writes, statements: chunks[i].statements });
	}
	await writeFile(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
	return chunks;
}

function parseArgs(argv) {
	const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
	const budget = Number(opt('write-budget') ?? D1_WRITE_BUDGET);
	if (!Number.isFinite(budget) || budget <= 0) throw new Error('--write-budget must be a positive number');
	return { only: opt('only') ?? null, budget, paidPlan: argv.includes('--paid-plan') };
}

/** Remote per-language ingredient_i18n counts must equal the backup's, or the reseed would drop names. */
function checkIngredientBackup(manifest) {
	const entry = manifest?.tables?.ingredient_i18n;
	if (!entry) {
		throw new Error(
			'no ingredient_i18n backup (pipeline/data/i18n-backup): run node pipeline/tools/export_remote_i18n.mjs first; ' +
				'a full reseed deletes and rewrites ingredient_i18n'
		);
	}
	const remote = Object.fromEntries(d1('SELECT lang, COUNT(*) AS n FROM ingredient_i18n GROUP BY lang').map((r) => [r.lang, r.n]));
	const langs = new Set([...Object.keys(remote), ...Object.keys(entry.langs)]);
	const stale = [...langs].filter((l) => (remote[l] ?? 0) !== (entry.langs[l]?.rows ?? 0));
	if (stale.length) {
		throw new Error(
			`ingredient_i18n backup (${manifest.exported_at}) differs from remote for ${stale.join(', ')}: ` +
				'run node pipeline/tools/export_remote_i18n.mjs --fresh --table=ingredient_i18n first'
		);
	}
}

function guard(planned, opts, label) {
	try {
		checkWriteBudget(planned, opts);
	} catch (err) {
		if (!(err instanceof WriteBudgetExceeded)) throw err;
		console.error(`gen_remote_seed${label}: REFUSED, nothing written. ${err.message}`);
		process.exit(1);
	}
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const indexes = schemaIndexes();

	if (opts.only === 'fts') {
		const chunks = packChunks([titleFtsRefresh(3_500)], MAX_CHUNK_BYTES);
		await writeChunks(FTS_CHUNK_DIR, chunks, { mode: 'fts', planned_writes: chunks[0].writes });
		console.log(`gen_remote_seed --only=fts: 1 chunk in pipeline/out/remote-chunks-fts/`);
		return;
	}
	if (opts.only === 'stats') {
		const chunks = packChunks(buildStatsUnits(), MAX_CHUNK_BYTES);
		await writeChunks(STATS_CHUNK_DIR, chunks, { mode: 'stats', planned_writes: chunks[0].writes });
		console.log(`gen_remote_seed --only=stats: ${chunks.length} chunk in pipeline/out/remote-chunks-stats/`);
		return;
	}

	const data = await readSeedInputs();
	if (opts.only === 'related') {
		const chunks = packChunks(buildRelatedUnits(data, { indexes }), MAX_CHUNK_BYTES);
		const planned = chunks.reduce((s, c) => s + c.writes, 0);
		guard(planned, opts, ' --only=related');
		await writeChunks(RELATED_CHUNK_DIR, chunks, { mode: 'related', planned_writes: planned });
		console.log(`gen_remote_seed --only=related: ${chunks.length} chunk files, ~${planned} rows written, in pipeline/out/remote-chunks-related/`);
		return;
	}
	if (opts.only) throw new Error(`unknown --only=${opts.only}`);

	const manifest = readManifest();
	const ingredientNames = readBackup('ingredient_i18n')?.rows ?? null;
	// Refused before any remote read when even the estimate with every kept
	// recipe already on remote is over budget.
	const allKept = new Set(data.recipeIngredients.map((r) => r.recipe_id));
	const early = packChunks(buildRemoteSeed(data, { remoteRecipeIds: allKept, ingredientNames, indexes }).units, MAX_CHUNK_BYTES);
	guard(early.reduce((s, c) => s + c.writes, 0), opts, '');

	checkIngredientBackup(manifest);
	console.log('gen_remote_seed: checking remote for existing recipe ids...');
	const remoteRecipeIds = new Set(d1('SELECT id FROM recipes').map((r) => r.id));
	const seed = buildRemoteSeed(data, { remoteRecipeIds, ingredientNames, indexes });
	const chunks = packChunks(seed.units, MAX_CHUNK_BYTES);
	const planned = chunks.reduce((s, c) => s + c.writes, 0);
	console.log(
		`gen_remote_seed: ${remoteRecipeIds.size} recipes on remote now; ${seed.existing.length} will be updated in place, ${seed.fresh.length} inserted. ` +
			`Ingredient names: ${seed.names.fromBackup} from the backup, ${seed.names.fromPipeline} from ingredients.jsonl, ` +
			`${seed.names.differs} where they disagree (backup kept), ${seed.names.orphans} backup rows for ingredients no longer in the pipeline.`
	);
	console.log(`gen_remote_seed: estimated ${planned} rows written (budget ${opts.budget}${opts.paidPlan ? ', --paid-plan' : ''})`);
	guard(planned, opts, '');
	await writeChunks(CHUNK_DIR, chunks, { mode: 'full', planned_writes: planned, backup_exported_at: manifest.exported_at });
	console.log(`gen_remote_seed: ${chunks.length} chunk files (~${MAX_CHUNK_BYTES}B each) in pipeline/out/remote-chunks/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
