/**
 * `recipes.non_staple_count` (migrations/0009) for every recipe, computed from
 * the same rows the seed writes into `recipe_ingredients` and `ingredients`.
 *
 * Must stay equal to the migration's SQL, `COUNT(*) … WHERE i.is_staple = 0`:
 * src/lib/match.ts subtracts a live count of satisfied non-staple rows from
 * this stored value, so any disagreement shows up as a wrong `missing` count
 * and a wrong ranking, silently. `is_staple` is a numeric 0/1 in
 * ingredients.jsonl, written as-is by the seeds.
 *
 * Returns a Map keyed by recipe id; a recipe with only staples is absent, so
 * read it with `?? 0`.
 */
export function nonStapleCounts(ingredients, recipeIngredients) {
	const isStaple = new Map(ingredients.map((ing) => [ing.canonical_key, ing.is_staple]));
	const counts = new Map();
	for (const ri of recipeIngredients) {
		if (isStaple.get(ri.canonical_key) !== 0) continue;
		counts.set(ri.recipe_id, (counts.get(ri.recipe_id) ?? 0) + 1);
	}
	return counts;
}
