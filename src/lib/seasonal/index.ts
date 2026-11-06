import { ALL_YEAR, inSeasonMask, maskOf, type Seasons } from '$lib/data/seasons.js';
import { toViewIndex, type SeasonView } from './zones';

/**
 * Season questions over the parsed seasons artefact. A view is either a
 * SeasonView or its precomputed index (viewOf), so loops over many
 * ingredients resolve it once.
 */

export type { Seasons };
export type ViewRef = SeasonView | number;

/** Windows longer than this are not "in season now" material: they are nearly always there. */
export const SHORT_WINDOW_MONTHS = 8;

export const viewOf = (view: ViewRef): number => (typeof view === 'number' ? view : toViewIndex(view));

/** In season this month (1-12). An all-year item always is; one not grown in the view never is. */
export const isInSeason = (seasons: Seasons, g: number, view: ViewRef, month: number): boolean =>
	inSeasonMask(maskOf(seasons, g, viewOf(view)), month);

/** Whether the view's calendar says anything about this item: all-year items are neutral. */
export const isSeasonalFor = (seasons: Seasons, g: number, view: ViewRef): boolean => maskOf(seasons, g, viewOf(view)) !== ALL_YEAR;

function bitCount(mask: number): number {
	let n = 0;
	for (let m = mask; m; m &= m - 1) n++;
	return n;
}

export interface SeasonalNowOptions {
	limit?: number;
	/** Keeps only the ingredient indexes it returns true for (a category, say). */
	filter?: (g: number) => boolean;
	/** Longest window still listed; SHORT_WINDOW_MONTHS by default. */
	maxMonths?: number;
}

/**
 * Ingredient indexes in season this month with a short window, shortest
 * first (ties by index, so the order is stable): the fleeting ones are what
 * "in season now" is worth saying about. Never an all-year item.
 */
export function seasonalNow(seasons: Seasons, view: ViewRef, month: number, options: SeasonalNowOptions = {}): number[] {
	const { limit = Infinity, filter, maxMonths = SHORT_WINDOW_MONTHS } = options;
	const v = viewOf(view);
	const hits: { g: number; months: number }[] = [];
	for (let g = 0; g < seasons.ingredients; g++) {
		const mask = maskOf(seasons, g, v);
		if (mask === ALL_YEAR || !inSeasonMask(mask, month)) continue;
		const months = bitCount(mask);
		if (months > maxMonths || (filter && !filter(g))) continue;
		hits.push({ g, months });
	}
	hits.sort((a, b) => a.months - b.months || a.g - b.g);
	return hits.slice(0, limit).map((hit) => hit.g);
}

/** Months (1-12, ascending) set in a mask. */
export function peakMonths(mask: number): number[] {
	const months: number[] = [];
	for (let month = 1; month <= 12; month++) if (inSeasonMask(mask, month)) months.push(month);
	return months;
}

/** Runs of consecutive months as [first, last], a run may wrap December into January; sorted by first month. */
export function monthRuns(mask: number): [number, number][] {
	mask &= ALL_YEAR;
	if (mask === 0 || mask === ALL_YEAR) return [];
	// The scan starts after an empty month and ends on it, so no run is cut in
	// two by the scan's ends and the last run is always closed.
	let empty = 1;
	while (inSeasonMask(mask, empty)) empty++;
	const runs: [number, number][] = [];
	let first = 0;
	for (let i = 1; i <= 12; i++) {
		const month = ((empty - 1 + i) % 12) + 1;
		const on = inSeasonMask(mask, month);
		if (on && !first) first = month;
		else if (!on && first) {
			runs.push([first, ((month + 10) % 12) + 1]);
			first = 0;
		}
	}
	return runs.sort((a, b) => a[0] - b[0]);
}

interface PeakFormat {
	month: (month: number) => string;
	separator: string;
	list: Intl.ListFormat;
}

const peakFormats = new Map<string, PeakFormat>();

function peakFormat(lang: string): PeakFormat {
	let format = peakFormats.get(lang);
	if (format) return format;
	let months: Intl.DateTimeFormat;
	let list: Intl.ListFormat;
	try {
		months = new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' });
		list = new Intl.ListFormat(lang, { type: 'conjunction' });
	} catch {
		months = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
		list = new Intl.ListFormat('en', { type: 'conjunction' });
	}
	const date = (month: number) => new Date(Date.UTC(2000, month - 1, 15));
	const month = (m: number) => months.format(date(m));
	// formatRange itself cannot be used: across a year end some locales add the
	// years (ja "2000/11～2001/02"), so only its separator is taken, from a range
	// inside one year.
	let separator = ' – ';
	const sample = months.formatRange(date(1), date(3));
	const [jan, mar] = [month(1), month(3)];
	if (sample.length > jan.length + mar.length && sample.startsWith(jan) && sample.endsWith(mar)) {
		separator = sample.slice(jan.length, sample.length - mar.length);
	}
	format = { month, separator, list };
	peakFormats.set(lang, format);
	return format;
}

/**
 * "Apr – Jun", "Nov – Feb", "Apr – May and Sep – Oct" in `lang`'s month names
 * and range style; '' for an empty or all-year mask, which has no peak to show.
 */
export function formatPeak(mask: number, lang: string): string {
	const runs = monthRuns(mask);
	if (!runs.length) return '';
	const { month, separator, list } = peakFormat(lang);
	return list.format(runs.map(([first, last]) => (first === last ? month(first) : month(first) + separator + month(last))));
}

export interface SeasonShare {
	/** Seasonal items in season this month. */
	inSeason: number;
	/** Items the view's calendar says anything about; all-year items are not counted. */
	seasonal: number;
}

/** "N of M in season" over a recipe's ingredient indexes (counted as given, not deduplicated). */
export function seasonShare(seasons: Seasons, ingredientIndexes: Iterable<number>, view: ViewRef, month: number): SeasonShare {
	const v = viewOf(view);
	let inSeason = 0;
	let seasonal = 0;
	for (const g of ingredientIndexes) {
		const mask = maskOf(seasons, g, v);
		if (mask === ALL_YEAR) continue;
		seasonal++;
		if (inSeasonMask(mask, month)) inSeason++;
	}
	return { inSeason, seasonal };
}

/**
 * The month (1-12) on the reader's clock. Browser only: during SSR this would
 * be the server's date and time zone, and pages are cached at the edge as a
 * pure function of their URL, so never call it while rendering on the server.
 */
export const currentMonth = (now: Date = new Date()): number => now.getMonth() + 1;
