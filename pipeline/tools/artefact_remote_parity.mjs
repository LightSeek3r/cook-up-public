/**
 * Read-only check that the pipeline snapshot the artefacts are built from
 * (pipeline/out + the translation backup, through 06_seed_d1's statements)
 * holds what remote D1 serves today.
 *
 * Per table: a fingerprint (row count, and per column sums of values, NULLs,
 * byte lengths and first/last characters, some weighted by the row's key so a
 * value moved to another row shows) computed by the same SELECT on both sides,
 * per language for the i18n tables; then a random sample of rows compared
 * value for value (text as hex(), so byte for byte). Recipes remote keeps but
 * the pipeline dropped (no kept ingredient) are excluded from both and
 * reported separately.
 *
 * Every statement is a SELECT and goes through pipeline/lib/d1.mjs (daily
 * ledger, 80% budget). The plan's estimated reads are printed first and the
 * run refuses above --max-reads (default 250,000).
 *
 * Works only until migrations/0013_retire_recipe_corpus.sql is applied: it
 * reads the corpus tables 0013 drops (pipeline/lib/d1.mjs then says so). Its
 * last run is one of 0013's preconditions. recipe_i18n rows the translation
 * store has changed since the last D1 export differ by design.
 *
 * Usage: node pipeline/tools/artefact_remote_parity.mjs [--max-reads=N] [--sample=N] [--seed=N] [--only=fingerprint|sample|remote-only]
 * Report: pipeline/out/remote-parity/<UTC date>.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { d1, ledgerToday } from '../lib/d1.mjs';
import { snapshotDb } from '../lib/artefacts.mjs';

const option = (/** @type {string} */ name, /** @type {string} */ fallback) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const MAX_READS = Number(option('max-reads', '250000'));
const SAMPLE = Number(option('sample', '40'));
/** all | fingerprint | sample | remote-only: the steps of one kind */
const ONLY = option('only', 'all');
let seed = Number(option('seed', String(Date.now() % 1e9)));

/** Remote recipes with no kept ingredient, absent from the snapshot (data-layer review 3.1). */
export const REMOTE_ONLY = [5869, 18907, 113904, 133096, 464428, 479561];

/** key: the column identifying the owning row; recipe: whether that is a recipe id. */
const FINGERPRINT_COLUMNS = 60;

const TABLES = {
	recipes: { key: 'id', recipe: true },
	recipe_i18n: { key: 'recipe_id', recipe: true, lang: true },
	recipe_ingredients: { key: 'recipe_id', recipe: true },
	recipe_diets: { key: 'recipe_id', recipe: true },
	recipe_micronutrient: { key: 'recipe_id', recipe: true },
	recipe_related: { key: 'recipe_id', recipe: true },
	ingredients: { key: 'id' },
	ingredient_i18n: { key: 'ingredient_id', lang: true },
	allergens: { key: 'id' },
	ingredient_allergens: { key: 'ingredient_id' },
	ingredient_generic_of: { key: 'specific_id' }
};

const rnd = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** @template T @param {T[]} list @param {number} n @returns {T[]} */
function sample(list, n) {
	const pool = [...list];
	const out = [];
	while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
	return out;
}

