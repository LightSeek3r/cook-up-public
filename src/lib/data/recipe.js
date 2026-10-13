// The recipe page's data from its per-recipe artefact (r/<id>.json), shaped
// exactly like src/routes/recipe/[id]/+page.server.ts builds it from D1.

import { recipeHit } from './search.js';

/**
 * @typedef {object} RecipeText
 * @property {string} title
 * @property {string} instructions
 * @property {number} is_machine
 */

/**
 * @typedef {object} DetailIngredient
 * @property {number} id
 * @property {string} canonical_key
 * @property {string} category
 * @property {string | null} raw_text
 * @property {number | null} quantity
 * @property {string | null} unit
 * @property {number | null} grams
 */

/**
 * One r/<id>.json. `recipe` is the recipes row, columns in table order;
 * `i18n` holds every language row the recipe has; `ingredients` are in page
 * order (staples last, then by category); `related` is recipe_related's list.
 * @typedef {object} RecipeDetailFile
 * @property {Record<string, unknown> & { id: number, source_lang: string }} recipe
 * @property {Record<string, RecipeText>} i18n
 * @property {DetailIngredient[]} ingredients
 * @property {{ nutrient_key: string, amount: number, unit: string, pct_nrv: number | null }[]} micronutrients
 * @property {number[]} related
 */

/**
 * `{ recipe, related }` as the page load returns them for `lang` (tips are
 * derived from `recipe.ingredients` by the route, with `nameForKey`).
 * @param {import('./corpus.js').Corpus} corpus
 * @param {RecipeDetailFile} detail
 * @param {string} lang
 */
export function recipePage(corpus, detail, lang) {
	const own = detail.i18n[lang];
	const src = detail.i18n[detail.recipe.source_lang];
	const recipe = {
		...detail.recipe,
		title: own?.title ?? src?.title ?? null,
		instructions: own?.instructions ?? src?.instructions ?? null,
		is_machine: own?.is_machine ?? 0,
		ingredients: detail.ingredients.map((i) => ({
			id: i.id,
			canonical_key: i.canonical_key,
			category: i.category,
			name: corpus.name(i.id - 1, lang),
			raw_text: i.raw_text,
			quantity: i.quantity,
			unit: i.unit,
			grams: i.grams
		})),
		micronutrients: detail.micronutrients
	};
	const related = detail.related
		.map((id) => corpus.recipeIndex(id))
		.filter((r) => r >= 0)
		.map((r) => recipeHit(corpus, r, lang));
	return { recipe, related };
}

/**
 * An ingredient's display name by canonical_key (the substitution tips'
 * lookup), undefined when no ingredient has that key.
 * @param {import('./corpus.js').Corpus} corpus
 * @param {string} key
 * @param {string} lang
 */
export function nameForKey(corpus, key, lang) {
	const g = corpus.ingredientIndex(key);
	return g < 0 ? undefined : corpus.name(g, lang);
}
