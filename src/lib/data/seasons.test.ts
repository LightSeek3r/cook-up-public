import { describe, expect, it } from 'vitest';
import { ALL_YEAR, VIEW_COUNT, WORLD_VIEW, ZONES, inSeasonMask, isSeasonalMask, maskOf, parseRange, parseSeasons, rotateMask, viewIndex } from './seasons.js';

describe('seasons', () => {
	it('lays views out as 9 northern zones, 9 southern zones, world', () => {
		expect(VIEW_COUNT).toBe(19);
		expect(WORLD_VIEW).toBe(18);
		expect(viewIndex('trop', 'n')).toBe(0);
		expect(viewIndex('bor', 'n')).toBe(8);
		expect(viewIndex('trop', 's')).toBe(9);
		expect(viewIndex('bor', 's')).toBe(17);
		expect(viewIndex('nope', 'n')).toBe(-1);
	});

	it('parses ranges, wrapping the year and joining harvests', () => {
		expect(parseRange('all')).toBe(0xfff);
		expect(parseRange('none')).toBe(0);
		expect(parseRange('3')).toBe(0b100);
		expect(parseRange('11-2')).toBe(0b1100_0000_0011);
		expect(parseRange('4-5,9-10')).toBe(0b0011_0001_1000);
		expect(parseRange('0-3')).toBeNull();
		expect(parseRange('13')).toBeNull();
		expect(parseRange('a-b')).toBeNull();
	});

	it('rotates masks by six months and wraps December into January', () => {
		expect(rotateMask(0b100000000000, 1)).toBe(0b1);
		expect(rotateMask(parseRange('11-2') ?? 0, 6)).toBe(parseRange('5-8'));
		expect(rotateMask(ALL_YEAR, 6)).toBe(ALL_YEAR);
		expect(rotateMask(0b101, 0)).toBe(0b101);
	});

	it('reads masks per ingredient and view', () => {
		const asparagus = Array.from({ length: VIEW_COUNT }, (_, v) => (v === viewIndex('med', 'n') ? '00e' : 'fff')).join('');
		const file = { version: 'v1', zones: ZONES, masks: `${'fff'.repeat(VIEW_COUNT)}\n${asparagus}` };
		const seasons = parseSeasons(JSON.stringify(file), { version: 'v1', ingredients: 2 });
		const med = viewIndex('med', 'n');
		expect(maskOf(seasons, 0, med)).toBe(ALL_YEAR);
		expect(isSeasonalMask(maskOf(seasons, 0, med))).toBe(false);
		expect(maskOf(seasons, 1, med)).toBe(0x00e);
		expect(inSeasonMask(0x00e, 2)).toBe(true);
		expect(inSeasonMask(0x00e, 1)).toBe(false);
	});

	it('rejects artefacts from another build or with the wrong shape', () => {
		const good = { version: 'v1', zones: ZONES, masks: 'fff'.repeat(VIEW_COUNT) };
		expect(() => parseSeasons(good, { version: 'v2' })).toThrow(/different builds/);
		expect(() => parseSeasons(good, { ingredients: 2 })).toThrow(/different ingredients/);
		expect(() => parseSeasons({ ...good, zones: ['trop'] })).toThrow(/different climate zones/);
		expect(() => parseSeasons({ ...good, masks: 'fff' })).toThrow(/characters/);
		expect(() => parseSeasons({ ...good, masks: 'zzz'.repeat(VIEW_COUNT) })).toThrow(/bad mask/);
	});
});
