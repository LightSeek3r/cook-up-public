/**
 * Validates a translated recipe batch and merges it into the store
 * (pipeline/lib/recipe_i18n_store.mjs). The agent's only job is the JSON
 * below; every check and every byte written comes from this script. The WHOLE
 * batch is validated first (pipeline/lib/recipe_i18n_gate.mjs): one bad row
 * rejects all of it, with one REJECTED line per problem, and nothing is
 * written. The write is one atomic file replace, refused if the file changed
 * while the batch was checked.
 *
 * Input JSON (array; unknown fields are rejected; ids exactly as handed out):
 *   titles        [{ "id": 100004, "title": "..." }, ...]
 *                 review only: "keep_source": "<why the English title stays>" (title must equal English)
 *   instructions  [{ "id": 100004, "instructions": "1. ...\n2. ..." }, ...]
 *
 * A first pass writes recipes the language lacks or whose entry is pending;
 * --overwrite also replaces valid ones. --review accepts only existing
 * entries (corrected or confirmed), holds them to the full gate and marks
 * them reviewed. Re-applying the same batch rewrites identical bytes.
 *
 * Usage:
 *   node pipeline/tools/recipe_i18n_apply.mjs --kind=titles --lang=fr --file=pipeline/out/recipe_i18n_batches/titles_fr_1.json
 *   [--review] [--overwrite] [--dry-run] [--store=pipeline/data/recipe-i18n] [--pipeline-out=pipeline/out]
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFlags } from '../lib/glossary_apply_lib.mjs';
import { formatIssue } from '../lib/recipe_i18n_gate.mjs';
import { checkBatch, coverage, loadCorpus, mergeEntries } from '../lib/recipe_i18n_lib.mjs';
import { KINDS, readFile, STORE_DIR, writeFile } from '../lib/recipe_i18n_store.mjs';

async function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const kind = str('kind');
	const lang = str('lang');
	const file = str('file');
	if (!KINDS.includes(kind ?? '')) throw new Error(`--kind=${KINDS.join('|')} is required`);
	if (!lang) throw new Error('--lang=<code> is required');
	if (!file) throw new Error('--file=<path> is required');
	if (!existsSync(file)) throw new Error(`${file} not found`);
	let batch;
	try {
		batch = JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		throw new Error(`${file}: invalid JSON (${err.message})`, { cause: err });
	}
	const storeDir = path.resolve(str('store') ?? STORE_DIR);
	const review = has('review');

	const before = readFile(kind, lang, storeDir);
	const corpus = await loadCorpus({ outDir: path.resolve(str('pipeline-out') ?? 'pipeline/out'), storeDir });
	const { errors, entries } = checkBatch({ corpus, kind, lang, batch, review, overwrite: has('overwrite') });
	if (errors.length) {
		for (const e of errors) console.error(`REJECTED ${formatIssue(e)}`);
		console.error(`recipe_i18n_apply: batch rejected, ${errors.length} problem(s); nothing written`);
		process.exitCode = 1;
		return;
	}
	const merged = mergeEntries(corpus.store[kind][lang] ?? new Map(), entries);
	const changed = has('dry-run') ? false : writeFile(kind, lang, merged, { dir: storeDir, expectSha: before.sha256 });
	corpus.store[kind][lang] = merged;
	const states = coverage(corpus, kind, lang);
	const remaining = states.filter((s) => s.missing || s.blocking.length).length;
	const unreviewed = states.filter((s) => !s.missing && !s.blocking.length && !s.entry.reviewed).length;
	console.log(
		`${has('dry-run') ? 'DRY-RUN ' : ''}APPLIED ${entries.size} ${kind} for ${lang}${review ? ' (reviewed)' : ''}; ` +
			`${remaining} remaining, ${unreviewed} awaiting review${changed || has('dry-run') ? '' : ' (no change on disk)'}`
	);
}

try {
	await main();
} catch (err) {
	console.error(`recipe_i18n_apply: ${err.message}`);
	process.exitCode = 1;
}
