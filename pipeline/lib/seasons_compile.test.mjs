import { describe, it, expect } from 'vitest';
import { ALL_YEAR, VIEW_COUNT, WORLD_VIEW, parseRange, parseSeasons, rotateMask, viewIndex } from '../../src/lib/data/seasons.js';
import {
	compileSeasons,
	extendStorage,
	formatRange,
	renderGrid,
	resolveEntry,
	seasonalViews,
	serializeFamily,
	flattenSources
} from './seasons_compile.mjs';

const KEYS = ['asparagus', 'basil', 'fresh_basil', 'flour', 'tomato', 'mango', 'herring', 'chicken', 'potato', 'quince', 'olive_oil', 'lime'];

const SOURCES = {
	produce: {
		asparagus: {
			z: { trop: 'none', sav: 'none', high: 'none', arid: '1-3', med: '2-4', subtrop: '3-4', oce: '4-6', cont: '5-6', bor: '6' },
			p: ['med:n', 'oce:n'],
			st: 0,
			note: 'Spears cut in spring.'
		},
		tomato: { z: { trop: 'all', med: '6-9', cont: '7-9' }, p: ['med:n', 'med:s'] },
		mango: { z: { trop: '3-6', med: 'none', cont: 'none', sav: '4-6' }, p: ['sav:n', 'trop:n'] },
		potato: { z: { trop: 'none', med: '5-7', cont: '8-9' }, p: ['cont:n'], st: 4 },
		quince: { z: { trop: 'none', med: '9-11', 'med:s': '4-5', cont: '10' }, p: ['med:n'] },
		lime: { like: 'mango' }
	},
	herbs: {
		basil: { z: { trop: 'all', med: '5-9', cont: '7-8' }, p: ['med:n'] },
		fresh_basil: { like: 'basil' }
	},
	fungi_nuts: {},
	animal: {
		herring: { z: { trop: 'none', med: 'none', cont: 'none', oce: '5-7', bor: '6-8' }, p: ['oce:n'] }
	},
	allyear: {
		chicken: { ay: 'farmed' },
		flour: { ay: 'staple' },
		olive_oil: { ay: 'processed' }
	}
};

const compiled = compileSeasons(SOURCES, KEYS);
const masksOf = (key) => {
	const line = compiled.lines[KEYS.indexOf(key)];
	return Array.from({ length: VIEW_COUNT }, (_, v) => parseInt(line.slice(v * 3, v * 3 + 3), 16));
};
const view = (key, zone, hemi = 'n') => masksOf(key)[viewIndex(zone, hemi)];
const r = (text) => parseRange(text);

describe('compileSeasons', () => {
	it('writes one line of 19 three-digit masks per key, in the given order', () => {
		expect(compiled.lines).toHaveLength(KEYS.length);
		for (const line of compiled.lines) expect(line).toMatch(/^[0-9a-f]{57}$/);
		expect(compiled.masks).toBe(compiled.lines.join('\n'));
		const parsed = parseSeasons({ version: 'x', zones: ['trop', 'sav', 'high', 'arid', 'med', 'subtrop', 'oce', 'cont', 'bor'], masks: compiled.masks }, { ingredients: KEYS.length });
		expect(parsed.ingredients).toBe(KEYS.length);
	});

	it('makes an ay entry all year in every view, World included', () => {
		expect(compiled.lines[KEYS.indexOf('flour')]).toBe('fff'.repeat(VIEW_COUNT));
		expect(masksOf('chicken').every((m) => m === ALL_YEAR)).toBe(true);
	});

	it('gives a like entry exactly the target line', () => {
		expect(compiled.lines[KEYS.indexOf('fresh_basil')]).toBe(compiled.lines[KEYS.indexOf('basil')]);
		expect(compiled.lines[KEYS.indexOf('lime')]).toBe(compiled.lines[KEYS.indexOf('mango')]);
	});

	it('uses the written ranges for explicit zones', () => {
		expect(view('asparagus', 'med')).toBe(r('2-4'));
		expect(view('asparagus', 'bor')).toBe(r('6'));
		expect(view('asparagus', 'trop')).toBe(0);
	});

	it('inherits omitted zones: bor/oce <- cont, subtrop/arid <- med, sav <- trop, high <- all', () => {
		expect(view('tomato', 'bor')).toBe(r('7-9'));
		expect(view('tomato', 'oce')).toBe(r('7-9'));
		expect(view('tomato', 'subtrop')).toBe(r('6-9'));
		expect(view('tomato', 'arid')).toBe(r('6-9'));
		expect(view('tomato', 'sav')).toBe(ALL_YEAR);
		expect(view('tomato', 'high')).toBe(ALL_YEAR);
		expect(view('herring', 'high')).toBe(ALL_YEAR);
		expect(view('herring', 'sav')).toBe(0);
	});

	it('rotates the southern hemisphere by 6 months, except trop', () => {
		expect(view('asparagus', 'med', 's')).toBe(r('8-10'));
		expect(view('asparagus', 'oce', 's')).toBe(rotateMask(r('4-6'), 6));
		expect(view('mango', 'trop', 's')).toBe(view('mango', 'trop', 'n'));
		expect(view('mango', 'trop')).toBe(r('3-6'));
		expect(view('mango', 'sav', 's')).toBe(r('10-12'));
	});

	it('uses an explicit southern override instead of the rotation, and an omitted zone inherits it', () => {
		expect(view('quince', 'med', 's')).toBe(r('4-5'));
		expect(view('quince', 'med')).toBe(r('9-11'));
		expect(view('quince', 'subtrop', 's')).toBe(r('4-5'));
		expect(view('quince', 'cont', 's')).toBe(rotateMask(r('10'), 6));
	});

	it('extends every window forward by st months, wrapping into January; none stays empty', () => {
		expect(view('potato', 'cont')).toBe(r('8-1'));
		expect(view('potato', 'med')).toBe(r('5-11'));
		expect(view('potato', 'cont', 's')).toBe(r('2-7'));
		expect(view('potato', 'trop')).toBe(0);
		expect(view('potato', 'sav')).toBe(0);
	});

	it('computes World as the OR of the producer views after storage', () => {
		expect(masksOf('potato')[WORLD_VIEW]).toBe(r('8-1'));
		expect(masksOf('tomato')[WORLD_VIEW]).toBe(r('6-9') | rotateMask(r('6-9'), 6));
		expect(masksOf('asparagus')[WORLD_VIEW]).toBe(r('2-6'));
		expect(masksOf('mango')[WORLD_VIEW]).toBe(r('3-6'));
	});

	it('refuses a key without an entry and a like whose target is not seasonal', () => {
		expect(() => compileSeasons(SOURCES, ['asparagus', 'nope'])).toThrow(/nope/);
		const bad = { ...SOURCES, herbs: { ...SOURCES.herbs, fresh_basil: { like: 'flour' } } };
		expect(() => compileSeasons(bad, ['fresh_basil'])).toThrow(/fresh_basil/);
	});
});

