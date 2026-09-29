/**
 * Computes the next translation batch for one language, entirely from local
 * caches — zero D1 reads.
 *
 * Requires pipeline/out/sources.json (pipeline/tools/export_sources.mjs) and
 * reads pipeline/out/applied/<lang>.json if present (written by
 * apply_manual_translations.mjs) to skip recipes already translated for that
 * language, so a translation agent never has to query D1 itself to find its
 * own gap — see .claude/plans/six-langs-and-d1-batching.md, Part A.
 *
 * Writes an array of { recipe_id, title, instructions } — the *source*
 * text for an agent to translate — to --out. This is the agent's translation
 * INPUT, not the JSON contract it writes back; see
 * apply_manual_translations.mjs's header for that (different) shape.
 *
 * Usage:
 *   node pipeline/tools/next_batch.mjs --lang=pt --n=25 --out=pipeline/out/batch_pt_1.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('pipeline/out');
const SOURCES_PATH = path.join(OUT_DIR, 'sources.json');

function parseArgs() {
	const args = process.argv.slice(2);
	const str = (flag) => {
		const hit = args.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	const lang = str('lang');
	const out = str('out');
	const n = Number(str('n') ?? '25');
	if (!lang) throw new Error('--lang=<code> is required');
	if (!out) throw new Error('--out=<path> is required');
	if (!Number.isInteger(n) || n <= 0) throw new Error('--n must be a positive integer');
	return { lang, n, out };
}

function main() {
	const { lang, n, out } = parseArgs();
	if (!existsSync(SOURCES_PATH)) {
		throw new Error(`${SOURCES_PATH} not found — run node pipeline/tools/export_sources.mjs first.`);
	}
	const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));

	const appliedPath = path.join(OUT_DIR, 'applied', `${lang}.json`);
	const applied = existsSync(appliedPath) ? new Set(JSON.parse(readFileSync(appliedPath, 'utf8'))) : new Set();

	const gap = sources.filter((s) => !applied.has(s.id)).slice(0, n);
	writeFileSync(
		out,
		JSON.stringify(
			gap.map((s) => ({ recipe_id: s.id, title: s.title, instructions: s.instructions })),
			null,
			2
		) + '\n'
	);
	console.log(
		`next_batch: lang=${lang} wrote ${gap.length} rows to ${out} ` +
			`(${applied.size} already applied, ${sources.length} total sources, ` +
			`${sources.length - applied.size} remaining before this batch)`
	);
}

main();
