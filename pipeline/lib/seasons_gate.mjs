/**
 * Pure validation of the seasons source (pipeline/seasons/*.json) and of the
 * masks compiled from it, in the glossary_gate.mjs style: every function
 * returns `{ rule, key?, zone?, message }[]`, empty when valid, and nothing
 * here touches the filesystem.
 *
 *   validateEntry    one entry (seasons_apply checks a batch with it)
 *   validateSources  every family file against the ingredient list (errors)
 *   checkCompiled    the compiled masks (errors)
 *   seasonWarnings   plausibility hints for reviewers (never fail the build)
 *
 * `ingredients` is the rows of pipeline/out/ingredients.jsonl in file order,
 * which is core.bin's ingredient order (ingredient id = line number).
 */

import { ALL_YEAR, VIEW_COUNT, WORLD_VIEW, ZONES, parseRange, parseSeasons, rotateMask, viewIndex } from '../../src/lib/data/seasons.js';
import {
	AY_FAMILY,
	AY_REASONS,
	FAMILIES,
	MAX_PRODUCERS,
	MAX_STORAGE,
	ROOT_ZONES,
	UNROTATED,
	familyIndex,
	flattenSources,
	formatRange,
	isSeasonalEntry,
	producerView,
	resolveEntry,
	seasonalViews,
	serializeFamily,
	zoneRanges
} from './seasons_compile.mjs';

/** Keys named like a processed food: they keep, so they must be `ay` unless allowlisted below. */
export const PROCESSED_MARKER =
	/dried_|ground_|_powder|_flour|_oil|_sauce|_paste|_juice|_jam|_broth|_stock|smoked_|cooked_|canned|frozen/;
/** Processed-looking keys that really are a fresh, seasonal food. */
export const PROCESSED_ALLOWLIST = new Set([]);

/** Categories where a seasonal entry is suspicious (category is unreliable, so this only warns). */
export const SUSPECT_CATEGORIES = new Set(['grain', 'dairy', 'spice']);
/** Seasonal keys in those categories that are fine: fresh sweetcorn is filed under grain. */
export const SUSPECT_CATEGORY_ALLOWLIST = new Set(['corn', 'corn_kernel', 'sweetcorn', 'yellow_corn']);
/** Neighbouring zones whose windows should touch somewhere. */
export const NEIGHBOURS = [
	['oce', 'cont'],
	['bor', 'cont'],
	['med', 'arid']
];
export const MAX_INHERITED_SHARE = 0.6;
export const MAX_NOTE = 200;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const bits = (mask) => {
	let n = 0;
	for (let m = mask; m; m &= m - 1) n++;
	return n;
};

export const formatIssue = (i) => `${i.key ? `${i.key}: ` : ''}[${i.rule}] ${i.zone ? `${i.zone}: ` : ''}${i.message}`;

/** Why a range text is unusable, or null. Parts may not overlap ("4-6,5" is a typo, not a second harvest). */
export function rangeProblem(range) {
	if (typeof range !== 'string') return `range must be a string, got ${JSON.stringify(range)}`;
	if (parseRange(range) === null) return `"${range}" is not a month range ("4-6", "11-2", "4-5,9-10", "all" or "none")`;
	if (range === 'all' || range === 'none') return null;
	let seen = 0;
	for (const part of range.split(',')) {
		const mask = parseRange(part);
		if (seen & mask) return `"${range}" has overlapping parts`;
		seen |= mask;
	}
	return null;
}

/**
 * Rules one entry can be checked against on its own. `lookup(key)` returns
 * another key's entry (for `like` targets); `family` is the file it sits in.
 */
