import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
	allMigrations,
	applyMigrations,
	CORPUS_SCHEMA_LAST,
	CORPUS_TABLES,
	corpusSchemaSql,
	migrationFiles,
	migrationsUpTo,
	RUNTIME_TABLES
} from './migrations.mjs';

const fresh = () => {
	const db = new DatabaseSync(':memory:');
	// D1 enforces foreign keys, and DROP TABLE of a referenced parent fails under them.
	db.exec('PRAGMA foreign_keys = ON');
	return db;
};

/** Ordinary and virtual tables, without SQLite's own and FTS5's shadow tables. */
const tables = (db) =>
	db
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
		.all()
		.map((r) => r.name)
		.filter((name) => !/_fts_(data|idx|docsize|config)$/.test(name));

const schemaOf = (db, names) =>
	db
		.prepare(`SELECT type, name, sql FROM sqlite_master WHERE tbl_name IN (SELECT value FROM json_each(?)) ORDER BY type, name`)
		.all(JSON.stringify(names))
		.map((r) => ({ ...r }));

/** One row per corpus table, foreign keys satisfied, plus runtime rows. */
function populated() {
	const db = applyMigrations(fresh(), { upTo: CORPUS_SCHEMA_LAST });
	db.exec(`INSERT INTO allergens (id, key) VALUES (1, 'egg');
		INSERT INTO ingredients (id, canonical_key, category) VALUES (1, 'egg', 'protein'), (2, 'egg_yolk', 'protein');
		INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES (1, 'en', 'Egg');
		INSERT INTO ingredient_allergens (ingredient_id, allergen_id) VALUES (1, 1);
		INSERT INTO ingredient_generic_of (specific_id, generic_id) VALUES (2, 1);
		INSERT INTO ingredient_nutrition (ingredient_id, kcal) VALUES (1, 143);
		INSERT INTO ingredient_micronutrient (ingredient_id, nutrient_key, amount, unit) VALUES (1, 'iron', 1.8, 'mg');
		INSERT INTO recipes (id, source_url, source_lang, license) VALUES (7, 'u', 'en', 'PD');
		INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES (7, 'en', 'Eggnog', 'Whisk.');
		INSERT INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (7, 1);
		INSERT INTO recipe_diets (recipe_id, diet) VALUES (7, 'vegetarian');
		INSERT INTO recipe_micronutrient (recipe_id, nutrient_key, amount, unit) VALUES (7, 'iron', 0.9, 'mg');
		INSERT INTO recipe_related (recipe_id, related_ids) VALUES (7, '[]');
		INSERT INTO recipe_i18n_stats (lang, translated, machine) VALUES ('en', 1, 0);
		INSERT INTO recipe_title_fts (rowid, title) SELECT rowid, title FROM recipe_i18n;
		INSERT INTO ingredient_fts (rowid, name) SELECT rowid, name FROM ingredient_i18n;
		INSERT INTO page_view (path, recipe_id) VALUES ('/recipe/7', 7);
		INSERT INTO admin_otp (email, code_hash, expires_at) VALUES ('a@b.c', 'h', datetime('now'));
		INSERT INTO admin_session (token_hash, email, expires_at) VALUES ('t', 'a@b.c', datetime('now'));`);
	return db;
}

describe('migration files', () => {
	it('are numbered 0001.. in order, without gaps', () => {
		expect(migrationFiles().map((m) => m.number)).toEqual(migrationFiles().map((_, i) => i + 1));
	});

	it('CORPUS_SCHEMA_LAST is the last migration before the corpus left D1', () => {
		const files = migrationFiles();
		expect(files.find((m) => m.number === CORPUS_SCHEMA_LAST)?.name).toBe('0012_admin_otp_binding.sql');
		const next = files.find((m) => m.number === CORPUS_SCHEMA_LAST + 1);
		if (next) expect(next.name).toBe('0013_retire_recipe_corpus.sql');
	});

	it('migrationsUpTo returns the texts in apply order and stops at the number given', () => {
		const files = migrationFiles();
		expect(migrationsUpTo(2)).toEqual(files.slice(0, 2).map((m) => readFileSync(m.file, 'utf8')));
		expect(migrationsUpTo(0)).toEqual([]);
		expect(allMigrations()).toHaveLength(files.length);
	});
});

