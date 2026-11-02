import { describe, expect, it } from 'vitest';
import { ALL_YEAR, VIEW_COUNT, WORLD_VIEW, ZONES, parseRange, parseSeasons, viewIndex } from '$lib/data/seasons.js';
import {
	PICKER_ZONES,
	ZONE_EXAMPLES,
	badgeState,
	groupOf,
	homeWith,
	monthGroups,
	monthName,
	nextMonth,
	parseMonthParam,
	zoneExamples,
	type SeasonItem
} from './ui';
import { SeasonData, type SeasonDataEnv } from './data.svelte';
import type { Seasons } from './index';

const range = (text: string) => parseRange(text) as number;
const hex = (mask: number) => mask.toString(16).padStart(3, '0');

/** Every view `all` except the ones given. */
function line(views: Record<number, string>) {
	return Array.from({ length: VIEW_COUNT }, (_, v) => hex(range(views[v] ?? 'all'))).join('');
}

const MED = viewIndex('med', 'n');
const seasons = parseSeasons({
	version: 't',
	zones: ZONES,
	masks: [line({ [MED]: '4-6', [WORLD_VIEW]: '3-7' }), line({}), line({ [MED]: 'none' })].join('\n')
});

describe('picker data', () => {
	it('lists the nine zones then the world, each zone with real examples', () => {
		expect(PICKER_ZONES).toEqual([...ZONES, 'world']);
		for (const zone of ZONES) expect(ZONE_EXAMPLES[zone].length).toBeGreaterThanOrEqual(4);
		expect(zoneExamples('med', 'en')).toBe('Spain, Italy, Greece, and Chile');
		expect(zoneExamples('med', 'fr')).toContain('Espagne');
		expect(zoneExamples('world', 'en')).toBe('');
		// An unknown tag still names the countries, in English.
		expect(zoneExamples('oce', 'pnb')).not.toBe('');
	});
});

describe('months', () => {
	it('names months in the language without time zone drift', () => {
		expect(monthName(1, 'en')).toBe('January');
		expect(monthName(12, 'en', 'short')).toBe('Dec');
		expect(monthName(4, 'fr')).toBe('avril');
		expect(nextMonth(12)).toBe(1);
		expect(nextMonth(4)).toBe(5);
	});

	it('accepts 1-12 written plainly and nothing else', () => {
		expect(parseMonthParam('1')).toBe(1);
		expect(parseMonthParam('12')).toBe(12);
		for (const raw of ['0', '13', '04', '4.0', ' 4', 'april', '', '-1']) expect(parseMonthParam(raw)).toBeNull();
	});
});

describe('badgeState', () => {
	it('marks seasonal items in or out of season, and says nothing otherwise', () => {
		expect(badgeState(seasons, 0, { zone: 'med', hemi: 'n' }, 5)).toBe('in');
		expect(badgeState(seasons, 0, { zone: 'med', hemi: 'n' }, 8)).toBe('out');
		expect(badgeState(seasons, 0, 'world', 7)).toBe('in');
		expect(badgeState(seasons, 0, { zone: 'oce', hemi: 'n' }, 8)).toBeNull();
		expect(badgeState(seasons, 1, MED, 5)).toBeNull();
		expect(badgeState(seasons, 2, MED, 5)).toBe('out');
		expect(badgeState(null, 0, MED, 5)).toBeNull();
		expect(badgeState(seasons, 0, MED, 0)).toBeNull();
		expect(badgeState(seasons, 99, MED, 5)).toBeNull();
		expect(badgeState(seasons, -1, MED, 5)).toBeNull();
	});
});

describe('monthGroups', () => {
	const item = (id: number, name: string): SeasonItem => ({ id, name, canonical_key: `k${id}`, category: 'fruit' });
	const masks: Record<number, number> = {
		1: range('4-6'),
		2: range('3-11'),
		3: range('5-6'),
		4: ALL_YEAR,
		5: 0,
		6: range('4'),
		7: range('5-8')
	};
	const items = [item(1, 'Cherry'), item(2, 'Apple'), item(3, 'Bean'), item(4, 'Salt'), item(5, 'Mango'), item(6, 'Asparagus'), item(7, 'Apricot')];

	it('puts this month shortest window first and next month by name, never all-year or never-grown items', () => {
		const groups = monthGroups(items, (i) => masks[i.id], 4, 'en');
		expect(groups.now.map((g) => g.item.name)).toEqual(['Asparagus', 'Cherry', 'Apple']);
		expect(groups.next.map((g) => g.item.name)).toEqual(['Apricot', 'Bean']);
		expect(groups.now[0].mask).toBe(range('4'));
	});

	it('wraps December into January', () => {
		const groups = monthGroups([item(1, 'Leek')], () => range('1-3'), 12, 'en');
		expect(groups.now).toEqual([]);
		expect(groups.next.map((g) => g.item.name)).toEqual(['Leek']);
	});
});

describe('groupOf', () => {
	it('folds core categories into shopper groups', () => {
		expect(groupOf('legume')).toBe('vegetable');
		expect(groupOf('spice')).toBe('herb');
		expect(groupOf('other')).toBe('forage');
		expect(groupOf('protein')).toBe('animal');
		expect(groupOf('fruit')).toBe('fruit');
	});
});

describe('homeWith', () => {
	it('adds the key to the remembered selection, once, within the cap', () => {
		expect(homeWith('pea', 'en', [], 3)).toBe('/?lang=en&have=pea');
		expect(homeWith('pea', 'fr', ['leek', 'pea'], 3)).toBe('/?lang=fr&have=leek,pea');
		expect(homeWith('pea', 'en', ['a', 'b', 'c'], 3)).toBe('/?lang=en&have=b,c,pea');
	});
});

describe('SeasonData', () => {
	function setup(load: () => Promise<Seasons>) {
		let month = 4;
		let loads = 0;
		const visible: (() => void)[] = [];
		const env: SeasonDataEnv = {
			load: () => {
				loads++;
				return load();
			},
			month: () => month,
			onVisible: (listener) => void visible.push(listener)
		};
		return {
			data: new SeasonData(env),
			loads: () => loads,
			turn: (next: number) => {
				month = next;
				for (const listener of visible) listener();
			}
		};
	}

	it('is empty until wanted, then loads once and follows the month', async () => {
		const { data, loads, turn } = setup(() => Promise.resolve(seasons));
		expect([data.seasons, data.month]).toEqual([null, 0]);
		data.want();
		data.want();
		expect(data.month).toBe(4);
		await Promise.resolve();
		expect(data.seasons).toBe(seasons);
		expect(loads()).toBe(1);
		turn(5);
		expect(data.month).toBe(5);
	});

	it('swallows a failed download and stays empty', async () => {
		const { data } = setup(() => Promise.reject(new Error('HTTP 404')));
		data.want();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(data.seasons).toBeNull();
		expect(data.month).toBe(4);
	});

	it('does nothing on the server', () => {
		const data = new SeasonData(null);
		data.want();
		expect([data.seasons, data.month]).toEqual([null, 0]);
	});
});
