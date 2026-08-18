import type { D1Database } from '@cloudflare/workers-types';
import { MATCH_PAGE_SIZE, type Lang } from '$lib/config';
import type { MatchResult } from '$lib/types';

export interface MatchParams {
	/** Canonical ingredient ids the user has selected. */
	have: number[];
	lang: Lang;
	cuisine?: string;
	mealType?: string;
	diet?: string;
	excludeAllergens?: number[];
	limit?: number;
	offset?: number;
}

/**
 * Ranks recipes by how few non-staple ingredients the user is missing.
 *
 * Ordering is the product rule: `missing = 0` first ("you can make this now"),
 * then 1, 2, … Ties break on the smaller shopping list, then the faster recipe.
 *
 * Staples (salt, water, oil…) are flagged in `ingredients.is_staple` and are
 * never counted as missing.
 *
 * All placeholders are positional and bound in textual order — do not mix in
 * numbered (`?1`) placeholders, SQLite will not resolve the two schemes together.
 */
export async function matchRecipes(
	db: D1Database,
	p: MatchParams
): Promise<{ results: MatchResult[] }> {
	if (p.have.length === 0) return { results: [] };

	const binds: (string | number)[] = [];
	const list = (values: number[]) => values.map(() => '?').join(',');

	// 1. SELECT clause: the selected-ingredient set appears twice.
	const haveList = list(p.have);
	binds.push(...p.have, ...p.have);

	// 2. Title join: requested language, falling back to the source language.
	binds.push(p.lang);

	// 3. Filters — only bound when supplied, so no dead `? IS NULL` predicates.
	const where: string[] = [];
	if (p.cuisine) {
		where.push('r.cuisine = ?');
		binds.push(p.cuisine);
	}
	if (p.mealType) {
		where.push('r.meal_type = ?');
		binds.push(p.mealType);
	}
	if (p.diet) {
		where.push('EXISTS (SELECT 1 FROM recipe_diets d WHERE d.recipe_id = r.id AND d.diet = ?)');
		binds.push(p.diet);
	}
	if (p.excludeAllergens?.length) {
		where.push(`NOT EXISTS (
        SELECT 1 FROM recipe_ingredients x
        JOIN ingredient_allergens ia ON ia.ingredient_id = x.ingredient_id
        WHERE x.recipe_id = r.id AND ia.allergen_id IN (${list(p.excludeAllergens)}))`);
		binds.push(...p.excludeAllergens);
	}
	const whereSql = where.length ? `WHERE ${where.join('\n      AND ')}` : '';

	// 4. Paging.
	const limit = p.limit ?? MATCH_PAGE_SIZE;
	binds.push(limit, p.offset ?? 0);

	const sql = `
    SELECT
      r.id,
      COALESCE(t.title, src.title)                                   AS title,
      r.cuisine, r.meal_type, r.prep_minutes, r.total_minutes,
      r.kcal, r.balance_grade, r.balance_score,
      r.nutrition_coverage, r.servings_assumed,
      COUNT(*) FILTER (WHERE ri.ingredient_id IN (${haveList}))       AS matched,
      COUNT(*) FILTER (WHERE i.is_staple = 0
                         AND ri.ingredient_id NOT IN (${haveList}))   AS missing,
      COUNT(*) FILTER (WHERE i.is_staple = 0)                         AS required_non_staple
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN ingredients i         ON i.id = ri.ingredient_id
    LEFT JOIN recipe_i18n t    ON t.recipe_id = r.id AND t.lang = ?
    LEFT JOIN recipe_i18n src  ON src.recipe_id = r.id AND src.lang = r.source_lang
    ${whereSql}
    GROUP BY r.id
    HAVING matched > 0
    ORDER BY missing ASC, required_non_staple ASC, r.total_minutes ASC, r.id ASC
    LIMIT ? OFFSET ?`;

	const { results } = await db
		.prepare(sql)
		.bind(...binds)
		.all<MatchResult>();

	return { results: results ?? [] };
}
