// Text semantics of the SQL these artefacts replace, so a search over them
// returns exactly what D1 returns.

/**
 * FTS5's trigram tokenizer (case_sensitive 0, the default) folds case one code
 * point at a time with SQLite's own Unicode table. That table predates several
 * Unicode versions and folds characters JS toLowerCase leaves alone, and vice
 * versa: 460 of its 1,057 folded code points disagree with V8. Extracted from
 * SQLite through fts5vocab and found identical on D1 (Miniflare's workerd) for
 * U+0020..U+1FFFF; text.sqlite.test.mjs re-checks it against node:sqlite.
 * Runs of [first code point, count, delta, stride].
 */
const FOLD_RUNS = [
	65, 26, 32, 1, 181, 1, 775, 1, 192, 23, 32, 1, 216, 7, 32, 1, 256, 24, 1, 2, 306, 3, 1, 2, 313, 8,
	1, 2, 330, 23, 1, 2, 376, 1, -121, 1, 377, 3, 1, 2, 383, 1, -268, 1, 385, 1, 210, 1, 386, 2, 1, 2,
	390, 1, 206, 1, 391, 1, 1, 1, 393, 2, 205, 1, 395, 1, 1, 1, 398, 1, 79, 1, 399, 1, 202, 1, 400, 1,
	203, 1, 401, 1, 1, 1, 403, 1, 205, 1, 404, 1, 207, 1, 406, 1, 211, 1, 407, 1, 209, 1, 408, 1, 1,
	1, 412, 1, 211, 1, 413, 1, 213, 1, 415, 1, 214, 1, 416, 3, 1, 2, 422, 1, 218, 1, 423, 1, 1, 1,
	425, 1, 218, 1, 428, 1, 1, 1, 430, 1, 218, 1, 431, 1, 1, 1, 433, 2, 217, 1, 435, 2, 1, 2, 439, 1,
	219, 1, 440, 1, 1, 1, 444, 1, 1, 1, 452, 1, 2, 1, 453, 1, 1, 1, 455, 1, 2, 1, 456, 1, 1, 1, 458,
	1, 2, 1, 459, 9, 1, 2, 478, 9, 1, 2, 497, 1, 2, 1, 498, 2, 1, 2, 502, 1, -97, 1, 503, 1, -56, 1,
	504, 20, 1, 2, 544, 1, -130, 1, 546, 9, 1, 2, 570, 1, 10795, 1, 571, 1, 1, 1, 573, 1, -163, 1,
	574, 1, 10792, 1, 577, 1, 1, 1, 579, 1, -195, 1, 580, 1, 69, 1, 581, 1, 71, 1, 582, 5, 1, 2, 837,
	1, 116, 1, 880, 2, 1, 2, 886, 1, 1, 1, 902, 1, 38, 1, 904, 3, 37, 1, 908, 1, 64, 1, 910, 2, 63, 1,
	913, 17, 32, 1, 931, 9, 32, 1, 962, 1, 1, 1, 975, 1, 8, 1, 976, 1, -30, 1, 977, 1, -25, 1, 981, 1,
	-15, 1, 982, 1, -22, 1, 984, 12, 1, 2, 1008, 1, -54, 1, 1009, 1, -48, 1, 1012, 1, -60, 1, 1013, 1,
	-64, 1, 1015, 1, 1, 1, 1017, 1, -7, 1, 1018, 1, 1, 1, 1021, 3, -130, 1, 1024, 16, 80, 1, 1040, 32,
	32, 1, 1120, 17, 1, 2, 1162, 27, 1, 2, 1216, 1, 15, 1, 1217, 7, 1, 2, 1232, 44, 1, 2, 1329, 38,
	48, 1, 4256, 38, 7264, 1, 4295, 1, 7264, 1, 4301, 1, 7264, 1, 7680, 75, 1, 2, 7835, 1, -58, 1,
	7838, 1, -7615, 1, 7840, 48, 1, 2, 7944, 8, -8, 1, 7960, 6, -8, 1, 7976, 8, -8, 1, 7992, 8, -8, 1,
	8008, 6, -8, 1, 8025, 4, -8, 2, 8040, 8, -8, 1, 8072, 8, -8, 1, 8088, 8, -8, 1, 8104, 8, -8, 1,
	8120, 2, -8, 1, 8122, 2, -74, 1, 8124, 1, -9, 1, 8126, 1, -7173, 1, 8136, 4, -86, 1, 8140, 1, -9,
	1, 8152, 2, -8, 1, 8154, 2, -100, 1, 8168, 2, -8, 1, 8170, 2, -112, 1, 8172, 1, -7, 1, 8184, 2,
	-128, 1, 8186, 2, -126, 1, 8188, 1, -9, 1, 8486, 1, -7517, 1, 8490, 1, -8383, 1, 8491, 1, -8262,
	1, 8498, 1, 28, 1, 8544, 16, 16, 1, 8579, 1, 1, 1, 9398, 26, 26, 1, 11264, 47, 48, 1, 11360, 1, 1,
	1, 11362, 1, -10743, 1, 11363, 1, -3814, 1, 11364, 1, -10727, 1, 11367, 3, 1, 2, 11373, 1, -10780,
	1, 11374, 1, -10749, 1, 11375, 1, -10783, 1, 11376, 1, -10782, 1, 11378, 1, 1, 1, 11381, 1, 1, 1,
	11390, 2, -10815, 1, 11392, 50, 1, 2, 11499, 2, 1, 2, 11506, 1, 1, 1, 42560, 23, 1, 2, 42624, 12,
	1, 2, 42786, 7, 1, 2, 42802, 31, 1, 2, 42873, 2, 1, 2, 42877, 1, -35332, 1, 42878, 5, 1, 2, 42891,
	1, 1, 1, 42893, 1, -42280, 1, 42896, 2, 1, 2, 42912, 5, 1, 2, 42922, 1, -42308, 1, 65313, 26, 32,
	1, 65534, 1, -1, 1, 65535, 1, -2, 1, 66560, 40, 40, 1
];

