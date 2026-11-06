import { describe, it, expect } from 'vitest';
import { ZONES } from '../../src/lib/data/seasons.js';
import { compileSeasons, serializeFamily } from './seasons_compile.mjs';
import {
	checkCompiled,
	formatIssue,
	missingKeys,
	rangeProblem,
	seasonWarnings,
	validateEntry,
	validateSources
} from './seasons_gate.mjs';

const INGREDIENTS = [
	['asparagus', 'vegetable'],
	['basil', 'spice'],
	['fresh_basil', 'spice'],
	['flour', 'other'],
	['tomato', 'vegetable'],
	['tomato_puree', 'vegetable'],
	['herring', 'protein'],
	['chicken', 'protein'],
	['potato', 'vegetable'],
	['sweetcorn', 'grain'],
	['rice', 'grain'],
	['parsley', 'spice']
].map(([canonical_key, category]) => ({ canonical_key, category }));
const KEYS = INGREDIENTS.map((r) => r.canonical_key);

const SOURCES = () => ({
	produce: {
		asparagus: {
			z: { trop: 'none', sav: 'none', high: 'none', arid: '1-3', med: '2-4', subtrop: '3-4', oce: '4-6', cont: '5-6', bor: '6' },
			p: ['med:n', 'oce:n'],
			st: 0,
			note: 'Spears cut in spring.'
		},
		tomato: { z: { trop: 'all', med: '6-9', cont: '7-9' }, p: ['med:n'] },
		potato: { z: { trop: 'none', high: 'all', med: '5-7', cont: '8-9' }, p: ['cont:n'], st: 4 },
		sweetcorn: { z: { trop: 'all', med: '7-9', cont: '8-9' }, p: ['cont:n'] }
	},
	herbs: {
		basil: { z: { trop: 'all', med: '5-9', cont: '7-8' }, p: ['med:n'] },
		fresh_basil: { like: 'basil' },
		parsley: { z: { trop: 'all', med: '3-11', cont: '5-9' }, p: ['med:n'] }
	},
	fungi_nuts: {},
	animal: {
		herring: { z: { trop: 'none', med: 'none', cont: 'none', oce: '5-7', bor: '6-8' }, p: ['oce:n'] }
	},
	allyear: {
		chicken: { ay: 'farmed' },
		flour: { ay: 'staple' },
		rice: { ay: 'staple' },
		tomato_puree: { ay: 'processed' }
	}
});
const raw = (sources) => Object.fromEntries(Object.entries(sources).map(([f, e]) => [f, serializeFamily(e)]));

const rules = (issues) => issues.map((i) => i.rule);
const seasonal = (over = {}) => ({ z: { trop: 'none', med: '4-6', cont: '6-8' }, p: ['med:n'], ...over });
const check = (key, entry, lookup = {}, family) => validateEntry(key, entry, { lookup: (k) => lookup[k], family });

