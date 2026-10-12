/**
 * The translation backup: remote `recipe_i18n` and `ingredient_i18n`, one
 * gzipped JSONL file per (table, language) under pipeline/data/i18n-backup/,
 * plus a manifest.json with row counts and sha256 per file.
 *
 * It is the pipeline's source of truth for translated rows. Remote D1 was the
 * only copy of ~52k translated instructions (free-plan Time Travel keeps 7
 * days), and neither seed can regenerate them from pipeline/out. The seeds
 * read it back through readBackup(), which refuses a file whose sha256 does
 * not match the manifest rather than seeding from a truncated copy.
 *
 * Export is keyset-paged by rowid (each page reads exactly the rows it
 * returns) and staged page by page under pipeline/out/i18n-export/, so an
 * interrupted export resumes where it stopped instead of re-reading remote.
 * `query` is injected so the whole flow runs against node:sqlite in tests.
 */

import { createHash, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const BACKUP_DIR = path.resolve('pipeline/data/i18n-backup');
export const STAGE_DIR = path.resolve('pipeline/out/i18n-export');
export const MANIFEST = 'manifest.json';

/**
 * `from` aliases the table as `t`. ingredient_i18n rows also carry the
 * ingredient's canonical_key: both seeds renumber ingredient ids positionally
 * from ingredients.jsonl, so an id alone does not identify an ingredient
 * across reseeds.
 */
export const TABLES = {
	recipe_i18n: {
		key: 'recipe_id',
		columns: ['recipe_id', 'lang', 'title', 'instructions', 'is_machine'],
		text: ['title', 'instructions'],
		from: 'recipe_i18n t',
		expr: {},
		firstPageRows: 200
	},
	ingredient_i18n: {
		key: 'ingredient_id',
		columns: ['ingredient_id', 'canonical_key', 'lang', 'name'],
		text: ['name'],
		from: 'ingredient_i18n t LEFT JOIN ingredients k ON k.id = t.ingredient_id',
		expr: { canonical_key: 'k.canonical_key' },
		firstPageRows: 4000
	}
};

const colExpr = (spec, c) => spec.expr[c] ?? `t.${c}`;

// Keeps one wrangler `--json` response around 1.5 MB. Translated
// instructions run up to ~2.4x the English byte size (hi), so a fixed row
// count would either waste calls on short languages or balloon on long ones.
const TARGET_PAGE_BYTES = 1_500_000;
const MAX_PAGE_ROWS = 5000;
const MIN_PAGE_ROWS = 20;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const utf8Hex = (s) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();

function writeAtomic(file, data) {
	mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, file);
}

function tableSpec(table) {
	const spec = TABLES[table];
	if (!spec) throw new Error(`unknown backup table: ${table}`);
	return spec;
}

/** Per-language counts as remote reports them (`machine` only for recipe_i18n). */
export function remoteCounts(query, table) {
	const machine = table === 'recipe_i18n' ? ', COALESCE(SUM(is_machine), 0) AS machine' : '';
	const rows = query(`SELECT lang, COUNT(*) AS n${machine} FROM ${table} GROUP BY lang ORDER BY lang`);
	return Object.fromEntries(rows.map((r) => [r.lang, table === 'recipe_i18n' ? { rows: r.n, machine: r.machine } : { rows: r.n }]));
}

function readStage(dir) {
	const statePath = path.join(dir, 'state.json');
	if (!existsSync(statePath)) return null;
	const state = JSON.parse(readFileSync(statePath, 'utf8'));
	const pages = readdirSync(dir)
		.filter((f) => /^page-\d+\.json$/.test(f))
		.sort()
		.map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
	return { state, pages };
}

/**
 * Pages one table into `stageDir`. Resumable: pages already on disk are kept
 * and paging continues after the last staged rowid. Returns every staged row.
 */
