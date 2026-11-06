// /api/match over the artefacts. Reproduces src/lib/match.ts's matchRecipes
// row for row: same candidates, totals, matched/missing counts, name lists,
// key order and sort ties (match.parity tests run both on one database).
// Runs unchanged in the Worker and in the browser.

import { compareBinary } from './text.js';
import { floatOrNull, intOrNull, vocabOrNull } from './core.js';
import { ALL_YEAR, VIEW_COUNT, WORLD_VIEW, ZONES, viewIndex } from './seasons.js';

// Mirror $lib/config (MATCH_PAGE_SIZE, MISSING_NAMES_SEP), which this module
// cannot import: the pipeline and the parity tools load it in plain Node,
// where `$lib` does not resolve. match.test.mjs pins them equal.
export const MATCH_PAGE_SIZE = 50;
export const MISSING_NAMES_SEP = String.fromCharCode(31);

/** Same rule as match.ts's slackFor. @param {number} haveCount */
export function slackFor(haveCount) {
	return Math.min(2, Math.floor(haveCount / 3));
}

/**
 * A season to rank by: the climate view (seasons.js viewIndex, or
 * WORLD_VIEW) and the month (1-12), which always comes from the client's
 * clock, never the server's, so a response stays a function of its URL.
 * @typedef {object} SeasonSelection
 * @property {number} view
 * @property {number} month
 * @property {boolean} [only] drop recipes that still need an out-of-season ingredient
 */

const SEASON_PARAM = /^(?:([a-z]+)\.([ns])|world)\.([1-9]|1[0-2])$/;

/**
 * The `season` URL value, `<zone>.<n|s>.<month>` or `world.<month>`
 * (`med.s.4`, `world.12`), as a view and month; null when malformed.
 * @param {string | null | undefined} value
 * @returns {{ view: number, month: number } | null}
 */
export function parseSeasonParam(value) {
	const m = value ? SEASON_PARAM.exec(value) : null;
	if (!m) return null;
	const view = m[1] === undefined ? WORLD_VIEW : viewIndex(m[1], /** @type {'n' | 's'} */ (m[2]));
	return view < 0 ? null : { view, month: Number(m[3]) };
}

/**
 * parseSeasonParam's inverse.
 * @param {number} view
 * @param {number} month
 */
export function seasonParam(view, month) {
	if (view === WORLD_VIEW) return `world.${month}`;
	const z = view % ZONES.length;
	return `${ZONES[z]}.${view < ZONES.length ? 'n' : 's'}.${month}`;
}

/**
 * @typedef {object} MatchQuery
 * @property {number[]} have ingredient ids
 * @property {string} lang
 * @property {string} [cuisine]
 * @property {string} [mealType]
 * @property {string} [diet]
 * @property {string[]} [excludeAllergens] allergen keys
 * @property {'kcal' | 'grade' | 'time'} [sort]
 * @property {number} [slack]
 * @property {number[]} [mustUse]
 * @property {SeasonSelection | null} [season] rank recipes needing out-of-season ingredients lower
 * @property {number} [limit]
 * @property {number} [offset]
 */

/**
 * @typedef {object} MatchRow
 * @property {number} id
 * @property {string | null} title
 * @property {string | null} cuisine
 * @property {string | null} meal_type
 * @property {number | null} prep_minutes
 * @property {number | null} total_minutes
 * @property {number | null} kcal
 * @property {string | null} balance_grade
 * @property {number | null} balance_score
 * @property {number} nutrition_coverage
 * @property {number} servings_assumed
 * @property {number} matched
 * @property {string | null} unused_names
 * @property {string | null} used_names
 * @property {string | null} used_keys
 * @property {number} missing
 * @property {number} required_non_staple
 * @property {string | null} missing_names
 * @property {string | null} missing_keys
 * @property {number} total
 */

/**
 * `resolveIngredientIds`: the ids of the keys that exist, in canonical_key
 * (BINARY) order whatever order they came in.
 * @param {import('./corpus.js').Corpus} corpus
 * @param {string[]} keys
 * @returns {number[]}
 */
export function resolveKeys(corpus, keys) {
	const found = [...new Set(keys)].filter((key) => corpus.ingredientIndex(key) >= 0);
	return found.sort(compareBinary).map((key) => corpus.ingredientIndex(key) + 1);
}

/**
 * SQLite's LIMIT/OFFSET: a negative LIMIT has no upper bound, a negative
 * OFFSET is 0, anything but an integer is an error (D1 answers it with a 500).
 * @param {number} value
 * @param {string} what
 */