export function validateEntry(key, entry, { lookup = () => undefined, family } = {}) {
	const issues = [];
	const add = (rule, message, zone) => issues.push({ key, ...(zone ? { zone } : {}), rule, message });
	if (!isObject(entry)) {
		add('shape', 'entry must be an object');
		return issues;
	}
	const kinds = ['ay', 'like', 'z'].filter((f) => Object.hasOwn(entry, f));
	if (kinds.length !== 1) {
		add('shape', kinds.length ? `entry has ${kinds.join(' and ')}; exactly one of ay, like, z` : 'entry needs one of ay, like or z');
		return issues;
	}
	const kind = kinds[0];
	const allowed = kind === 'z' ? ['z', 'p', 'st', 'note'] : [kind, 'note'];
	const extra = Object.keys(entry).filter((f) => !allowed.includes(f));
	if (extra.length) add('shape', `unknown field(s) for a ${kind} entry: ${extra.join(', ')}`);
	if (entry.note !== undefined) {
		const n = entry.note;
		if (typeof n !== 'string' || !n.trim() || /[\r\n]/.test(n) || n.length > MAX_NOTE) {
			add('note', `note must be one non-empty line of at most ${MAX_NOTE} characters`);
		}
	}
	if (family !== undefined) {
		if (kind === 'ay' && family !== AY_FAMILY) add('family', `ay entries belong in ${AY_FAMILY}.json, not ${family}.json`);
		if (kind !== 'ay' && family === AY_FAMILY) add('family', `${AY_FAMILY}.json holds only ay entries`);
	}

	if (kind === 'ay') {
		if (!AY_REASONS.includes(entry.ay)) add('ay-reason', `ay reason ${JSON.stringify(entry.ay)} is not one of ${AY_REASONS.join(', ')}`);
		return issues;
	}
	if (PROCESSED_MARKER.test(key) && !PROCESSED_ALLOWLIST.has(key)) {
		add('processed', 'key names a processed food: {"ay":"processed"}, or allowlist it in seasons_gate.mjs if it really is fresh');
	}

	if (kind === 'like') {
		const target = entry.like;
		if (typeof target !== 'string' || !target) {
			add('shape', 'like must be a key');
		} else if (target === key) {
			add('like-target', 'an entry cannot be like itself');
		} else {
			const t = lookup(target);
			if (!isObject(t)) add('like-target', `"${target}" has no seasons entry`);
			else if (t.like !== undefined) add('like-target', `"${target}" is itself like "${t.like}": point at the seasonal entry directly`);
			else if (!isSeasonalEntry(t)) add('like-target', `"${target}" is all year: give this key its own {"ay": reason}`);
		}
		return issues;
	}

	const z = entry.z;
	if (!isObject(z)) {
		add('shape', 'z must be an object of zone -> range');
		return issues;
	}
	const before = issues.length;
	for (const [k, range] of Object.entries(z)) {
		const m = /^([a-z]+)(:s)?$/.exec(k);
		if (!m || !ZONES.includes(m[1])) {
			add('bad-zone', `"${k}" is not a zone (${ZONES.join(', ')}) or a "<zone>:s" override`);
			continue;
		}
		if (m[2] && UNROTATED.has(m[1])) {
			add('bad-zone', `${m[1]} is never rotated, so it takes no southern override`, k);
			continue;
		}
		const problem = rangeProblem(range);
		if (problem) add('bad-range', problem, k);
	}
	for (const zone of ROOT_ZONES) {
		if (!Object.hasOwn(z, zone)) add('missing-zone', `${zone} must be given: other zones inherit from it`, zone);
	}
	if (entry.st !== undefined && !(Number.isInteger(entry.st) && entry.st >= 0 && entry.st <= MAX_STORAGE)) {
		add('st', `st must be an integer 0-${MAX_STORAGE}`);
	}
	const p = entry.p;
	if (!Array.isArray(p) || p.length === 0) {
		add('producers', 'p must list 1 to 4 producer views ("med:n", "sav:s")');
	} else {
		if (p.length > MAX_PRODUCERS) add('producers', `p has ${p.length} views, at most ${MAX_PRODUCERS}`);
		const seen = new Set();
		for (const v of p) {
			const [zone, hemi] = typeof v === 'string' ? v.split(':') : [];
			if (producerView(v) < 0) add('producers', `${JSON.stringify(v)} is not a "<zone>:n" or "<zone>:s" view`);
			else if (hemi === 's' && UNROTATED.has(zone)) add('producers', `${zone} has no hemispheres: write "${zone}:n"`);
			if (seen.has(v)) add('producers', `${JSON.stringify(v)} is listed twice`);
			seen.add(v);
		}
	}
	if (issues.length > before) return issues;

	const views = seasonalViews(entry);
	const zoneViews = views.views.slice(0, WORLD_VIEW);
	if (zoneViews.every((m) => m === 0)) add('empty-season', 'no zone has a season: an item grown nowhere needs a decision ({"ay": reason})');
	else if (zoneViews.every((m) => m === ALL_YEAR)) add('all-year', 'in season all year in every zone: write {"ay": reason} instead');
	for (const v of p) {
		if (views.views[producerView(v)] === 0) add('producers', `producer ${v} has no season there ("none")`);
	}
	const ranges = zoneRanges(z);
	for (const zone of ZONES) {
		if (!Object.hasOwn(z, `${zone}:s`)) continue;
		const north = parseRange(ranges[zone].north);
		if (parseRange(z[`${zone}:s`]) === rotateMask(north, 6)) {
			add('override-redundant', `"${zone}:s" equals the northern window rotated by 6 months: drop it`, `${zone}:s`);
		}
	}
	return issues;
}

