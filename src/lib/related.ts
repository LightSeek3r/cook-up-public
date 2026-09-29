import type { D1Database } from '@cloudflare/workers-types';
import { RELATED_LIMIT, RELATED_MAX_INGREDIENT_RECIPES, RELATED_MIN_SHARED, type Lang } from '$lib/config';
import { getRecipesByIds } from '$lib/search';
import type { RecipeHit } from '$lib/types';

/**
 * Recipes sharing the most distinctive non-staple ingredients with `id`,
 * ranked by shared-ingredient count.
 *
 * Two queries, not a join into the RecipeHit projection directly: the first
 * ranks candidate ids by shared ingredients alone, the second (`getRecipesByIds`,
 * already used by /favorites) fetches the display columns for exactly those
 * ids. `WHERE id IN (...)` makes no ordering promise, so the results are
 * re-sorted back into rank order here rather than trusted from the second
 * query.
 */
export async function relatedRecipes(
	db: D1Database,
	p: { id: number; lang: Lang }
): Promise<RecipeHit[]> {
	const { results } = await db
		.prepare(
			`SELECT ri2.recipe_id AS id, COUNT(*) AS shared
       FROM recipe_ingredients ri1
       JOIN ingredients i          ON i.id = ri1.ingredient_id AND i.is_staple = 0 AND i.recipe_count <= ?
       JOIN recipe_ingredients ri2 ON ri2.ingredient_id = ri1.ingredient_id AND ri2.recipe_id != ri1.recipe_id
       WHERE ri1.recipe_id = ?
       GROUP BY ri2.recipe_id
       HAVING shared >= ?
       ORDER BY shared DESC, ri2.recipe_id
       LIMIT ?`
		)
		.bind(RELATED_MAX_INGREDIENT_RECIPES, p.id, RELATED_MIN_SHARED, RELATED_LIMIT)
		.all<{ id: number; shared: number }>();

	const ranked = results ?? [];
	if (ranked.length === 0) return [];

	const ids = ranked.map((row) => row.id);
	const { recipes } = await getRecipesByIds(db, { ids, lang: p.lang });

	const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
	return ids.map((rid) => byId.get(rid)).filter((recipe): recipe is RecipeHit => Boolean(recipe));
}