function sqlInteger(value, what) {
	if (!Number.isInteger(value)) throw new Error(`${what} must be an integer, got ${value}`);
	return value;
}

/**
 * @param {import('./corpus.js').Corpus} corpus
 * @param {MatchQuery} p
 * @returns {{ results: MatchRow[], total: number }}
 */
export function matchCore(corpus, p) {
	const c = corpus.core;
	const have = [...new Set(p.have)];
	if (have.length === 0) return { results: [], total: 0 };
	const slack = Math.max(0, p.slack ?? 0);
	const floor = Math.max(1, have.length - slack);
	const limit = sqlInteger(p.limit ?? MATCH_PAGE_SIZE, 'limit');
	const offset = sqlInteger(p.offset ?? 0, 'offset');

	// Filters on a value the corpus never has match nothing, like `= ?` does.
	let cuisine = -1;
	if (p.cuisine) {
		cuisine = c.vocab.cuisine.indexOf(p.cuisine) + 1;
		if (cuisine === 0) return { results: [], total: 0 };
	}
	let mealType = -1;
	if (p.mealType) {
		mealType = c.vocab.mealType.indexOf(p.mealType) + 1;
		if (mealType === 0) return { results: [], total: 0 };
	}
	let dietBit = 0;
	if (p.diet) {
		const k = c.vocab.diet.indexOf(p.diet);
		if (k < 0) return { results: [], total: 0 };
		dietBit = 1 << k;
	}
	let allergenMask = 0;
	for (const key of p.excludeAllergens ?? []) {
		const k = c.vocab.allergen.indexOf(key);
		if (k >= 0) allergenMask |= 1 << k;
	}

	const mustUse = p.mustUse?.length ? [...new Set(p.mustUse)].filter((id) => have.includes(id)) : [];
	const isMust = have.map((id) => mustUse.includes(id));

	// sat: per selection, the ingredient indexes that satisfy it (itself and
	// its curated specific forms); `inSat` is their union.
	const N = c.ingredients;
	const inSat = new Uint8Array(N);
	/** @type {number[][]} */
	const sat = have.map((id) => {
		if (!Number.isInteger(id) || id < 1 || id > N) return [];
		const g = id - 1;
		const list = [g];
		for (let k = c.specificStart[g]; k < c.specificStart[g + 1]; k++) list.push(c.specific[k]);
		for (const s of list) inSat[s] = 1;
		return list;
	});

	const R = c.recipes;
	const matched = new Uint16Array(R);
	const mustHit = new Uint16Array(R);
	const seen = new Int32Array(R).fill(-1);
	// The posting walks are the hot loops, and on a lightly used isolate they
	// run interpreted: arrays and bounds in locals instead of a property load
	// per element cut a cold walk about in half (measured on the full corpus).
	const { posting, postingStart, isStaple } = c;
	const touched = new Int32Array(R);
	let touchedCount = 0;
	for (let k = 0; k < sat.length; k++) {
		const must = isMust[k];
		for (const g of sat[k]) {
			let r = 0;
			for (let j = postingStart[g], end = postingStart[g + 1]; j < end; j++) {
				r += posting[j];
				if (seen[r] === k) continue;
				seen[r] = k;
				if (matched[r]++ === 0) touched[touchedCount++] = r;
				if (must) mustHit[r]++;
			}
		}
	}
	// Distinct non-staple recipe ingredients that satisfy some selection.
	const satisfied = new Uint16Array(R);
	for (let g = 0; g < N; g++) {
		if (!inSat[g] || isStaple[g]) continue;
		let r = 0;
		for (let j = postingStart[g], end = postingStart[g + 1]; j < end; j++) satisfied[(r += posting[j])]++;
	}

	/** @type {number[]} */
	let cand = [];
	for (let i = 0; i < touchedCount; i++) {
		const r = touched[i];
		if (matched[r] < floor) continue;
		if (mustUse.length && mustHit[r] !== mustUse.length) continue;
		if (cuisine >= 0 && c.cuisine[r] !== cuisine) continue;
		if (mealType >= 0 && c.mealType[r] !== mealType) continue;
		if (dietBit && !(c.dietMask[r] & dietBit)) continue;
		if (c.allergenMask[r] & allergenMask) continue;
		cand.push(r);
	}
	const missing = (/** @type {number} */ r) => c.nonStaple[r] - satisfied[r];
	const byTime = p.sort !== 'kcal' && p.sort !== 'grade' && p.sort !== 'time';

	// Per candidate, the ingredients still to buy (the ones `missing` counts)
	// that the season's view has a calendar for and that are out of season in
	// its month, capped at 3. Only the default order ranks by it; `only` drops
	// every recipe that has one. Without seasons.json there is no season.
	const season = p.season ?? null;
	const seasons = season ? corpus.seasons() : null;
	/** @type {Uint8Array | null} */
	let oos = null;
	if (season && seasons && (season.only || byTime)) {
		const { view, month } = season;
		if (!Number.isInteger(view) || view < 0 || view >= VIEW_COUNT || !Number.isInteger(month) || month < 1 || month > 12) {
			throw new Error(`season must be a view 0..${VIEW_COUNT - 1} and a month 1..12, got ${view} and ${month}`);
		}
		const { masks } = seasons;
		const bit = 1 << (month - 1);
		const { recipeIngStart, recipeIng } = c;
		oos = new Uint8Array(R);
		/** @type {number[]} */
		const kept = [];
		for (const r of cand) {
			let n = 0;
			for (let j = recipeIngStart[r], end = recipeIngStart[r + 1], g = 0; j < end && n < 3; j++) {
				g += recipeIng[j];
				if (isStaple[g] || inSat[g]) continue;
				const mask = masks[g * VIEW_COUNT + view];
				if (mask !== ALL_YEAR && !(mask & bit)) n++;
			}
			if (season.only && n > 0) continue;
			oos[r] = n;
			kept.push(r);
		}
		cand = kept;
	}

	// match.ts's ORDER BY as one number per candidate, sorted natively: the
	// per-recipe parts are ranks precomputed by the generator (they already
	// encode SQLite's NULLs-first and the id tie-break), so a cold isolate sorts
	// plain doubles instead of calling a comparator ~20k times. Mixed-radix,
	// most significant first; the generator checks the largest key stays
	// below 2^53. With slack, more selections used comes first.
	//   default: missing, required_non_staple, timeRank (total_minutes, id)
	//            with a season: missing, out-of-season (0-3), required_non_staple, timeRank
	//   kcal:    kcalDense, missing, id
	//   grade:   grade (NULL last), missing, id
	//   time:    timeDense, missing, id
	const used = slack > 0 ? Math.min(have.length, N) : 0;
	const MISS = c.maxNonStaple + 1;
	const keys = new Float64Array(cand.length);
	for (let i = 0; i < cand.length; i++) {
		const r = cand[i];
		const lead = used - (slack > 0 ? matched[r] : 0);
		let key;
		if (p.sort === 'kcal') key = ((lead * R + c.kcalDense[r]) * MISS + missing(r)) * R + r;
		else if (p.sort === 'grade') key = ((lead * 256 + (c.grade[r] || 255)) * MISS + missing(r)) * R + r;
		else if (p.sort === 'time') key = ((lead * R + c.timeDense[r]) * MISS + missing(r)) * R + r;
		else if (oos) key = (((lead * MISS + missing(r)) * 4 + oos[r]) * MISS + c.nonStaple[r]) * R + c.timeRank[r];
		else key = ((lead * MISS + missing(r)) * MISS + c.nonStaple[r]) * R + c.timeRank[r];
		keys[i] = key;
	}
	keys.sort();

	const start = Math.max(0, offset);
	const end = limit < 0 ? keys.length : Math.min(keys.length, start + limit);
	if (start >= end) return { results: [], total: 0 };
	/** @type {number[]} */
	const page = [];
	for (let i = start; i < end; i++) {
		const last = keys[i] % R;
		page.push(byTime ? c.byTime[last] : last);
	}

	const lang = p.lang;
	const total = cand.length;
	const inRecipe = new Uint8Array(N);
	const results = page.map((r) => {
		const from = c.recipeIngStart[r];
		const to = c.recipeIngStart[r + 1];
		for (let j = from, g = 0; j < to; j++) inRecipe[(g += c.recipeIng[j])] = 1;

		/** @type {string[]} */
		const unused = [];
		/** @type {string[]} */
		const usedNames = [];
		/** @type {string[]} */
		const usedKeys = [];
		for (let k = 0; k < have.length; k++) {
			if (sat[k].length === 0) continue;
			if (!sat[k].some((g) => inRecipe[g])) unused.push(corpus.name(sat[k][0], lang));
			else {
				usedNames.push(corpus.name(sat[k][0], lang));
				usedKeys.push(c.key(sat[k][0]));
			}
		}
		/** @type {string[]} */
		const missingNames = [];
		/** @type {string[]} */
		const missingKeys = [];
		for (let j = from, g = 0; j < to; j++) {
			g += c.recipeIng[j];
			inRecipe[g] = 0;
			if (c.isStaple[g] || inSat[g]) continue;
			missingNames.push(corpus.name(g, lang));
			missingKeys.push(c.key(g));
		}

		/** @type {MatchRow} */
		const row = {
			id: c.recipeId[r],
			title: corpus.title(r, lang),
			cuisine: vocabOrNull(c.vocab.cuisine, c.cuisine[r]),
			meal_type: vocabOrNull(c.vocab.mealType, c.mealType[r]),
			prep_minutes: intOrNull(c.prepMinutes[r]),
			total_minutes: intOrNull(c.totalMinutes[r]),
			kcal: floatOrNull(c.kcal[r]),
			balance_grade: vocabOrNull(c.vocab.grade, c.grade[r]),
			balance_score: intOrNull(c.balanceScore[r]),
			nutrition_coverage: c.coverage[r],
			servings_assumed: c.servingsAssumed[r],
			matched: matched[r],
			unused_names: unused.length ? unused.join(MISSING_NAMES_SEP) : null,
			used_names: usedNames.length ? usedNames.join(MISSING_NAMES_SEP) : null,
			used_keys: usedKeys.length ? usedKeys.join(MISSING_NAMES_SEP) : null,
			missing: missing(r),
			required_non_staple: c.nonStaple[r],
			missing_names: missingNames.length ? missingNames.join(MISSING_NAMES_SEP) : null,
			missing_keys: missingKeys.length ? missingKeys.join(MISSING_NAMES_SEP) : null,
			total
		};
		return row;
	});
	return { results, total };
}

