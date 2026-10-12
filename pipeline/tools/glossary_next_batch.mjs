/**
 * Computes the next glossary translation batch for one language, entirely from
 * the checked-in files in src/lib/glossary — no D1, no network.
 *
 * A term is "remaining" when content/<lang>.json has no entry for it, or has one
 * that fails the gate (pipeline/lib/glossary_gate.mjs). Terms whose English
 * source is not written yet are skipped: there is nothing to translate.
 *
 * Writes an array of
 *   { id, category, aliases, related_names, diagram_marks,
 *     en: { name, short, long, steps, tips, diagramAlt }, previous_issues? }
 * to --out. This is the agent's translation INPUT; the JSON it writes back has a
 * different shape, see glossary_apply.mjs's header. `previous_issues` is present
 * only for a term whose existing translation failed validation.
 *
 * Usage:
 *   node pipeline/tools/glossary_next_batch.mjs --lang=fr --n=20 --out=pipeline/out/glossary_batches/in_fr_1.json
 *   [--root=<dir holding terms.json>]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SUPPORTED_LANGS } from '../lib/langs.mjs';
import { formatIssue } from '../lib/glossary_gate.mjs';
import {
	buildBatchRow,
	DEFAULT_ROOT,
	loadGlossaryData,
	parseFlags,
	pendingTerms
} from '../lib/glossary_apply_lib.mjs';

function parseArgs() {
	const { str } = parseFlags(process.argv.slice(2));
	const lang = str('lang');
	const out = str('out');
	const n = Number(str('n') ?? '20');
	if (!lang) throw new Error('--lang=<code> is required');
	if (lang === 'en') throw new Error('English is authored separately; there is no batch for "en"');
	if (!SUPPORTED_LANGS.includes(lang)) throw new Error(`unsupported language "${lang}"`);
	if (!out) throw new Error('--out=<path> is required');
	if (!Number.isInteger(n) || n <= 0) throw new Error('--n must be a positive integer');
	return { lang, n, out, root: path.resolve(str('root') ?? DEFAULT_ROOT) };
}

function main() {
	const { lang, n, out, root } = parseArgs();
	const data = loadGlossaryData(root);
	const termById = new Map(data.terms.map((t) => [t.id, t]));
	const pending = pendingTerms({ lang, data, content: data.contentByLang[lang] ?? {} });

	const ready = [...pending].filter(([id]) => data.contentByLang.en?.[id]);
	const batch = ready.slice(0, n).map(([id, state]) => {
		const row = buildBatchRow({ term: termById.get(id), data });
		return state.issues.length ? { ...row, previous_issues: state.issues.map(formatIssue) } : row;
	});

	mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
	writeFileSync(out, JSON.stringify(batch, null, 2) + '\n');

	if (pending.size === 0) {
		console.log(`glossary_next_batch: lang=${lang} ALL DONE - every term is translated and valid`);
	} else if (batch.length === 0) {
		console.log(
			`glossary_next_batch: lang=${lang} nothing to hand out - ${pending.size} term(s) pending but ` +
				`none has an English source yet`
		);
	} else {
		console.log(
			`glossary_next_batch: lang=${lang} wrote ${batch.length} term(s) to ${out} ` +
				`(${pending.size} remaining before this batch)`
		);
	}
}

try {
	main();
} catch (err) {
	console.error(`glossary_next_batch: ${err.message}`);
	process.exitCode = 1;
}
