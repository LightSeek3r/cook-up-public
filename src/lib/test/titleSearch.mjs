// The reference for searchTitles (src/lib/data/search.js) now that it also
// matches translated titles: the D1 query (src/lib/test/sql/search.ts) for
// what it always did, plus, for 3+ characters, every recipe whose title in
// the language differs from the source title and contains the query in
// foldText form, ranked by the same ORDER BY and projected by the same
// columns in SQL. Without a matching translated title it is the D1 result.
import { sqliteD1 } from './d1';
import { searchRecipeTitles } from './sql/search';
import { foldText } from '../data/text.js';
import { MIN_FTS_LENGTH, normaliseQuery, RECIPE_HIT_LIMIT } from '../data/search.js';

/**
 * @param {import('node:sqlite').DatabaseSync} sqlite
 * @param {{ q: string, lang: string, limit?: number }} p
 */
export async function referenceTitleSearch(sqlite, p) {
	const limit = p.limit ?? RECIPE_HIT_LIMIT;
	const q = normaliseQuery(p.q);
	const needle = foldText(q);
	const translated =
		q.length >= MIN_FTS_LENGTH && needle
			? sqlite
					.prepare(
						`SELECT t.recipe_id AS id, t.title FROM recipe_i18n t
						   JOIN recipes r ON r.id = t.recipe_id
						   JOIN recipe_i18n s ON s.recipe_id = r.id AND s.lang = r.source_lang
						  WHERE t.lang = ? AND t.title <> s.title`
					)
					.all(p.lang)
					.filter((row) => foldText(String(row.title)).includes(needle))
					.map((row) => Number(row.id))
			: [];
	if (!translated.length) return searchRecipeTitles(sqliteD1(sqlite), p);
	const sql = await searchRecipeTitles(sqliteD1(sqlite), { ...p, limit: -1 });
	const ids = [...new Set([...sql.recipes.map((r) => r.id), ...translated])];
	const recipes = sqlite
		.prepare(
			`SELECT r.id, COALESCE(t.title, src.title) AS title, r.cuisine, r.total_minutes, r.balance_grade, r.nutrition_coverage
			   FROM recipes r
			   LEFT JOIN recipe_i18n t   ON t.recipe_id = r.id AND t.lang = ?
			   LEFT JOIN recipe_i18n src ON src.recipe_id = r.id AND src.lang = r.source_lang
			  WHERE r.id IN (SELECT value FROM json_each(?))
			  ORDER BY (r.balance_grade IS NULL) ASC, r.total_minutes IS NULL, r.total_minutes ASC, r.id ASC
			  LIMIT ?`
		)
		.all(p.lang, JSON.stringify(ids), limit);
	return { recipes };
}