/** @param {string} sql */
function remote(sql) {
	if (!/^\s*SELECT\b/i.test(sql)) throw new Error(`refusing a non-SELECT statement: ${sql.slice(0, 60)}`);
	return /** @type {Record<string, unknown>[]} */ (d1(sql, { local: false }));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 */
function fingerprintSql(db, table) {
	const spec = TABLES[/** @type {keyof typeof TABLES} */ (table)];
	const cols = db.prepare(`SELECT name, type FROM pragma_table_info('${table}') ORDER BY cid`).all();
	const k = `(${spec.key} % 10007)`;
	const parts = ['COUNT(*) AS n'];
	for (const { name, type } of cols) {
		const c = String(name);
		parts.push(`SUM(${c} IS NULL) AS "${c}:null"`);
		if (/INT/i.test(String(type))) {
			parts.push(`SUM(${c}) AS "${c}:sum"`, `SUM(${k} * (${c} % 10009)) AS "${c}:ksum"`);
		} else if (/REAL/i.test(String(type))) {
			// Integer sums of a fixed scaling: exact and independent of scan order.
			parts.push(`SUM(CAST(${c} * 1000000 AS INTEGER)) AS "${c}:sum"`);
		} else {
			const bytes = `length(CAST(${c} AS BLOB))`;
			parts.push(
				`SUM(${bytes}) AS "${c}:bytes"`,
				`SUM(${k} * (${bytes} + 1)) AS "${c}:kbytes"`,
				`SUM(unicode(${c})) AS "${c}:first"`,
				`SUM(unicode(substr(${c}, -1))) AS "${c}:last"`
			);
		}
	}
	const where = spec.recipe ? `WHERE ${spec.key} NOT IN (${REMOTE_ONLY.join(',')})` : '';
	// D1 rejects result sets over 100 columns ("too many columns"), so wide
	// tables take several statements, each one more scan of the table.
	const statements = [];
	for (let i = 0; i < parts.length; i += FINGERPRINT_COLUMNS) {
		const chunk = parts.slice(i, i + FINGERPRINT_COLUMNS);
		statements.push(`SELECT ${spec.lang ? 'lang, ' : ''}${chunk.join(', ')} FROM ${table} ${where}${spec.lang ? ' GROUP BY lang ORDER BY lang' : ''}`);
	}
	return statements;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @param {number[]} keys
 */
function sampleSql(db, table, keys) {
	const spec = TABLES[/** @type {keyof typeof TABLES} */ (table)];
	const cols = db.prepare(`SELECT name, type, pk FROM pragma_table_info('${table}') ORDER BY cid`).all();
	const select = cols.map(({ name, type }) => (/INT|REAL/i.test(String(type)) ? String(name) : `hex(${name}) AS ${name}`));
	// Every table has a primary key, so ordering by it makes the row order total.
	const pk = cols.filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((c) => String(c.name));
	return `SELECT ${select.join(', ')} FROM ${table} WHERE ${spec.key} IN (${keys.join(',')}) ORDER BY ${pk.join(', ')}`;
}

const canon = (/** @type {unknown} */ rows) => JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? Number(v) : v));