describe('the corpus schema (migrations up to CORPUS_SCHEMA_LAST)', () => {
	it('holds exactly the corpus and the runtime tables', () => {
		const db = applyMigrations(fresh(), { upTo: CORPUS_SCHEMA_LAST });
		expect(tables(db)).toEqual([...CORPUS_TABLES, ...RUNTIME_TABLES].sort());
	});

	it('has no triggers or views a drop could leave behind', () => {
		const db = applyMigrations(fresh(), { upTo: CORPUS_SCHEMA_LAST });
		expect(db.prepare(`SELECT name FROM sqlite_master WHERE type IN ('trigger', 'view')`).all()).toEqual([]);
	});

	it('CORPUS_TABLES is a drop order foreign keys allow: every child before its parent', () => {
		const db = populated();
		for (const table of CORPUS_TABLES) db.exec(`DROP TABLE ${table}`);
		expect(tables(db)).toEqual([...RUNTIME_TABLES].sort());
		expect(db.prepare('SELECT COUNT(*) AS n FROM page_view').get().n).toBe(1);
	});

	it('and the order matters: a parent first is refused while children reference it', () => {
		const db = populated();
		expect(() => db.exec('DROP TABLE recipes')).toThrow(/FOREIGN KEY/);
	});
});

describe('corpusSchemaSql (the restore after 0013)', () => {
	const columns = (db, table) => db.prepare(`SELECT * FROM pragma_table_xinfo(?)`).all(table).map((r) => ({ ...r }));
	const foreignKeys = (db, table) => db.prepare(`SELECT * FROM pragma_foreign_key_list(?)`).all(table).map((r) => ({ ...r }));
	const indexes = (db) =>
		db.prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' ORDER BY name`).all().map((r) => ({ ...r }));

	it('recreates every corpus table, column, foreign key and index of 0001-0012 on a retired database', () => {
		const reference = applyMigrations(fresh(), { upTo: CORPUS_SCHEMA_LAST });
		const db = applyMigrations(fresh(), { upTo: CORPUS_SCHEMA_LAST });
		for (const t of CORPUS_TABLES) db.exec(`DROP TABLE ${t}`);
		for (const sql of corpusSchemaSql()) db.exec(sql);
		expect(tables(db)).toEqual(tables(reference));
		for (const t of CORPUS_TABLES) {
			expect(columns(db, t), t).toEqual(columns(reference, t));
			expect(foreignKeys(db, t), t).toEqual(foreignKeys(reference, t));
		}
		expect(indexes(db)).toEqual(indexes(reference));
	});

	it('is idempotent and creates parents before children', () => {
		const sql = corpusSchemaSql();
		expect(sql.every((s) => /^CREATE (VIRTUAL TABLE|TABLE|INDEX) IF NOT EXISTS /.test(s))).toBe(true);
		const at = (name) => sql.findIndex((s) => new RegExp(`EXISTS ${name}\\b`).test(s));
		expect(at('recipes')).toBeLessThan(at('recipe_i18n'));
		expect(at('ingredients')).toBeLessThan(at('ingredient_i18n'));
		expect(at('recipe_i18n')).toBeLessThan(at('recipe_title_fts'));
	});
});

const retire = migrationFiles().find((m) => m.number === CORPUS_SCHEMA_LAST + 1);

// Skipped only while 0013 is staged outside migrations/ (see C:\tmp\p35\cutover-runbook.md).
describe.skipIf(!retire)('0013_retire_recipe_corpus.sql', () => {
	const text = retire ? readFileSync(retire.file, 'utf8') : '';
	const statements = text
		.replace(/--.*$/gm, '')
		.split(';')
		.map((s) => s.trim().replace(/\s+/g, ' '))
		.filter(Boolean);

	it('only drops: no statement writes or creates anything', () => {
		for (const s of statements) expect(s).toMatch(/^DROP (TABLE|INDEX) IF EXISTS \w+$/);
	});

	it('drops every corpus table, in CORPUS_TABLES order', () => {
		const dropped = statements.filter((s) => s.startsWith('DROP TABLE')).map((s) => s.split(' ').at(-1));
		expect(dropped).toEqual([...CORPUS_TABLES]);
	});

	it('applies cleanly after 0001-0012 on a populated database, keeping the runtime tables and their rows', () => {
		const db = populated();
		const runtimeBefore = schemaOf(db, RUNTIME_TABLES);
		db.exec(text);
		expect(tables(db)).toEqual([...RUNTIME_TABLES].sort());
		expect(schemaOf(db, RUNTIME_TABLES)).toEqual(runtimeBefore);
		expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((r) => r.name)).toEqual([
			'idx_admin_otp_email',
			'idx_admin_session_expires',
			'idx_page_view_at',
			'idx_page_view_recipe'
		]);
		for (const t of RUNTIME_TABLES) expect(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n).toBe(1);
	});

	it('is the schema every migration gives', () => {
		const db = applyMigrations(fresh());
		expect(tables(db)).toEqual([...RUNTIME_TABLES].sort());
	});

	it('can be applied twice (IF EXISTS), as a hand re-run after a partial failure would', () => {
		const db = populated();
		db.exec(text);
		expect(() => db.exec(text)).not.toThrow();
	});
});
