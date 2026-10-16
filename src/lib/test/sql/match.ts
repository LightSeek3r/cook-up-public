/**
 * D1 reference: /api/match, as the app ran it against D1
 * before the data moved to the static artefacts (phases 3.2-3.3). D1 no
 * longer holds these tables (migrations/0013_retire_recipe_corpus.sql), so
 * this runs only in the parity suites, on SQLite built with migrations up to
 * CORPUS_SCHEMA_LAST (pipeline/lib/migrations.mjs): the regression reference
 * for the artefact generator and the in-memory queries. Nothing outside
 * src/lib/test may import it (src/lib/test/corpusReads.test.mjs).
 */
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
 * Cost shape (D1 bills rows read): the query starts from the selected ids and
 * walks `idx_ri_ingredient` to the recipes that contain one of them, so it reads
 * O(rows holding a selected ingredient) + O(page), not O(corpus). The previous
 * form joined all ~28k `recipe_ingredients` rows and evaluated per-recipe
 * subqueries for every recipe before HAVING/LIMIT, ~430k-690k rows per call.
 * Display-only columns (titles, names) are computed for the LIMITed page only.
 *
 * All placeholders are numbered (`?1`, `?2`, …) so a value used in several
 * places is bound once — do not mix in bare `?`, SQLite will not resolve the
 * two schemes together.
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
 *
 * Ordered by key, whatever order the URL listed them in: the id order becomes
 * the order of `unused_names`, and /api/match responses are cached per URL, so
 * every permutation of one selection must produce the same bytes. The planner
 * already probes the index in key order; the ORDER BY costs no extra rows and
 * keeps that from depending on the plan.
 */
export async function resolveIngredientIds(db: D1Database, keys: string[]): Promise<number[]> {
	if (keys.length === 0) return [];
	const { results } = await db
		.prepare(
			`SELECT id FROM ingredients WHERE canonical_key IN (SELECT value FROM json_each(?)) ORDER BY canonical_key`
		)
		.bind(JSON.stringify(keys))
		.all<{ id: number }>();
	return (results ?? []).map((row) => row.id);
}