async function main() {
	const before = ledgerToday();
	console.log(`remote parity: building the snapshot database (pipeline/out + translation backup)`);
	const { db } = await snapshotDb();
	const count = (/** @type {string} */ t) => Number(/** @type {any} */ (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).n);

	const plan = [];
	for (const table of Object.keys(TABLES)) {
		const extra = TABLES[/** @type {keyof typeof TABLES} */ (table)].recipe ? 16 * REMOTE_ONLY.length : 0;
		// D1 bills these aggregate scans about two rows read per row (measured).
		for (const sql of fingerprintSql(db, table)) plan.push({ kind: 'fingerprint', table, sql, estimate: 2 * (count(table) + extra) });
	}
	const orphanSql = `SELECT ${Object.entries(TABLES)
		.filter(([, s]) => s.recipe)
		.map(([t, s]) => `(SELECT COUNT(*) FROM ${t} WHERE ${s.key} IN (${REMOTE_ONLY.join(',')})) AS ${t}`)
		.join(', ')}`;
	plan.push({ kind: 'remote-only recipes', table: '*', sql: orphanSql, estimate: 200 });
	plan.push({
		kind: 'remote-only recipes, detail',
		table: 'recipes',
		sql: `SELECT r.id, r.source_lang, r.non_staple_count, (SELECT COUNT(*) FROM recipe_ingredients x WHERE x.recipe_id = r.id) AS ingredients, (SELECT title FROM recipe_i18n t WHERE t.recipe_id = r.id AND t.lang = r.source_lang) AS title FROM recipes r WHERE r.id IN (${REMOTE_ONLY.join(',')}) ORDER BY r.id`,
		estimate: 30
	});

	const recipeIds = db.prepare('SELECT id FROM recipes ORDER BY id').all().map((r) => Number(r.id));
	const ingredientIds = db.prepare('SELECT id FROM ingredients ORDER BY id').all().map((r) => Number(r.id));
	const langs = db.prepare('SELECT DISTINCT lang FROM recipe_i18n ORDER BY lang').all().map((r) => String(r.lang));
	/** @param {string} table @param {number[]} keys @param {number} est */
	const addSample = (table, keys, est) => plan.push({ kind: 'sample', table, sql: sampleSql(db, table, keys), estimate: est, keys });
	addSample('recipes', sample(recipeIds, SAMPLE), SAMPLE);
	addSample('recipe_ingredients', sample(recipeIds, Math.ceil(SAMPLE / 2)), SAMPLE * 6);
	addSample('recipe_diets', sample(recipeIds, SAMPLE), SAMPLE * 3);
	addSample('recipe_micronutrient', sample(recipeIds, Math.ceil(SAMPLE / 2)), SAMPLE * 5);
	addSample('recipe_related', sample(recipeIds, SAMPLE), SAMPLE);
	addSample('ingredients', sample(ingredientIds, SAMPLE), SAMPLE);
	addSample('ingredient_i18n', sample(ingredientIds, Math.ceil(SAMPLE / 2)), SAMPLE * 10);
	addSample('ingredient_allergens', ingredientIds, 250);
	addSample('ingredient_generic_of', ingredientIds, 600);
	addSample('allergens', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 12);
	for (const lang of langs) {
		const keys = sample(recipeIds, Math.ceil(SAMPLE / 4));
		const sql = sampleSql(db, 'recipe_i18n', keys).replace(' WHERE recipe_id IN', ` WHERE lang = '${lang}' AND recipe_id IN`);
		plan.push({ kind: 'sample', table: `recipe_i18n/${lang}`, sql, estimate: keys.length * 2, keys });
	}

	const steps = plan.filter((p) => ONLY === 'all' || p.kind.startsWith(ONLY));
	plan.length = 0;
	plan.push(...steps);
	const estimate = plan.reduce((s, p) => s + p.estimate, 0);
	console.log(`remote parity: ${plan.length} SELECTs, estimated ${estimate} rows read (limit ${MAX_READS}); ledger today before: ${JSON.stringify(before)}`);
	if (estimate > MAX_READS) throw new Error(`estimated ${estimate} rows read exceeds --max-reads=${MAX_READS}`);

	const results = [];
	let mismatches = 0;
	for (const step of plan) {
		const local = db.prepare(step.sql).all();
		const startLedger = ledgerToday();
		const got = remote(step.sql);
		const read = ledgerToday().rows_read - startLedger.rows_read;
		const same = canon(local) === canon(got);
		/** @type {Record<string, unknown>} */
		const entry = { kind: step.kind, table: step.table, rows_read: read, same };
		if (step.kind.startsWith('remote-only')) {
			entry.remote = got;
			entry.local = local;
		} else if (!same) {
			mismatches++;
			entry.local = local.length > 20 ? `${local.length} rows` : local;
			entry.remote = got.length > 20 ? `${got.length} rows` : got;
			if (step.kind === 'sample') {
				const l = local.map(canon);
				const r = new Set(got.map(canon));
				entry.first_local_only = local.find((_, i) => !r.has(l[i]));
			}
		}
		results.push(entry);
		console.log(`${same || step.kind.startsWith('remote-only') ? 'ok  ' : 'DIFF'} ${step.kind.padEnd(28)} ${step.table.padEnd(22)} rows_read ${read}`);
	}

	const after = ledgerToday();
	const report = {
		checked_at: new Date().toISOString(),
		seed: Number(option('seed', '0')) || null,
		remote_only: REMOTE_ONLY,
		rows_read: after.rows_read - before.rows_read,
		rows_written: after.rows_written - before.rows_written,
		mismatches,
		results
	};
	const dir = path.resolve('pipeline/out/remote-parity');
	mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `${report.checked_at.slice(0, 10)}${ONLY === 'all' ? '' : `-${ONLY}`}.json`);
	writeFileSync(file, JSON.stringify(report, null, '\t') + '\n');
	console.log(
		`remote parity: ${mismatches ? `${mismatches} MISMATCHES` : 'snapshot == remote'} (remote-only recipes excluded), ` +
			`${report.rows_read} rows read, ${report.rows_written} written; report ${path.relative(process.cwd(), file)}`
	);
	process.exit(mismatches ? 1 : 0);
}

await main();
