/**
 * Computes the next ingredient-name translation batch for one language —
 * the ingredient-name counterpart to next_batch.mjs (which does this for
 * recipe instructions).
 *
 * Checks the DB directly for which (ingredient_id, lang) pairs already
 * exist, rather than a locally-cached "done" list. That local-file approach
 * (an earlier version of this script, plus a matching write-back in
 * apply_ingredient_translations.mjs) turned out unsafe under this task's
 * real concurrency: multiple agents fill different languages in parallel,
 * and each did a full read-modify-write of the same shared JSON file — a
 * classic lost-update race (confirmed happening: the cache undercounted true
 * DB state by 90-150 rows for several languages). One agent even got fully
 * stuck in a retry loop after a permission wall blocked its own attempt to
 * patch the shared file. Querying ingredient_i18n directly has no shared
 * mutable state to race on, so this replaces the file-cache approach entirely
 * rather than trying to synchronize it harder. It walks `ingredients` and
 * probes the (ingredient_id, lang) primary key, ~2 rows read per ingredient:
 * migrations/0011 dropped idx_ingredient_i18n_lang, and a plain
 * `WHERE lang = ?` now scans every language's rows (16,624 read vs 2,078 on
 * a full local copy). CROSS JOIN pins that join order.
 *
 * Writes { canonical_key, en_name }[] to --out — the source name for an
 * agent to translate into a natural ingredient-name term in its own
 * language, not a literal word-for-word gloss. This is the agent's
 * translation INPUT; apply_ingredient_translations.mjs defines the (very
 * different) shape it writes back.
 *
 * Usage:
 *   node pipeline/tools/next_ingredient_batch.mjs --lang=pnb --n=100 --out=pipeline/out/ing_batch_pnb_1.json [--local]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { d1 } from '../lib/d1.mjs';

const OUT_DIR = path.resolve('pipeline/out');
const INGREDIENTS_PATH = path.join(OUT_DIR, 'ingredients.jsonl');
const IDS_CACHE_PATH = path.join(OUT_DIR, 'ingredient_ids.json');

function parseArgs() {
	const args = process.argv.slice(2);
	const str = (flag) => {
		const hit = args.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	const lang = str('lang');
	const out = str('out');
	const n = Number(str('n') ?? '100');
	if (!lang) throw new Error('--lang=<code> is required');
	if (!out) throw new Error('--out=<path> is required');
	if (!Number.isInteger(n) || n <= 0) throw new Error('--n must be a positive integer');
	return { lang, n, out, local: args.includes('--local') };
}

function main() {
	const { lang, n, out, local } = parseArgs();
	if (!existsSync(INGREDIENTS_PATH)) {
		throw new Error(`${INGREDIENTS_PATH} not found — run node pipeline/03_normalize_ingredients.mjs first.`);
	}
	if (!existsSync(IDS_CACHE_PATH)) {
		throw new Error(`${IDS_CACHE_PATH} not found — run load_ingredient_i18n.mjs once first to build it.`);
	}
	const rows = readFileSync(INGREDIENTS_PATH, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
	const idByKey = new Map(Object.entries(JSON.parse(readFileSync(IDS_CACHE_PATH, 'utf8'))));

	const done = d1(
		`SELECT t.ingredient_id FROM ingredients i CROSS JOIN ingredient_i18n t ON t.ingredient_id = i.id AND t.lang = '${lang}'`,
		{ local }
	);
	const doneIds = new Set(done.map((r) => r.ingredient_id));

	const gapAll = rows.filter((r) => r.names.en && !doneIds.has(idByKey.get(r.canonical_key)));
	const gap = gapAll.slice(0, n).map((r) => ({ canonical_key: r.canonical_key, en_name: r.names.en }));

	writeFileSync(out, JSON.stringify(gap, null, 2) + '\n');
	console.log(`next_ingredient_batch: lang=${lang} wrote ${gap.length} rows to ${out} (${gapAll.length} total remaining before this batch)`);
}

main();
