#!/usr/bin/env node
/**
 * Sync ingredient_i18n cache (pipeline/out/ingredients.jsonl) with newly inserted names from D1.
 * Updates ingredients.jsonl to reflect translations already applied to the database.
 * Usage: node pipeline/tools/sync_ingredient_i18n_cache.mjs --lang=pnb --file=pipeline/out/ing_batch_pnb_agent_translated.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

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
	return { lang, file };
}

function main() {
	const { lang, file } = parseArgs();
	const OUT_DIR = path.resolve('pipeline/out');
	const INGREDIENTS_PATH = path.join(OUT_DIR, 'ingredients.jsonl');

	if (!existsSync(INGREDIENTS_PATH)) {
		throw new Error(`${INGREDIENTS_PATH} not found`);
	}
	if (!existsSync(file)) {
		throw new Error(`${file} not found`);
	}

	const ingredients = readFileSync(INGREDIENTS_PATH, 'utf8')
		.trim()
		.split('\n')
		.map((l) => JSON.parse(l));

	const translations = JSON.parse(readFileSync(file, 'utf8'));
	const transMap = new Map(translations.map((t) => [t.canonical_key, t.name]));

	let updated = 0;
	for (const ing of ingredients) {
		if (transMap.has(ing.canonical_key)) {
			ing.names[lang] = transMap.get(ing.canonical_key);
			updated++;
		}
	}

	writeFileSync(INGREDIENTS_PATH, ingredients.map((r) => JSON.stringify(r)).join('\n') + '\n');
	console.log(`sync_ingredient_i18n_cache: updated ${updated} entries for lang=${lang}`);
}

main();