export async function matchRecipes(
	db: D1Database,
	p: MatchParams
): Promise<{ results: MatchResult[]; total: number }> {
	// Dedupe here, not just in the caller: `HAVING matched >= ?3` is bound to the
	// selected-ingredient count below, and that is only a correct test for "uses
	// every selected ingredient" if the set has no duplicates — `matched` counts
	// distinct ids, so `have: [1, 1]` would demand matched = 2 from a single id
	// and silently return nothing. `parseIds` dedupes for the HTTP route, but this
	// function is exported and takes `have` directly.
	const have = [...new Set(p.have)];
	if (have.length === 0) return { results: [], total: 0 };

	// How many selected ingredients a recipe must use. `matched` counts distinct
	// satisfied `have` ids and so is capped at `have.length` by construction,
	// which makes `>= have.length` exactly the strict "uses everything" rule; the
	// relaxed group is the same query with a lower floor. `Math.max(1, …)` keeps
	// a recipe that satisfies *nothing* out however large slack gets.
	const slack = Math.max(0, p.slack ?? 0);

	// `have` (and every list below) is bound as one JSON string unpacked with
	// `json_each`, never one placeholder per id: D1 caps bound parameters at 100
	// (found by bisection — a placeholder-per-id design 500'd at 16 selected
	// ingredients). Bind count is 5 plus one per supplied filter, whatever the
	// selection size.
	const binds: (string | number)[] = [
		JSON.stringify(have), // ?1
		p.lang, // ?2
		Math.max(1, have.length - slack), // ?3
		p.limit ?? MATCH_PAGE_SIZE, // ?4
		p.offset ?? 0 // ?5
	];
	const param = (value: string | number) => {
		binds.push(value);
		return `?${binds.length}`;
	};

	// Filters — only bound when supplied, so no dead `? IS NULL` predicates.
	const where: string[] = [];
	if (p.cuisine) where.push(`r.cuisine = ${param(p.cuisine)}`);
	if (p.mealType) where.push(`r.meal_type = ${param(p.mealType)}`);
	if (p.diet) {
		where.push(
			`EXISTS (SELECT 1 FROM recipe_diets d WHERE d.recipe_id = r.id AND d.diet = ${param(p.diet)})`
		);
	}
	if (p.excludeAllergens?.length) {
		// Filtered by `allergens.key`, not `allergens.id` — see the MatchParams
		// comment; ids renumber on reseed the same way ingredient ids do, so a
		// shared/bookmarked URL has to carry the stable key instead.
		where.push(`NOT EXISTS (
        SELECT 1 FROM recipe_ingredients x
        JOIN ingredient_allergens ia ON ia.ingredient_id = x.ingredient_id
        JOIN allergens a ON a.id = ia.allergen_id
        WHERE x.recipe_id = r.id
          AND a.key IN (SELECT value FROM json_each(${param(JSON.stringify(p.excludeAllergens))})))`);
	}
	const whereSql = where.length ? `WHERE ${where.join('\n         AND ')}` : '';

	// `mustUse` forces a subset of `have` to be actually used by the recipe, not
	// merely available to it. Only bites when `slack` has already let the floor
	// admit recipes that skip some of the selection. Deduped and filtered to
	// `have` rather than trusted from the caller: an id outside `have` could
	// never be satisfied and would zero out the results instead of being a no-op.
	// Same "is this selection used" test as `matched` (directly or through a
	// curated specific form), as a count of the required ids that were credited.
	const mustUse = p.mustUse?.length
		? [...new Set(p.mustUse)].filter((id) => have.includes(id))
		: [];
	let mustHitCol = '';
	let mustHaving = '';
	if (mustUse.length) {
		const mustParam = param(JSON.stringify(mustUse));
		mustHitCol = `,
             COUNT(DISTINCT CASE WHEN s.have_id IN (SELECT value FROM json_each(${mustParam}))
                                 THEN s.have_id END)                     AS must_hit`;
		mustHaving = ` AND must_hit = ${param(mustUse.length)}`;
	}

	// Sort — a column/expression choice, not a value, so it's built as SQL text
	// rather than bound; `p.sort` only ever reaches here already whitelisted by
	// the API route, same trust boundary as `p.cuisine` etc. Every variant ends
	// on `r.id`, a total order, which is what lets the outer SELECT re-apply it
	// to the page and get exactly the rows' LIMIT order back.
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

	const sql = `
    WITH
    -- (selected id, ingredient id that satisfies it): the id itself, or one of
    -- its curated specific forms (selecting "egg" satisfies "egg_yolk"). A UNION,
    -- not one parent per ingredient: cassava_flour sits under both cassava and
    -- flour, and selecting both must credit both. MATERIALIZED so the generic
    -- table is read once, not once per reference below.
    sat(have_id, ing_id, staple) AS MATERIALIZED (
      SELECT s.have_id, s.ing_id, i.is_staple
        FROM (SELECT h.value AS have_id, h.value AS ing_id FROM json_each(?1) h
              UNION
              SELECT igo.generic_id, igo.specific_id
                FROM json_each(?1) h
                JOIN ingredient_generic_of igo ON igo.generic_id = h.value) s
        JOIN ingredients i ON i.id = s.ing_id
    ),
    -- Only recipes holding at least one satisfying ingredient can reach the
    -- floor (>= 1), so this index walk is the whole candidate set. matched
    -- counts distinct selections, not rows: a recipe using both egg_yolk and
    -- egg_white for a selected "egg" counts it once, or matched could exceed
    -- have.length. satisfied_non_staple counts distinct recipe rows, since one
    -- row can satisfy two selections.
    hit AS (
      SELECT ri.recipe_id,
             COUNT(DISTINCT s.have_id)                                   AS matched,
             GROUP_CONCAT(DISTINCT s.have_id)                            AS matched_ids,
             COUNT(DISTINCT CASE WHEN s.staple = 0 THEN ri.ingredient_id END) AS satisfied_non_staple${mustHitCol}
        FROM sat s
        JOIN recipe_ingredients ri ON ri.ingredient_id = s.ing_id
       GROUP BY ri.recipe_id
      HAVING matched >= ?3${mustHaving}
    ),
    -- non_staple_count is precomputed by the seed (migrations/0009); the
    -- fallback count only runs for a row some other writer left NULL, so such a
    -- row is slower, never wrong.
    cand AS (
      SELECT r.id, r.source_lang, r.cuisine, r.meal_type, r.prep_minutes, r.total_minutes,
             r.kcal, r.balance_grade, r.balance_score, r.nutrition_coverage, r.servings_assumed,
             hit.matched, hit.matched_ids, hit.satisfied_non_staple,
             COALESCE(r.non_staple_count, (
               SELECT COUNT(*) FROM recipe_ingredients x
                 JOIN ingredients xi ON xi.id = x.ingredient_id
                WHERE x.recipe_id = r.id AND xi.is_staple = 0)) AS required_non_staple
        FROM hit
        JOIN recipes r ON r.id = hit.recipe_id
       ${whereSql}
    ),
    -- How many recipes match in total, ignoring LIMIT/OFFSET: a window function
    -- rather than a second COUNT query — windows run before LIMIT, so this
    -- counts every candidate. Identical on every row. Without it the UI could
    -- only report how many rows it happened to receive ("50 recipes" when 395
    -- matched).
    page AS (
      SELECT r.*, r.required_non_staple - r.satisfied_non_staple AS missing,
             COUNT(*) OVER () AS total
        FROM cand r
       ORDER BY ${orderBy}
       LIMIT ?4 OFFSET ?5
    )
    SELECT
      r.id,
      COALESCE(t.title, src.title)                                   AS title,
      r.cuisine, r.meal_type, r.prep_minutes, r.total_minutes,
      r.kcal, r.balance_grade, r.balance_score,
      r.nutrition_coverage, r.servings_assumed,
      r.matched,
      -- Which of the user's *own* selections this recipe doesn't use, in
      -- selection order — the mirror of missing_names. A near-miss card that
      -- just said "2 of 3" would leave the user wondering which ingredient went
      -- unused, and "I have carrots" was the whole reason they were looking.
      (SELECT GROUP_CONCAT(COALESCE(ut.name, uen.name, ui.canonical_key), '${MISSING_NAMES_SEP}')
         FROM json_each(?1) h
         JOIN ingredients ui           ON ui.id = h.value
         LEFT JOIN ingredient_i18n ut  ON ut.ingredient_id = ui.id AND ut.lang = ?2
         LEFT JOIN ingredient_i18n uen ON uen.ingredient_id = ui.id AND uen.lang = 'en'
        WHERE h.value NOT IN (SELECT value FROM json_each('[' || r.matched_ids || ']'))) AS unused_names,
      -- The selections it does use, same order, names then keys: the card's
      -- "Uses" row draws an icon per key and labels it with the name.
      (SELECT GROUP_CONCAT(COALESCE(ut.name, uen.name, ui.canonical_key), '${MISSING_NAMES_SEP}')
         FROM json_each(?1) h
         JOIN ingredients ui           ON ui.id = h.value
         LEFT JOIN ingredient_i18n ut  ON ut.ingredient_id = ui.id AND ut.lang = ?2
         LEFT JOIN ingredient_i18n uen ON uen.ingredient_id = ui.id AND uen.lang = 'en'
        WHERE h.value IN (SELECT value FROM json_each('[' || r.matched_ids || ']'))) AS used_names,
      (SELECT GROUP_CONCAT(ui.canonical_key, '${MISSING_NAMES_SEP}')
         FROM json_each(?1) h
         JOIN ingredients ui ON ui.id = h.value
        WHERE h.value IN (SELECT value FROM json_each('[' || r.matched_ids || ']'))) AS used_keys,
      r.missing,
      r.required_non_staple,
      (SELECT GROUP_CONCAT(COALESCE(mt.name, men.name, i.canonical_key), '${MISSING_NAMES_SEP}')
         FROM recipe_ingredients ri
         JOIN ingredients i            ON i.id = ri.ingredient_id
         LEFT JOIN ingredient_i18n mt  ON mt.ingredient_id = ri.ingredient_id AND mt.lang = ?2
         LEFT JOIN ingredient_i18n men ON men.ingredient_id = ri.ingredient_id AND men.lang = 'en'
        WHERE ri.recipe_id = r.id AND i.is_staple = 0
          AND ri.ingredient_id NOT IN (SELECT ing_id FROM sat))       AS missing_names,
      -- Positionally aligned with missing_names: the same rows, walked in the
      -- same (primary key) order, projecting canonical_key instead of the
      -- display name. Exists so the UI can add a missing ingredient straight
      -- into the selection — missing_names is display text and cannot
      -- round-trip back into have.
      (SELECT GROUP_CONCAT(i.canonical_key, '${MISSING_NAMES_SEP}')
         FROM recipe_ingredients ri
         JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = r.id AND i.is_staple = 0
          AND ri.ingredient_id NOT IN (SELECT ing_id FROM sat))       AS missing_keys,
      r.total
    FROM page r
    LEFT JOIN recipe_i18n t   ON t.recipe_id = r.id AND t.lang = ?2
    LEFT JOIN recipe_i18n src ON src.recipe_id = r.id AND src.lang = r.source_lang
    ORDER BY ${orderBy}`;

	const { results } = await db
		.prepare(sql)
		.bind(...binds)
		.all<MatchRow>();

	const rows = results ?? [];
	// No rows means no matches, so the window function produced nothing to read.
	return { results: rows, total: rows[0]?.total ?? 0 };
}
