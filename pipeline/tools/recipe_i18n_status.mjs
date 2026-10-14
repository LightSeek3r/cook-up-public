/**
 * Coverage matrix of the recipe translation store: per kind and language, how
 * many served recipes are done (present, valid, not stale), missing, invalid
 * or stale, how many a reviewer has passed, and (titles) how many a reviewer
 * kept as in English. For instructions imported from the backup, `advisory`
 * counts the rows that pass the rules they were accepted under but not the
 * full gate a new batch must pass; they are not handed out again.
 *
 * Exits 1 when a store file is damaged, or with --strict when anything is
 * pending.
 *
 * Usage:
 *   node pipeline/tools/recipe_i18n_status.mjs [--kind=titles|instructions] [--lang=xx]
 *     [--verbose] [--strict] [--store=pipeline/data/recipe-i18n] [--pipeline-out=pipeline/out]
 */

import path from 'node:path';
import { parseFlags } from '../lib/glossary_apply_lib.mjs';
import { TARGET_LANGS } from '../lib/langs.mjs';
import { formatIssue } from '../lib/recipe_i18n_gate.mjs';
import { coverage, loadCorpus } from '../lib/recipe_i18n_lib.mjs';
import { KINDS, STORE_DIR } from '../lib/recipe_i18n_store.mjs';

const MAX_LINES = 30;

async function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const kinds = str('kind') ? [str('kind')] : KINDS;
	for (const k of kinds) if (!KINDS.includes(k)) throw new Error(`--kind must be ${KINDS.join(' or ')}`);
	const langs = str('lang') ? [str('lang')] : TARGET_LANGS;
	const corpus = await loadCorpus({ outDir: path.resolve(str('pipeline-out') ?? 'pipeline/out'), storeDir: path.resolve(str('store') ?? STORE_DIR) });
	const total = corpus.recipes.size;
	let pendingAll = 0;
	const details = [];
	for (const kind of kinds) {
		console.log(`\n${kind} (${total} served recipes)`);
		console.log(`lang  ${'done'.padStart(5)} ${'missing'.padStart(7)} ${'invalid'.padStart(7)} ${'stale'.padStart(5)} ${'reviewed'.padStart(8)} ${(kind === 'titles' ? 'kept-en' : 'advisory').padStart(8)}`);
		for (const lang of langs) {
			const states = coverage(corpus, kind, lang);
			const missing = states.filter((s) => s.missing).length;
			const stale = states.filter((s) => s.blocking.some((i) => i.rule === 'stale')).length;
			const invalid = states.filter((s) => s.blocking.some((i) => i.rule !== 'stale')).length;
			const pending = states.filter((s) => s.missing || s.blocking.length).length;
			const reviewed = states.filter((s) => s.entry?.reviewed && !s.blocking.length).length;
			const last = kind === 'titles' ? states.filter((s) => s.entry?.keep).length : states.filter((s) => s.advisory.length).length;
			pendingAll += pending;
			console.log(
				`${lang.padEnd(5)} ${String(total - pending).padStart(5)} ${String(missing).padStart(7)} ${String(invalid).padStart(7)} ` +
					`${String(stale).padStart(5)} ${String(reviewed).padStart(8)} ${String(last).padStart(8)}`
			);
			for (const s of states) {
				for (const i of s.blocking) details.push(`${kind} ${formatIssue({ ...i, lang, id: s.id })}`);
				if (has('verbose')) for (const i of s.advisory) details.push(`${kind} advisory ${formatIssue({ ...i, lang, id: s.id })}`);
			}
		}
	}
	if (details.length) {
		console.log(`\n${details.length} issue(s):`);
		for (const line of details.slice(0, has('verbose') ? Infinity : MAX_LINES)) console.log(`  ${line}`);
		if (!has('verbose') && details.length > MAX_LINES) console.log(`  ... ${details.length - MAX_LINES} more (--verbose)`);
	}
	if (has('strict') && pendingAll) process.exitCode = 1;
}

try {
	await main();
} catch (err) {
	console.error(`recipe_i18n_status: ${err.message}`);
	process.exitCode = 1;
}
