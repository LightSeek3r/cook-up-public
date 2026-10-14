/**
 * The D1 migrations as SQL text, for building SQLite databases that have
 * D1's schema: every migration (what the app runs on), or only up to a given
 * one (the corpus schema the pipeline and the SQL reference tests need).
 *
 * migrations/0013_retire_recipe_corpus.sql drops the recipe corpus tables
 * from D1, but the pipeline still builds the artefacts from a SQLite holding
 * exactly that corpus (pipeline/lib/artefacts.mjs, through 06_seed_d1.mjs's
 * statements), and the artefact-vs-SQL parity suites compare against it. Both
 * therefore stop at CORPUS_SCHEMA_LAST; the runtime tables' tests apply all.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

/** The last migration whose schema still holds the recipe corpus (0012_admin_otp_binding.sql). */
export const CORPUS_SCHEMA_LAST = 12;

/**
 * Migration files in apply order (wrangler applies them by filename), with
 * their number.
 * @param {string} [dir]
 * @returns {{ name: string, number: number, file: string }[]}
 */
export function migrationFiles(dir = MIGRATIONS_DIR) {
	return readdirSync(dir)
		.filter((f) => /^\d{4}_.*\.sql$/.test(f))
		.sort()
		.map((name) => ({ name, number: Number(name.slice(0, 4)), file: path.join(dir, name) }));
}

/**
 * SQL text of every migration numbered `last` or lower, in apply order.
 * @param {number} last
 * @param {string} [dir]
 * @returns {string[]}
 */
export function migrationsUpTo(last, dir = MIGRATIONS_DIR) {
	return migrationFiles(dir)
		.filter((m) => m.number <= last)
		.map((m) => readFileSync(m.file, 'utf8'));
}

/**
 * SQL text of every migration: the schema D1 has once all are applied.
 * @param {string} [dir]
 */
export const allMigrations = (dir = MIGRATIONS_DIR) => migrationsUpTo(Infinity, dir);

/**
 * Applies migrations to a node:sqlite database (or anything with `exec`).
 * @template {{ exec(sql: string): unknown }} D
 * @param {D} db
 * @param {{ upTo?: number, dir?: string }} [opts] `upTo` defaults to all
 * @returns {D}
 */
export function applyMigrations(db, { upTo = Infinity, dir } = {}) {
	for (const sql of migrationsUpTo(upTo, dir)) db.exec(sql);
	return db;
}

/**
 * The recipe corpus as D1 held it before 0013: every table, FTS index and
 * named index the offline pipeline wrote and the app used to read, in the
 * order 0013 drops them (FTS first, then each child before its parent).
 * FTS shadow tables (`<name>_data`, `_idx`, `_docsize`, `_config`) go with
 * their virtual table. Single list for 0013, the corpus-read scan test and
 * pipeline/lib/d1.mjs's retirement message.
 */
export const CORPUS_TABLES = Object.freeze([
	'recipe_title_fts',
	'ingredient_fts',
	'recipe_i18n_stats',
	'recipe_related',
	'recipe_micronutrient',
	'recipe_diets',
	'recipe_ingredients',
	'recipe_i18n',
	'recipes',
	'ingredient_allergens',
	'ingredient_generic_of',
	'ingredient_micronutrient',
	'ingredient_nutrition',
	'ingredient_i18n',
	'ingredients',
	'allergens'
]);

/** What D1 keeps after 0013: runtime state written by the Worker itself. */
export const RUNTIME_TABLES = Object.freeze(['page_view', 'admin_otp', 'admin_session']);

/**
 * The tables of `tables` that `text` names as SQL: after FROM, JOIN, INTO,
 * UPDATE, TABLE or EXISTS. Uppercase keywords only by default, as every
 * statement in this codebase is written, so prose in a comment ("drops views
 * from recipes") does not count; `anyCase` for SQL from elsewhere (D1 insights).
 * @param {string} text
 * @param {{ tables?: readonly string[], anyCase?: boolean }} [opts]
 * @returns {string[]}
 */
export function tablesNamed(text, { tables = CORPUS_TABLES, anyCase = false } = {}) {
	const re = new RegExp(
		String.raw`\b(?:FROM|JOIN|INTO|UPDATE|TABLE|EXISTS)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?["\x60]?(?:main\.)?(${tables.join('|')})\b`,
		anyCase ? 'gi' : 'g'
	);
	return [...new Set([...text.matchAll(re)].map((m) => m[1].toLowerCase()))];
}

/**
 * CREATE statements that put the corpus tables back as 0001-0012 left them
 * (columns added by ALTER TABLE included, FTS shadow tables implied by their
 * virtual table), parents first, then the named indexes. All IF NOT EXISTS,
 * so a rerun is harmless. For a restore after 0013, which cannot re-run
 * migrations wrangler has recorded as applied.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function corpusSchemaSql(dir) {
	const db = applyMigrations(new DatabaseSync(':memory:'), { upTo: CORPUS_SCHEMA_LAST, dir });
	const rows = db
		.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table', 'index')`)
		.all()
		.filter((r) => CORPUS_TABLES.includes(/** @type {string} */ (r.tbl_name)));
	db.close();
	const rank = (/** @type {any} */ r) => (r.type === 'table' ? -CORPUS_TABLES.indexOf(r.tbl_name) : CORPUS_TABLES.length + CORPUS_TABLES.indexOf(r.tbl_name));
	return rows
		.sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)))
		.map((r) =>
			String(r.sql)
				.replace(/^CREATE (VIRTUAL TABLE|TABLE|INDEX) (?!IF NOT EXISTS)/, 'CREATE $1 IF NOT EXISTS ')
				.concat(';')
		);
}