describe('validateSources', () => {
	it('accepts the valid fixture with its canonical bytes', () => {
		const sources = SOURCES();
		expect(validateSources({ ingredients: INGREDIENTS, sources, raw: raw(sources) }).map(formatIssue)).toEqual([]);
	});

	it('reports missing, unknown and duplicate keys', () => {
		const sources = SOURCES();
		delete sources.produce.potato;
		sources.produce.durian = seasonal();
		sources.animal.tomato = seasonal();
		const issues = validateSources({ ingredients: INGREDIENTS, sources });
		expect(issues).toContainEqual(expect.objectContaining({ key: 'potato', rule: 'missing-key' }));
		expect(issues).toContainEqual(expect.objectContaining({ key: 'durian', rule: 'unknown-key' }));
		expect(issues).toContainEqual(expect.objectContaining({ key: 'tomato', rule: 'duplicate-key' }));
		expect(rules(validateSources({ ingredients: INGREDIENTS, sources, partial: true }))).not.toContain('missing-key');
		expect(missingKeys(INGREDIENTS, sources)).toEqual(['potato']);
	});

	it('finds a key written twice in one file, which JSON.parse would hide', () => {
		const sources = SOURCES();
		const text = serializeFamily(sources.allyear).replace('\t"flour"', '\t"flour": {"ay":"staple"},\n\t"flour"');
		const issues = validateSources({ ingredients: INGREDIENTS, sources, raw: { ...raw(sources), allyear: text } });
		expect(issues).toContainEqual(expect.objectContaining({ key: 'flour', rule: 'duplicate-key' }));
	});

	it('requires canonical bytes: sorted, LF', () => {
		const sources = SOURCES();
		const unsorted = '{\n\t"rice": {"ay":"staple"},\n\t"chicken": {"ay":"farmed"},\n\t"flour": {"ay":"staple"},\n\t"tomato_puree": {"ay":"processed"}\n}\n';
		expect(rules(validateSources({ ingredients: INGREDIENTS, sources, raw: { ...raw(sources), allyear: unsorted } }))).toEqual(['format']);
		const crlf = serializeFamily(sources.allyear).replace(/\n/g, '\r\n');
		const issues = validateSources({ ingredients: INGREDIENTS, sources, raw: { ...raw(sources), allyear: crlf } });
		expect(issues.map((i) => i.message)).toEqual([expect.stringMatching(/CR line endings/)]);
	});

	it('refuses an unknown family file and ay outside allyear.json', () => {
		const sources = { ...SOURCES(), fruit: {} };
		sources.produce.rice = { ay: 'staple' };
		delete sources.allyear.rice;
		const issues = validateSources({ ingredients: INGREDIENTS, sources });
		expect(rules(issues)).toContain('unknown-family');
		expect(issues).toContainEqual(expect.objectContaining({ key: 'rice', rule: 'family' }));
		const s2 = SOURCES();
		s2.allyear.potato = s2.produce.potato;
		delete s2.produce.potato;
		expect(validateSources({ ingredients: INGREDIENTS, sources: s2 })).toContainEqual(expect.objectContaining({ key: 'potato', rule: 'family' }));
	});

	it('checks like targets across files', () => {
		const sources = SOURCES();
		sources.herbs.fresh_basil = { like: 'flour' };
		expect(validateSources({ ingredients: INGREDIENTS, sources })).toContainEqual(expect.objectContaining({ key: 'fresh_basil', rule: 'like-target' }));
	});
});

