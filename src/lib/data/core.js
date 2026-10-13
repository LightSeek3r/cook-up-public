// core.bin: everything /api/match and title search need, laid out so that
// decoding is a small JSON header plus typed-array views over the file's own
// bytes. Nothing is parsed, copied or rebuilt per row, and strings are decoded
// only when asked for, which keeps the first request on a cold Worker isolate
// cheap (the free plan allows 10 ms of CPU per request).
//
// Written by pipeline/lib/artefacts.mjs. Layout (little-endian):
//   "CKUPCORE" | u32 header byte length | header JSON (UTF-8) | sections
// The sections start at the first 8-byte boundary after the header, each on
// an 8-byte boundary, in CORE_SECTIONS order; the header gives every
// section's offset (from that first boundary) and element count.
//
// Indexes, not ids: a recipe is its position in `recipeId` (ascending ids), an
// ingredient is `ingredients.id - 1` (the seeds number them 1..N in
// ingredients.jsonl order). Vocabulary columns hold 0 for NULL and k for
// vocab[k - 1]; vocabularies are in BINARY order, so codes sort like the text.
// Strings are UTF-8, joined by NUL into one blob per kind: item i is the bytes
// [start[i], start[i + 1] - 1).

export const CORE_MAGIC = 'CKUPCORE';
export const CORE_FORMAT = 1;

/** Stands for NULL in the i32 columns that are nullable INTEGERs in D1. */
export const NULL_INT = -0x80000000;

/** @typedef {'i32' | 'u16' | 'u8' | 'f64'} ElementType */

/** @type {readonly (readonly [string, ElementType])[]} */
export const CORE_SECTIONS = [
	// per recipe
	['recipeId', 'i32'],
	['prepMinutes', 'i32'],
	['totalMinutes', 'i32'],
	['balanceScore', 'i32'],
	['kcal', 'f64'], // NaN = NULL
	['coverage', 'f64'],
	['nonStaple', 'u16'],
	['allergenMask', 'u16'], // bit k: an ingredient carries vocab.allergen[k]
	['cuisine', 'u8'],
	['mealType', 'u8'],
	['grade', 'u8'],
	['dietMask', 'u8'], // bit k: recipe_diets has vocab.diet[k]
	['servingsAssumed', 'u8'],
	['hasTitle', 'u8'], // 0 when the recipe has no source-language row
	['titleStart', 'i32'],
	['titleBlob', 'u8'], // source-language titles
	// Sort ranks, precomputed so a match sorts plain numbers (see match.js):
	['timeRank', 'u16'], // position by (total_minutes, NULL first; id)
	['byTime', 'u16'], // inverse of timeRank
	['timeDense', 'u16'], // dense rank by (total_minutes IS NULL, total_minutes)
	['kcalDense', 'u16'], // dense rank by (coverage < 0.7 OR kcal IS NULL, kcal, NULL first)
	['byHit', 'u16'], // recipe indexes in search.ts's hit order (grade IS NULL, total_minutes IS NULL, total_minutes, id)
	// recipe -> its ingredient indexes, ascending and delta-coded (each value
	// is the gap from the previous one, the first from 0), which halves the
	// gzip size and costs one addition where the list is walked anyway
	['recipeIngStart', 'i32'], // R + 1 entries
	['recipeIng', 'u16'],
	// per ingredient
	['isStaple', 'u8'],
	['category', 'u8'],
	['recipeCount', 'i32'],
	['keyStart', 'i32'],
	['keyBlob', 'u8'], // canonical_key
	['keyOrder', 'u16'], // ingredient indexes by canonical_key (BINARY)
	// generic ingredient -> its curated specific forms (ingredient_generic_of)
	['specificStart', 'i32'],
	['specific', 'u16'],
	// ingredient -> recipe indexes holding it, ascending and delta-coded likewise
	['postingStart', 'i32'],
	['posting', 'u16']
];

/** @type {Record<ElementType, Int32ArrayConstructor | Uint16ArrayConstructor | Uint8ArrayConstructor | Float64ArrayConstructor>} */
export const ELEMENT = { i32: Int32Array, u16: Uint16Array, u8: Uint8Array, f64: Float64Array };

/**
 * @typedef {object} CoreVocab
 * @property {string[]} cuisine
 * @property {string[]} mealType
 * @property {string[]} grade
 * @property {string[]} diet
 * @property {string[]} allergen
 * @property {string[]} category
 */

/**
 * @typedef {object} CoreHeader
 * @property {number} format
 * @property {string} version
 * @property {number} recipes
 * @property {number} ingredients
 * @property {number} maxNonStaple
 * @property {boolean} titlesFoldByLowerCase toLowerCase() of the title blob equals its FTS folding
 * @property {CoreVocab} vocab
 * @property {Record<string, [number, number]>} sections byte offset from the section area, element count
 */

