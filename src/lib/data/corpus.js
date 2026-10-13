// The loaded artefact set: core.bin plus the per-language text files, with
// the same fallbacks the SQL applies (title: the language's row, then the
// source-language row; ingredient name: language, then English, then
// canonical_key).
//
// Text files may be passed parsed or as JSON strings; strings are parsed on
// first use of their language, so a Worker that bundles every language pays
// only for the ones its requests ask for.

import { compareBinary, ftsFold } from './text.js';
import { decodeCore } from './core.js';

/**
 * Titles of one language that differ from the source title; every other
 * recipe shows its source title (core.bin) in that language too.
 * @typedef {object} TitleOverridesFile
 * @property {string} version
 * @property {string} lang
 * @property {number[]} ids
 * @property {string[]} titles
 */

/**
 * One language's ingredient names by ingredient index, already resolved
 * (`COALESCE(t.name, en.name, i.canonical_key)`) and joined by newlines: one
 * JSON string parses and splits natively, where an array of 1,039 strings
 * plus a fallback pass costs a cold isolate several times more. `own` has
 * '1' where the name is the language's own ingredient_i18n row, '0' where it
 * is a fallback (the search index only holds own rows).
 * @typedef {object} NamesFile
 * @property {string} version
 * @property {string} lang
 * @property {string} names
 * @property {string} own
 * @property {boolean} foldByLowerCase toLowerCase() of `names` equals its FTS folding
 */

/**
 * @typedef {object} CorpusInput
 * @property {import('./core.js').Core | ArrayBuffer | Uint8Array} core
 * @property {Record<string, TitleOverridesFile | string>} [titles] title overrides by language
 * @property {Record<string, NamesFile | string>} names by language; must include 'en'
 */

/**
 * @template T
 * @param {T | string} value
 * @returns {T}
 */
const parsed = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

/**
 * @param {string} what
 * @param {string} expected
 * @param {{ version: string }} file
 */
function sameVersion(what, expected, file) {
	if (file.version !== expected) {
		throw new Error(`${what} is data version ${file.version}, core.bin is ${expected}: artefacts from different builds`);
	}
}