describe('helpers', () => {
	it('resolveEntry follows one like', () => {
		const flat = flattenSources(SOURCES);
		expect(resolveEntry(flat, 'fresh_basil')).toBe(SOURCES.herbs.basil);
		expect(resolveEntry(SOURCES.allyear, 'flour')).toEqual({ ay: 'staple' });
	});

	it('extendStorage wraps and leaves 0 alone', () => {
		expect(extendStorage(r('11-12'), 2)).toBe(r('11-2'));
		expect(extendStorage(0, 8)).toBe(0);
		expect(extendStorage(r('6'), 0)).toBe(r('6'));
	});

	it('formatRange is the inverse of parseRange', () => {
		for (const text of ['none', 'all', '6', '4-6', '11-2', '4-5,9-10', '12-1', '1,3,5']) expect(formatRange(r(text))).toBe(text);
	});

	it('seasonalViews marks inherited views and where they came from', () => {
		const v = seasonalViews(SOURCES.produce.tomato);
		expect(v.inherited[viewIndex('med', 'n')]).toBe(false);
		expect(v.inherited[viewIndex('oce', 'n')]).toBe(true);
		expect(v.from[viewIndex('oce', 'n')]).toBe('cont');
		expect(v.from[viewIndex('high', 's')]).toBe('all');
		const q = seasonalViews(SOURCES.produce.quince);
		expect(q.inherited[viewIndex('med', 's')]).toBe(false);
		expect(q.from[viewIndex('arid', 's')]).toBe('med:s');
	});
});

describe('renderGrid', () => {
	it('marks field months, storage months and inherited cells', () => {
		const text = renderGrid(SOURCES, 'cont', 'n', ['potato', 'tomato', 'flour', 'fresh_basil']);
		const line = (key) => text.split('\n').find((l) => l.startsWith(`${key} `));
		expect(line('potato')).toContain('S......XXSSS');
		expect(line('potato')).toContain('st 4');
		expect(line('tomato')).toContain('......XXX...');
		expect(line('flour')).toContain('all year: staple');
		expect(line('fresh_basil')).toContain('like basil');
		const oce = renderGrid(SOURCES, 'oce', 'n', ['tomato']);
		expect(oce).toContain('------xxx---  < cont');
	});

	it('defaults to every seasonal and like key, sorted, and renders World with producers', () => {
		const text = renderGrid(SOURCES, 'world');
		const keys = text.split('\n').slice(3).filter(Boolean).map((l) => l.split(' ')[0]);
		expect(keys).toEqual(['asparagus', 'basil', 'fresh_basil', 'herring', 'lime', 'mango', 'potato', 'quince', 'tomato']);
		expect(text).toContain('p med:n oce:n');
	});

	it('says trop south is the northern view', () => {
		expect(renderGrid(SOURCES, 'trop', 's', ['mango'])).toContain('never rotated');
		expect(() => renderGrid(SOURCES, 'tundra')).toThrow(/unknown zone/);
	});
});

describe('serializeFamily', () => {
	it('sorts keys, one tab-indented entry per line, canonical field and zone order, LF', () => {
		const text = serializeFamily({
			zucchini: { note: 'n', p: ['med:n'], z: { cont: '7-9', 'med:s': '1-2', med: '6-9', trop: 'none' } },
			apple: { ay: 'traded' }
		});
		expect(text).toBe(
			'{\n' +
				'\t"apple": {"ay":"traded"},\n' +
				'\t"zucchini": {"z":{"trop":"none","med":"6-9","med:s":"1-2","cont":"7-9"},"p":["med:n"],"note":"n"}\n' +
				'}\n'
		);
		expect(serializeFamily({})).toBe('{}\n');
		expect(JSON.parse(text).zucchini.z.cont).toBe('7-9');
	});
});