describe('validateEntry', () => {
	it('accepts the three shapes', () => {
		expect(check('flour', { ay: 'staple' })).toEqual([]);
		expect(check('flour', { ay: 'staple', note: 'Milled grain keeps.' })).toEqual([]);
		expect(check('fresh_basil', { like: 'basil' }, { basil: seasonal() })).toEqual([]);
		expect(check('asparagus', seasonal({ st: 2, note: 'x' }))).toEqual([]);
	});

	it('shape: exactly one of ay, like, z and no unknown fields', () => {
		expect(rules(check('k', null))).toEqual(['shape']);
		expect(rules(check('k', {}))).toEqual(['shape']);
		expect(rules(check('k', { ay: 'staple', like: 'x' }))).toEqual(['shape']);
		expect(rules(check('k', { ay: 'staple', p: ['med:n'] }))).toEqual(['shape']);
		expect(rules(check('k', seasonal({ months: '4-6' })))).toEqual(['shape']);
		expect(rules(check('k', { z: 'med' }))).toEqual(['shape']);
	});

	it('ay-reason', () => {
		expect(rules(check('k', { ay: 'boring' }))).toEqual(['ay-reason']);
	});

	it('note is one short line', () => {
		expect(rules(check('k', { ay: 'staple', note: 'a\nb' }))).toEqual(['note']);
		expect(rules(check('k', { ay: 'staple', note: ' ' }))).toEqual(['note']);
		expect(rules(check('k', { ay: 'staple', note: 'x'.repeat(201) }))).toEqual(['note']);
	});

	it('bad-zone: unknown zones, hemisphere suffixes other than :s, trop:s', () => {
		expect(rules(check('k', seasonal({ z: { trop: 'none', med: '4-6', cont: '6-8', tundra: '7' } })))).toEqual(['bad-zone']);
		expect(rules(check('k', seasonal({ z: { trop: 'none', med: '4-6', cont: '6-8', 'med:n': '7' } })))).toEqual(['bad-zone']);
		expect(rules(check('k', seasonal({ z: { trop: 'none', 'trop:s': '1', med: '4-6', cont: '6-8' } })))).toEqual(['bad-zone']);
	});

	it('bad-range: malformed, out of 1-12, overlapping parts', () => {
		for (const range of ['13', '0-3', '4-', 'spring', '', 4, '4-6,5', '1-12,6', 'all,4', 'none,4']) {
			const issues = check('k', seasonal({ z: { trop: 'none', med: range, cont: '6-8' } }));
			expect(rules(issues), String(range)).toEqual(['bad-range']);
			expect(issues[0].zone).toBe('med');
		}
		expect(rangeProblem('11-2')).toBeNull();
		expect(rangeProblem('4-5,9-10')).toBeNull();
	});

	it('missing-zone: the roots trop, med and cont are always written', () => {
		const issues = check('k', { z: { med: '4-6', oce: '5-7' }, p: ['med:n'] });
		expect(issues.map((i) => `${i.rule}:${i.zone}`)).toEqual(['missing-zone:trop', 'missing-zone:cont']);
	});

	it('st is an integer 0-8', () => {
		expect(rules(check('k', seasonal({ st: 9 })))).toEqual(['st']);
		expect(rules(check('k', seasonal({ st: 1.5 })))).toEqual(['st']);
		expect(rules(check('k', seasonal({ st: '2' })))).toEqual(['st']);
		expect(check('k', seasonal({ st: 8 }))).toEqual([]);
	});

	it('producers: 1-4 distinct real views, never trop:s, never a zone without a season', () => {
		expect(rules(check('k', seasonal({ p: [] })))).toEqual(['producers']);
		expect(rules(check('k', seasonal({ p: undefined })))).toEqual(['producers']);
		expect(rules(check('k', seasonal({ p: ['med:n', 'cont:n', 'med:s', 'cont:s', 'oce:n'] })))).toEqual(['producers']);
		expect(rules(check('k', seasonal({ p: ['med'] })))).toEqual(['producers']);
		expect(rules(check('k', seasonal({ p: ['med:x'] })))).toEqual(['producers']);
		expect(rules(check('k', seasonal({ p: ['med:n', 'med:n'] })))).toEqual(['producers']);
		expect(rules(check('k', seasonal({ z: { trop: '4-6', med: '4-6', cont: '6-8' }, p: ['trop:s'] })))).toEqual(['producers']);
		const empty = check('k', seasonal({ p: ['trop:n'] }));
		expect(rules(empty)).toEqual(['producers']);
		expect(empty[0].message).toMatch(/no season/);
	});

	it('empty-season and all-year', () => {
		expect(rules(check('k', { z: { trop: 'none', med: 'none', cont: 'none', high: 'none' }, p: ['med:n'] }))).toContain('empty-season');
		expect(rules(check('k', { z: { trop: 'all', med: 'all', cont: 'all' }, p: ['med:n'] }))).toEqual(['all-year']);
		expect(rules(check('k', { z: { trop: 'all', med: '1-6', cont: '7-12' }, p: ['med:n'], st: 6 }))).toEqual(['all-year']);
	});

	it('override-redundant: a :s override equal to the rotation', () => {
		const issues = check('k', seasonal({ z: { trop: 'none', med: '4-6', 'med:s': '10-12', cont: '6-8' } }));
		expect(issues.map((i) => `${i.rule}:${i.zone}`)).toEqual(['override-redundant:med:s']);
		expect(check('k', seasonal({ z: { trop: 'none', med: '4-6', 'med:s': '9-11', cont: '6-8' } }))).toEqual([]);
	});

	it('like-target: exists, not itself, no chain, seasonal', () => {
		const lookup = { basil: seasonal(), fresh_basil: { like: 'basil' }, flour: { ay: 'staple' } };
		expect(rules(check('k', { like: 'nope' }, lookup))).toEqual(['like-target']);
		expect(rules(check('k', { like: 'k' }, lookup))).toEqual(['like-target']);
		expect(rules(check('k', { like: 'fresh_basil' }, lookup))).toEqual(['like-target']);
		expect(rules(check('k', { like: 'flour' }, lookup))).toEqual(['like-target']);
		expect(rules(check('k', { like: '' }, lookup))).toEqual(['shape']);
	});

	it('processed: a processed-looking key must be ay', () => {
		expect(rules(check('dried_apricots', seasonal()))).toEqual(['processed']);
		expect(rules(check('tomato_paste', { like: 'tomato' }, { tomato: seasonal() }))).toEqual(['processed']);
		expect(check('tomato_puree', { ay: 'processed' })).toEqual([]);
	});

	it('family: ay only in allyear.json, nothing else there', () => {
		expect(rules(check('k', { ay: 'staple' }, {}, 'produce'))).toEqual(['family']);
		expect(rules(check('k', seasonal(), {}, 'allyear'))).toEqual(['family']);
		expect(check('k', seasonal(), {}, 'produce')).toEqual([]);
	});
});

