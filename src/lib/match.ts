import type { D1Database } from '@cloudflare/workers-types';
import { MATCH_PAGE_SIZE, MISSING_NAMES_SEP, type Lang } from '$lib/config';
import type { MatchResult } from '$lib/types';

export interface MatchParams {
	/** Canonical ingredient ids the user has selected. */
	have: number[];
	lang: Lang;
	cuisine?: string;
	mealType?: string;
	diet?: string;
	excludeAllergens?: number[];
	/** Default: fewest missing first. `kcal`/`grade` push recipes with no
	 *  nutrition data to the end rather than mixing them in arbitrarily. */
	sort?: 'kcal' | 'grade';
	limit?: number;
	offset?: number;
}

/**
 * Returns only recipes that use every selected ingredient — a recipe may need
 * more than `have`, never fewer — ranked by how few *other* non-staple
 * ingredients it still needs.
 *
 * Default ordering is the product rule: `missing = 0` first ("you can make
 * this now"), then 1, 2, … Ties break on the smaller shopping list, then the
 * faster recipe. `sort: 'kcal' | 'grade'` overrides this to rank by nutrition
 * instead, still pushing recipes with no nutrition data to the end.
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
	// Dedupe here, not just in the caller: `HAVING matched = ?` is bound to the
	// selected-ingredient count below, and that is only a correct test for "uses
	// every selected ingredient" if the set has no duplicates — `matched` counts
	// distinct rows, so `have: [1, 1]` would demand matched = 2 from a single row
	// and silently return nothing. `parseIds` dedupes for the HTTP route, but this
	// function is exported and takes `have` directly.
	const have = [...new Set(p.have)];
	if (have.length === 0) return { results: [] };

	const binds: (string | number)[] = [];
	const list = (values: number[]) => values.map(() => '?').join(',');

	// 1. SELECT clause: the selected-ingredient set appears three times
	// (matched, missing count, missing-names list).
	const haveList = list(have);
	binds.push(...have, ...have, ...have);

	// 2. Title + missing-ingredient-name joins: requested language, falling
	// back to the source language / English respectively.
	binds.push(p.lang, p.lang);

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

	// 4. Every selected ingredient must be used — a recipe may use more than
	// `have`, never fewer. `matched` already counts distinct selected
	// ingredients found (one row per ingredient per recipe, by primary key),
	// so requiring the full house is just `matched = have.length`.
	binds.push(have.length);

	// 5. Sort — a column/expression choice, not a value, so it's built as SQL
	// text rather than bound; `p.sort` only ever reaches here already
	// whitelisted by the API route, same trust boundary as `p.cuisine` etc.
	let orderBy = 'missing ASC, required_non_staple ASC, r.total_minutes ASC, r.id ASC';
	if (p.sort === 'kcal') {
		orderBy = '(r.nutrition_coverage < 0.7 OR r.kcal IS NULL) ASC, r.kcal ASC, missing ASC, r.id ASC';
	} else if (p.sort === 'grade') {
		orderBy = '(r.balance_grade IS NULL) ASC, r.balance_grade ASC, missing ASC, r.id ASC';
	}

	// 6. Paging.
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
      COUNT(*) FILTER (WHERE i.is_staple = 0)                         AS required_non_staple,
      GROUP_CONCAT(CASE WHEN i.is_staple = 0 AND ri.ingredient_id NOT IN (${haveList})
                        THEN COALESCE(mt.name, men.name, i.canonical_key) END,
                   '${MISSING_NAMES_SEP}') AS missing_names
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN ingredients i         ON i.id = ri.ingredient_id
    LEFT JOIN recipe_i18n t    ON t.recipe_id = r.id AND t.lang = ?
    LEFT JOIN recipe_i18n src  ON src.recipe_id = r.id AND src.lang = r.source_lang
    LEFT JOIN ingredient_i18n mt  ON mt.ingredient_id = ri.ingredient_id AND mt.lang = ?
    LEFT JOIN ingredient_i18n men ON men.ingredient_id = ri.ingredient_id AND men.lang = 'en'
    ${whereSql}
    GROUP BY r.id
    HAVING matched = ?
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`;

	const { results } = await db
		.prepare(sql)
		.bind(...binds)
		.all<MatchResult>();

	return { results: results ?? [] };
}
