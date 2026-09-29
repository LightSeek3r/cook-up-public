/**
 * One-time seed of pipeline/out/applied/<lang>.json for languages that
 * already have real rows on remote from before apply_manual_translations.mjs
 * started keeping this cache itself (hi/ja/vi, filled across earlier
 * sessions). Without this, next_batch.mjs would hand out recipes that are
 * already translated, and apply_manual_translations.mjs would have to fall
 * back on INSERT OR IGNORE to discover that the slow way, one row at a time.
 *
 * A brand-new language (pt/it/bn/ru/pnb/jv) needs none of this — its cache
 * starts empty and grows correctly from apply_manual_translations.mjs alone.
 *
 * Cost: one real D1 read per already-translated row across the given langs
 * (not per (recipe_id, lang) pair queried — D1 charges more than the result
 * row count for this shape of query; measured, not assumed, on 2026-09-25).
 * Run once per lang, ever.
 *
 * Usage:
 *   node pipeline/tools/seed_applied_cache.mjs --lang=hi,ja,vi [--local]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { d1 } from '../lib/d1.mjs';

const OUT_DIR = path.resolve('pipeline/out');
const APPLIED_DIR = path.join(OUT_DIR, 'applied');

function parseArgs() {
	const args = process.argv.slice(2);
	const str = (flag) => {
		const hit = args.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	const langs = (str('lang') ?? '').split(',').filter(Boolean);
	if (!langs.length) throw new Error('--lang=<comma-separated codes> is required');
	return { langs, local: args.includes('--local') };
}

function main() {
	const { langs, local } = parseArgs();
	const inList = langs.map((l) => `'${l}'`).join(',');
	const rows = d1(`SELECT recipe_id, lang FROM recipe_i18n WHERE lang IN (${inList})`, { local });

	const byLang = new Map(langs.map((l) => [l, []]));
	for (const r of rows) byLang.get(r.lang)?.push(r.recipe_id);

	mkdirSync(APPLIED_DIR, { recursive: true });
	for (const lang of langs) {
		const ids = (byLang.get(lang) ?? []).sort((a, b) => a - b);
		writeFileSync(path.join(APPLIED_DIR, `${lang}.json`), JSON.stringify(ids) + '\n');
		console.log(`seed_applied_cache: ${lang} — ${ids.length} already-applied rows cached`);
	}
}

main();
