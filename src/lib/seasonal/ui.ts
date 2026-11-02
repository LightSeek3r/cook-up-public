import { ALL_YEAR, inSeasonMask, maskOf, type Seasons } from '$lib/data/seasons.js';
import type { IngredientCategory } from '$lib/config';
import { viewOf, type ViewRef } from './index';
import { ZONES, type ZoneId } from './zones';

/**
 * Pure helpers behind the season UI (badges, shelf, picker, /seasonal):
 * nothing here reads the clock, storage or the network.
 */

/** Countries shown under each zone in the picker, as ISO 3166 regions named by Intl.DisplayNames. */
export const ZONE_EXAMPLES: Readonly<Record<ZoneId, readonly string[]>> = {
	trop: ['ID', 'MY', 'SG', 'BR', 'CD'],
	sav: ['IN', 'TH', 'BD', 'NG'],
	high: ['MX', 'CO', 'KE', 'ET'],
	arid: ['EG', 'SA', 'PK', 'AE'],
	med: ['ES', 'IT', 'GR', 'CL'],
	subtrop: ['JP', 'AU', 'US', 'CN'],
	oce: ['GB', 'IE', 'NZ', 'FR'],
	cont: ['PL', 'RU', 'KR', 'CA'],
	bor: ['FI', 'SE', 'CA', 'IS']
};

/** The picker's options in order: the nine zones, then the world. */
export const PICKER_ZONES: readonly (ZoneId | 'world')[] = [...ZONES, 'world'];

function displayNames(lang: string): Intl.DisplayNames {
	try {
		return new Intl.DisplayNames([lang, 'en'], { type: 'region' });
	} catch {
		return new Intl.DisplayNames(['en'], { type: 'region' });
	}
}

function listFormat(lang: string): Intl.ListFormat {
	try {
		return new Intl.ListFormat([lang, 'en'], { type: 'conjunction' });
	} catch {
		return new Intl.ListFormat(['en'], { type: 'conjunction' });
	}
}

/** "Spain, Italy, Greece and Chile" in `lang`; '' for the world, which has no examples. */
export function zoneExamples(zone: ZoneId | 'world', lang: string): string {
	if (zone === 'world') return '';
	const names = displayNames(lang);
	return listFormat(lang).format(ZONE_EXAMPLES[zone].map((code) => names.of(code) ?? code));
}

const monthFormats = new Map<string, Intl.DateTimeFormat>();

/** The month's name (1 = January), in UTC so no time zone can move it to the next month. */
export function monthName(month: number, lang: string, style: 'long' | 'short' = 'long'): string {
	const id = `${lang}:${style}`;
	let format = monthFormats.get(id);
	if (!format) {
		try {
			format = new Intl.DateTimeFormat([lang, 'en'], { month: style, timeZone: 'UTC' });
		} catch {
			format = new Intl.DateTimeFormat(['en'], { month: style, timeZone: 'UTC' });
		}
		monthFormats.set(id, format);
	}
	return format.format(new Date(Date.UTC(2000, month - 1, 15)));
}

export const nextMonth = (month: number): number => (month % 12) + 1;

/** `/seasonal/<n>`'s parameter: 1-12 written plainly, anything else is no page. */
export function parseMonthParam(raw: string): number | null {
	return /^(?:[1-9]|1[0-2])$/.test(raw) ? Number(raw) : null;
}

/** What a badge says about one ingredient: in season, out of it, or nothing (all year, no data yet). */
export type BadgeState = 'in' | 'out' | null;

export function badgeState(seasons: Seasons | null, g: number, view: ViewRef, month: number): BadgeState {
	if (!seasons || !(month >= 1 && month <= 12) || !(g >= 0 && g < seasons.ingredients)) return null;
	const mask = maskOf(seasons, g, viewOf(view));
	if (mask === ALL_YEAR) return null;
	return inSeasonMask(mask, month) ? 'in' : 'out';
}

/**
 * Category chips of the seasonal pages. core's categories are coarse
 * (mushrooms are `other`, fresh herbs `spice`), so they fold into groups a
 * shopper recognises rather than being shown as they are.
 */
export const SEASON_GROUPS = ['vegetable', 'fruit', 'herb', 'forage', 'animal'] as const;
export type SeasonGroup = (typeof SEASON_GROUPS)[number];

const GROUP_OF: Record<IngredientCategory, SeasonGroup> = {
	vegetable: 'vegetable',
	legume: 'vegetable',
	fruit: 'fruit',
	spice: 'herb',
	nut: 'forage',
	grain: 'forage',
	other: 'forage',
	protein: 'animal',
	dairy: 'animal'
};

export const groupOf = (category: IngredientCategory): SeasonGroup => GROUP_OF[category] ?? 'forage';

export interface SeasonItem {
	id: number;
	name: string;
	canonical_key: string;
	category: IngredientCategory;
}

/** One ingredient of /seasonal/<month>, as the server sends it. */
export interface SeasonPageItem extends SeasonItem {
	/** The world view's month mask: what the server renders. */
	world: number;
}

export interface MonthGroups<T extends SeasonItem> {
	/** In season this month, shortest window first: the fleeting ones lead. */
	now: { item: T; mask: number }[];
	/** Not yet in season, in season next month, by name. */
	next: { item: T; mask: number }[];
}

function bits(mask: number): number {
	let n = 0;
	for (let m = mask; m; m &= m - 1) n++;
	return n;
}

/**
 * Splits items into this month's and next month's for one calendar. `maskFor`
 * gives an item's month mask in the view shown; all-year and never-grown
 * items belong to neither group.
 */
export function monthGroups<T extends SeasonItem>(
	items: readonly T[],
	maskFor: (item: T) => number,
	month: number,
	lang: string
): MonthGroups<T> {
	const collator = new Intl.Collator([lang, 'en']);
	const following = nextMonth(month);
	const now: { item: T; mask: number; months: number }[] = [];
	const next: { item: T; mask: number }[] = [];
	for (const item of items) {
		const mask = maskFor(item);
		if (mask === ALL_YEAR || mask === 0) continue;
		if (inSeasonMask(mask, month)) now.push({ item, mask, months: bits(mask) });
		else if (inSeasonMask(mask, following)) next.push({ item, mask });
	}
	now.sort((a, b) => a.months - b.months || collator.compare(a.item.name, b.item.name) || a.item.id - b.item.id);
	next.sort((a, b) => collator.compare(a.item.name, b.item.name) || a.item.id - b.item.id);
	return { now: now.map(({ item, mask }) => ({ item, mask })), next };
}

/**
 * The home page with `key` added to the remembered selection. The home page
 * replaces its stored selection with any `have` it is opened with, so the
 * link carries the whole selection, not the one key.
 */
export function homeWith(key: string, lang: string, fridge: readonly string[], max: number): string {
	const keys = fridge.includes(key) ? [...fridge] : [...fridge, key];
	const search = new URLSearchParams({ lang });
	search.set('have', keys.slice(Math.max(0, keys.length - max)).join(','));
	return `/?${search.toString().replace(/%2C/g, ',')}`;
}