/**
 * A parsed /api/match query (apiParams' MatchQuery): canonical_keys, sorted
 * and unique, with the route's own parameter names.
 * @typedef {object} MatchApiQuery
 * @property {string[]} have
 * @property {string} lang
 * @property {string} [cuisine]
 * @property {string} [meal]
 * @property {string} [diet]
 * @property {'kcal' | 'grade' | 'time'} [sort]
 * @property {string[]} noAllergen
 * @property {string[]} must
 * @property {string} [season] `<zone>.<n|s>.<month>` or `world.<month>` (parseSeasonParam)
 * @property {boolean} [seasonOnly]
 * @property {number} offset
 */

/**
 * The /api/match response body, built the same way by the route and by the
 * browser (src/lib/client), so both answer one query with one JSON.
 * @param {import('./corpus.js').Corpus} corpus with `query.lang` loaded
 * @param {MatchApiQuery} query
 * @returns {{ results: MatchRow[], total: number, haveCount: number }}
 */
export function matchResponse(corpus, query) {
	// Keys that don't exist are dropped by the lookup rather than erroring, so
	// a stale or hand-edited link degrades to a smaller selection.
	const have = resolveKeys(corpus, query.have);
	if (have.length === 0) return { results: [], total: 0, haveCount: 0 };

	const slack = slackFor(have.length);

	// `must` (canonical keys, same shape as `have`) only matters once `slack`
	// lets a recipe skip some of the selection — with no slack every selection
	// is already required. Resolved with the same lookup `have` uses, then
	// intersected with `have`: a `must` id outside the selection could never be
	// satisfied.
	const mustUse =
		slack > 0 && query.must.length ? resolveKeys(corpus, query.must).filter((id) => have.includes(id)) : [];

	const season = parseSeasonParam(query.season);

	const data = matchCore(corpus, {
		have,
		lang: query.lang,
		cuisine: query.cuisine,
		mealType: query.meal,
		diet: query.diet,
		excludeAllergens: query.noAllergen,
		sort: query.sort,
		// Derived from the selection size, not accepted from the query string:
		// slack is a product rule, and a client-supplied value would let a URL
		// widen the match floor arbitrarily.
		slack,
		mustUse,
		season: season && { ...season, only: query.seasonOnly === true },
		offset: query.offset
	});

	// `have.length` travels with the results so the client can tell a full
	// match (`matched === haveCount`) from a near-miss without re-deriving it
	// from the URL: only the side that resolves and dedupes the keys knows how
	// many actually count.
	return { ...data, haveCount: have.length };
}
