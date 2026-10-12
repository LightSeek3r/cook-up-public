/**
 * `recipe_related` rows (migrations/0010) for every recipe, computed from the
 * same rows the seeds write into `recipe_ingredients` and `ingredients`.
 *
 * Must rank exactly like the live query in src/lib/related.ts (its
 * `liveRelatedRecipes`), which the recipe page still falls back to for a recipe
 * with no stored row: count the distinctive ingredients shared with every other
 * recipe, keep those sharing at least RELATED_MIN_SHARED, order by that count
 * descending then id ascending, keep RELATED_LIMIT. "Distinctive" means
 * non-staple and used by at most RELATED_MAX_INGREDIENT_RECIPES recipes, where
 * that count is `ingredients.recipe_count`, which both seeds set to the number
 * of `recipe_ingredients` rows per ingredient — so it is recounted here from the
 * same rows rather than read from anywhere else.
 *
 * Computed here and shipped as plain rows because running the ranking inside
 * D1 for every recipe (an INSERT … SELECT) reads ~2.36M rows, half the daily
 * free tier.
 */

// Must equal the constants of the same name in src/lib/config.ts (checked by
// related_recipes.test.mjs): the stored lists are only equivalent to the live
// query while both rank with the same numbers. Changing one means a reseed.
export const RELATED_LIMIT = 6;
export const RELATED_MAX_INGREDIENT_RECIPES = 200;
export const RELATED_MIN_SHARED = 2;

/**
 * @param {{ canonical_key: string, is_staple: number }[]} ingredients
 * @param {{ recipe_id: number, canonical_key: string }[]} recipeIngredients
 * @param {Iterable<number>} recipeIds every recipe that gets a row, empty list included
 * @returns {Map<number, number[]>} related ids in rank order, per recipe id
 */
export function relatedLists(ingredients, recipeIngredients, recipeIds) {
	const isStaple = new Map(ingredients.map((ing) => [ing.canonical_key, ing.is_staple]));
	const recipesByKey = new Map();
	const keysByRecipe = new Map();
	for (const ri of recipeIngredients) {
		// Same rows the seed can insert: a key outside ingredients.jsonl has no id.
		if (!isStaple.has(ri.canonical_key)) continue;
		if (!recipesByKey.has(ri.canonical_key)) recipesByKey.set(ri.canonical_key, []);
		recipesByKey.get(ri.canonical_key).push(ri.recipe_id);
		if (!keysByRecipe.has(ri.recipe_id)) keysByRecipe.set(ri.recipe_id, []);
		keysByRecipe.get(ri.recipe_id).push(ri.canonical_key);
	}

	const lists = new Map();
	for (const id of recipeIds) {
		const shared = new Map();
		for (const key of keysByRecipe.get(id) ?? []) {
			const users = recipesByKey.get(key);
			if (isStaple.get(key) !== 0 || users.length > RELATED_MAX_INGREDIENT_RECIPES) continue;
			for (const other of users) {
				if (other !== id) shared.set(other, (shared.get(other) ?? 0) + 1);
			}
		}
		lists.set(
			id,
			[...shared]
				.filter(([, count]) => count >= RELATED_MIN_SHARED)
				.sort((a, b) => b[1] - a[1] || a[0] - b[0])
				.slice(0, RELATED_LIMIT)
				.map(([other]) => other)
		);
	}
	return lists;
}

/** `recipe_related` insert rows: one per recipe, the list as JSON text ('[]' when empty). */
export function relatedRows(ingredients, recipeIngredients, recipeIds) {
	return [...relatedLists(ingredients, recipeIngredients, recipeIds)].map(([recipe_id, ids]) => ({
		recipe_id,
		related_ids: JSON.stringify(ids)
	}));
}
