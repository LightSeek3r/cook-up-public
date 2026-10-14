/**
 * The recurring words of the English titles (Soup, Salad, Cake, Bread,
 * Stew...) with up to --examples of the language's current titles for each,
 * so a translator keeps one term per word across batches and a reviewer can
 * see at a glance where the titles disagree. Read-only.
 *
 * Usage:
 *   node pipeline/tools/recipe_i18n_terms.mjs --lang=fr --out=pipeline/out/recipe_i18n_batches/terms_fr.json
 *   [--top=40] [--examples=12] [--store=pipeline/data/recipe-i18n] [--pipeline-out=pipeline/out]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFlags } from '../lib/glossary_apply_lib.mjs';
import { TARGET_LANGS } from '../lib/langs.mjs';
import { loadCorpus, recurringTerms } from '../lib/recipe_i18n_lib.mjs';
import { STORE_DIR } from '../lib/recipe_i18n_store.mjs';

async function main() {
	const { str } = parseFlags(process.argv.slice(2));
	const lang = str('lang');
	const out = str('out');
	if (!lang || !TARGET_LANGS.includes(lang)) throw new Error(`--lang must be one of ${TARGET_LANGS.join(' ')}`);
	if (!out) throw new Error('--out=<path> is required');
	const corpus = await loadCorpus({ outDir: path.resolve(str('pipeline-out') ?? 'pipeline/out'), storeDir: path.resolve(str('store') ?? STORE_DIR) });
	const terms = recurringTerms(corpus, lang, { top: Number(str('top') ?? 40), examples: Number(str('examples') ?? 12) });
	mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
	writeFileSync(out, JSON.stringify({ lang, terms }, null, 2) + '\n');
	const covered = terms.filter((t) => t.translated.length).length;
	console.log(`recipe_i18n_terms: lang=${lang} wrote ${terms.length} recurring title words to ${out} (${covered} with ${lang} titles so far)`);
}

try {
	await main();
} catch (err) {
	console.error(`recipe_i18n_terms: ${err.message}`);
	process.exitCode = 1;
}
