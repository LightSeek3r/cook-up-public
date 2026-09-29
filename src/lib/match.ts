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
	/** Allergen `key`s (from `ALLERGENS` in config.ts) to exclude, not
	 *  `allergens.id` — ids are positional and renumbered on reseed, the same
	 *  reason ingredient selections travel as `canonical_key` rather than id. */
	excludeAllergens?: string[];
	/** Default: fewest missing first. `kcal`/`grade` push recipes with no
	 *  nutrition data to the end rather than mixing them in arbitrarily;
	 *  `time` does the same for recipes with no `total_minutes`. */
	sort?: 'kcal' | 'grade' | 'time';
	/** How many selected ingredients a recipe may leave unused and still be
	 *  returned. 0 (the default) is the strict "uses everything you picked"
	 *  rule; see `slackFor`. */
	slack?: number;
	/** Ingredient ids (a subset of `have`) the recipe must actually use, not
	 *  merely leave available — only meaningful with `slack > 0`, where a
	 *  recipe can otherwise ignore any selection up to the slack count. Ids
	 *  outside `have` are dropped rather than trusted, since a requirement on
	 *  something the user never selected could never be satisfied. */
	mustUse?: number[];
	limit?: number;
	offset?: number;
}

/**
 * How many of the user's selections a recipe may ignore and still be worth
 * showing as a near-miss.
 *
 * Scaled rather than fixed, because slack is only meaningful relative to how
 * much the user picked: allowing 2 unused out of 3 selections would surface
 * every recipe containing any one of them, which is not "almost there", it's
 * "unrelated". A third of the selection, capped at 2, keeps the relaxed group
 * recognisably close to what the user actually has. Below 3 selections there is
 * no slack at all — with one or two ingredients the strict list is already
 * broad, and the feature exists for the case the user described: several
 * ingredients picked, and a recipe that uses most but not all of them.
 */
export function slackFor(haveCount: number): number {
	return Math.min(2, Math.floor(haveCount / 3));
}

/**
 * Returns recipes that use every selected ingredient — a recipe may need more
 * than `have`, never fewer — ranked by how few *other* non-staple ingredients
 * it still needs.
 *
 * With `slack > 0` the floor drops to `have.length - slack`, so recipes that
 * use *most* of the selection come back too, carrying `matched` and
 * `unused_names` so the caller can separate them ("almost there") and say which
 * selections went unused. Full matches always sort first, so relaxing this can
 * only ever add rows after the ones a strict query would have returned.
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
/** A result row plus the window-function total, which is identical on every row. */
type MatchRow = MatchResult & { total: number };

/**
 * `canonical_key`s -> `ingredients.id`, keeping only the keys that exist.
 *
 * The URL carries keys (stable across reseeds) while the match query works on
 * ids (what `recipe_ingredients` and `ingredient_generic_of` actually store), so
 * one lookup bridges them. Bound as a single JSON array unpacked by `json_each`,
 * not one placeholder per key, for the same reason `matchRecipes` does it: D1
 * caps bound parameters at 100, and a selection can exceed that.
 *
 * `canonical_key` is UNIQUE (migrations/0001_init.sql), so this rides its
 * implicit index.
 */
export async function resolveIngredientIds(db: D1Database, keys: string[]): Promise<number[]> {
	if (keys.length === 0) return [];
	const { results } = await db
		.prepare(`SELECT id FROM ingredients WHERE canonical_key IN (SELECT value FROM json_each(?))`)
		.bind(JSON.stringify(keys))
		.all<{ id: number }>();
	return (results ?? []).map((row) => row.id);
}

