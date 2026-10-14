// /api/search, /api/recipes and /api/ingredients over the artefacts, with the
// semantics of the SQL they replaced (src/lib/test/sql, src/routes/api/
// ingredients): FTS5 trigram phrase matching of source titles for queries of
// 3+ characters, the LIKE fallback below that, and the same ORDER BY ties;
// plus, beyond the SQL, translated titles (see searchTitles).

import { intOrNull, vocabOrNull } from './core.js';
import { compareBinary, foldText, ftsFold, likeFold, trigramMatch } from './text.js';

// Mirror $lib/search (pinned equal by search.test.mjs); see match.js for why
// these are not imported.
export const MAX_QUERY = 64;
export const MIN_FTS_LENGTH = 3;
export const RECIPE_HIT_LIMIT = 12;
/** The `LIMIT 60` of /api/ingredients?q=. */
export const INGREDIENT_HIT_LIMIT = 60;

/** @param {string | null | undefined} raw */
export const normaliseQuery = (raw) => (raw ?? '').trim().slice(0, MAX_QUERY);

// One or two Han, kana or Hangul characters are a word (汤, 鸡肉, 국), where
// two Latin letters are not.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Whether a normalised query is worth a title search: 3+ characters, or any
 * CJK one. Shorter non-CJK queries are answered empty without loading data.
 * @param {string} q
 */
export const titleQueryReady = (q) => q.length >= MIN_FTS_LENGTH || (q.length > 0 && CJK.test(q));

/**
 * @typedef {object} RecipeHit
 * @property {number} id
 * @property {string | null} title
 * @property {string | null} cuisine
 * @property {number | null} total_minutes
 * @property {string | null} balance_grade
 * @property {number} nutrition_coverage
 */

/**
 * @typedef {object} IngredientTile
 * @property {number} id
 * @property {string} canonical_key
 * @property {string} category
 * @property {number} recipe_count
 * @property {string} name
 */

/** @typedef {import('./corpus.js').Corpus} Corpus */

/**
 * search.ts's HIT_COLS for one recipe index.
 * @param {Corpus} corpus
 * @param {number} r
 * @param {string} lang
 * @returns {RecipeHit}
 */
export function recipeHit(corpus, r, lang) {
	const c = corpus.core;
	return {
		id: c.recipeId[r],
		title: corpus.title(r, lang),
		cuisine: vocabOrNull(c.vocab.cuisine, c.cuisine[r]),
		total_minutes: intOrNull(c.totalMinutes[r]),
		balance_grade: vocabOrNull(c.vocab.grade, c.grade[r]),
		nutrition_coverage: c.coverage[r]
	};
}

/**
 * Recipe indexes in search.ts's `ORDER BY (r.balance_grade IS NULL) ASC,
 * r.total_minutes IS NULL, r.total_minutes ASC, r.id ASC`, at most `limit`
 * (SQLite's: negative means no limit). The order is precomputed (byHit), so
 * this is a walk over it, not a sort.
 * @param {import('./core.js').Core} c
 * @param {Uint8Array} hit 1 for every recipe that matched
 * @param {number} limit
 */
function inHitOrder(c, hit, limit) {
	if (!Number.isInteger(limit)) throw new Error(`limit must be an integer, got ${limit}`);
	/** @type {number[]} */
	const rows = [];
	for (let i = 0; i < c.byHit.length && rows.length !== limit; i++) if (hit[c.byHit[i]]) rows.push(c.byHit[i]);
	return rows;
}

/**
 * `searchRecipeTitles`, extended to translated titles. 3+ characters match
 * the source-language title the way recipe_title_fts did (so an English
 * query finds the same recipes in every language), and also the title in
 * `lang` where it differs from the source one, compared in foldText form
 * (case, accents and script variants folded: "creme" finds "Crème"). Shorter
 * queries LIKE-match the title shown in `lang` (case-insensitive for ASCII
 * only, as SQLite's LIKE), which is how one or two CJK characters find a
 * translated title. Hits are ranked as the SQL ranked them, never by which
 * title matched.
 * @param {Corpus} corpus
 * @param {{ q: string, lang: string, limit?: number }} p
 * @returns {{ recipes: RecipeHit[] }}
 */