/** @type {Map<number, number> | null} */
let foldMap = null;

function buildFoldMap() {
	/** @type {Map<number, number>} */
	const map = new Map();
	for (let i = 0; i < FOLD_RUNS.length; i += 4) {
		const [first, count, delta, stride] = FOLD_RUNS.slice(i, i + 4);
		for (let k = 0; k < count; k++) map.set(first + k * stride, first + k * stride + delta);
	}
	return map;
}

const ASCII = /^[\x00-\x7f]*$/;

/**
 * Case folding as recipe_title_fts and ingredient_fts index and query text.
 * @param {string} s
 */
export function ftsFold(s) {
	if (ASCII.test(s)) return s.toLowerCase();
	foldMap ??= buildFoldMap();
	let out = '';
	for (const ch of s) {
		const folded = foldMap.get(/** @type {number} */ (ch.codePointAt(0)));
		out += folded === undefined ? ch : String.fromCodePoint(folded);
	}
	return out;
}

// Only these combining ranges are stripped, never all of \p{M}: Devanagari and
// Bengali vowel signs are marks too, and removing them would make every word
// collapse to its bare consonants.
//   U+0300-036F  Latin/Cyrillic/Greek accents; also what NFKD splits Arabic
//                alef-hamza/madda and Cyrillic yo into, so those fold for free
//   U+064B-065F, U+0670  Arabic harakat and hamza/madda marks
//   U+0640  tatweel
//   U+200C, U+200D  ZWNJ / ZWJ (typed inconsistently in Persian-script and Indic text)
//   U+093C, U+09BC  Devanagari / Bengali nukta, so U+095C (ड़) folds to ड
const STRIP = /[\u0300-\u036F\u064B-\u065F\u0670\u0640\u200C\u200D\u093C\u09BC]/g;

// Letters that survive NFKD unchanged and must be folded by hand. The
// Arabic-script entries are spellings people type interchangeably, each mapped
// to one canonical form.
/** @type {Record<string, string>} */
const TABLE = {
	'\u00DF': 'ss', // sharp s
	'\u0111': 'd', // d with stroke
	'\u00F8': 'o', // o with stroke
	'\u00E6': 'ae',
	'\u0153': 'oe',
	'\u0142': 'l', // l with stroke
	'\u0131': 'i', // dotless i
	'\u0671': '\u0627', // alef wasla -> alef
	'\u0649': '\u064A', // alef maksura -> yeh
	'\u06CC': '\u064A', // Farsi/Shahmukhi yeh -> yeh
	'\u06D2': '\u064A', // yeh barree -> yeh
	'\u06A9': '\u0643', // keheh -> kaf
	'\u0629': '\u0647', // teh marbuta -> heh
	'\u06BE': '\u0647', // heh doachashmee (Shahmukhi aspirate marker) -> heh
	'\u06C1': '\u0647', // heh goal -> heh
	'\u06BA': '\u0646' // noon ghunna -> noon
};
const TABLE_RE = new RegExp(`[${Object.keys(TABLE).join('')}]`, 'g');

const KATAKANA = /[\u30A1-\u30F6]/g;

/**
 * Canonical comparison form for text people search in their own language
 * (glossary entries, translated recipe titles) and for their queries: case,
 * accents, Arabic-script spelling variants, width and katakana/hiragana
 * folded. NFKC after the strip recomposes everything that was not removed
 * (Hangul syllables, kana with dakuten, Indic conjuncts), so only the
 * intended marks disappear. Not the FTS folding: source titles keep ftsFold.
 * @param {string} s
 */
export function foldText(s) {
	return s
		.normalize('NFKD')
		.replace(STRIP, '')
		.normalize('NFKC')
		.toLowerCase()
		.replace(TABLE_RE, (c) => TABLE[c])
		.replace(KATAKANA, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} s */
export function codePointLength(s) {
	let n = 0;
	for (const _ of s) n++;
	return n;
}

/**
 * FTS5 trigram `MATCH` of one phrase: consecutive trigrams are a substring
 * test on the folded text, and a phrase under 3 characters (code points, not
 * UTF-16 units) has no trigram and matches nothing.
 * @param {string} foldedText
 * @param {string} foldedPhrase
 */
export function trigramMatch(foldedText, foldedPhrase) {
	return foldedText.includes(foldedPhrase) && codePointLength(foldedPhrase) >= 3;
}

/**
 * SQLite LIKE without case_sensitive_like folds ASCII only.
 * @param {string} s
 */
export function likeFold(s) {
	return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

/**
 * SQLite's BINARY collation (memcmp over UTF-8), which is code point order.
 * JS `<` compares UTF-16 units and so puts U+10000 and above (surrogate
 * pairs) before U+E000..U+FFFF.
 * @param {string} a
 * @param {string} b
 */
export function compareBinary(a, b) {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const x = a.charCodeAt(i);
		const y = b.charCodeAt(i);
		if (x === y) continue;
		const xs = x >= 0xd800 && x <= 0xdfff;
		const ys = y >= 0xd800 && y <= 0xdfff;
		// A surrogate stands for a code point above every BMP one.
		if (xs !== ys) return xs ? 1 : -1;
		return x < y ? -1 : 1;
	}
	return a.length - b.length;
}
