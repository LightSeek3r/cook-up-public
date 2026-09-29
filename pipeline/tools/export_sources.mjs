/**
 * One-time export of every recipe's source-language title + instructions to
 * a local JSON cache, so batch-translation and apply runs never need to
 * SELECT them from D1 repeatedly.
 *
 * Source rows don't change day to day — only adding new recipes to the corpus
 * would invalidate this cache, which doesn't happen mid-translation-run — so
 * re-running this once per pipeline session (not once per batch, which is
 * what apply_manual_translations.mjs used to do) is the whole point. See
 * .claude/plans/six-langs-and-d1-batching.md, Part A, for why repeated
 * per-batch SELECTs were burning D1 read quota for data that never changes.
 *
 * Cost: one real D1 read per recipe row (~3,484 today, more once new recipes
 * are added). Counts against the daily read budget in pipeline/lib/d1.mjs.
 *
 * Usage:
 *   node pipeline/tools/export_sources.mjs [--local]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { d1 } from '../lib/d1.mjs';

const OUT_DIR = path.resolve('pipeline/out');

function parseArgs() {
	return { local: process.argv.slice(2).includes('--local') };
}

function main() {
	const { local } = parseArgs();
	const rows = d1(
		`SELECT r.id, r.source_lang, s.title, s.instructions
		 FROM recipes r
		 JOIN recipe_i18n s ON s.recipe_id = r.id AND s.lang = r.source_lang`,
		{ local }
	);

	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(path.join(OUT_DIR, 'sources.json'), JSON.stringify(rows) + '\n');
	console.log(`export_sources: wrote ${rows.length} source rows to pipeline/out/sources.json`);
}

main();