const KEY_LINE = /^\t("(?:[^"\\]|\\.)*"):/gm;

/**
 * Every error rule over the loaded family files. `raw` (family -> file text)
 * adds the byte-level checks; `partial` skips missing-key while the data is
 * still being written.
 * @param {{ ingredients: { canonical_key: string }[], sources: Record<string, unknown>, raw?: Record<string, string>, partial?: boolean }} input
 */
export function validateSources({ ingredients, sources, raw = {}, partial = false }) {
	const issues = [];
	const known = new Set(ingredients.map((r) => r.canonical_key));
	const familyOf = new Map();
	for (const [family, entries] of Object.entries(sources)) {
		if (!FAMILIES.includes(family)) {
			issues.push({ rule: 'unknown-family', message: `${family}.json is not a seasons family (${FAMILIES.join(', ')})` });
			continue;
		}
		if (!isObject(entries)) {
			issues.push({ rule: 'shape', message: `${family}.json must be a JSON object of key -> entry` });
			continue;
		}
		const text = raw[family];
		if (typeof text === 'string') {
			const counts = new Map();
			for (const m of text.matchAll(KEY_LINE)) {
				const k = JSON.parse(m[1]);
				counts.set(k, (counts.get(k) ?? 0) + 1);
			}
			for (const [k, n] of counts) {
				if (n > 1) issues.push({ key: k, rule: 'duplicate-key', message: `appears ${n} times in ${family}.json` });
			}
			if (text.includes('\r')) issues.push({ rule: 'format', message: `${family}.json has CR line endings: LF only` });
			else if (text !== serializeFamily(entries)) {
				issues.push({ rule: 'format', message: `${family}.json is not in canonical form (sorted keys, one tab-indented entry per line, LF): seasons_check --fix` });
			}
		}
		for (const key of Object.keys(entries)) {
			if (familyOf.has(key)) {
				issues.push({ key, rule: 'duplicate-key', message: `in both ${familyOf.get(key)}.json and ${family}.json` });
				continue;
			}
			familyOf.set(key, family);
			if (!known.has(key)) issues.push({ key, rule: 'unknown-key', message: 'not a canonical_key in ingredients.jsonl' });
		}
	}
	const flat = flattenSources(Object.fromEntries(Object.entries(sources).filter(([f]) => FAMILIES.includes(f))));
	for (const [key, family] of familyOf) {
		issues.push(...validateEntry(key, flat.get(key), { lookup: (k) => flat.get(k), family }));
	}
	if (!partial) {
		for (const key of known) {
			if (!familyOf.has(key)) issues.push({ key, rule: 'missing-key', message: 'no seasons entry: every ingredient needs one' });
		}
	}
	return issues;
}

/** Keys of `ingredients` with no entry in any family, in ingredient order. */
export function missingKeys(ingredients, sources) {
	const decided = familyIndex(sources);
	return ingredients.map((r) => r.canonical_key).filter((k) => !decided.has(k));
}

/**
 * Rules on the built masks (compileSeasons output): one line per ingredient in
 * core.bin order, trop identical in both hemispheres, World covering every
 * producer view.
 */