describe('checkCompiled', () => {
	const sources = SOURCES();
	it('passes for the compiler output', () => {
		const compiled = compileSeasons(sources, KEYS);
		expect(checkCompiled({ compiled, ingredients: INGREDIENTS, sources })).toEqual([]);
	});

	it('catches a wrong count, a rotated trop, a World missing a producer, a broken line', () => {
		const compiled = compileSeasons(sources, KEYS);
		expect(rules(checkCompiled({ compiled: { lines: compiled.lines.slice(1), masks: '' }, ingredients: INGREDIENTS, sources }))).toEqual(['order']);
		const lines = [...compiled.lines];
		const g = KEYS.indexOf('tomato');
		const tropS = ZONES.length * 3;
		lines[g] = lines[g].slice(0, tropS) + '001' + lines[g].slice(tropS + 3, -3) + '000';
		const issues = checkCompiled({ compiled: { lines, masks: lines.join('\n') }, ingredients: INGREDIENTS, sources });
		expect(rules(issues).sort()).toEqual(['trop-rotated', 'world']);
		const short = [...compiled.lines];
		short[0] = short[0].slice(3);
		expect(rules(checkCompiled({ compiled: { lines: short, masks: short.join('\n') }, ingredients: INGREDIENTS, sources }))).toEqual(['artefact']);
	});
});

describe('seasonWarnings', () => {
	it('is quiet on plausible data', () => {
		expect(seasonWarnings({ ingredients: INGREDIENTS, sources: SOURCES() }).filter((w) => w.rule !== 'inherited-heavy')).toEqual([]);
	});

	it('flags disjoint neighbours, a longer bor season, seasonal staples, heavy inheritance', () => {
		const sources = SOURCES();
		sources.produce.asparagus.z.oce = '9-10';
		sources.produce.asparagus.z.bor = '3-9';
		delete sources.allyear.rice;
		sources.produce.rice = seasonal();
		const warnings = seasonWarnings({ ingredients: INGREDIENTS, sources });
		expect(warnings).toContainEqual(expect.objectContaining({ key: 'asparagus', zone: 'oce', rule: 'neighbour-disjoint' }));
		expect(warnings).toContainEqual(expect.objectContaining({ key: 'asparagus', zone: 'bor', rule: 'bor-longer' }));
		expect(warnings).toContainEqual(expect.objectContaining({ key: 'rice', rule: 'seasonal-category' }));
		expect(warnings.filter((w) => w.rule === 'seasonal-category').map((w) => w.key)).toEqual(['rice']);
		const heavy = warnings.filter((w) => w.rule === 'inherited-heavy').map((w) => w.zone);
		expect(heavy).toContain('oce');
		expect(heavy).not.toContain('med');
	});
});
