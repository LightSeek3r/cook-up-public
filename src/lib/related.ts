import type { D1Database } from '@cloudflare/workers-types';
import { RELATED_LIMIT, RELATED_MAX_INGREDIENT_RECIPES, RELATED_MIN_SHARED, type Lang } from '$lib/config';
import { getRecipesByIds, HIT_COLS, HIT_JOINS } from '$lib/search';
import type { RecipeHit } from '$lib/types';

/**
 * Recipes sharing the most distinctive non-staple ingredients with `id`,
 * ranked by shared-ingredient count.
 *
 * Read from `recipe_related` (migrations/0010), which the seeds fill with the
 * same ranking computed offline: one statement, ~20 rows read, against ~640 on
 * average (up to ~3,800) for ranking live. A recipe without a stored row — the
 * table not seeded yet, or a recipe written by a path that skips it — gets the
 * live ranking instead, so the page is never wrong, only slower.
 *
 * The page now reads the stored list from r/<id>.json; this stays as the D1
 * reference of the parity suite (src/lib/test/sqlRoutes.ts) until the corpus
 * tables are dropped.
 */
export async function relatedRecipes(
	db: D1Database,
	p: { id: number; lang: Lang }
): Promise<RecipeHit[]> {
	const stored = await storedRelatedRecipes(db, p).catch((err: unknown) => {
		// Deployed before migrations/0010 was applied: rank live until it is.
		// Anything else is a real failure and must not hide behind the fallback.
		if (/no such table: recipe_related/.test(String(err))) return null;
		throw err;
	});
	return stored ?? liveRelatedRecipes(db, p);
}

type StoredRow = { [K in keyof RecipeHit]: RecipeHit[K] | null };

/**
 * The stored list, or `null` when the recipe has no `recipe_related` row.
 *
 * The LEFT JOINs make a stored row always come back as at least one result
 * row: all-NULL for an empty list (and for an id whose recipe no longer
 * exists, which is dropped like `getRecipesByIds` drops it). Zero rows can
 * therefore only mean "no stored row", which is what lets one statement both
 * answer and detect the fallback case.
 */
export async function storedRelatedRecipes(
	db: D1Database,
	p: { id: number; lang: Lang }
): Promise<RecipeHit[] | null> {
	const { results } = await db
		.prepare(
			`SELECT ${HIT_COLS}
       FROM recipe_related rr
       LEFT JOIN json_each(rr.related_ids) j
       LEFT JOIN recipes r ON r.id = j.value
       ${HIT_JOINS}
       WHERE rr.recipe_id = ?
       ORDER BY j.key`
		)
		.bind(p.lang, p.id)
		.all<StoredRow>();

	const rows = results ?? [];
	if (rows.length === 0) return null;
	return rows.filter((row): row is RecipeHit => row.id !== null);
}

/**
 * The ranking itself, run in D1. pipeline/lib/related_recipes.mjs is the
 * offline copy that fills `recipe_related`; the two must stay equivalent.
 *
 * Two queries, not a join into the RecipeHit projection directly: the first
 * ranks candidate ids by shared ingredients alone, the second (`getRecipesByIds`,
 * already used by /favorites) fetches the display columns for exactly those
 * ids. `WHERE id IN (...)` makes no ordering promise, so the results are
 * re-sorted back into rank order here rather than trusted from the second
 * query.
 */
export async function liveRelatedRecipes(
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
