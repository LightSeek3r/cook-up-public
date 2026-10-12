/**
 * Coverage matrix for the glossary: one row per language with how many terms
 * are done (present and valid), the total, and how many entries are invalid.
 * Exits non-zero when anything is invalid or the shared structure is broken.
 * Works on a partial dataset: a missing language file counts as 0 done.
 *
 * Usage:
 *   node pipeline/tools/glossary_status.mjs [--verbose] [--root=<dir holding terms.json>]
 */

import path from 'node:path';
import { SUPPORTED_LANGS } from '../lib/langs.mjs';
import { formatIssue, validateStructure } from '../lib/glossary_gate.mjs';
import {
	DEFAULT_ROOT,
	loadGlossaryData,
	parseFlags,
	pendingTerms
} from '../lib/glossary_apply_lib.mjs';

const MAX_LINES = 10;

function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const verbose = has('verbose');
	const data = loadGlossaryData(path.resolve(str('root') ?? DEFAULT_ROOT));
	const total = data.terms.length;
	let failed = false;

	// Language-neutral problems: shape of every content file is reported per
	// language below, so only issues without a language belong here.
	const neutral = validateStructure({
		terms: data.terms,
		diagrams: data.diagrams,
		diagramFileExists: data.diagramFileExists
	});
	if (neutral.length) {
		failed = true;
		console.log(`structure: ${neutral.length} problem(s)`);
		for (const i of neutral.slice(0, verbose ? Infinity : MAX_LINES)) console.log(`  ${formatIssue(i)}`);
		if (!verbose && neutral.length > MAX_LINES) console.log(`  ... ${neutral.length - MAX_LINES} more (--verbose)`);
	}

	const langs = [...new Set([...SUPPORTED_LANGS, ...Object.keys(data.contentByLang)])];
	console.log('lang  done/total  invalid');
	const details = [];
	for (const lang of langs) {
		const content = data.contentByLang[lang] ?? {};
		const pending = pendingTerms({ lang, data, content });
		const invalid = [...pending.values()].filter((p) => !p.missing);
		const known = new Set(data.terms.map((t) => t.id));
		const stray = Object.keys(content).filter((id) => !known.has(id));
		const done = Object.keys(content).length - stray.length - invalid.length;
		const invalidCount = invalid.length + stray.length;
		console.log(`${lang.padEnd(5)} ${`${done}/${total}`.padEnd(11)} ${invalidCount}`);
		if (invalidCount) failed = true;
		for (const p of invalid) details.push(...p.issues.map(formatIssue));
		for (const id of stray) details.push(`${lang} ${id}: [unknown-id] content key is not a term id in terms.json`);
		if (!SUPPORTED_LANGS.includes(lang)) {
			failed = true;
			details.push(`${lang}: [unknown-lang] not a supported language code`);
		}
	}

	if (details.length) {
		console.log(`\n${details.length} issue(s):`);
		for (const line of details.slice(0, verbose ? Infinity : MAX_LINES * 3)) console.log(`  ${line}`);
		if (!verbose && details.length > MAX_LINES * 3) {
			console.log(`  ... ${details.length - MAX_LINES * 3} more (--verbose)`);
		}
	}
	if (failed) process.exitCode = 1;
}

try {
	main();
} catch (err) {
	console.error(`glossary_status: ${err.message}`);
	process.exitCode = 1;
}