/** @param {CorpusInput} input */
export function loadCorpus(input) {
	const core = input.core instanceof ArrayBuffer || input.core instanceof Uint8Array ? decodeCore(input.core) : input.core;
	const { version } = core;
	if (input.names.en === undefined) throw new Error("names: English is required (every language's fallback)");

	/**
	 * Index of a recipe id in the core, or -1.
	 * @param {number} id
	 */
	function recipeIndex(id) {
		const ids = core.recipeId;
		let lo = 0;
		let hi = ids.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1;
			const v = ids[mid];
			if (v === id) return mid;
			if (v < id) lo = mid + 1;
			else hi = mid - 1;
		}
		return -1;
	}

	/** @type {Map<string, Map<number, string>>} */
	const overrides = new Map();
	/** @param {string} lang */
	function overridesFor(lang) {
		let map = overrides.get(lang);
		if (map) return map;
		map = new Map();
		const raw = input.titles?.[lang];
		if (raw !== undefined) {
			/** @type {TitleOverridesFile} */
			const file = parsed(raw);
			sameVersion(`titles/${lang}`, version, file);
			for (let i = 0; i < file.ids.length; i++) {
				const r = recipeIndex(file.ids[i]);
				if (r < 0) throw new Error(`titles/${lang} names unknown recipe ${file.ids[i]}`);
				map.set(r, file.titles[i]);
			}
		}
		overrides.set(lang, map);
		return map;
	}

	/**
	 * @typedef {{ file: NamesFile, names: string[], folded?: string[] }} LoadedNames
	 * @type {Map<string, LoadedNames | null>}
	 */
	const names = new Map();
	/**
	 * A language without a names file has no ingredient_i18n row at all, so
	 * every name falls back exactly as the English file already resolves it.
	 * @param {string} lang
	 * @returns {LoadedNames | null}
	 */
	function namesFor(lang) {
		let loaded = names.get(lang);
		if (loaded !== undefined) return loaded;
		const raw = input.names[lang];
		if (raw === undefined) loaded = null;
		else {
			/** @type {NamesFile} */
			const file = parsed(raw);
			sameVersion(`names/${lang}`, version, file);
			const list = file.names.split('\n');
			if (list.length !== core.ingredients || file.own.length !== core.ingredients) {
				throw new Error(`names/${lang} and core.bin list different ingredients`);
			}
			loaded = { file, names: list };
		}
		names.set(lang, loaded);
		return loaded;
	}
	const display = (/** @type {string} */ lang) => /** @type {LoadedNames} */ (namesFor(lang) ?? namesFor('en'));

	/** @type {(string | null)[] | null} */
	let foldedTitles = null;
	const noNames = () => Array.from({ length: core.ingredients }, () => '');

	return {
		core,
		version,
		recipeIndex,
		/**
		 * Index of a canonical_key, or -1: a binary search over keyOrder, so
		 * no lookup table has to be built on a cold isolate.
		 * @param {string} key
		 */
		ingredientIndex(key) {
			const order = core.keyOrder;
			let lo = 0;
			let hi = order.length - 1;
			while (lo <= hi) {
				const mid = (lo + hi) >>> 1;
				const cmp = compareBinary(core.key(order[mid]), key);
				if (cmp === 0) return order[mid];
				if (cmp < 0) lo = mid + 1;
				else hi = mid - 1;
			}
			return -1;
		},
		/**
		 * `COALESCE(t.title, src.title)`: the language's own title, else the
		 * source-language title, else null.
		 * @param {number} r recipe index
		 * @param {string} lang
		 * @returns {string | null}
		 */
		title(r, lang) {
			const own = overridesFor(lang).get(r);
			return own === undefined ? core.sourceTitle(r) : own;
		},
		/**
		 * `COALESCE(t.name, en.name, i.canonical_key)`.
		 * @param {number} g ingredient index
		 * @param {string} lang
		 * @returns {string}
		 */
		name(g, lang) {
			return display(lang).names[g];
		},
		/**
		 * The language's own ingredient_i18n name, null when it has none.
		 * @param {number} g
		 * @param {string} lang
		 * @returns {string | null}
		 */
		ownName(g, lang) {
			const loaded = namesFor(lang);
			return loaded && loaded.file.own.charCodeAt(g) === 49 ? loaded.names[g] : null;
		},
		/**
		 * Source-language titles FTS-folded, by recipe index (null: no title).
		 * One native toLowerCase over the whole blob when the generator found
		 * that equal to the FTS folding, which spares a cold isolate 3,478 calls.
		 * @returns {(string | null)[]}
		 */
		foldedSourceTitles() {
			if (!foldedTitles) {
				const list = core.titlesFoldByLowerCase ? core.titleText().toLowerCase().split('\0') : null;
				foldedTitles = core.sourceTitles().map((t, r) => (t === null ? null : list ? list[r] : ftsFold(t)));
			}
			return foldedTitles;
		},
		/**
		 * The language's own names FTS-folded, by ingredient index ('' where it
		 * has none, which no search phrase matches).
		 * @param {string} lang
		 * @returns {string[]}
		 */
		foldedOwnNames(lang) {
			const loaded = namesFor(lang);
			if (!loaded) return noNames();
			if (!loaded.folded) {
				const { file } = loaded;
				const all = file.foldByLowerCase ? file.names.toLowerCase().split('\n') : loaded.names.map(ftsFold);
				loaded.folded = all.map((name, g) => (file.own.charCodeAt(g) === 49 ? name : ''));
			}
			return loaded.folded;
		}
	};
}

/** @typedef {ReturnType<typeof loadCorpus>} Corpus */
