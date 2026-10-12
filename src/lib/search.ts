import type { D1Database } from '@cloudflare/workers-types';
import type { Lang } from '$lib/config';
import type { RecipeHit } from '$lib/types';

/** Longest query we will look at. Anything beyond this is noise or an attempt to
 *  make the tokenizer work hard. */
export const MAX_QUERY = 64;

/** Below this, the trigram tokenizer has nothing to index and we fall back to a
 *  LIKE scan — which is what makes CJK queries work at all. */
export const MIN_FTS_LENGTH = 3;

/** Default cap on recipe title hits. Deliberately smaller than the ingredient
 *  mosaic's 60: recipe hits are a secondary affordance above the mosaic, not the
 *  main surface, and a long list would push the ingredients off-screen. */
export const RECIPE_HIT_LIMIT = 12;

/**
 * FTS5 phrase literal. Doubling `"` neutralises the query syntax, so user input
 * can never be interpreted as FTS operators.
 */
export const ftsPhrase = (q: string) => `"${q.replace(/"/g, '""')}"`;

/** LIKE wildcards must be escaped for the short-query fallback path. */
export const likeTerm = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Trim and clamp a raw `?q=` value once, at the boundary. */
export const normaliseQuery = (raw: string | null): string =>
	(raw ?? '').trim().slice(0, MAX_QUERY);

/**
 * Recipes whose title matches `q`.
 *
 * Reads `recipe_title_fts`, which the pipeline has been building and rebuilding
 * all along (`06_seed_d1.mjs`, `gen_remote_seed.mjs`) while
 * no application code ever queried it.
 *
 * One thing about that index drives the whole shape of this query: **recipe
 * titles are deliberately never translated.** A dish name is a proper noun, so
 * every language's `recipe_i18n` row would otherwise carry the same
 * untranslated source title. As of migrations/0008_recipe_title_fts_source_only.sql,
 * the index is built from source-lang rows only (`WHERE i.lang = r.source_lang`)
 * — not "rebuild" over the whole table — specifically to avoid indexing that
 * same string once per language (a rebuild-after-every-translation-batch habit
 * that once burned the whole D1 free-tier daily read quota re-reading rows that
 * never needed indexing in the first place). Never call `'rebuild'` on this
 * table again; use the source-lang INSERT from that migration instead.
 *
 * Consequence: search is English-title search in every locale. A French user
 * typing "poulet" will not find "Chicken Handi". That is a property of the
 * data, not a bug in this query; changing it means translating titles in the
 * pipeline, which contradicts the proper-noun decision on record.
 *
 * Cost shape (D1 bills rows read): the FTS hits are ranked in a subquery that
 * reads only `recipes`, and the two `recipe_i18n` title lookups run for the
 * `limit` rows shown, not for every hit — ~4 rows per hit instead of ~7
 * ("chicken": 1,365 -> 816). `DISTINCT` there is the dedupe `GROUP BY r.id`
 * used to do: the index normally holds one row per recipe since 0008, but a
 * translated row indexed by an older pipeline, or a pre-0008 index, gives one
 * recipe several FTS rowids, and the subquery selects only `recipes` columns,
 * so its duplicates are identical rows.
 *
 * The displayed title still goes through the `COALESCE(t.title, src.title)`
 * fallback that `match.ts` uses, so this stays correct on its own terms if
 * titles ever do become translated.
 */
/** RecipeHit projection + the i18n title fallback, shared by every query that
 *  returns RecipeHit rows (this file and related.ts). `HIT_JOINS` binds the
 *  language with one bare `?`. */
export const HIT_COLS = `r.id,
       COALESCE(t.title, src.title) AS title,
       r.cuisine, r.total_minutes, r.balance_grade, r.nutrition_coverage`;
export const HIT_JOINS = `LEFT JOIN recipe_i18n t   ON t.recipe_id = r.id AND t.lang = ?
       LEFT JOIN recipe_i18n src ON src.recipe_id = r.id AND src.lang = r.source_lang`;

export async function searchRecipeTitles(
	db: D1Database,
	p: { q: string; lang: Lang; limit?: number }
): Promise<{ recipes: RecipeHit[] }> {
	const q = normaliseQuery(p.q);
	if (!q) return { recipes: [] };

	const limit = p.limit ?? RECIPE_HIT_LIMIT;

	// Ranking: a recipe we can describe nutritionally first, then the quicker
	// one. There is no relevance score to sort by — every hit is a substring
	// match on a short proper noun, so FTS rank would be close to arbitrary.
	const order = `ORDER BY (r.balance_grade IS NULL) ASC, r.total_minutes IS NULL, r.total_minutes ASC, r.id ASC`;

	if (q.length >= MIN_FTS_LENGTH) {
		const { results } = await db
			.prepare(
				`SELECT ${HIT_COLS}
         FROM (SELECT DISTINCT r.id, r.source_lang, r.cuisine, r.total_minutes,
                      r.balance_grade, r.nutrition_coverage
               FROM recipe_title_fts f
               JOIN recipe_i18n m ON m.rowid = f.rowid
               JOIN recipes r     ON r.id = m.recipe_id
               WHERE f.title MATCH ?
               ${order}
               LIMIT ?) r
         ${HIT_JOINS}
         ${order}`
			)
			.bind(ftsPhrase(q), limit, p.lang)
			.all<RecipeHit>();
		return { recipes: results ?? [] };
	}

	const { results } = await db
		.prepare(
			`SELECT ${HIT_COLS}
       FROM recipes r
       ${HIT_JOINS}
       WHERE COALESCE(t.title, src.title) LIKE ? ESCAPE '\\'
       GROUP BY r.id
       ${order}
       LIMIT ?`
		)
		.bind(p.lang, `%${likeTerm(q)}%`, limit)
		.all<RecipeHit>();
	return { recipes: results ?? [] };
}

/**
 * Recipes by id — the summary-row fetch behind the client-only favorites
 * page, which already knows its own id list from localStorage and only needs
 * display data. Same RecipeHit projection and i18n-title fallback as
 * searchRecipeTitles. Rows come back in id order whatever order `ids` is in,
 * so every permutation of one list is the same response; the favorites page
 * re-sorts client-side by its own stored order.
 *
 * The ids are bound as one JSON array, not one placeholder each: D1 caps a
 * statement at 100 bound parameters, and a placeholder per id 500'd at 100
 * favorites.
 */
export async function getRecipesByIds(
	db: D1Database,
	p: { ids: number[]; lang: Lang }
): Promise<{ recipes: RecipeHit[] }> {
	if (p.ids.length === 0) return { recipes: [] };
	const { results } = await db
		.prepare(
			`SELECT ${HIT_COLS}
       FROM recipes r
       ${HIT_JOINS}
       WHERE r.id IN (SELECT value FROM json_each(?))
       GROUP BY r.id
       ORDER BY r.id`
		)
		.bind(p.lang, JSON.stringify(p.ids))
		.all<RecipeHit>();
	return { recipes: results ?? [] };
}
