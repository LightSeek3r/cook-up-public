/**
 * Seasons source (pipeline/seasons/<family>.json) -> the per-ingredient month
 * masks of src/lib/data/seasons.js. Pure: every function takes the loaded
 * family files (`{ family: { key: entry } }`) and never touches the disk.
 *
 * An entry is one of
 *   { ay: reason }                      all year in every view
 *   { like: key }                       the seasonal entry of another key
 *   { z: { zone: range, "zone:s": range }, p: ["zone:h"], st, note }
 * See pipeline/seasons/README.md for the authoring rules; seasons_gate.mjs
 * enforces them. Functions here assume a valid entry and throw otherwise.
 */

import {
	ALL_YEAR,
	VIEW_COUNT,
	WORLD_VIEW,
	ZONES,
	parseRange,
	rotateMask,
	viewIndex
} from '../../src/lib/data/seasons.js';

/** Source files, in the order the tools list them; `allyear` holds every `ay` entry and nothing else. */
export const FAMILIES = ['produce', 'herbs', 'fungi_nuts', 'animal', 'allyear'];
export const AY_FAMILY = 'allyear';
export const AY_REASONS = ['processed', 'generic', 'farmed', 'cultivated', 'staple', 'traded'];
export const MAX_STORAGE = 8;
export const MAX_PRODUCERS = 4;

/** Omitted zone -> the zone whose range it takes; `all` means all year. */
export const INHERIT = { bor: 'cont', oce: 'cont', subtrop: 'med', arid: 'med', sav: 'trop', high: 'all' };
/** Zones nothing is inherited for, so every seasonal entry states them. */
export const ROOT_ZONES = ZONES.filter((z) => !Object.hasOwn(INHERIT, z));
/** Equatorial: no winter to mirror, the southern view is the northern one. */
export const UNROTATED = new Set(['trop']);

export const ENTRY_FIELDS = ['ay', 'like', 'z', 'p', 'st', 'note'];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

export const isSeasonalEntry = (entry) => isObject(entry) && entry.z !== undefined;

const lookup = (entries, key) =>
	entries instanceof Map ? entries.get(key) : isObject(entries) && Object.hasOwn(entries, key) ? entries[key] : undefined;

/** Every family's entries in one Map; the first family holding a key wins (duplicates are a gate error). */
export function flattenSources(sources) {
	const flat = new Map();
	for (const entries of Object.values(sources)) {
		if (!isObject(entries)) continue;
		for (const [key, entry] of Object.entries(entries)) if (!flat.has(key)) flat.set(key, entry);
	}
	return flat;
}

/** Which family file holds each key (first one, like flattenSources). */
export function familyIndex(sources) {
	const index = new Map();
	for (const [family, entries] of Object.entries(sources)) {
		if (!isObject(entries)) continue;
		for (const key of Object.keys(entries)) if (!index.has(key)) index.set(key, family);
	}
	return index;
}

/**
 * The entry whose masks `key` gets: its own, or for `like` the target's.
 * @param {Map<string, object> | Record<string, object>} entries
 */
export function resolveEntry(entries, key) {
	const entry = lookup(entries, key);
	if (!isObject(entry)) throw new Error(`${key}: no seasons entry`);
	if (entry.like === undefined) return entry;
	const target = lookup(entries, entry.like);
	if (!isSeasonalEntry(target)) throw new Error(`${key}: like "${entry.like}" is not a seasonal entry`);
	return target;
}

/**
 * Range text and provenance per zone after inheritance. `from` is the zone the
 * northern range came from (`all` for high's default); `south` is the
 * explicit southern override in force, or null when the view is a rotation.
 */
export function zoneRanges(z) {
	const out = {};
	for (const zone of ZONES) {
		const own = Object.hasOwn(z, zone);
		const parent = INHERIT[zone];
		const north = own ? z[zone] : parent === 'all' ? 'all' : z[parent];
		let south = null;
		let southFrom = null;
		if (Object.hasOwn(z, `${zone}:s`)) {
			south = z[`${zone}:s`];
			southFrom = zone;
		} else if (!own && parent !== 'all' && Object.hasOwn(z, `${parent}:s`)) {
			south = z[`${parent}:s`];
			southFrom = parent;
		}
		out[zone] = { north, from: own ? zone : parent, south, southFrom };
	}
	return out;
}