export function stageTable({ query, table, stageDir, log = () => {}, firstPageRows, targetBytes = TARGET_PAGE_BYTES }) {
	const spec = tableSpec(table);
	const dir = path.join(stageDir, table);
	mkdirSync(dir, { recursive: true });
	let staged = readStage(dir);
	if (!staged) {
		const counts = remoteCounts(query, table);
		const state = { table, started_at: new Date().toISOString(), counts, complete: false };
		writeAtomic(path.join(dir, 'state.json'), JSON.stringify(state, null, 2) + '\n');
		staged = { state, pages: [] };
	}
	const { state, pages } = staged;
	if (state.complete) {
		log(`${table}: staged export already complete (${pages.length} pages), no remote read`);
		return { state, rows: pages.flat() };
	}

	let after = pages.length ? pages[pages.length - 1].at(-1).rid : 0;
	let limit = firstPageRows ?? spec.firstPageRows;
	const cols = spec.columns.map((c) => `${colExpr(spec, c)} AS ${c}`).join(', ');
	for (;;) {
		const rows = query(`SELECT t.rowid AS rid, ${cols} FROM ${spec.from} WHERE t.rowid > ${after} ORDER BY t.rowid LIMIT ${limit}`);
		if (!rows.length) break;
		const body = JSON.stringify(rows);
		const n = pages.length + 1;
		writeAtomic(path.join(dir, `page-${String(n).padStart(5, '0')}.json`), body);
		pages.push(rows);
		after = rows.at(-1).rid;
		log(`${table}: page ${n}, ${rows.length} rows, ${(Buffer.byteLength(body) / 1e6).toFixed(2)} MB, last rowid ${after}`);
		if (rows.length < limit) break;
		const bytes = Buffer.byteLength(body);
		limit = Math.max(MIN_PAGE_ROWS, Math.min(MAX_PAGE_ROWS, Math.round((limit * targetBytes) / bytes)));
	}
	state.complete = true;
	state.completed_at = new Date().toISOString();
	writeAtomic(path.join(dir, 'state.json'), JSON.stringify(state, null, 2) + '\n');
	return { state, rows: pages.flat() };
}

/** Pure: one JSONL string per language, rows ordered by key, fixed column order. */
export function serializeByLang(table, rows) {
	const spec = tableSpec(table);
	const byLang = new Map();
	for (const row of rows) {
		if (!byLang.has(row.lang)) byLang.set(row.lang, []);
		byLang.get(row.lang).push(row);
	}
	const out = new Map();
	for (const lang of [...byLang.keys()].sort()) {
		const list = byLang.get(lang).sort((a, b) => a[spec.key] - b[spec.key]);
		const lines = list.map((r) => JSON.stringify(Object.fromEntries(spec.columns.map((c) => [c, r[c]]))));
		out.set(lang, { rows: list.length, jsonl: lines.join('\n') + '\n' });
	}
	return out;
}

/**
 * Writes the per-language files for one table and returns its manifest entry.
 * Throws, before writing anything, when the staged rows do not add up to the
 * counts remote reported when the export started.
 */
export function writeTable({ table, rows, counts, backupDir }) {
	const files = serializeByLang(table, rows);
	const langs = new Set([...files.keys(), ...Object.keys(counts)]);
	const problems = [];
	for (const lang of langs) {
		const got = files.get(lang)?.rows ?? 0;
		const want = counts[lang]?.rows ?? 0;
		if (got !== want) problems.push(`${lang}: exported ${got}, remote has ${want}`);
	}
	if (problems.length) throw new Error(`${table}: row counts differ from remote: ${problems.join('; ')}`);

	const entry = { columns: tableSpec(table).columns, rows: rows.length, langs: {} };
	for (const [lang, { rows: n, jsonl }] of files) {
		const gz = gzipSync(Buffer.from(jsonl, 'utf8'), { level: 9 });
		const rel = `${table}/${lang}.jsonl.gz`;
		writeAtomic(path.join(backupDir, rel), gz);
		entry.langs[lang] = {
			file: rel,
			rows: n,
			remote_rows: counts[lang].rows,
			...(counts[lang].machine !== undefined ? { machine: counts[lang].machine } : {}),
			jsonl_bytes: Buffer.byteLength(jsonl),
			gz_bytes: gz.length,
			sha256: sha256(gz),
			jsonl_sha256: sha256(Buffer.from(jsonl, 'utf8'))
		};
	}
	return entry;
}

