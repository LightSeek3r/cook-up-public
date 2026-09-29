/**
 * Validate + apply agent-translated ingredient_i18n names.
 *
 * Same "agent produces JSON only, this script owns every check and every
 * byte of SQL" split as apply_manual_translations.mjs, adapted for short
 * ingredient names rather than multi-line recipe instructions:
 *  - no line-count check (a name is one line by definition)
 *  - no length-ratio check (too noisy at this scale — "egg" vs its
 *    translation can legitimately be 3x longer); a flat max-length sanity
 *    check catches the actual failure mode instead (an agent pasting a
 *    description/sentence instead of a short name — 80 chars is comfortably
 *    above the longest existing name in any language, 62)
 *  - script-presence / byte-identical-to-source checks are unchanged,
 *    reused directly from translate_gate.mjs
 *
 * Input JSON shape:
 *   [{ "canonical_key": "green_onion", "name": "..." }, ...]
 *
 * canonical_key -> ingredient_id comes from pipeline/out/ingredient_ids.json
 * (built by load_ingredient_i18n.mjs's first run); en_name for the
 * byte-identical check comes from pipeline/out/ingredients.jsonl.
 *
 * Usage:
 *   node pipeline/tools/apply_ingredient_translations.mjs --lang=pnb --file=batch.json [--dry-run] [--overwrite] [--local]
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { esc, d1 } from '../lib/d1.mjs';
import { hasLiteralBackslashN, hasTargetScript, looksUntranslated } from '../lib/translate_gate.mjs';

// translate_gate.mjs's pnb check requires a Shahmukhi/Urdu-only letter
// (ٹڈڑںھہے) — calibrated for whole recipe instructions, where that letter
// turning up somewhere in a paragraph of genuine Punjabi is near-certain.
// An ingredient name is 1-3 words with no such guarantee: "شکر" (sugar) is
// entirely genuine Shahmukhi and contains none of those letters, and got
// wrongly rejected by the stricter check during testing. For names, just
// require the Arabic Unicode block — the same bar `ar` itself gets — and
// leave translate_gate.mjs's stricter recipe-instructions check untouched.
const ARABIC_BLOCK = /[؀-ۿ]/;
function hasIngredientScript(lang, text) {
	if (lang === 'pnb') return ARABIC_BLOCK.test(text);
	return hasTargetScript(lang, text);
}

const OUT_DIR = path.resolve('pipeline/out');
const INGREDIENTS_PATH = path.join(OUT_DIR, 'ingredients.jsonl');
const IDS_CACHE_PATH = path.join(OUT_DIR, 'ingredient_ids.json');
const MAX_NAME_LENGTH = 80; // longest real name across every existing language is 62
const FLUSH_EVERY = 100;

function parseArgs() {
	const args = process.argv.slice(2);
	const str = (flag) => {
		const hit = args.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	const lang = str('lang');
	const file = str('file');
	if (!lang) throw new Error('--lang=<code> is required');
	if (!file) throw new Error('--file=<path> is required');
	return { lang, file, dryRun: args.includes('--dry-run'), overwrite: args.includes('--overwrite'), local: args.includes('--local') };
}

function loadBatch(file) {
	const raw = JSON.parse(readFileSync(file, 'utf8'));
	if (!Array.isArray(raw)) throw new Error('input file must be a JSON array');
	const seen = new Set();
	for (const row of raw) {
		if (typeof row !== 'object' || row === null) throw new Error('every element must be an object');
		if (typeof row.canonical_key !== 'string' || !row.canonical_key) {
			throw new Error(`invalid canonical_key: ${JSON.stringify(row.canonical_key)}`);
		}
		if (typeof row.name !== 'string' || row.name.trim() === '') {
			throw new Error(`canonical_key ${row.canonical_key}: name must be a non-empty string`);
		}
		if (seen.has(row.canonical_key)) throw new Error(`duplicate canonical_key ${row.canonical_key} within input file`);
		seen.add(row.canonical_key);
	}
	return raw;
}

function loadEnNames() {
	if (!existsSync(INGREDIENTS_PATH)) {
		throw new Error(`${INGREDIENTS_PATH} not found — run node pipeline/03_normalize_ingredients.mjs first.`);
	}
	const rows = readFileSync(INGREDIENTS_PATH, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
	return new Map(rows.map((r) => [r.canonical_key, r.names.en]));
}

function loadIdMap() {
	if (!existsSync(IDS_CACHE_PATH)) {
		throw new Error(`${IDS_CACHE_PATH} not found — run load_ingredient_i18n.mjs once first to build it.`);
	}
	return new Map(Object.entries(JSON.parse(readFileSync(IDS_CACHE_PATH, 'utf8'))));
}

async function main() {
	const { lang, file, dryRun, overwrite, local } = parseArgs();
	const batch = loadBatch(file);
	if (batch.length === 0) {
		console.log('apply_ingredient_translations: input file is empty, nothing to do');
		return;
	}

	const enByKey = loadEnNames();
	const idByKey = loadIdMap();

	const rejects = [];
	const inserts = [];

	for (const row of batch) {
		const enName = enByKey.get(row.canonical_key);
		const id = idByKey.get(row.canonical_key);
		if (!id) {
			rejects.push([row.canonical_key, 'no-ingredient-id-match']);
			continue;
		}
		if (row.name.length > MAX_NAME_LENGTH) {
			rejects.push([row.canonical_key, 'suspiciously-long']);
			continue;
		}
		if (hasLiteralBackslashN(row.name)) {
			rejects.push([row.canonical_key, 'literal-backslash-n-found']);
			continue;
		}
		const scriptCheck = hasIngredientScript(lang, row.name);
		if (scriptCheck === false) {
			rejects.push([row.canonical_key, 'no-target-script']);
			continue;
		}
		if (scriptCheck === undefined && enName && looksUntranslated(enName, row.name)) {
			rejects.push([row.canonical_key, 'byte-identical-to-source']);
			continue;
		}
		inserts.push({ id, name: row.name });
	}

	const insertKeyword = overwrite ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
	let insertedCount = 0;
	for (let i = 0; i < inserts.length; i += FLUSH_EVERY) {
		const chunk = inserts.slice(i, i + FLUSH_EVERY);
		const values = chunk.map((r) => `(${r.id},${esc(lang)},${esc(r.name)})`).join(',\n');
		if (!dryRun) {
			d1(`${insertKeyword} INTO ingredient_i18n (ingredient_id, lang, name) VALUES\n${values};`, { local, json: false });
		}
		insertedCount += chunk.length;
	}

	// No local cache to refresh here (deliberate, not an oversight): as of the
	// next_ingredient_batch.mjs rewrite, the gap check queries ingredient_i18n
	// directly instead of a local file — see that file's header for why (a
	// multi-agent write race silently lost cache updates under real concurrency).
	// The DB write above via INSERT OR IGNORE is what actually matters.

	if (rejects.length) {
		mkdirSync(OUT_DIR, { recursive: true });
		writeFileSync(
			path.join(OUT_DIR, `ingredient_apply_rejects_${lang}.txt`),
			rejects.map(([k, reason]) => `${k}\t${reason}`).join('\n') + '\n'
		);
	}

	console.log(
		`apply_ingredient_translations: lang=${lang} inserted=${insertedCount} rejected=${rejects.length}` +
			`${dryRun ? ' [DRY RUN — nothing written]' : ''}`
	);
	if (rejects.length) {
		const counts = {};
		for (const [, reason] of rejects) counts[reason] = (counts[reason] ?? 0) + 1;
		console.log(`apply_ingredient_translations: reject reasons — ${JSON.stringify(counts)}`);
	}
}

await main();
