/**
 * The recipe translation store: the source of truth for recipe titles and
 * instructions in every language once D1 no longer holds them (step 3.5 of
 * .claude/plans/phase3-static-data.md). 09_build_artefacts.mjs reads it; only
 * recipe_i18n_apply.mjs and recipe_i18n_import_backup.mjs write it.
 *
 * Layout under STORE_DIR (git-ignored like the backup it was seeded from;
 * recipe_i18n_mirror.mjs keeps a copy on a private release):
 *   titles/<lang>.jsonl           one title per line, ~150-300 KB
 *   instructions/<lang>.jsonl.gz  one instructions text per line, ~0.7-1 MB
 * Titles have their own files so a title batch rewrites a few hundred KB, not
 * a language's 3-6 MB of instructions.
 *
 * Each file starts with a header line {"format","kind","lang","rows","sha256"}
 * (sha256 of the text after the header line, uncompressed) and holds its rows
 * in recipe_id order with a fixed key order, so equal content is equal bytes.
 * There is no shared manifest: agents translating different languages in
 * parallel never write the same file. Readers refuse a file whose header does
 * not match its rows rather than building artefacts from a truncated or
 * hand-edited copy.
 *
 * Rows, per kind (English rows carry only the text: they are the source):
 *   titles        { recipe_id, title, src, origin, reviewed, keep? }
 *   instructions  { recipe_id, instructions, is_machine, src, origin, reviewed }
 * `src` is the hash (srcHash) of the English text the translation was made
 * from, so a changed English source shows up as stale. `origin` is "backup"
 * (imported, held to the rules it was accepted under) or "batch" (applied
 * through the full gate). `reviewed` is set by a second-pass review apply.
 * `keep` is a reviewer's reason for a title that stays as in English.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const STORE_DIR = path.resolve('pipeline/data/recipe-i18n');
export const STORE_FORMAT = 1;
export const KINDS = ['titles', 'instructions'];
export const SOURCE_LANG = 'en';

const FIELDS = {
	titles: ['recipe_id', 'title', 'src', 'origin', 'reviewed', 'keep'],
	instructions: ['recipe_id', 'instructions', 'is_machine', 'src', 'origin', 'reviewed']
};

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Short hash of an English text, recorded with every translation of it. */
export const srcHash = (text) => sha256(Buffer.from(text, 'utf8')).slice(0, 16);

export const storeFile = (kind, lang) => (kind === 'titles' ? `titles/${lang}.jsonl` : `instructions/${lang}.jsonl.gz`);

function kindOf(kind) {
	if (!KINDS.includes(kind)) throw new Error(`unknown kind "${kind}": use ${KINDS.join(' or ')}`);
	return kind;
}

/** A row with the kind's keys in order, absent optional keys dropped. */
export function normalizeRow(kind, row) {
	const out = {};
	for (const key of FIELDS[kindOf(kind)]) if (row[key] !== undefined && row[key] !== null) out[key] = row[key];
	return out;
}

/**
 * Pure: the file bytes for one (kind, lang).
 * @param {string} kind
 * @param {string} lang
 * @param {Map<number, object>} rows by recipe_id
 */
export function serializeFile(kind, lang, rows) {
	const ids = [...rows.keys()].sort((a, b) => a - b);
	const body = ids.map((id) => JSON.stringify(normalizeRow(kind, { ...rows.get(id), recipe_id: id }))).join('\n') + (ids.length ? '\n' : '');
	const header = JSON.stringify({ format: STORE_FORMAT, kind, lang, rows: ids.length, sha256: sha256(Buffer.from(body, 'utf8')) });
	const text = Buffer.from(`${header}\n${body}`, 'utf8');
	return kind === 'titles' ? text : gzipSync(text, { level: 9 });
}

/**
 * Pure: parses and verifies one file's bytes.
 * @returns {Map<number, object>} rows by recipe_id
 */
export function parseFile(kind, lang, bytes, what = storeFile(kind, lang)) {
	const text = (kind === 'titles' ? bytes : gunzipSync(bytes)).toString('utf8');
	const nl = text.indexOf('\n');
	const header = JSON.parse(nl < 0 ? text : text.slice(0, nl));
	const body = nl < 0 ? '' : text.slice(nl + 1);
	if (header.format !== STORE_FORMAT || header.kind !== kind || header.lang !== lang) {
		throw new Error(`${what}: header ${JSON.stringify(header)} is not a format-${STORE_FORMAT} ${kind}/${lang} file`);
	}
	if (sha256(Buffer.from(body, 'utf8')) !== header.sha256) {
		throw new Error(`${what}: content differs from its header's sha256; refusing a damaged or hand-edited store file`);
	}
	const rows = new Map();
	let prev = 0;
	for (const line of body.split('\n')) {
		if (!line) continue;
		const row = JSON.parse(line);
		if (!Number.isInteger(row.recipe_id) || row.recipe_id <= prev) throw new Error(`${what}: rows must be in ascending recipe_id order`);
		prev = row.recipe_id;
		rows.set(row.recipe_id, row);
	}
	if (rows.size !== header.rows) throw new Error(`${what}: ${rows.size} rows, header says ${header.rows}`);
	return rows;
}