export function readManifest(backupDir = BACKUP_DIR) {
	const p = path.join(backupDir, MANIFEST);
	return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

export function writeManifest(manifest, backupDir = BACKUP_DIR) {
	writeAtomic(path.join(backupDir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Every backed-up row of `table`, all languages. Returns null when there is no
 * backup; throws when a file is missing or its sha256 differs from the manifest.
 */
export function readBackup(table, backupDir = BACKUP_DIR) {
	const manifest = readManifest(backupDir);
	const entry = manifest?.tables?.[table];
	if (!entry) return null;
	const rows = [];
	for (const [lang, meta] of Object.entries(entry.langs)) {
		const gz = readFileSync(path.join(backupDir, meta.file));
		if (sha256(gz) !== meta.sha256) throw new Error(`${meta.file}: sha256 differs from ${MANIFEST}; refusing to use a damaged backup`);
		const lines = gunzipSync(gz).toString('utf8').split('\n').filter(Boolean);
		if (lines.length !== meta.rows) throw new Error(`${meta.file}: ${lines.length} rows, ${MANIFEST} says ${meta.rows}`);
		for (const l of lines) {
			const row = JSON.parse(l);
			if (row.lang !== lang) throw new Error(`${meta.file}: row in lang ${row.lang}`);
			rows.push(row);
		}
	}
	return { exported_at: manifest.exported_at, rows };
}

/** Pure: up to `n` distinct elements of `list`, chosen with `pick(max)`. */
export function sample(list, n, pick = randomInt) {
	const pool = [...list];
	const out = [];
	while (out.length < n && pool.length) out.push(pool.splice(pick(pool.length), 1)[0]);
	return out;
}

/**
 * Byte-for-byte check of `n` random rows per language: remote's stored bytes
 * (SQL hex()) against the UTF-8 bytes of the backed-up string, so a lossy
 * step anywhere between D1 and the gzip file would show up here.
 */
export function verifySample({ query, table, backupDir, n = 50, pick }) {
	const spec = tableSpec(table);
	const backup = readBackup(table, backupDir);
	if (!backup) throw new Error(`no backup for ${table}`);
	const byLang = new Map();
	for (const r of backup.rows) {
		if (!byLang.has(r.lang)) byLang.set(r.lang, []);
		byLang.get(r.lang).push(r);
	}
	const hexCols = spec.text.map((c) => `hex(${colExpr(spec, c)}) AS ${c}`).join(', ');
	const plain = spec.columns.filter((c) => !spec.text.includes(c) && c !== 'lang' && c !== spec.key);
	const result = { sampled: 0, mismatches: [] };
	for (const [lang, list] of [...byLang].sort(([a], [b]) => a.localeCompare(b))) {
		const picked = sample(list, n, pick);
		const ids = picked.map((r) => r[spec.key]);
		const remote = query(
			`SELECT t.${spec.key} AS ${spec.key}, ${hexCols}${plain.map((c) => `, ${colExpr(spec, c)} AS ${c}`).join('')} FROM ${spec.from} ` +
				`WHERE t.lang = '${lang.replace(/'/g, "''")}' AND t.${spec.key} IN (${ids.join(',')})`
		);
		const remoteById = new Map(remote.map((r) => [r[spec.key], r]));
		for (const row of picked) {
			result.sampled++;
			const r = remoteById.get(row[spec.key]);
			if (!r) {
				result.mismatches.push(`${lang}/${row[spec.key]}: missing on remote`);
				continue;
			}
			for (const c of spec.text) if (r[c] !== utf8Hex(row[c])) result.mismatches.push(`${lang}/${row[spec.key]}: ${c} differs`);
			for (const c of plain) if (r[c] !== row[c]) result.mismatches.push(`${lang}/${row[spec.key]}: ${c} differs`);
		}
	}
	return result;
}

/** Drops one table's staged pages, so its next export starts a fresh snapshot. */
export function clearStage(table, stageDir = STAGE_DIR) {
	tableSpec(table);
	rmSync(path.join(stageDir, table), { recursive: true, force: true });
}