/** `mask` plus `st` months after each in-season month, wrapping December into January. */
export function extendStorage(mask, st = 0) {
	let out = mask;
	for (let k = 1; k <= st; k++) out |= rotateMask(mask, k);
	return out;
}

function mustParse(range, label) {
	const mask = typeof range === 'string' ? parseRange(range) : null;
	if (mask === null) throw new Error(`${label}: bad range ${JSON.stringify(range)}`);
	return mask;
}

/** "med:n" -> view index. */
export function producerView(p) {
	const [zone, hemi] = String(p).split(':');
	return hemi === 'n' || hemi === 's' ? viewIndex(zone, hemi) : -1;
}

/**
 * All VIEW_COUNT masks of a seasonal entry, plus what reviewers need to see:
 * `field` the windows before storage, `inherited` whether a view was not
 * written for its own zone, `from` where it came from ('' when its own).
 */
export function seasonalViews(entry) {
	const ranges = zoneRanges(entry.z);
	const st = entry.st ?? 0;
	const views = new Array(VIEW_COUNT).fill(0);
	const field = new Array(VIEW_COUNT).fill(0);
	const inherited = new Array(VIEW_COUNT).fill(false);
	const from = new Array(VIEW_COUNT).fill('');
	for (const zone of ZONES) {
		const r = ranges[zone];
		const north = mustParse(r.north, zone);
		const n = viewIndex(zone, 'n');
		const s = viewIndex(zone, 's');
		field[n] = north;
		inherited[n] = r.from !== zone;
		from[n] = inherited[n] ? r.from : '';
		if (r.south !== null) {
			field[s] = mustParse(r.south, `${r.southFrom}:s`);
			inherited[s] = r.southFrom !== zone;
			from[s] = inherited[s] ? `${r.southFrom}:s` : '';
		} else {
			field[s] = UNROTATED.has(zone) ? north : rotateMask(north, 6);
			inherited[s] = inherited[n];
			from[s] = from[n];
		}
		views[n] = extendStorage(field[n], st);
		views[s] = extendStorage(field[s], st);
	}
	for (const p of entry.p ?? []) {
		const v = producerView(p);
		if (v < 0) throw new Error(`bad producer ${JSON.stringify(p)}`);
		views[WORLD_VIEW] |= views[v];
		field[WORLD_VIEW] |= field[v];
	}
	return { views, field, inherited, from };
}

/** The VIEW_COUNT masks of a resolved (non-`like`) entry. */
export function entryMasks(entry) {
	if (isObject(entry) && entry.ay !== undefined) return new Array(VIEW_COUNT).fill(ALL_YEAR);
	return seasonalViews(entry).views;
}

export const hex3 = (mask) => mask.toString(16).padStart(3, '0');

/** A mask back as range text, the inverse of parseRange: 0b1110000000011 -> "11-2". */
export function formatRange(mask) {
	if (mask === 0) return 'none';
	if (mask === ALL_YEAR) return 'all';
	const on = (m) => ((mask >> (((m % 12) + 12) % 12)) & 1) === 1;
	const parts = [];
	for (let m = 0; m < 12; m++) {
		if (!on(m) || on(m - 1)) continue;
		let end = m;
		while (on(end + 1)) end++;
		parts.push(end === m ? `${m + 1}` : `${m + 1}-${(end % 12) + 1}`);
	}
	return parts.join(',');
}

/**
 * One line per ingredient in `keys` order (core.bin's: ingredients.jsonl line
 * order), VIEW_COUNT masks of 3 hex digits each. Throws on a key without a
 * usable entry: the artefact must never silently call something all year.
 * @param {Record<string, Record<string, object>>} sources
 * @param {string[]} keys
 */
export function compileSeasons(sources, keys) {
	const entries = flattenSources(sources);
	const lines = keys.map((key) => {
		try {
			return entryMasks(resolveEntry(entries, key)).map(hex3).join('');
		} catch (err) {
			throw new Error(`seasons: ${err.message.startsWith(key) ? err.message : `${key}: ${err.message}`}`, { cause: err });
		}
	});
	return { lines, masks: lines.join('\n') };
}

const MONTHS = 'JFMAMJJASOND';