export async function matchRecipes(
	db: D1Database,
	p: MatchParams
): Promise<{ results: MatchResult[]; total: number }> {
	// Dedupe here, not just in the caller: `HAVING matched = ?` is bound to the
	// selected-ingredient count below, and that is only a correct test for "uses
	// every selected ingredient" if the set has no duplicates — `matched` counts
	// distinct rows, so `have: [1, 1]` would demand matched = 2 from a single row
	// and silently return nothing. `parseIds` dedupes for the HTTP route, but this
	// function is exported and takes `have` directly.
	const have = [...new Set(p.have)];
	if (have.length === 0) return { results: [], total: 0 };

	const binds: (string | number)[] = [];
	const list = <T>(values: T[]) => values.map(() => '?').join(',');

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

	// 1b. `unused_names` — which of the user's *own* selections this recipe
	// doesn't use. Note the direction: everything else here aggregates over the
	// recipe's ingredient rows, so it can only ever describe what the recipe
	// needs. This is the opposite question, and it can't be expressed as a
	// FILTER over those rows — a selected ingredient the recipe never mentions
	// has no row to filter. Hence a correlated subquery over `have` itself.
	//
	// It exists to explain group membership: a near-miss card that just said
	// "2 of 3" leaves the user wondering which of their ingredients went
	// unused, and "I have carrots" was the whole reason they were looking.
	const unusedNamesExpr = `(
    SELECT GROUP_CONCAT(COALESCE(ut.name, uen.name, ui.canonical_key), '${MISSING_NAMES_SEP}')
      FROM json_each(?) h
      JOIN ingredients ui           ON ui.id = h.value
      LEFT JOIN ingredient_i18n ut  ON ut.ingredient_id = ui.id AND ut.lang = ?
      LEFT JOIN ingredient_i18n uen ON uen.ingredient_id = ui.id AND uen.lang = 'en'
     WHERE h.value NOT IN (SELECT ri3.ingredient_id FROM recipe_ingredients ri3 WHERE ri3.recipe_id = r.id)
       AND h.value NOT IN (
             SELECT igo.generic_id FROM recipe_ingredients ri4
               JOIN ingredient_generic_of igo ON igo.specific_id = ri4.ingredient_id
              WHERE ri4.recipe_id = r.id)
  )`;
	binds.push(haveJson, p.lang);

	// 2. `missing` / `missing_names` / `missing_keys` — a per-row check, safe to
	// expand as a plain OR: a row is satisfied if its own id is selected, or its
	// curated generic parent is selected. Used three times (count + names +
	// keys), each occurrence needs `haveJson` bound twice (the direct check,
	// then the generic-parent check).
	const notSatisfied = `ri.ingredient_id NOT IN (${haveIds})
       AND ri.ingredient_id NOT IN (SELECT specific_id FROM ingredient_generic_of WHERE generic_id IN (${haveIds}))`;
	binds.push(haveJson, haveJson); // missing count
	binds.push(haveJson, haveJson); // missing_names
	binds.push(haveJson, haveJson); // missing_keys

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
		// Filtered by `allergens.key`, not `allergens.id` — see the MatchParams
		// comment; ids renumber on reseed the same way ingredient ids do, so a
		// shared/bookmarked URL has to carry the stable key instead.
		where.push(`NOT EXISTS (
        SELECT 1 FROM recipe_ingredients x
        JOIN ingredient_allergens ia ON ia.ingredient_id = x.ingredient_id
        JOIN allergens a ON a.id = ia.allergen_id
        WHERE x.recipe_id = r.id AND a.key IN (${list(p.excludeAllergens)}))`);
		binds.push(...p.excludeAllergens);
	}

	// 4b. `mustUse` — forces a subset of `have` to be actually used by the
	// recipe, not merely available to it. Only bites when `slack` has already
	// let `HAVING matched >= ?` (below) admit recipes that skip some of the
	// selection; deduped and filtered to `have` here rather than trusted from
	// the caller, since an id outside `have` could never be satisfied and
	// would zero out the results instead of being a no-op. Mirrors
	// `unusedNamesExpr`'s "is this selection used" logic (direct row, or via a
	// curated generic parent) but as a subset requirement rather than a name
	// list, so it needs its own JSON-bound `json_each` rather than reusing
	// `haveJson`.
	const mustUse = p.mustUse?.length
		? [...new Set(p.mustUse)].filter((id) => have.includes(id))
		: [];
	if (mustUse.length) {
		where.push(`NOT EXISTS (
        SELECT 1 FROM json_each(?) m
        WHERE m.value NOT IN (SELECT ri5.ingredient_id FROM recipe_ingredients ri5 WHERE ri5.recipe_id = r.id)
          AND m.value NOT IN (SELECT igo.generic_id FROM recipe_ingredients ri6
                                 JOIN ingredient_generic_of igo ON igo.specific_id = ri6.ingredient_id
                                WHERE ri6.recipe_id = r.id))`);
		binds.push(JSON.stringify(mustUse));
	}
	const whereSql = where.length ? `WHERE ${where.join('\n      AND ')}` : '';

	// 5. How many selected ingredients a recipe must use. `matched` counts
	// distinct satisfied `have` ids (see above) and so is capped at
	// `have.length` by construction, which makes `>= have.length` exactly the
	// old strict equality — `slack: 0` is therefore byte-equivalent in behaviour
	// to the previous `HAVING matched = ?`, and the relaxed group is the same
	// query with a lower floor rather than a second one. `Math.max(1, …)` keeps
	// a recipe that satisfies *nothing* out of the results however large slack
	// gets.
	const slack = Math.max(0, p.slack ?? 0);
	binds.push(Math.max(1, have.length - slack));

	// 6. Sort — a column/expression choice, not a value, so it's built as SQL
	// text rather than bound; `p.sort` only ever reaches here already
	// whitelisted by the API route, same trust boundary as `p.cuisine` etc.
	let orderBy = 'missing ASC, required_non_staple ASC, r.total_minutes ASC, r.id ASC';
	if (p.sort === 'kcal') {
		orderBy = '(r.nutrition_coverage < 0.7 OR r.kcal IS NULL) ASC, r.kcal ASC, missing ASC, r.id ASC';
	} else if (p.sort === 'grade') {
		orderBy = '(r.balance_grade IS NULL) ASC, r.balance_grade ASC, missing ASC, r.id ASC';
	} else if (p.sort === 'time') {
		// 65% of recipes have no total_minutes (measured 2026-09-29: 2,248 of
		// 3,478), so unknown times go last rather than being filtered out.
		orderBy = '(r.total_minutes IS NULL) ASC, r.total_minutes ASC, missing ASC, r.id ASC';
	}
	// With slack, coverage outranks everything else: a full match is a different
	// kind of answer from a near-miss, not merely a better-scoring one, and the
	// caller splits the rows on exactly this. Ordering it first also means LIMIT
	// can only ever truncate the relaxed tail — the strict results a user would
	// have seen before are never pushed off the page by this feature. Omitted
	// entirely when slack is 0, where `matched` is constant and the clause would
	// be dead weight.
	if (slack > 0) orderBy = `matched DESC, ${orderBy}`;

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
      ${unusedNamesExpr}                                              AS unused_names,
      COUNT(*) FILTER (WHERE i.is_staple = 0
                         AND ${notSatisfied})                          AS missing,
      COUNT(*) FILTER (WHERE i.is_staple = 0)                         AS required_non_staple,
      GROUP_CONCAT(CASE WHEN i.is_staple = 0 AND ${notSatisfied}
                        THEN COALESCE(mt.name, men.name, i.canonical_key) END,
                   '${MISSING_NAMES_SEP}') AS missing_names,
      -- Positionally aligned with missing_names above: SQLite steps every
      -- aggregate of a group on the same row in the same pass, so the
      -- identical CASE condition here walks the same rows in the same order,
      -- just projecting canonical_key instead of the display name. Exists so
      -- the UI can add a missing ingredient straight into the selection --
      -- missing_names is display text and cannot round-trip back into have.
      GROUP_CONCAT(CASE WHEN i.is_staple = 0 AND ${notSatisfied}
                        THEN i.canonical_key END,
                   '${MISSING_NAMES_SEP}') AS missing_keys,
      -- How many recipes match in total, ignoring LIMIT/OFFSET. A window
      -- function rather than a second COUNT query: SQLite evaluates windows
      -- after GROUP BY and HAVING but before LIMIT, so this counts the matching
      -- *groups* — verified against D1, not assumed. Identical on every row.
      -- Without it the UI could only report how many rows it happened to
      -- receive, which read as "50 recipes" when 395 matched.
      COUNT(*) OVER () AS total
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN ingredients i         ON i.id = ri.ingredient_id
    LEFT JOIN recipe_i18n t    ON t.recipe_id = r.id AND t.lang = ?
    LEFT JOIN recipe_i18n src  ON src.recipe_id = r.id AND src.lang = r.source_lang
    LEFT JOIN ingredient_i18n mt  ON mt.ingredient_id = ri.ingredient_id AND mt.lang = ?
    LEFT JOIN ingredient_i18n men ON men.ingredient_id = ri.ingredient_id AND men.lang = 'en'
    ${whereSql}
    GROUP BY r.id
    HAVING matched >= ?
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`;

	const { results } = await db
		.prepare(sql)
		.bind(...binds)
		.all<MatchRow>();

	const rows = results ?? [];
	// No rows means no matches, so the window function produced nothing to read.
	return { results: rows, total: rows[0]?.total ?? 0 };
}
