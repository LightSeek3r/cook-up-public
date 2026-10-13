// /api/match over the artefacts. Reproduces src/lib/match.ts's matchRecipes
// row for row: same candidates, totals, matched/missing counts, name lists,
// key order and sort ties (match.parity tests run both on one database).
// Runs unchanged in the Worker and in the browser.

import { compareBinary } from './text.js';
import { floatOrNull, intOrNull, vocabOrNull } from './core.js';

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
	const cand = [];
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

	// match.ts's ORDER BY as one number per candidate, sorted natively: the
	// per-recipe parts are ranks precomputed by the generator (they already
	// encode SQLite's NULLs-first and the id tie-break), so a cold isolate sorts
	// plain doubles instead of calling a comparator ~20k times. Mixed-radix,
	// most significant first; the generator checks the largest key stays
	// below 2^53. With slack, more selections used comes first.
	//   default: missing, required_non_staple, timeRank (total_minutes, id)
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
		else key = ((lead * MISS + missing(r)) * MISS + c.nonStaple[r]) * R + c.timeRank[r];
		keys[i] = key;
	}
	keys.sort();

	const start = Math.max(0, offset);
	const end = limit < 0 ? keys.length : Math.min(keys.length, start + limit);
	if (start >= end) return { results: [], total: 0 };
	const byTime = !p.sort || (p.sort !== 'kcal' && p.sort !== 'grade' && p.sort !== 'time');
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
		for (let k = 0; k < have.length; k++) {
			if (sat[k].length === 0) continue;
			if (!sat[k].some((g) => inRecipe[g])) unused.push(corpus.name(sat[k][0], lang));
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
