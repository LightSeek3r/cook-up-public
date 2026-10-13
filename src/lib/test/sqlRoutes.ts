/**
 * The D1 implementations of the public data GETs and of the recipe page load,
 * exactly as they ran before they moved to the data artefacts (phases 3.2 and
 * 3.3). Kept as the reference the parity suite compares the real routes
 * against; nothing outside the tests may import this.
 */
import { error, json } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { matchRecipes, resolveIngredientIds, slackFor } from '$lib/match';
import { ftsPhrase, getRecipesByIds, MIN_FTS_LENGTH, searchRecipeTitles } from '$lib/search';
import { relatedRecipes } from '$lib/related';
import { substitutionsFor } from '$lib/substitutions';
import { getTermIds } from '$lib/glossary/load';
import { resolveLang } from '$lib/i18n';
import { PUBLIC_DATA } from '$lib/httpCache';
import {
	parseIngredientsQuery,
	parseMatchQuery,
	parseRecipesQuery,
	parseSearchQuery
} from '$lib/apiParams';
import { badRequest } from '$lib/apiError';
import type { IngredientTile, MicroNutrient, RecipeDetail, SubstitutionTip } from '$lib/types';

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

const escapeXml = (value: string) => value.replace(/&/g, '&amp;');

const sitemap: Handler = async ({ url, platform }) => {
	const db = requireDb(platform);
	const { results } = await db.prepare(`SELECT id FROM recipes ORDER BY id`).all<{ id: number }>();

	const urls = [
		`${url.origin}/`,
		`${url.origin}/glossary`,
		...getTermIds().map((id) => `${url.origin}/glossary/${id}`),
		...(results ?? []).map((row) => `${url.origin}/recipe/${row.id}`)
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`).join('\n')}
</urlset>
`;

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': PUBLIC_DATA
		}
	});
};

export const SQL_ROUTES: Record<string, { GET: Handler }> = {
	'/api/match': { GET: match },
	'/api/search': { GET: search },
	'/api/ingredients': { GET: ingredients },
	'/api/recipes': { GET: recipes },
	'/sitemap.xml': { GET: sitemap }
};

/** src/routes/recipe/[id]/+page.server.ts's load. */
export async function sqlRecipePageLoad({
	params,
	url,
	platform
}: {
	params: { id: string };
	url: URL;
	platform: App.Platform | undefined;
}) {
	const db = requireDb(platform);
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'invalid recipe id');

	const lang = resolveLang(url.searchParams.get('lang'));

	const recipe = await db
		.prepare(
			`SELECT r.*, COALESCE(t.title, src.title) AS title,
              COALESCE(t.instructions, src.instructions) AS instructions,
              COALESCE(t.is_machine, 0) AS is_machine
       FROM recipes r
       LEFT JOIN recipe_i18n t   ON t.recipe_id = r.id AND t.lang = ?
       LEFT JOIN recipe_i18n src ON src.recipe_id = r.id AND src.lang = r.source_lang
       WHERE r.id = ?`
		)
		.bind(lang, id)
		.first<RecipeDetail & { source_lang: string }>();

	if (!recipe) throw error(404, 'recipe not found');

	const [ingredients, micronutrients, related] = await Promise.all([
		db
			.prepare(
				`SELECT i.id, i.canonical_key, i.category,
                COALESCE(t.name, en.name, i.canonical_key) AS name,
                ri.raw_text, ri.quantity, ri.unit, ri.grams
         FROM recipe_ingredients ri
         JOIN ingredients i           ON i.id = ri.ingredient_id
         LEFT JOIN ingredient_i18n t  ON t.ingredient_id = i.id AND t.lang = ?
         LEFT JOIN ingredient_i18n en ON en.ingredient_id = i.id AND en.lang = 'en'
         WHERE ri.recipe_id = ?
         ORDER BY i.is_staple ASC, i.category ASC`
			)
			.bind(lang, id)
			.all<RecipeDetail['ingredients'][number]>(),
		db
			.prepare(
				`SELECT nutrient_key, amount, unit, pct_nrv
         FROM recipe_micronutrient WHERE recipe_id = ?`
			)
			.bind(id)
			.all<MicroNutrient>(),
		relatedRecipes(db, { id, lang })
	]);

	const recipeIngredients = ingredients.results ?? [];

	const matches = substitutionsFor(recipeIngredients.map((i) => i.canonical_key));
	let tips: SubstitutionTip[] = [];
	if (matches.length) {
		const nameByKey = new Map(recipeIngredients.map((i) => [i.canonical_key, i.name]));
		const toKeys = [...new Set(matches.map((m) => m.to))];
		const placeholders = toKeys.map(() => '?').join(',');
		const subNames = await db
			.prepare(
				`SELECT i.canonical_key, COALESCE(t.name, en.name, i.canonical_key) AS name
         FROM ingredients i
         LEFT JOIN ingredient_i18n t  ON t.ingredient_id = i.id AND t.lang = ?
         LEFT JOIN ingredient_i18n en ON en.ingredient_id = i.id AND en.lang = 'en'
         WHERE i.canonical_key IN (${placeholders})`
			)
			.bind(lang, ...toKeys)
			.all<{ canonical_key: string; name: string }>();
		const toNameByKey = new Map((subNames.results ?? []).map((r) => [r.canonical_key, r.name]));
		tips = matches.map((m) => ({
			from: m.from,
			to: m.to,
			fromName: nameByKey.get(m.from) ?? m.from,
			toName: toNameByKey.get(m.to) ?? m.to,
			benefit: m.benefit
		}));
	}

	return {
		lang,
		tips,
		related,
		recipe: {
			...recipe,
			ingredients: recipeIngredients,
			micronutrients: micronutrients.results ?? []
		} satisfies RecipeDetail
	};
}
