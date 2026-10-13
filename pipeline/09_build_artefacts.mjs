/**
 * Stage 09 — static data artefacts (pipeline/lib/artefacts.mjs) from the
 * pipeline snapshot: pipeline/out plus the translation backup, through the
 * same statements 06_seed_d1.mjs writes for a local D1.
 *
 * Usage:
 *   node pipeline/09_build_artefacts.mjs [--out=pipeline/out/artefacts] [--sql=<fixture.sql>] [--save-db=<file>]
 *
 * --sql builds from plain INSERTs applied after every migration (a test
 * fixture such as tests/e2e/fixtures/seed.sql) instead of the snapshot.
 * Writes the files into --out (replacing it) and prints sizes; refuses when a
 * budget is exceeded. --save-db also writes the database the artefacts were
 * built from, for the parity tests (DATA_PARITY_DB, see src/lib/data). Publishing
 * is pipeline/tools/publish_artefacts.mjs.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildArtefacts, checkBudgets, fixtureDb, snapshotDb } from './lib/artefacts.mjs';
import { readManifest } from './lib/i18n_backup.mjs';
import { sha256, writeTree } from '../scripts/lib/datapack.mjs';

const option = (/** @type {string} */ name) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const INPUT_FILES = [
	'recipes.jsonl', 'ingredients.jsonl', 'recipe_ingredients.jsonl', 'recipe_ingredients.grams.jsonl',
	'recipe_diets.jsonl', 'recipes.nutrition.jsonl', 'ingredient_nutrition.jsonl',
	'ingredient_micronutrient.jsonl', 'recipe_micronutrient.jsonl', 'recipe_images.jsonl'
];

/** @param {number[]} sorted @param {number} q */
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(1)} KB`;

/** @param {Map<string, Buffer>} files */
export function sizeReport(files) {
	/** @type {Map<string, { n: number, raw: number, gz: number, rawSizes: number[], gzSizes: number[] }>} */
	const groups = new Map();
	for (const [p, body] of files) {
		const group = p.includes('/') ? `${p.split('/')[0]}/*` : p;
		const gz = gzipSync(body, { level: 9 }).length;
		const g = groups.get(group) ?? { n: 0, raw: 0, gz: 0, rawSizes: [], gzSizes: [] };
		g.n++;
		g.raw += body.length;
		g.gz += gz;
		g.rawSizes.push(body.length);
		g.gzSizes.push(gz);
		groups.set(group, g);
	}
	const lines = [];
	for (const [group, g] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
		const raw = g.rawSizes.sort((a, b) => a - b);
		const gz = g.gzSizes.sort((a, b) => a - b);
		lines.push(
			g.n === 1
				? `${group.padEnd(16)} ${kb(g.raw).padStart(10)} raw ${kb(g.gz).padStart(10)} gzip`
				: `${group.padEnd(16)} ${String(g.n).padStart(5)} files, total ${kb(g.raw)} raw / ${kb(g.gz)} gzip; ` +
						`per file raw min ${kb(raw[0])} median ${kb(quantile(raw, 0.5))} p95 ${kb(quantile(raw, 0.95))} max ${kb(raw.at(-1) ?? 0)}; ` +
						`gzip median ${kb(quantile(gz, 0.5))} p95 ${kb(quantile(gz, 0.95))} max ${kb(gz.at(-1) ?? 0)}`
		);
	}
	return lines;
}

async function main() {
	const out = path.resolve(option('out') ?? 'pipeline/out/artefacts');
	const sqlFile = option('sql');
	let db;
	/** @type {Record<string, unknown>} */
	let source;
	if (sqlFile) {
		const sql = readFileSync(sqlFile);
		db = fixtureDb(sql.toString('utf8'));
		source = { fixture: path.basename(sqlFile), sha256: sha256(sql) };
	} else {
		const snap = await snapshotDb();
		db = snap.db;
		const backupManifest = readManifest();
		source = {
			pipeline_out: Object.fromEntries(INPUT_FILES.map((f) => [f, sha256(readFileSync(path.join('pipeline/out', f)))])),
			i18n_backup: { exported_at: backupManifest?.exported_at ?? null, manifest_sha256: sha256(readFileSync('pipeline/data/i18n-backup/manifest.json')) }
		};
		const s = snap.seed;
		console.log(
			`09_build_artefacts: snapshot ${s.rows.keptRecipes.length} recipes, ${s.rows.ingredients.length} ingredients; ` +
				`${s.i18n.notKept} backed-up recipe_i18n rows left out (recipes with no kept ingredient)`
		);
	}
	const started = performance.now();
	const { version, files, manifest } = buildArtefacts(db, { source });
	const problems = checkBudgets(files);
	console.log(`09_build_artefacts: data version ${version}, ${files.size} files in ${((performance.now() - started) / 1000).toFixed(1)} s`);
	for (const line of sizeReport(files)) console.log(`  ${line}`);
	console.log(`  counts ${JSON.stringify(manifest.counts)}`);
	if (problems.length) {
		for (const p of problems) console.error(`BUDGET: ${p}`);
		process.exit(1);
	}
	writeTree(out, files);
	const saveDb = option('save-db');
	if (saveDb) {
		if (existsSync(saveDb)) rmSync(saveDb);
		db.exec(`VACUUM INTO '${path.resolve(saveDb).replaceAll("'", "''")}'`);
	}
	console.log(`09_build_artefacts: wrote ${path.relative(process.cwd(), out)}${saveDb ? ` and ${saveDb}` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
