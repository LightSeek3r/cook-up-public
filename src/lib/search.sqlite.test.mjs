// searchRecipeTitles against SQLite (every migration applied) and a real
// trigram index, compared with the single-level query it replaced, which joined
// both titles for every FTS hit before GROUP BY / LIMIT. search.test.ts only
// sees SQL text through a spy. `.mjs` for node:sqlite.
import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { searchRecipeTitles, ftsPhrase, RECIPE_HIT_LIMIT } from './search';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
const ORDER = 'ORDER BY (r.balance_grade IS NULL) ASC, r.total_minutes IS NULL, r.total_minutes ASC, r.id ASC';
const REPLACED = `SELECT r.id, COALESCE(t.title, src.title) AS title, r.cuisine, r.total_minutes, r.balance_grade, r.nutrition_coverage
	FROM recipe_title_fts f
	JOIN recipe_i18n m ON m.rowid = f.rowid
	JOIN recipes r     ON r.id = m.recipe_id
	LEFT JOIN recipe_i18n t   ON t.recipe_id = r.id AND t.lang = ?
	LEFT JOIN recipe_i18n src ON src.recipe_id = r.id AND src.lang = r.source_lang
	WHERE f.title MATCH ?
	GROUP BY r.id ${ORDER} LIMIT ?`;

const WORDS = ['Chicken', 'Soup', 'Beef', 'Stew', 'Curry', 'Café', 'Phở', 'Pie', 'Rice', '鸡肉汤', 'カレー', '김치찌개'];
let sqlite;
let db;

beforeAll(() => {
	sqlite = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort())
		sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
	const recipe = sqlite.prepare(`INSERT INTO recipes (id, source_url, source_lang, license, cuisine, total_minutes, balance_grade, nutrition_coverage)
		VALUES (?, 'u', 'en', 'PD', ?, ?, ?, ?)`);
	const title = sqlite.prepare(`INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES (?, ?, ?, '')`);
	for (let k = 0; k < 200; k++) {
		const id = 1000 - k * 3;
		recipe.run(id, k % 2 ? 'thai' : null, k % 5 ? 5 + (k % 17) : null, k % 3 ? 'ABCDE'[k % 5] : null, (k % 10) / 10);
		title.run(id, 'en', `${WORDS[k % WORDS.length]} ${WORDS[(k * 7) % WORDS.length]} ${k}`);
		if (k % 4 === 0) title.run(id, 'fr', `Poulet ${WORDS[k % WORDS.length]} ${k}`);
	}
	// 0008's source-language index, then the translated rows on top: several
	// FTS rowids for one recipe, as a pre-0008 index had.
	sqlite.exec(`INSERT INTO recipe_title_fts(rowid, title)
		SELECT i.rowid, i.title FROM recipe_i18n i JOIN recipes r ON r.id = i.recipe_id AND i.lang = r.source_lang`);
	sqlite.exec(`INSERT INTO recipe_title_fts(rowid, title) SELECT rowid, title FROM recipe_i18n WHERE lang = 'fr'`);
	db = { prepare: (sql) => ({ bind: (...b) => ({ all: async () => ({ results: sqlite.prepare(sql).all(...b) }) }) }) };
});

describe('searchRecipeTitles on a real index', () => {
	const queries = ['chi', 'Chicken', 'CHICKEN', 'soup', 'ken sou', 'pie', 'Poulet', 'oulet', 'café', 'Phở', '鸡肉汤', 'カレー', '김치찌', 'xyzq', 'a"b', '  pie  '];

	it('the fixture has recipes matched through more than one FTS row', () => {
		const { n, d } = sqlite.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT m.recipe_id) d FROM recipe_title_fts f
			JOIN recipe_i18n m ON m.rowid = f.rowid WHERE f.title MATCH ?`).get(ftsPhrase('Chicken'));
		expect(n).toBeGreaterThan(d);
		expect(d).toBeGreaterThan(RECIPE_HIT_LIMIT);
	});

	it.each(['en', 'fr', 'ja'])('returns exactly what the replaced query returned (%s)', async (lang) => {
		for (const q of queries) {
			for (const limit of [RECIPE_HIT_LIMIT, 1, 50]) {
				const expected = sqlite.prepare(REPLACED).all(lang, ftsPhrase(q.trim()), limit);
				expect(await searchRecipeTitles(db, { q, lang, limit }), `${q} ${limit}`).toEqual({ recipes: expected });
			}
		}
	});
});
