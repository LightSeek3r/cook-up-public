/**
 * Writes the next recipe translation batch for one language and kind, from
 * the local store and pipeline/out alone (no D1, no network).
 *
 * A recipe is pending when the language has no entry for it, or one that
 * fails the gate (pipeline/lib/recipe_i18n_gate.mjs) or is stale (its English
 * text changed). Missing ones come first, then pending ones with their
 * `previous_issues`. With --review it hands out instead the valid entries no
 * reviewer has passed yet, each with its `current` text.
 *
 * Rows written to --out (the translator's INPUT; what comes back is the
 * shape in recipe_i18n_apply.mjs's header):
 *   titles        { id, en, cuisine, meal, ingredients, first_step, current?, kept_as_english?, previous_issues? }
 *   instructions  { id, en_title, lines, en, current?, previous_issues? }
 *
 * Usage:
 *   node pipeline/tools/recipe_i18n_next_batch.mjs --kind=titles --lang=fr [--n=100] --out=pipeline/out/recipe_i18n_batches/in_titles_fr_1.json
 *   node pipeline/tools/recipe_i18n_next_batch.mjs --kind=instructions --lang=bn [--n=15] --out=...
 *   [--review] [--ids=1,2,3] [--store=pipeline/data/recipe-i18n] [--pipeline-out=pipeline/out]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFlags } from '../lib/glossary_apply_lib.mjs';
import { TARGET_LANGS } from '../lib/langs.mjs';
import { DEFAULT_N, MAX_BATCH, loadCorpus, nextBatch } from '../lib/recipe_i18n_lib.mjs';
import { KINDS, STORE_DIR } from '../lib/recipe_i18n_store.mjs';

async function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const kind = str('kind');
	const lang = str('lang');
	const out = str('out');
	if (!KINDS.includes(kind ?? '')) throw new Error(`--kind=${KINDS.join('|')} is required`);
	if (!lang || !TARGET_LANGS.includes(lang)) throw new Error(`--lang must be one of ${TARGET_LANGS.join(' ')}`);
	if (!out) throw new Error('--out=<path> is required');
	const n = Number(str('n') ?? DEFAULT_N[kind]);
	if (!Number.isInteger(n) || n <= 0 || n > MAX_BATCH[kind]) throw new Error(`--n must be an integer from 1 to ${MAX_BATCH[kind]}`);
	const ids = str('ids')?.split(',').map(Number) ?? null;
	if (ids?.some((id) => !Number.isInteger(id))) throw new Error('--ids must be comma-separated recipe ids');
	const review = has('review');

	const corpus = await loadCorpus({ outDir: path.resolve(str('pipeline-out') ?? 'pipeline/out'), storeDir: path.resolve(str('store') ?? STORE_DIR) });
	const { rows, remaining, pending } = nextBatch({ corpus, kind, lang, n, review, ids });
	mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
	writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
	const what = review ? `${kind} to review` : kind;
	if (!remaining) {
		console.log(`recipe_i18n_next_batch: kind=${kind} lang=${lang} ALL DONE - no ${what} left${review ? ` (${pending} still pending translation)` : ''}`);
	} else {
		console.log(`recipe_i18n_next_batch: kind=${kind} lang=${lang} wrote ${rows.length} ${what} to ${out} (${remaining} remaining before this batch)`);
	}
}

try {
	await main();
} catch (err) {
	console.error(`recipe_i18n_next_batch: ${err.message}`);
	process.exitCode = 1;
}