/**
 * @typedef {object} Core
 * @property {string} version
 * @property {number} recipes
 * @property {number} ingredients
 * @property {number} maxNonStaple
 * @property {boolean} titlesFoldByLowerCase
 * @property {CoreVocab} vocab
 * @property {(g: number) => string} key canonical_key of an ingredient index
 * @property {() => string[]} keys every canonical_key, by ingredient index
 * @property {(r: number) => string | null} sourceTitle
 * @property {() => (string | null)[]} sourceTitles every source-language title, by recipe index
 * @property {() => string} titleText the title blob decoded, titles joined by NUL
 * @property {Int32Array} recipeId
 * @property {Int32Array} prepMinutes
 * @property {Int32Array} totalMinutes
 * @property {Int32Array} balanceScore
 * @property {Float64Array} kcal
 * @property {Float64Array} coverage
 * @property {Uint16Array} nonStaple
 * @property {Uint16Array} allergenMask
 * @property {Uint8Array} cuisine
 * @property {Uint8Array} mealType
 * @property {Uint8Array} grade
 * @property {Uint8Array} dietMask
 * @property {Uint8Array} servingsAssumed
 * @property {Uint8Array} hasTitle
 * @property {Int32Array} titleStart
 * @property {Uint8Array} titleBlob
 * @property {Uint16Array} timeRank
 * @property {Uint16Array} byTime
 * @property {Uint16Array} timeDense
 * @property {Uint16Array} kcalDense
 * @property {Uint16Array} byHit
 * @property {Int32Array} recipeIngStart
 * @property {Uint16Array} recipeIng
 * @property {Uint8Array} isStaple
 * @property {Uint8Array} category
 * @property {Int32Array} recipeCount
 * @property {Int32Array} keyStart
 * @property {Uint8Array} keyBlob
 * @property {Uint16Array} keyOrder
 * @property {Int32Array} specificStart
 * @property {Uint16Array} specific
 * @property {Int32Array} postingStart
 * @property {Uint16Array} posting
 */

/** Where the sections start, given the header's byte length. @param {number} headerBytes */
export const sectionBase = (headerBytes) => Math.ceil((12 + headerBytes) / 8) * 8;

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * Lazily decoded strings of one blob: one at a time (a page of results), or
 * all at once (a search over every title), each decoded at most once.
 * @param {Uint8Array} blob
 * @param {Int32Array} start
 * @param {TextDecoder} utf8
 */
function strings(blob, start, utf8) {
	/** @type {string[] | null} */
	let all = null;
	/** @type {string | null} */
	let text = null;
	/** @type {(string | undefined)[]} */
	const one = [];
	return {
		text: () => (text ??= utf8.decode(blob)),
		/** @param {number} i */
		get(i) {
			if (all) return all[i];
			return (one[i] ??= utf8.decode(blob.subarray(start[i], start[i + 1] - 1)));
		},
		list() {
			// One decode and one native split instead of a call per string; the
			// generator guarantees no string contains the NUL separator.
			all ??= (text ??= utf8.decode(blob)).split('\0');
			return all;
		}
	};
}

/**
 * Typed-array views over core.bin. The views keep `bytes` referenced, so pass
 * a buffer nobody mutates afterwards.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {Core}
 */
export function decodeCore(bytes) {
	if (!LITTLE_ENDIAN) throw new Error('core.bin is little-endian; this platform is not');
	let u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	// Views need element-aligned offsets; a Uint8Array into a shared pool (a
	// small node Buffer, say) may not be, so realign once by copying.
	if (u8.byteOffset % 8 !== 0) u8 = u8.slice();
	for (let i = 0; i < CORE_MAGIC.length; i++) {
		if (u8[i] !== CORE_MAGIC.charCodeAt(i)) throw new Error('not a core.bin file');
	}
	const headerBytes = new DataView(u8.buffer, u8.byteOffset + 8, 4).getUint32(0, true);
	const utf8 = new TextDecoder();
	/** @type {CoreHeader} */
	const header = JSON.parse(utf8.decode(u8.subarray(12, 12 + headerBytes)));
	if (header.format !== CORE_FORMAT) throw new Error(`core.bin format ${header.format}, this code reads ${CORE_FORMAT}`);

	const base = sectionBase(headerBytes);
	const buffer = /** @type {ArrayBuffer} */ (u8.buffer);
	/** @type {Record<string, any>} */
	const v = {};
	for (const [name, type] of CORE_SECTIONS) {
		const entry = header.sections[name];
		if (!entry) throw new Error(`core.bin has no ${name} section`);
		v[name] = new ELEMENT[type](buffer, u8.byteOffset + base + entry[0], entry[1]);
	}
	const keys = strings(v.keyBlob, v.keyStart, utf8);
	const titles = strings(v.titleBlob, v.titleStart, utf8);
	/** @type {(string | null)[] | null} */
	let titleList = null;
	return /** @type {Core} */ ({
		version: header.version,
		recipes: header.recipes,
		ingredients: header.ingredients,
		maxNonStaple: header.maxNonStaple,
		titlesFoldByLowerCase: header.titlesFoldByLowerCase,
		vocab: header.vocab,
		// All at once: a match names several ingredients and a key lookup
		// binary-searches them, so decoding one by one would cost more.
		key: (/** @type {number} */ g) => keys.list()[g],
		keys: keys.list,
		sourceTitle: (/** @type {number} */ r) => (v.hasTitle[r] ? titles.get(r) : null),
		sourceTitles: () => (titleList ??= titles.list().map((t, r) => (v.hasTitle[r] ? t : null))),
		titleText: titles.text,
		...v
	});
}

/** @param {number} v */
export const intOrNull = (v) => (v === NULL_INT ? null : v);

/** @param {number} v */
export const floatOrNull = (v) => (Number.isNaN(v) ? null : v);

/**
 * @param {string[]} vocab
 * @param {number} code
 */
export const vocabOrNull = (vocab, code) => (code === 0 ? null : vocab[code - 1]);
