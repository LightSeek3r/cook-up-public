/**
 * Validate and merge a translated glossary batch into src/lib/glossary/content/<lang>.json.
 *
 * The agent's only job is to produce the JSON below; every check and every byte
 * written comes from this script, never from the agent's self-report. The WHOLE
 * batch is validated against English first (pipeline/lib/glossary_gate.mjs): one
 * bad term rejects all of it, with a message per problem, and nothing is written.
 *
 * Input JSON shape (array; unknown fields are rejected):
 *   [{ "id": "sous-vide", "name": "...", "short": "...", "long": "...",
 *      "steps": ["..."], "tips": ["..."], "aliases": ["..."], "diagramAlt": "..." }, ...]
 * Use the ids from glossary_next_batch.mjs verbatim. steps/diagramAlt are present
 * exactly when the English entry has them; tips and aliases are optional.
 *
 * Terms already translated are refused unless --overwrite, except an existing
 * entry that currently fails validation (next_batch hands those out again).
 * Re-running with --overwrite on the same batch rewrites identical bytes.
 *
 * Usage:
 *   node pipeline/tools/glossary_apply.mjs --lang=fr --file=pipeline/out/glossary_batches/fr_1.json [--dry-run] [--overwrite]
 *   [--root=<dir holding terms.json>]
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { formatIssue } from '../lib/glossary_gate.mjs';
import {
	checkBatch,
	DEFAULT_ROOT,
	loadGlossaryData,
	mergeBatch,
	parseFlags,
	pendingTerms,
	serializeContent,
	writeContent
} from '../lib/glossary_apply_lib.mjs';

function parseArgs() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const lang = str('lang');
	const file = str('file');
	if (!lang) throw new Error('--lang=<code> is required');
	if (!file) throw new Error('--file=<path> is required');
	return {
		lang,
		file,
		dryRun: has('dry-run'),
		overwrite: has('overwrite'),
		root: path.resolve(str('root') ?? DEFAULT_ROOT)
	};
}

function main() {
	const { lang, file, dryRun, overwrite, root } = parseArgs();
	if (!existsSync(file)) throw new Error(`${file} not found`);
	let batch;
	try {
		batch = JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		throw new Error(`${file}: invalid JSON (${err.message})`, { cause: err });
	}

	const data = loadGlossaryData(root);
	const { errors, entries } = checkBatch({ lang, batch, data, overwrite });
	if (errors.length) {
		for (const e of errors) console.error(`REJECTED ${formatIssue({ ...e, lang: undefined })}`);
		console.error(`glossary_apply: batch rejected, ${errors.length} problem(s); nothing written`);
		process.exitCode = 1;
		return;
	}

	const existing = data.contentByLang[lang] ?? {};
	const merged = mergeBatch({ terms: data.terms, existing, entries });
	const remaining = pendingTerms({ lang, data, content: merged }).size;
	if (!dryRun) writeContent(root, lang, merged);

	const changed = serializeContent(merged) !== serializeContent(existing);
	console.log(
		`${dryRun ? 'DRY-RUN ' : ''}APPLIED ${entries.size} term(s) for ${lang}; ${remaining} remaining` +
			(changed ? '' : ' (no change on disk)')
	);
}

try {
	main();
} catch (err) {
	console.error(`glossary_apply: ${err.message}`);
	process.exitCode = 1;
}
