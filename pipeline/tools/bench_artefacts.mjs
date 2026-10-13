/**
 * Cold-start cost of the artefacts: for each scenario, N fresh Node processes
 * each decode core.bin, load the corpus and answer one first request, timed
 * from bytes in memory (reading them is I/O, as an ASSETS fetch or a bundled
 * module is on a Worker), then the same request warm. Synchronous wall time on
 * one thread, so it is CPU time. Prints median / p90 / max in ms.
 *
 * Usage: node pipeline/tools/bench_artefacts.mjs [--dir=static/data] [--runs=20]
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const option = (/** @type {string} */ name, /** @type {string} */ fallback) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dir = path.resolve(option('dir', 'static/data'));
const SCENARIOS = ['match', 'search', 'ingredients', 'page', 'match-base64'];

/** One measurement in this process. @param {string} scenario */
async function child(scenario) {
	const bytes = readFileSync(path.join(dir, 'core.bin'));
	const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	const base64 = bytes.toString('base64');
	const langs = readdirSync(path.join(dir, 'names')).map((f) => f.replace(/\.json$/, ''));
	const read = (/** @type {string} */ p) => readFileSync(path.join(dir, p), 'utf8');
	const titles = Object.fromEntries(langs.map((l) => [l, read(`titles/${l}.json`)]));
	const names = Object.fromEntries(langs.map((l) => [l, read(`names/${l}.json`)]));
	const recipeFile = readdirSync(path.join(dir, 'r'))[0];
	const detail = read(`r/${recipeFile}`);
	const data = await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/lib/data/index.js')).href);

	const t0 = performance.now();
	let core;
	if (scenario === 'match-base64') {
		// A core bundled into the Worker as a base64 string (Vite `?inline`).
		const bin = atob(base64);
		const u8 = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
		core = data.decodeCore(u8);
	} else core = data.decodeCore(buffer);
	const t1 = performance.now();
	const corpus = data.loadCorpus({ core, titles, names });
	const run = {
		match: () => {
			const have = data.resolveKeys(corpus, ['onion', 'garlic', 'tomato']);
			return data.matchCore(corpus, { have, lang: 'fr', slack: data.slackFor(have.length) });
		},
		search: () => data.searchTitles(corpus, { q: 'chicken', lang: 'fr' }),
		ingredients: () => data.searchIngredients(corpus, { q: 'tom', lang: 'fr' }),
		page: () => data.recipePage(corpus, JSON.parse(detail), 'fr')
	}[scenario === 'match-base64' ? 'match' : scenario];
	const t2 = performance.now();
	run();
	const t3 = performance.now();
	const W = 200;
	for (let i = 0; i < W; i++) run();
	const warm = (performance.now() - t3) / W;
	console.log(JSON.stringify({ decode: t1 - t0, load: t2 - t1, first: t3 - t2, cold: t3 - t0, warm }));
}

function main() {
	const runs = Number(option('runs', '20'));
	const self = fileURLToPath(import.meta.url);
	console.log(`artefacts ${dir}, ${runs} fresh processes per scenario; ms median / p90 / max`);
	for (const scenario of SCENARIOS) {
		const results = [];
		for (let i = 0; i < runs; i++) {
			const out = execFileSync(process.execPath, [self, `--child=${scenario}`, `--dir=${dir}`], { encoding: 'utf8' });
			results.push(JSON.parse(out.trim().split('\n').at(-1) ?? '{}'));
		}
		const stat = (/** @type {string} */ k) => {
			const v = results.map((r) => r[k]).sort((a, b) => a - b);
			return [v[Math.floor(v.length / 2)], v[Math.floor(v.length * 0.9)], v.at(-1)].map((x) => x.toFixed(2)).join(' / ');
		};
		console.log(`${scenario.padEnd(13)} decode ${stat('decode')}   load ${stat('load')}   first ${stat('first')}   COLD ${stat('cold')}   warm ${stat('warm')}`);
	}
}

const childScenario = option('child', '');
if (childScenario) await child(childScenario);
else main();
