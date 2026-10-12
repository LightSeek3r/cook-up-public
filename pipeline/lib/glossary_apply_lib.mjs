/**
 * Batch validation and merge logic behind pipeline/tools/glossary_apply.mjs,
 * glossary_next_batch.mjs and glossary_status.mjs. The decision functions are
 * pure; the few filesystem helpers at the bottom are thin so every tool reads
 * and writes src/lib/glossary the same way (2-space JSON, LF, trailing newline,
 * keys in terms.json order).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SUPPORTED_LANGS } from './langs.mjs';
import {
	validateContentShape,
	validateLangContent,
	validateTextShape,
	missingIds
} from './glossary_gate.mjs';

const TEXT_KEYS = ['name', 'short', 'long', 'steps', 'tips', 'aliases', 'diagramAlt'];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Batch row -> TermText with a stable key order and no `id`. */
export function normalizeEntry(row) {
	const out = {};
	for (const key of TEXT_KEYS) if (row[key] !== undefined) out[key] = row[key];
	return out;
}

/**
 * Terms of `lang` still to do: missing from `content`, or present but failing
 * validation. Map<id, { missing: boolean, issues: Issue[] }> in terms.json order.
 */
export function pendingTerms({ lang, data, content }) {
	const { terms, diagrams, contentByLang } = data;
	const issues = [
		...validateContentShape({ lang, terms, diagrams, content }),
		...validateLangContent({
			lang,
			terms,
			en: contentByLang.en ?? {},
			content,
			allContentByLang: { ...contentByLang, [lang]: content }
		})
	];
	const byId = new Map();
	for (const issue of issues) {
		if (!issue.id) continue;
		if (!byId.has(issue.id)) byId.set(issue.id, []);
		byId.get(issue.id).push(issue);
	}
	const missing = new Set(missingIds(terms, content));
	const pending = new Map();
	for (const t of terms) {
		if (missing.has(t.id)) pending.set(t.id, { missing: true, issues: [] });
		else if (byId.has(t.id)) pending.set(t.id, { missing: false, issues: byId.get(t.id) });
	}
	return pending;
}

/**
 * Validate a whole batch for `lang` against English and the existing content.
 * Any problem rejects everything: `errors` non-empty means nothing may be written.
 * An existing entry that currently fails validation may be replaced without
 * `overwrite`, because glossary_next_batch hands such terms out again.
 */
export function checkBatch({ lang, batch, data, overwrite = false }) {
	const errors = [];
	const entries = new Map();
	const fail = (id, rule, message) => errors.push({ id, rule, message });

	if (lang === 'en') {
		fail(undefined, 'lang', 'English is authored separately; refusing to apply a batch for "en"');
		return { errors, entries };
	}
	if (!SUPPORTED_LANGS.includes(lang)) {
		fail(undefined, 'lang', `"${lang}" is not a supported language code`);
		return { errors, entries };
	}
	if (!Array.isArray(batch)) {
		fail(undefined, 'batch', 'batch file must be a JSON array');
		return { errors, entries };
	}
	if (batch.length === 0) {
		fail(undefined, 'batch', 'batch is empty');
		return { errors, entries };
	}

	const { terms, diagrams, contentByLang } = data;
	const termById = new Map(terms.map((t) => [t.id, t]));
	const diagramById = new Map(diagrams.map((d) => [d.id, d]));
	const existing = contentByLang[lang] ?? {};
	const pending = pendingTerms({ lang, data, content: existing });
	const seen = new Set();
	const accepted = new Map();

	for (const [index, row] of batch.entries()) {
		if (!isObject(row) || typeof row.id !== 'string' || row.id === '') {
			fail(undefined, 'batch', `row ${index} must be an object with a string "id"`);
			continue;
		}
		const id = row.id;
		if (seen.has(id)) {
			fail(id, 'duplicate-id', 'id appears more than once in the batch');
			continue;
		}
		seen.add(id);
		const term = termById.get(id);
		if (!term) {
			fail(id, 'unknown-id', 'not a term id in terms.json; use the exact ids from glossary_next_batch');
			continue;
		}
		if (Object.hasOwn(existing, id) && !pending.has(id) && !overwrite) {
			fail(id, 'already-present', `already translated for ${lang}; pass --overwrite to replace it`);
			continue;
		}
		const extra = Object.keys(row).filter((k) => k !== 'id' && !TEXT_KEYS.includes(k));
		if (extra.length) {
			fail(id, 'unknown-field', `unknown field(s): ${extra.join(', ')}`);
			continue;
		}
		const text = normalizeEntry(row);
		const shape = validateTextShape({ lang, id, text, term, diagram: diagramById.get(term.diagram) });
		for (const i of shape) fail(id, i.rule, i.message);
		accepted.set(id, text);
	}

	const quality = validateLangContent({
		lang,
		terms,
		en: contentByLang.en ?? {},
		content: Object.fromEntries(accepted),
		allContentByLang: contentByLang
	});
	for (const i of quality) fail(i.id, i.rule, i.message);

	if (!errors.length) for (const [id, text] of accepted) entries.set(id, text);
	return { errors, entries };
}

