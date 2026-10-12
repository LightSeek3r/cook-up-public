// The export runs against node:sqlite standing in for remote D1: same SQL,
// same row shapes as wrangler's `--json` results.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { stageTable, writeTable, readBackup, verifySample, serializeByLang, writeManifest, sample } from './i18n_backup.mjs';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
const LANGS = ['en', 'fr', 'hi', 'zh', 'pnb'];

let db;
let work;
let calls;

function migrated() {
	const lite = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) lite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
	return lite;
}

const query = (sql) => {
	calls++;
	return db.prepare(sql).all();
};

function exportAll(q = query) {
	const manifest = { format: 1, tables: {} };
	for (const table of ['recipe_i18n', 'ingredient_i18n']) {
		const { state, rows } = stageTable({ query: q, table, stageDir: path.join(work, 'stage'), firstPageRows: 50, targetBytes: 20_000 });
		manifest.tables[table] = writeTable({ table, rows, counts: state.counts, backupDir: path.join(work, 'backup') });
	}
	writeManifest(manifest, path.join(work, 'backup'));
	return manifest;
}

beforeEach(() => {
	calls = 0;
	work = mkdtempSync(path.join(tmpdir(), 'i18n-backup-'));
	db = migrated();
	const recipe = db.prepare(`INSERT INTO recipes (id, source_url, source_lang, license) VALUES (?, 'u', 'en', 'PD')`);
	const i18n = db.prepare(`INSERT INTO recipe_i18n (recipe_id, lang, title, instructions, is_machine) VALUES (?, ?, ?, ?, ?)`);
	const ing = db.prepare(`INSERT INTO ingredients (id, canonical_key, category) VALUES (?, ?, 'other')`);
	const name = db.prepare(`INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES (?, ?, ?)`);
	// Inserted language-major, so rowid order differs from the (key, lang) order of the files.
	for (let id = 1; id <= 120; id++) recipe.run(id);
	for (const lang of LANGS) {
		for (let id = 120; id >= 1; id--) {
			if (lang !== 'en' && id % 9 === 0) continue;
			const body = `${lang} step 1 for ${id}: l'oignon «émincé» 切 बारीक ${'x'.repeat(id * 7)}\n2. Done`;
			i18n.run(id, lang, `Title ${id}`, body, lang === 'en' ? 0 : 1);
		}
	}
	for (let id = 1; id <= 40; id++) {
		ing.run(id, `k${id}`);
		for (const lang of LANGS) name.run(id, lang, `${lang}-ingrédient-${id}`);
	}
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

describe('export', () => {
	it('backs up every row of every language exactly, ordered by key', () => {
		const manifest = exportAll();
		const back = readBackup('recipe_i18n', path.join(work, 'backup'));
		const want = db.prepare('SELECT recipe_id, lang, title, instructions, is_machine FROM recipe_i18n ORDER BY lang, recipe_id').all();
		const got = [...back.rows].sort((a, b) => a.lang.localeCompare(b.lang) || a.recipe_id - b.recipe_id);
		expect(got).toEqual(want.map((r) => ({ ...r })));
		expect(manifest.tables.recipe_i18n.langs.fr).toMatchObject({ rows: 107, remote_rows: 107, machine: 107 });
		expect(manifest.tables.ingredient_i18n.rows).toBe(200);
		const names = readBackup('ingredient_i18n', path.join(work, 'backup')).rows;
		expect(names.find((r) => r.ingredient_id === 7 && r.lang === 'hi')).toEqual({ ingredient_id: 7, canonical_key: 'k7', lang: 'hi', name: 'hi-ingrédient-7' });

		const fr = gunzipSync(readFileSync(path.join(work, 'backup', 'recipe_i18n', 'fr.jsonl.gz'))).toString('utf8').trim().split('\n');
		expect(fr.map((l) => JSON.parse(l).recipe_id)).toEqual([...fr.keys()].map((i) => i + 1 + Math.floor(i / 8)));
		expect(Object.keys(JSON.parse(fr[0]))).toEqual(['recipe_id', 'lang', 'title', 'instructions', 'is_machine']);
	});

	it('resumes after an interruption without re-reading staged pages', () => {
		let failAt = 4;
		const flaky = (sql) => {
			if (/WHERE t.rowid >/.test(sql) && --failAt === 0) throw new Error('7403 transient');
			return query(sql);
		};
		expect(() => exportAll(flaky)).toThrow('7403');
		const stage = path.join(work, 'stage', 'recipe_i18n');
		const staged = readdirSync(stage).filter((f) => f.startsWith('page-')).length;
		expect(staged).toBe(3);

		const seen = [];
		exportAll((sql) => (seen.push(sql), query(sql)));
		expect(seen.some((s) => /GROUP BY lang/.test(s) && /recipe_i18n/.test(s))).toBe(false);
		const resumedFrom = Number(/rowid > (\d+)/.exec(seen[0])[1]);
		expect(resumedFrom).toBeGreaterThan(0);
		expect(readBackup('recipe_i18n', path.join(work, 'backup')).rows.length).toBe(db.prepare('SELECT COUNT(*) n FROM recipe_i18n').get().n);
	});

	it('is idempotent: a finished export rewrites identical files without querying', () => {
		const first = exportAll();
		calls = 0;
		const second = exportAll();
		expect(calls).toBe(0);
		expect(second).toEqual(first);
	});

	it('refuses to write a table whose rows do not add up to remote counts', () => {
		const rows = db.prepare('SELECT rowid AS rid, * FROM ingredient_i18n').all();
		expect(() =>
			writeTable({ table: 'ingredient_i18n', rows: rows.slice(1), counts: { en: { rows: 40 }, fr: { rows: 40 }, hi: { rows: 40 }, zh: { rows: 40 }, pnb: { rows: 40 } }, backupDir: path.join(work, 'b') })
		).toThrow(/row counts differ/);
	});
});

describe('readBackup', () => {
	it('returns null without a backup and refuses a damaged file', () => {
		expect(readBackup('recipe_i18n', path.join(work, 'none'))).toBeNull();
		exportAll();
		const file = path.join(work, 'backup', 'ingredient_i18n', 'zh.jsonl.gz');
		const bytes = readFileSync(file);
		bytes[bytes.length - 5] ^= 1;
		writeFileSync(file, bytes);
		expect(() => readBackup('ingredient_i18n', path.join(work, 'backup'))).toThrow(/sha256/);
	});
});

describe('verifySample', () => {
	it('matches remote byte for byte, and reports a changed row', () => {
		exportAll();
		const all = (max) => 0;
		const ok = verifySample({ query, table: 'recipe_i18n', backupDir: path.join(work, 'backup'), n: 500, pick: all });
		expect(ok.sampled).toBe(db.prepare('SELECT COUNT(*) n FROM recipe_i18n').get().n);
		expect(ok.mismatches).toEqual([]);

		// U+00E9 vs e + U+0301: equal once normalised, different bytes.
		db.prepare(`UPDATE recipe_i18n SET instructions = replace(instructions, 'é', 'e' || char(769)) WHERE recipe_id = 5 AND lang = 'fr'`).run();
		db.prepare(`UPDATE recipe_i18n SET is_machine = 0 WHERE recipe_id = 7 AND lang = 'hi'`).run();
		const bad = verifySample({ query, table: 'recipe_i18n', backupDir: path.join(work, 'backup'), n: 500, pick: all });
		expect(bad.mismatches).toEqual(['fr/5: instructions differs', 'hi/7: is_machine differs']);
	});
});

describe('helpers', () => {
	it('sample picks distinct rows and caps at the list size', () => {
		expect(sample([1, 2, 3], 10).sort()).toEqual([1, 2, 3]);
		expect(new Set(sample([...Array(100).keys()], 50)).size).toBe(50);
	});

	it('serializeByLang orders languages and keys', () => {
		const out = serializeByLang('ingredient_i18n', [
			{ ingredient_id: 2, canonical_key: 'k2', lang: 'fr', name: 'b', rid: 9 },
			{ ingredient_id: 1, canonical_key: 'k1', lang: 'fr', name: 'a', rid: 10 },
			{ ingredient_id: 1, canonical_key: 'k1', lang: 'de', name: 'c', rid: 11 }
		]);
		expect([...out.keys()]).toEqual(['de', 'fr']);
		expect(out.get('fr').jsonl).toBe('{"ingredient_id":1,"canonical_key":"k1","lang":"fr","name":"a"}\n{"ingredient_id":2,"canonical_key":"k2","lang":"fr","name":"b"}\n');
	});
});
