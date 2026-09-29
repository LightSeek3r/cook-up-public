import { error } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { resolveLang } from '$lib/i18n';
import { relatedRecipes } from '$lib/related';
import { substitutionsFor } from '$lib/substitutions';
import type { MicroNutrient, RecipeDetail, SubstitutionTip } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, platform }) => {
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

	// Prose in the requested language is filled lazily by /api/translate.
	const needsTranslation = lang !== recipe.source_lang;
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
		needsTranslation,
		tips,
		related,
		recipe: {
			...recipe,
			ingredients: recipeIngredients,
			micronutrients: micronutrients.results ?? []
		} satisfies RecipeDetail
	};
};