/** Existing content overlaid with `entries`, keys in terms.json order (stray keys kept at the end). */
export function mergeBatch({ terms, existing, entries }) {
	const merged = {};
	for (const t of terms) {
		if (entries.has(t.id)) merged[t.id] = entries.get(t.id);
		else if (Object.hasOwn(existing, t.id)) merged[t.id] = existing[t.id];
	}
	for (const [id, text] of Object.entries(existing)) if (!Object.hasOwn(merged, id)) merged[id] = text;
	return merged;
}

export const serializeContent = (content) => JSON.stringify(content, null, 2) + '\n';

/** Row handed to a translation agent by glossary_next_batch. */
export function buildBatchRow({ term, data }) {
	const en = data.contentByLang.en?.[term.id] ?? {};
	const nameById = new Map(data.terms.map((t) => [t.id, t.en]));
	const diagram = data.diagrams.find((d) => d.id === term.diagram);
	return {
		id: term.id,
		category: term.category,
		aliases: term.aliases,
		related_names: term.related.map((r) => nameById.get(r)).filter(Boolean),
		diagram_marks: diagram ? diagram.marks : null,
		en: {
			name: en.name,
			short: en.short,
			long: en.long,
			steps: en.steps ?? null,
			tips: en.tips ?? null,
			diagramAlt: en.diagramAlt ?? null
		}
	};
}

export const DEFAULT_ROOT = path.resolve('src/lib/glossary');

const readJson = (file, fallback) => {
	if (!existsSync(file)) return fallback;
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		throw new Error(`${file}: invalid JSON (${err.message})`, { cause: err });
	}
};

/**
 * Loads terms.json, diagrams.json and every content/<lang>.json that exists.
 * Missing files read as empty so the tools work on a partial dataset.
 * Diagram components live at <root>/../../components/glossary/diagrams unless overridden.
 */
export function loadGlossaryData(root = DEFAULT_ROOT, { diagramsDir } = {}) {
	const contentDir = path.join(root, 'content');
	const contentByLang = {};
	if (existsSync(contentDir)) {
		for (const file of readdirSync(contentDir).sort()) {
			if (file.endsWith('.json')) contentByLang[file.slice(0, -5)] = readJson(path.join(contentDir, file));
		}
	}
	const dir = diagramsDir ?? path.join(root, '..', '..', 'components', 'glossary', 'diagrams');
	return {
		root,
		terms: readJson(path.join(root, 'terms.json'), []),
		diagrams: readJson(path.join(root, 'diagrams.json'), []),
		contentByLang,
		diagramFileExists: (id) => existsSync(path.join(dir, `${id}.svelte`))
	};
}

export function writeContent(root, lang, content) {
	const dir = path.join(root, 'content');
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, `${lang}.json`), serializeContent(content));
}

/** Minimal `--flag=value` / `--flag` parser shared by the three tools. */
export function parseFlags(argv) {
	const str = (flag) => {
		const hit = argv.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	return { str, has: (flag) => argv.includes(`--${flag}`) };
}