export function searchTitles(corpus, p) {
	const q = normaliseQuery(p.q);
	if (!q) return { recipes: [] };
	const limit = p.limit ?? RECIPE_HIT_LIMIT;
	const c = corpus.core;
	const hit = new Uint8Array(c.recipes);
	if (q.length >= MIN_FTS_LENGTH) {
		const phrase = ftsFold(q);
		const titles = corpus.foldedSourceTitles();
		for (let r = 0; r < c.recipes; r++) {
			const t = titles[r];
			if (t !== null && trigramMatch(t, phrase)) hit[r] = 1;
		}
		const needle = foldText(q);
		if (needle) for (const { r, folded } of corpus.foldedTitleOverrides(p.lang)) if (folded.includes(needle)) hit[r] = 1;
	} else {
		const term = likeFold(q);
		for (let r = 0; r < c.recipes; r++) {
			const t = corpus.title(r, p.lang);
			if (t !== null && likeFold(t).includes(term)) hit[r] = 1;
		}
	}
	return { recipes: inHitOrder(c, hit, limit).map((r) => recipeHit(corpus, r, p.lang)) };
}

/**
 * `getRecipesByIds`: the recipes that exist, once each, in id order.
 * @param {Corpus} corpus
 * @param {{ ids: number[], lang: string }} p
 * @returns {{ recipes: RecipeHit[] }}
 */
export function recipesByIds(corpus, p) {
	const rows = [...new Set(p.ids)].map((id) => corpus.recipeIndex(id)).filter((r) => r >= 0);
	rows.sort((a, b) => a - b);
	return { recipes: rows.map((r) => recipeHit(corpus, r, p.lang)) };
}

/**
 * @param {Corpus} corpus
 * @param {number} g
 * @param {string} lang
 * @returns {IngredientTile}
 */
function tile(corpus, g, lang) {
	const c = corpus.core;
	return {
		id: g + 1,
		canonical_key: c.key(g),
		category: /** @type {string} */ (vocabOrNull(c.vocab.category, c.category[g])),
		recipe_count: c.recipeCount[g],
		name: corpus.name(g, lang)
	};
}

/**
 * The full /api/ingredients mosaic: non-staples by recipe_count descending,
 * then name (BINARY), then id.
 * @param {Corpus} corpus
 * @param {string} lang
 * @returns {IngredientTile[]}
 */
export function buildMosaic(corpus, lang) {
	const c = corpus.core;
	const tiles = [];
	for (let g = 0; g < c.ingredients; g++) if (!c.isStaple[g]) tiles.push(tile(corpus, g, lang));
	return tiles.sort((a, b) => b.recipe_count - a.recipe_count || compareBinary(a.name, b.name) || a.id - b.id);
}

/**
 * /api/ingredients?q= for a query of 3+ characters: non-staples whose own
 * name in `lang` or in English contains the phrase (ingredient_fts, which
 * indexes ingredient_i18n rows, never the canonical_key fallback), by
 * recipe_count descending, at most 60. Ties come out in descending id order:
 * the SQL leaves them to the plan (GROUP BY and ORDER BY through temp
 * B-trees), and that is the order it gives on node:sqlite and D1 alike.
 * Shorter queries are answered empty by the route and never reach this.
 * @param {Corpus} corpus
 * @param {{ q: string, lang: string }} p
 * @returns {IngredientTile[]}
 */
export function searchIngredients(corpus, p) {
	const phrase = ftsFold(normaliseQuery(p.q));
	const c = corpus.core;
	const own = corpus.foldedOwnNames(p.lang);
	const en = corpus.foldedOwnNames('en');
	/** @type {number[]} */
	const rows = [];
	for (let g = 0; g < c.ingredients; g++) {
		if (c.isStaple[g]) continue;
		if (trigramMatch(own[g], phrase) || trigramMatch(en[g], phrase)) rows.push(g);
	}
	rows.sort((a, b) => c.recipeCount[b] - c.recipeCount[a] || b - a);
	return rows.slice(0, INGREDIENT_HIT_LIMIT).map((g) => tile(corpus, g, p.lang));
}
