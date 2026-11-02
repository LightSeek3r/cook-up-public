/**
 * First pass over the seasons data: decides the keys that need no judgement
 * (seasons_triage_rules.mjs) into pipeline/seasons/allyear.json and writes
 * the work lists for the agents into pipeline/out/seasons:
 *
 *   todo_<family>.json       every undecided key routed to a writer family
 *   batch_<family>_<nn>.json the same keys in batches of 25, for the writers
 *   classify_<nn>.json       keys needing an all-year-vs-seasonal decision, in batches of 80
 *
 * Idempotent: an entry already in pipeline/seasons is never touched, and the
 * work lists are rebuilt from scratch each run (stale batch files removed).
 * Keys with a {"seasonal": family} verdict (seasons_apply) go to that
 * family's writer batches. Do not rerun while writer agents hold batches:
 * the numbering follows whatever is still undecided.
 *
 * Usage: node pipeline/tools/seasons_triage.mjs [--dry-run]
 */

import { readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { AY_FAMILY, FAMILIES, flattenSources, isSeasonalEntry } from '../lib/seasons_compile.mjs';
import { validateEntry } from '../lib/seasons_gate.mjs';
import {
	WORK_DIR,
	loadIngredients,
	loadSources,
	loadVerdicts,
	parseFlags,
	writeJson,
	writeSources
} from '../lib/seasons_io.mjs';
import { suggestLike, triageKey } from '../lib/seasons_triage_rules.mjs';

const WRITE_BATCH = 25;
const CLASSIFY_BATCH = 80;
const WORK_FILE = /^(todo_[a-z_]+|batch_[a-z_]+_\d+|classify_\d+)\.json$/;

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const nn = (i) => String(i + 1).padStart(2, '0');

function main() {
	const { has } = parseFlags(process.argv.slice(2));
	const dryRun = has('dry-run');
	const ingredients = loadIngredients();
	const { sources } = loadSources();
	for (const family of Object.keys(sources)) {
		if (!FAMILIES.includes(family)) throw new Error(`pipeline/seasons/${family}.json is not a seasons family; fix it first (seasons_check)`);
	}
	const verdicts = loadVerdicts();
	const decided = flattenSources(sources);
	const byKey = new Map(ingredients.map((r) => [r.canonical_key, r]));

	const added = {};
	const routed = [];
	for (const row of ingredients) {
		const key = row.canonical_key;
		if (decided.has(key)) continue;
		const t = verdicts[key] ? { family: verdicts[key], stage: 'write' } : triageKey(row);
		if (t.ay) {
			const entry = { ay: t.ay };
			const issues = validateEntry(key, entry, { family: AY_FAMILY });
			if (issues.length) throw new Error(`triage produced an invalid entry for ${key}: ${issues[0].message}`);
			sources[AY_FAMILY][key] = entry;
			added[t.ay] = (added[t.ay] ?? 0) + 1;
		} else routed.push({ row, ...t });
	}

	const after = flattenSources(sources);
	const undecided = new Set(routed.map((r) => r.row.canonical_key));
	// A like target must end up seasonal: an undecided key may, a decided ay may not.
	const candidate = (k) => byKey.has(k) && (undecided.has(k) || isSeasonalEntry(after.get(k)));
	const toRow = ({ row, family, stage }) => {
		const like = suggestLike(row.canonical_key, candidate);
		return {
			key: row.canonical_key,
			category: row.category,
			en: row.names?.en ?? row.canonical_key,
			...(stage === 'classify' ? { family_hint: family } : {}),
			...(like ? { like_hint: like } : {})
		};
	};

	const writeFamilies = FAMILIES.filter((f) => f !== AY_FAMILY);
	const todo = Object.fromEntries(writeFamilies.map((f) => [f, []]));
	const classify = [];
	for (const r of routed) (r.stage === 'classify' ? classify : todo[r.family]).push(toRow(r));
	for (const list of [...Object.values(todo), classify]) list.sort((a, b) => (a.key < b.key ? -1 : 1));

	const changed = dryRun ? [] : writeSources(sources);
	if (!dryRun) {
		if (existsSync(WORK_DIR)) {
			for (const f of readdirSync(WORK_DIR)) if (WORK_FILE.test(f)) rmSync(path.join(WORK_DIR, f));
		}
		for (const family of writeFamilies) {
			writeJson(path.join(WORK_DIR, `todo_${family}.json`), todo[family]);
			chunks(todo[family], WRITE_BATCH).forEach((b, i) => writeJson(path.join(WORK_DIR, `batch_${family}_${nn(i)}.json`), b));
		}
		chunks(classify, CLASSIFY_BATCH).forEach((b, i) => writeJson(path.join(WORK_DIR, `classify_${nn(i)}.json`), b));
	}

	const total = Object.values(added).reduce((a, b) => a + b, 0);
	console.log(`${dryRun ? 'DRY-RUN ' : ''}decided ${total} new all-year key(s)${total ? `: ${Object.entries(added).map(([r, n]) => `${r} ${n}`).join(', ')}` : ''}`);
	console.log(`files changed: ${changed.length ? changed.map((f) => `${f}.json`).join(', ') : 'none'}`);
	for (const family of writeFamilies) {
		console.log(`write ${family.padEnd(10)} ${String(todo[family].length).padStart(4)} key(s), ${Math.ceil(todo[family].length / WRITE_BATCH)} batch(es)`);
	}
	console.log(`classify   ${String(classify.length).padStart(4)} key(s), ${Math.ceil(classify.length / CLASSIFY_BATCH)} batch(es)`);
	console.log(`undecided  ${String(routed.length).padStart(4)} of ${ingredients.length} key(s)`);
}

try {
	main();
} catch (err) {
	console.error(`seasons_triage: ${err.message}`);
	process.exitCode = 1;
}
