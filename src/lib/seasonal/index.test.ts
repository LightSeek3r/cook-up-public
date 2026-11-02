import { describe, expect, it } from 'vitest';
import { ALL_YEAR, VIEW_COUNT, WORLD_VIEW, ZONES, parseRange, parseSeasons, rotateMask, viewIndex } from '$lib/data/seasons.js';
import { currentMonth, formatPeak, isInSeason, isSeasonalFor, monthRuns, peakMonths, seasonShare, seasonalNow, viewOf } from './index';

const range = (text: string) => parseRange(text) as number;
// ICU puts thin spaces around the range dash.
const spaced = (text: string) => text.replace(/\s/gu, ' ');
const hex = (mask: number) => mask.toString(16).padStart(3, '0');

/** One artefact line: the northern masks, rotated for the south except in the tropics, and the world. */
function line(north: Partial<Record<(typeof ZONES)[number], string>>, world: string, fallback = 'all') {
	const masks = new Array<number>(VIEW_COUNT);
	for (const zone of ZONES) {
		const mask = range(north[zone] ?? fallback);
		masks[viewIndex(zone, 'n')] = mask;
		masks[viewIndex(zone, 's')] = zone === 'trop' ? mask : rotateMask(mask, 6);
	}
	masks[WORLD_VIEW] = range(world);
	return masks.map(hex).join('');
}

const ASPARAGUS = 0;
const SALT = 1;
const CHESTNUT = 2;
const MANGO = 3;
const PEA = 4;
const LEEK = 5;

const seasons = parseSeasons(
	{
		version: 'test',
		zones: ZONES,
		masks: [
			line({ med: '3-5', oce: '4-6', cont: '5-6', trop: 'none' }, '2-6'),
			line({}, 'all'),
			line({ med: '10-12', oce: '10-11', trop: 'none' }, '10-12'),
			line({ trop: '3-6', med: 'none', oce: 'none' }, '1-7'),
			line({ med: '4-6', oce: '5-7', trop: 'none' }, '4-7'),
			line({ med: '9-3', oce: '9-4', trop: 'none' }, '9-4')
		].join('\n')
	},
	{ version: 'test', ingredients: 6 }
);

const med = { zone: 'med', hemi: 'n' } as const;
const medSouth = { zone: 'med', hemi: 's' } as const;

describe('season lookups', () => {
	it('resolves views once', () => {
		expect(viewOf(med)).toBe(viewIndex('med', 'n'));
		expect(viewOf('world')).toBe(WORLD_VIEW);
		expect(viewOf(7)).toBe(7);
	});

	it('answers in season per view and month', () => {
		expect(isInSeason(seasons, ASPARAGUS, med, 4)).toBe(true);
		expect(isInSeason(seasons, ASPARAGUS, med, 9)).toBe(false);
		expect(isInSeason(seasons, ASPARAGUS, medSouth, 10)).toBe(true);
		expect(isInSeason(seasons, ASPARAGUS, medSouth, 4)).toBe(false);
		expect(isInSeason(seasons, ASPARAGUS, 'world', 6)).toBe(true);
		expect(isInSeason(seasons, ASPARAGUS, 'world', 8)).toBe(false);
	});

	it('wraps December into January', () => {
		for (const month of [9, 10, 11, 12, 1, 2, 3]) expect(isInSeason(seasons, LEEK, med, month), String(month)).toBe(true);
		for (const month of [4, 5, 6, 7, 8]) expect(isInSeason(seasons, LEEK, med, month), String(month)).toBe(false);
	});

	it('never rotates the tropics, whichever hemisphere is asked for', () => {
		const tropSouth = { zone: 'trop', hemi: 's' } as const;
		for (let month = 1; month <= 12; month++) {
			expect(isInSeason(seasons, MANGO, tropSouth, month)).toBe(isInSeason(seasons, MANGO, { zone: 'trop', hemi: 'n' }, month));
		}
		expect(isInSeason(seasons, MANGO, tropSouth, 4)).toBe(true);
		expect(isInSeason(seasons, ASPARAGUS, tropSouth, 4)).toBe(false);
	});

	it('keeps all-year items neutral', () => {
		expect(isSeasonalFor(seasons, SALT, med)).toBe(false);
		expect(isSeasonalFor(seasons, SALT, 'world')).toBe(false);
		expect(isInSeason(seasons, SALT, med, 8)).toBe(true);
		expect(isSeasonalFor(seasons, ASPARAGUS, med)).toBe(true);
		// Not grown there: seasonal, and never in season.
		expect(isSeasonalFor(seasons, MANGO, med)).toBe(true);
		expect(isInSeason(seasons, MANGO, med, 4)).toBe(false);
	});
});