export function checkCompiled({ compiled, ingredients, sources }) {
	const issues = [];
	if (compiled.lines.length !== ingredients.length) {
		return [{ rule: 'order', message: `${compiled.lines.length} mask lines for ${ingredients.length} ingredients` }];
	}
	try {
		parseSeasons({ version: '', zones: ZONES, masks: compiled.masks }, { ingredients: ingredients.length });
	} catch (err) {
		return [{ rule: 'artefact', message: err.message }];
	}
	const flat = flattenSources(sources);
	const trop = [viewIndex('trop', 'n'), viewIndex('trop', 's')];
	ingredients.forEach((row, g) => {
		const key = row.canonical_key;
		const line = compiled.lines[g];
		const mask = (v) => parseInt(line.slice(v * 3, v * 3 + 3), 16);
		if (mask(trop[0]) !== mask(trop[1])) issues.push({ key, zone: 'trop', rule: 'trop-rotated', message: 'trop differs between hemispheres' });
		let entry;
		try {
			entry = resolveEntry(flat, key);
		} catch {
			issues.push({ key, rule: 'order', message: 'compiled line has no source entry' });
			return;
		}
		const world = mask(WORLD_VIEW);
		for (const p of entry.p ?? []) {
			const v = mask(producerView(p));
			if ((world & v) !== v) issues.push({ key, rule: 'world', message: `World ${formatRange(world)} does not cover producer ${p} ${formatRange(v)}` });
		}
		if (entry.ay !== undefined && line !== 'fff'.repeat(VIEW_COUNT)) {
			issues.push({ key, rule: 'artefact', message: 'ay entry is not all year in every view' });
		}
	});
	return issues;
}

/**
 * Plausibility hints for the zone reviewers; they never fail a build.
 * @param {{ ingredients: { canonical_key: string, category?: string }[], sources: Record<string, unknown> }} input
 */
export function seasonWarnings({ ingredients, sources }) {
	const issues = [];
	const valid = Object.fromEntries(Object.entries(sources).filter(([f, e]) => FAMILIES.includes(f) && isObject(e)));
	const flat = flattenSources(valid);
	const familyOf = familyIndex(valid);
	const categoryOf = new Map(ingredients.map((r) => [r.canonical_key, r.category]));
	const stats = Object.fromEntries(ZONES.map((z) => [z, { total: 0, inherited: 0 }]));
	const usable = (entry) => isSeasonalEntry(entry) && validateEntry('', entry).length === 0;

	for (const [key, entry] of flat) {
		if (usable(entry)) {
			const v = seasonalViews(entry);
			const north = (zone) => v.field[viewIndex(zone, 'n')];
			for (const [a, b] of NEIGHBOURS) {
				const ma = north(a);
				const mb = north(b);
				if (ma && mb && !(ma & mb)) {
					issues.push({ key, zone: a, rule: 'neighbour-disjoint', message: `${a} ${formatRange(ma)} and ${b} ${formatRange(mb)} never overlap` });
				}
			}
			if (Object.hasOwn(entry.z, 'bor') && north('cont') && bits(north('bor')) > bits(north('cont'))) {
				issues.push({ key, zone: 'bor', rule: 'bor-longer', message: `bor ${formatRange(north('bor'))} is longer than cont ${formatRange(north('cont'))}` });
			}
			for (const zone of ZONES) {
				stats[zone].total++;
				if (!Object.hasOwn(entry.z, zone)) stats[zone].inherited++;
			}
		}
		const category = categoryOf.get(key);
		let seasonal = false;
		try {
			seasonal = isSeasonalEntry(resolveEntry(flat, key));
		} catch {
			// a broken like is validateSources' error, not a warning
		}
		if (seasonal && SUSPECT_CATEGORIES.has(category) && !SUSPECT_CATEGORY_ALLOWLIST.has(key) && !(category === 'spice' && familyOf.get(key) === 'herbs')) {
			issues.push({ key, rule: 'seasonal-category', message: `seasonal, but category is ${category}: is it really a fresh food?` });
		}
	}
	for (const zone of ZONES) {
		const { total, inherited } = stats[zone];
		if (total && inherited / total > MAX_INHERITED_SHARE) {
			issues.push({ zone, rule: 'inherited-heavy', message: `${inherited} of ${total} seasonal entries inherit ${zone}: write it out where it differs` });
		}
	}
	return issues;
}
