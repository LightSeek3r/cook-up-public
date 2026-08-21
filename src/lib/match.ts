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
 * A selected generic ingredient also satisfies a recipe's need for one of its
 * curated specific forms (`ingredient_generic_of`, e.g. selecting "egg"
 * satisfies a recipe that needs "egg_yolk") — but never the other direction,
 * and only for the curated pairs in that table, not the taxonomy's full DAG
 * (see `pipeline/lib/generic_ingredients.mjs` for why: e.g. "spice" or
 * "cheese" are whole categories, not one food with named variants).
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

	// `have` is passed as one bound JSON string and unpacked in SQL via
	// `json_each`, not as `have.length` positional placeholders — D1 caps
	// bound parameters at 100 (undocumented in the schema, found by bisection:
	// 15 selected ingredients = 95 binds, works; 16 = 101 binds, `D1_ERROR: too
	// many SQL variables`). Any placeholder-per-id design just moves that
	// ceiling; `json_each(?)` makes bind count constant (6, below) regardless
	// of how many ingredients are selected.
	const haveJson = JSON.stringify(have);
	const haveIds = `SELECT value FROM json_each(?)`;

	// 1. `matched` — NOT a simple row count against `have`: a recipe using
	// both egg_yolk and egg_white for a selected "egg" must still only count
	// once, or `matched` could exceed `have.length` and a real match would be
	// excluded by the `HAVING` below. Computed as a UNION (not a per-row CASE
	// picking one generic parent) so an ingredient with *two* curated generic
	// parents — e.g. `cassava_flour` under both `cassava` and `flour`
	// (`pipeline/lib/generic_ingredients.mjs`) — still credits both if the
	// user selected both, same as the old per-id-EXISTS design did; a CASE
	// with a single fallback lookup would silently drop one.
	const matchedExpr = `(
    SELECT COUNT(DISTINCT s.have_id) FROM (
      SELECT ri2.ingredient_id AS have_id
        FROM recipe_ingredients ri2
       WHERE ri2.recipe_id = r.id AND ri2.ingredient_id IN (${haveIds})
      UNION
      SELECT igo.generic_id AS have_id
        FROM recipe_ingredients ri2
        JOIN ingredient_generic_of igo ON igo.specific_id = ri2.ingredient_id
       WHERE ri2.recipe_id = r.id AND igo.generic_id IN (${haveIds})
    ) s
  )`;
	binds.push(haveJson, haveJson);

	// 2. `missing` / `missing_names` — a per-row check, safe to expand as a
	// plain OR: a row is satisfied if its own id is selected, or its curated
	// generic parent is selected. Used twice (count + names), each occurrence
	// needs `haveJson` bound twice (the direct check, then the generic-parent
	// check).
	const notSatisfied = `ri.ingredient_id NOT IN (${haveIds})
       AND ri.ingredient_id NOT IN (SELECT specific_id FROM ingredient_generic_of WHERE generic_id IN (${haveIds}))`;
	binds.push(haveJson, haveJson); // missing count
	binds.push(haveJson, haveJson); // missing_names

	// 3. Title + missing-ingredient-name joins: requested language, falling
	// back to the source language / English respectively.
	binds.push(p.lang, p.lang);

	// 4. Filters — only bound when supplied, so no dead `? IS NULL` predicates.
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

	// 5. Every selected ingredient must be used (directly or via a curated
	// generic->specific pair) — a recipe may use more than `have`, never
	// fewer. `matched` is a count of distinct satisfied `have` ids (see
	// above), so it's capped at `have.length` by construction — requiring the
	// full house is just this equality.
	binds.push(have.length);

	// 6. Sort — a column/expression choice, not a value, so it's built as SQL
	// text rather than bound; `p.sort` only ever reaches here already
	// whitelisted by the API route, same trust boundary as `p.cuisine` etc.
	let orderBy = 'missing ASC, required_non_staple ASC, r.total_minutes ASC, r.id ASC';
	if (p.sort === 'kcal') {
		orderBy = '(r.nutrition_coverage < 0.7 OR r.kcal IS NULL) ASC, r.kcal ASC, missing ASC, r.id ASC';
	} else if (p.sort === 'grade') {
		orderBy = '(r.balance_grade IS NULL) ASC, r.balance_grade ASC, missing ASC, r.id ASC';
	}

	// 7. Paging.
	const limit = p.limit ?? MATCH_PAGE_SIZE;
	binds.push(limit, p.offset ?? 0);

	const sql = `
    SELECT
      r.id,
      COALESCE(t.title, src.title)                                   AS title,
      r.cuisine, r.meal_type, r.prep_minutes, r.total_minutes,
      r.kcal, r.balance_grade, r.balance_score,
      r.nutrition_coverage, r.servings_assumed,
      (${matchedExpr})                                                AS matched,
      COUNT(*) FILTER (WHERE i.is_staple = 0
                         AND ${notSatisfied})                          AS missing,
      COUNT(*) FILTER (WHERE i.is_staple = 0)                         AS required_non_staple,
      GROUP_CONCAT(CASE WHEN i.is_staple = 0 AND ${notSatisfied}
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