/**
 * Month x item grid of one view for reviewers. `X` field peak, `S` storage
 * month, `.` out of season; lowercase `x` `s` `-` mark a cell inherited from
 * another zone (named at the end of the row).
 * @param {Record<string, Record<string, object>>} sources
 * @param {string} zone one of ZONES, or 'world'
 * @param {'n' | 's'} [hemi]
 * @param {string[]} [keys] default: every key whose entry is seasonal or `like`, sorted
 */
export function renderGrid(sources, zone, hemi = 'n', keys) {
	const world = zone === 'world';
	if (!world && !ZONES.includes(zone)) throw new Error(`unknown zone "${zone}"; one of ${ZONES.join(', ')} or world`);
	const view = world ? WORLD_VIEW : viewIndex(zone, hemi);
	const entries = flattenSources(sources);
	const list =
		keys ??
		[...entries.keys()].filter((k) => isSeasonalEntry(entries.get(k)) || entries.get(k)?.like !== undefined).sort();
	const width = Math.max(3, ...list.map((k) => k.length));
	const title = world
		? 'world (OR over the producer views in p)'
		: `${zone} ${hemi === 's' ? 'south' : 'north'}${hemi === 's' && UNROTATED.has(zone) ? ' (same as north: never rotated)' : ''}`;
	const out = [
		`# ${title}`,
		'# X field peak  S storage  . out of season; lowercase x s - inherited from the zone named after the row',
		`${'key'.padEnd(width)}  ${MONTHS}`
	];
	for (const key of list) {
		const entry = entries.get(key);
		let cells;
		let note = '';
		if (!isObject(entry)) {
			cells = '?'.repeat(12);
			note = 'no entry';
		} else {
			try {
				const resolved = resolveEntry(entries, key);
				if (entry.like !== undefined) note = `like ${entry.like}`;
				if (resolved.ay !== undefined) {
					cells = '~'.repeat(12);
					note = `all year: ${resolved.ay}`;
				} else {
					const v = seasonalViews(resolved);
					const inh = v.inherited[view];
					cells = '';
					for (let m = 0; m < 12; m++) {
						const on = (v.views[view] >> m) & 1;
						const peak = (v.field[view] >> m) & 1;
						const c = !on ? '.' : peak ? 'X' : 'S';
						cells += inh ? (c === '.' ? '-' : c.toLowerCase()) : c;
					}
					const extra = [];
					if (inh) extra.push(`< ${v.from[view]}`);
					if (resolved.st) extra.push(`st ${resolved.st}`);
					if (world) extra.push(`p ${resolved.p.join(' ')}`);
					note = [note, ...extra].filter(Boolean).join('  ');
				}
			} catch (err) {
				cells = '!'.repeat(12);
				note = err.message;
			}
		}
		out.push(`${key.padEnd(width)}  ${cells}${note ? `  ${note}` : ''}`);
	}
	return out.join('\n') + '\n';
}

/** Entry with its fields, and its zones, in the canonical order the files are written in. */
export function canonicalEntry(entry) {
	if (!isObject(entry)) return entry;
	const out = {};
	for (const f of ENTRY_FIELDS) if (Object.hasOwn(entry, f)) out[f] = f === 'z' ? canonicalZones(entry.z) : entry[f];
	for (const f of Object.keys(entry).filter((k) => !ENTRY_FIELDS.includes(k)).sort()) out[f] = entry[f];
	return out;
}

function canonicalZones(z) {
	if (!isObject(z)) return z;
	const out = {};
	for (const zone of ZONES) {
		if (Object.hasOwn(z, zone)) out[zone] = z[zone];
		if (Object.hasOwn(z, `${zone}:s`)) out[`${zone}:s`] = z[`${zone}:s`];
	}
	for (const k of Object.keys(z).filter((k) => !Object.hasOwn(out, k)).sort()) out[k] = z[k];
	return out;
}

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A family file's bytes: keys sorted, one tab-indented entry per line, LF, trailing newline. */
export function serializeFamily(entries) {
	const keys = Object.keys(entries).sort(byCodeUnit);
	if (!keys.length) return '{}\n';
	const lines = keys.map((k) => `\t${JSON.stringify(k)}: ${JSON.stringify(canonicalEntry(entries[k]))}`);
	return `{\n${lines.join(',\n')}\n}\n`;
}
