// Seasonality artefact (seasons.json, pipeline/lib/artefacts.mjs): per
// ingredient, one 12-bit month mask for each of 19 views. Plain JS with JSDoc
// types so match.js, the pipeline and the parity tools run it in Node without
// the `$lib` alias.
//
// A mask has bit (month - 1) set when the ingredient is in season in that
// month (1 = January); 0xfff is "all year" and never ranks an ingredient out.

/** Climate zones in view order; mirrored by pipeline/lib/seasons_gate.mjs and src/lib/seasonal/zones.ts. */
export const ZONES = /** @type {const} */ (['trop', 'sav', 'high', 'arid', 'med', 'subtrop', 'oce', 'cont', 'bor']);

/** Views: 0-8 the zones in the northern hemisphere, 9-17 the same zones in the southern, 18 the world. */
export const VIEW_COUNT = ZONES.length * 2 + 1;
export const WORLD_VIEW = ZONES.length * 2;
export const ALL_YEAR = 0xfff;

/**
 * @param {string} zone one of ZONES
 * @param {'n' | 's'} hemi
 * @returns {number} the view index, -1 for an unknown zone
 */
export function viewIndex(zone, hemi) {
	const z = ZONES.indexOf(/** @type {any} */ (zone));
	return z < 0 ? -1 : hemi === 's' ? ZONES.length + z : z;
}

/**
 * @typedef {object} SeasonsFile
 * @property {string} version core.bin's data version
 * @property {readonly string[]} zones ZONES at build time
 * @property {string} masks one line per ingredient (core.bin order), VIEW_COUNT masks of 3 hex digits each
 */

/**
 * @typedef {object} Seasons
 * @property {string} version
 * @property {number} ingredients
 * @property {Uint16Array} masks ingredient * VIEW_COUNT + view
 */

/**
 * @param {SeasonsFile | string} input
 * @param {{ version?: string, ingredients?: number }} [expected] core.bin's version and ingredient count
 * @returns {Seasons}
 */
export function parseSeasons(input, expected = {}) {
	/** @type {SeasonsFile} */
	const file = typeof input === 'string' ? JSON.parse(input) : input;
	if (expected.version !== undefined && file.version !== expected.version) {
		throw new Error(`seasons is data version ${file.version}, core.bin is ${expected.version}: artefacts from different builds`);
	}
	if (file.zones.length !== ZONES.length || file.zones.some((z, i) => z !== ZONES[i])) {
		throw new Error('seasons lists different climate zones than this build');
	}
	const lines = file.masks.split('\n');
	if (expected.ingredients !== undefined && lines.length !== expected.ingredients) {
		throw new Error('seasons and core.bin list different ingredients');
	}
	const masks = new Uint16Array(lines.length * VIEW_COUNT);
	for (let g = 0; g < lines.length; g++) {
		const line = lines[g];
		if (line.length !== VIEW_COUNT * 3) throw new Error(`seasons line ${g} has ${line.length} characters, expected ${VIEW_COUNT * 3}`);
		for (let v = 0; v < VIEW_COUNT; v++) {
			const mask = parseInt(line.slice(v * 3, v * 3 + 3), 16);
			if (!(mask >= 0 && mask <= ALL_YEAR)) throw new Error(`seasons line ${g} has a bad mask at view ${v}`);
			masks[g * VIEW_COUNT + v] = mask;
		}
	}
	return { version: file.version, ingredients: lines.length, masks };
}

/**
 * @param {Seasons} seasons
 * @param {number} g ingredient index
 * @param {number} view
 */
export const maskOf = (seasons, g, view) => seasons.masks[g * VIEW_COUNT + view];

/**
 * @param {number} mask
 * @param {number} month 1-12
 */
export const inSeasonMask = (mask, month) => ((mask >> (month - 1)) & 1) === 1;

/**
 * Whether the view's calendar says anything about this ingredient: an
 * all-year mask is neutral for ranking and for "n of m in season".
 * @param {number} mask
 */
export const isSeasonalMask = (mask) => mask !== ALL_YEAR;

/**
 * A mask rotated forward by `months` (the southern hemisphere is 6).
 * @param {number} mask
 * @param {number} months
 */
export function rotateMask(mask, months) {
	const k = ((months % 12) + 12) % 12;
	return ((mask << k) | (mask >> (12 - k))) & ALL_YEAR;
}

/**
 * @param {string} range "11-2", "4-5,9-10", "all" or "none"
 * @returns {number | null} the mask, null when the text is malformed
 */
export function parseRange(range) {
	if (range === 'all') return ALL_YEAR;
	if (range === 'none') return 0;
	let mask = 0;
	for (const part of range.split(',')) {
		const m = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
		if (!m) return null;
		const from = Number(m[1]);
		const to = m[2] === undefined ? from : Number(m[2]);
		if (from < 1 || from > 12 || to < 1 || to > 12) return null;
		for (let month = from; ; month = (month % 12) + 1) {
			mask |= 1 << (month - 1);
			if (month === to) break;
		}
	}
	return mask;
}
