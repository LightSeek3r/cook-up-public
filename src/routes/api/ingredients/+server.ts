import { json } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { PUBLIC_DATA } from '$lib/httpCache';
import { parseIngredientsQuery } from '$lib/apiParams';
import type { IngredientTile } from '$lib/types';
import type { RequestHandler } from './$types';
// One copy of the query hardening and the length thresholds, shared with the
// recipe-title search — these are the same trust boundary, and two divergent
// copies of an FTS escape is exactly the bug you don't find by reading.
import { ftsPhrase, MIN_FTS_LENGTH } from '$lib/search';

/**
 * Ingredient names fall back to English, then to the canonical key: a newly
 * ingested ingredient must still appear in the mosaic before its translations
 * land, rather than silently disappearing for every language but English.
 */
const NAME = `COALESCE(t.name, en.name, i.canonical_key)`;
const COLS = `i.id, i.canonical_key, i.category, i.recipe_count, ${NAME} AS name`;
const FALLBACK_JOINS = `LEFT JOIN ingredient_i18n t  ON t.ingredient_id = i.id AND t.lang = ?
       LEFT JOIN ingredient_i18n en ON en.ingredient_id = i.id AND en.lang = 'en'`;

const respond = (results: IngredientTile[] | undefined) =>
	json({ results: results ?? [] }, { headers: { 'cache-control': PUBLIC_DATA } });

export const GET: RequestHandler = async ({ url, platform }) => {
	const { lang, q } = parseIngredientsQuery(url.searchParams);

	// The trigram tokenizer cannot index terms shorter than 3 characters. The
	// page filters those (common in CJK) over the mosaic it already holds
	// (tileSearch.ts) and never sends them; answering one here would be a LIKE
	// scan of every ingredient name, so it is answered empty without D1.
	if (q.length > 0 && q.length < MIN_FTS_LENGTH) return respond([]);

	const db = requireDb(platform);

	if (q) {
		const { results } = await db
			.prepare(
				`SELECT ${COLS}
         FROM ingredient_fts f
         JOIN ingredient_i18n m ON m.rowid = f.rowid
         JOIN ingredients i     ON i.id = m.ingredient_id
         ${FALLBACK_JOINS}
         WHERE f.name MATCH ? AND m.lang IN (?, 'en') AND i.is_staple = 0
         GROUP BY i.id
         ORDER BY i.recipe_count DESC
         LIMIT 60`
			)
			.bind(lang, ftsPhrase(q), lang)
			.all<IngredientTile>();
		return respond(results);
	}

	// Full mosaic; the client groups by category and sizes tiles by recipe_count.
	const { results } = await db
		.prepare(
			`SELECT ${COLS}
       FROM ingredients i
       ${FALLBACK_JOINS}
       WHERE i.is_staple = 0
       ORDER BY i.recipe_count DESC, name ASC`
		)
		.bind(lang)
		.all<IngredientTile>();

	return respond(results);
};