describe('seasonalNow', () => {
	it('lists short windows covering the month, shortest first, never all-year items', () => {
		expect(seasonalNow(seasons, med, 4)).toEqual([ASPARAGUS, PEA]);
		expect(seasonalNow(seasons, med, 11)).toEqual([CHESTNUT, LEEK]);
		expect(seasonalNow(seasons, med, 8)).toEqual([]);
		expect(seasonalNow(seasons, { zone: 'trop', hemi: 'n' }, 4)).toEqual([MANGO]);
		expect(seasonalNow(seasons, 'world', 5)).toEqual([PEA, ASPARAGUS, MANGO]);
		for (let month = 1; month <= 12; month++) expect(seasonalNow(seasons, 'world', month)).not.toContain(SALT);
	});

	it('limits, filters and caps the window length', () => {
		expect(seasonalNow(seasons, med, 4, { limit: 1 })).toEqual([ASPARAGUS]);
		expect(seasonalNow(seasons, med, 4, { filter: (g) => g !== ASPARAGUS })).toEqual([PEA]);
		expect(seasonalNow(seasons, med, 1, { maxMonths: 6 })).toEqual([]);
		expect(seasonalNow(seasons, med, 1, { maxMonths: 7 })).toEqual([LEEK]);
	});

	it('follows the hemisphere', () => {
		expect(seasonalNow(seasons, medSouth, 10)).toEqual([ASPARAGUS, PEA]);
		expect(seasonalNow(seasons, medSouth, 4)).toEqual([CHESTNUT, LEEK]);
	});
});

describe('peaks', () => {
	it('lists months and runs, wrapping the year', () => {
		expect(peakMonths(range('11-2'))).toEqual([1, 2, 11, 12]);
		expect(peakMonths(0)).toEqual([]);
		expect(monthRuns(range('4-6'))).toEqual([[4, 6]]);
		expect(monthRuns(range('11-2'))).toEqual([[11, 2]]);
		expect(monthRuns(range('12-1,6'))).toEqual([
			[6, 6],
			[12, 1]
		]);
		expect(monthRuns(range('1,12'))).toEqual([[12, 1]]);
		expect(monthRuns(range('4-5,9-10'))).toEqual([
			[4, 5],
			[9, 10]
		]);
		expect(monthRuns(range('2-12'))).toEqual([[2, 12]]);
		expect(monthRuns(ALL_YEAR)).toEqual([]);
		expect(monthRuns(0)).toEqual([]);
	});

	it('formats peaks in English', () => {
		expect(spaced(formatPeak(range('4-6'), 'en'))).toBe('Apr – Jun');
		expect(spaced(formatPeak(range('11-2'), 'en'))).toBe('Nov – Feb');
		expect(formatPeak(range('6'), 'en')).toBe('Jun');
		expect(spaced(formatPeak(range('4-5,9-10'), 'en'))).toBe('Apr – May and Sep – Oct');
		expect(formatPeak(ALL_YEAR, 'en')).toBe('');
		expect(formatPeak(0, 'en')).toBe('');
	});

	it('formats peaks in other scripts without years or errors', () => {
		expect(formatPeak(range('11-2'), 'ja')).toBe('11月～2月');
		for (const lang of ['ja', 'ar', 'zh', 'hi', 'bn', 'pnb', 'ru']) {
			for (const text of ['11-2', '4-6', '1,6-7', '3']) {
				const out = formatPeak(range(text), lang);
				expect(out, `${lang} ${text}`).not.toBe('');
				expect(out, `${lang} ${text}`).not.toMatch(/200[01]/);
			}
		}
		expect(spaced(formatPeak(range('4-6'), 'not a tag'))).toBe('Apr – Jun');
	});
});

describe('seasonShare', () => {
	it('counts only seasonal items', () => {
		expect(seasonShare(seasons, [ASPARAGUS, SALT, CHESTNUT, PEA], med, 4)).toEqual({ inSeason: 2, seasonal: 3 });
		expect(seasonShare(seasons, [SALT], med, 4)).toEqual({
			inSeason: 0,
			seasonal: 0
		});
		expect(seasonShare(seasons, [], 'world', 4)).toEqual({
			inSeason: 0,
			seasonal: 0
		});
		expect(seasonShare(seasons, [MANGO, ASPARAGUS], med, 4)).toEqual({
			inSeason: 1,
			seasonal: 2
		});
		expect(seasonShare(seasons, new Set([MANGO, ASPARAGUS]), viewOf('world'), 7)).toEqual({ inSeason: 1, seasonal: 2 });
	});
});

describe('currentMonth', () => {
	it('is 1-12 from the given clock', () => {
		expect(currentMonth(new Date(2026, 0, 31))).toBe(1);
		expect(currentMonth(new Date(2026, 11, 1))).toBe(12);
		expect(currentMonth()).toBeGreaterThanOrEqual(1);
		expect(currentMonth()).toBeLessThanOrEqual(12);
	});
});