function writeAtomic(file, data) {
	mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, file);
}

/** Every language that has a file of `kind`. */
export function storeLangs(kind, dir = STORE_DIR) {
	const sub = path.join(dir, kindOf(kind));
	if (!existsSync(sub)) return [];
	const ext = kind === 'titles' ? '.jsonl' : '.jsonl.gz';
	return readdirSync(sub)
		.filter((f) => f.endsWith(ext))
		.map((f) => f.slice(0, -ext.length))
		.sort();
}

/**
 * One (kind, lang) file's rows, with the bytes' sha256 so a writer can tell
 * whether someone else changed the file meanwhile. A missing file is empty.
 */
export function readFile(kind, lang, dir = STORE_DIR) {
	const file = path.join(dir, storeFile(kindOf(kind), lang));
	if (!existsSync(file)) return { rows: new Map(), sha256: null };
	const bytes = readFileSync(file);
	return { rows: parseFile(kind, lang, bytes, file), sha256: sha256(bytes) };
}

/**
 * Replaces one file with `rows`, atomically (write + rename). `expectSha` is
 * the sha256 the caller read (null: no file): when the file changed since,
 * nothing is written, so two writers of one language never lose an update.
 * Returns whether the bytes changed.
 */
export function writeFile(kind, lang, rows, { dir = STORE_DIR, expectSha } = {}) {
	const file = path.join(dir, storeFile(kindOf(kind), lang));
	const current = existsSync(file) ? readFileSync(file) : null;
	if (expectSha !== undefined && (current ? sha256(current) : null) !== expectSha) {
		throw new Error(`${file} changed while this batch was being checked; run the command again`);
	}
	const bytes = serializeFile(kind, lang, rows);
	if (current && sha256(current) === sha256(bytes)) return false;
	writeAtomic(file, bytes);
	return true;
}

/** Every file of the store: `{ titles: { lang: Map }, instructions: { lang: Map } }`. */
export function readStore(dir = STORE_DIR) {
	const store = {};
	for (const kind of KINDS) {
		store[kind] = {};
		for (const lang of storeLangs(kind, dir)) store[kind][lang] = readFile(kind, lang, dir).rows;
	}
	return store;
}

export const storeExists = (dir = STORE_DIR) => KINDS.some((k) => storeLangs(k, dir).length > 0);

/**
 * Pure: the store as recipe_i18n rows (the backup's row shape), which is what
 * the seeds and 09_build_artefacts.mjs consume. A language row exists where
 * the language has instructions; its title is the language's title, else the
 * English one. A title without instructions of its own (Bengali rows still to
 * be translated) still becomes a row, with the English instructions and
 * is_machine 0, so the page and the cards show the title in that language.
 */
export function recipeI18nRows(store) {
	const en = { titles: store.titles[SOURCE_LANG] ?? new Map(), instructions: store.instructions[SOURCE_LANG] ?? new Map() };
	const rows = [];
	for (const [id, row] of en.instructions) {
		rows.push({ recipe_id: id, lang: SOURCE_LANG, title: en.titles.get(id)?.title, instructions: row.instructions, is_machine: row.is_machine ?? 0 });
	}
	const langs = [...new Set([...Object.keys(store.titles), ...Object.keys(store.instructions)])].filter((l) => l !== SOURCE_LANG).sort();
	for (const lang of langs) {
		const titles = store.titles[lang] ?? new Map();
		const texts = store.instructions[lang] ?? new Map();
		for (const id of [...new Set([...titles.keys(), ...texts.keys()])].sort((a, b) => a - b)) {
			const source = { title: en.titles.get(id)?.title, instructions: en.instructions.get(id)?.instructions };
			const text = texts.get(id);
			const title = titles.get(id)?.title ?? source.title;
			if (text) rows.push({ recipe_id: id, lang, title, instructions: text.instructions, is_machine: text.is_machine });
			else if (source.instructions !== undefined) rows.push({ recipe_id: id, lang, title, instructions: source.instructions, is_machine: 0 });
		}
	}
	for (const r of rows) if (typeof r.title !== 'string') throw new Error(`recipe ${r.recipe_id} (${r.lang}) has no English title in the store`);
	return rows;
}

/** Provenance for the artefact manifest: every store file's header hash. */
export function storeDigest(dir = STORE_DIR) {
	const out = {};
	for (const kind of KINDS) {
		for (const lang of storeLangs(kind, dir)) out[storeFile(kind, lang)] = readFile(kind, lang, dir).sha256;
	}
	return out;
}
