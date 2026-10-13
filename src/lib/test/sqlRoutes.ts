/**
 * The D1 implementations of the public data GETs, exactly as the routes ran
 * them before they moved to the data artefacts (phase 3.2). Kept as the
 * reference the parity suite compares the real routes against; nothing
 * outside the tests may import this.
 */
import { json } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { matchRecipes, resolveIngredientIds, slackFor } from '$lib/match';
import { ftsPhrase, getRecipesByIds, MIN_FTS_LENGTH, searchRecipeTitles } from '$lib/search';
import { PUBLIC_DATA } from '$lib/httpCache';
import {
	parseIngredientsQuery,
	parseMatchQuery,
	parseRecipesQuery,
	parseSearchQuery
} from '$lib/apiParams';
import { badRequest } from '$lib/apiError';
import type { IngredientTile } from '$lib/types';

type Handler = (event: { url: URL; platform: App.Platform | undefined }) => Promise<Response>;

const headers = { 'cache-control': PUBLIC_DATA };

const match: Handler = async ({ url, platform }) => {
	const query = parseMatchQuery(url.searchParams);
	if (!query) return badRequest();
	if (query.have.length === 0) return json({ results: [], total: 0, haveCount: 0 }, { headers });
	const db = requireDb(platform);
	const have = await resolveIngredientIds(db, query.have);
	if (have.length === 0) return json({ results: [], total: 0, haveCount: 0 }, { headers });
	const slack = slackFor(have.length);
	const mustUse =
		slack > 0 && query.must.length
			? (await resolveIngredientIds(db, query.must)).filter((id) => have.includes(id))
			: [];
	const data = await matchRecipes(db, {
		have,
		lang: query.lang,
		cuisine: query.cuisine,
		mealType: query.meal,
		diet: query.diet,
		excludeAllergens: query.noAllergen,
		sort: query.sort,
		slack,
		mustUse,
		offset: query.offset
	});
	return json({ ...data, haveCount: have.length }, { headers });
};

const search: Handler = async ({ url, platform }) => {
	const { q, lang } = parseSearchQuery(url.searchParams);
	if (q.length < MIN_FTS_LENGTH) return json({ recipes: [] }, { headers });
	const data = await searchRecipeTitles(requireDb(platform), { q, lang });
	return json(data, { headers });
};

const NAME = `COALESCE(t.name, en.name, i.canonical_key)`;
const COLS = `i.id, i.canonical_key, i.category, i.recipe_count, ${NAME} AS name`;
const FALLBACK_JOINS = `LEFT JOIN ingredient_i18n t  ON t.ingredient_id = i.id AND t.lang = ?
       LEFT JOIN ingredient_i18n en ON en.ingredient_id = i.id AND en.lang = 'en'`;

const respond = (results: IngredientTile[] | undefined) =>
	json({ results: results ?? [] }, { headers: { 'cache-control': PUBLIC_DATA } });

const ingredients: Handler = async ({ url, platform }) => {
	const { lang, q } = parseIngredientsQuery(url.searchParams);
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

const recipes: Handler = async ({ url, platform }) => {
	const { ids, lang } = parseRecipesQuery(url.searchParams);
	if (ids.length === 0) return json({ recipes: [] }, { headers });
	const data = await getRecipesByIds(requireDb(platform), { ids, lang });
	return json(data, { headers });
};

export const SQL_ROUTES: Record<string, { GET: Handler }> = {
	'/api/match': { GET: match },
	'/api/search': { GET: search },
	'/api/ingredients': { GET: ingredients },
	'/api/recipes': { GET: recipes }
};
