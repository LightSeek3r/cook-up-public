import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	buildBatchRow,
	checkBatch,
	loadGlossaryData,
	mergeBatch,
	normalizeEntry,
	pendingTerms,
	serializeContent,
	writeContent
} from './glossary_apply_lib.mjs';

const clone = (v) => structuredClone(v);
const byRule = (errors) => errors.map((e) => `${e.id ?? '-'}:${e.rule}`);

const TERMS = [
	{
		id: 'sous-vide',
		en: 'Sous vide',
		category: 'modernist',
		aliases: ['vacuum cooking'],
		related: ['poach'],
		diagram: 'sous-vide'
	},
	{ id: 'poach', en: 'Poach', category: 'moist-heat', aliases: [], related: ['sous-vide'] },
	{ id: 'blanch', en: 'Blanch', category: 'moist-heat', aliases: [], related: [] }
];
const DIAGRAMS = [{ id: 'sous-vide', marks: 3, directional: false, drawn: true }];
const EN = {
	'sous-vide': {
		name: 'Sous vide',
		short: 'Cooking sealed food in a precisely heated water bath.',
		long: 'Food is sealed in a bag and cooked in a water bath at 63 °C (145 °F) for 2 hours.',
		steps: ['Seal the food in a bag.', 'Heat the water to 63 °C (145 °F).', 'Cook for 2 hours.'],
		diagramAlt: 'A sealed bag sitting in a water bath with a thermometer.'
	},
	poach: {
		name: 'Poach',
		short: 'Gently cooking food in hot liquid.',
		long: 'Food is gently cooked in liquid just below simmering.'
	},
	blanch: {
		name: 'Blanch',
		short: 'Briefly boiling food, then cooling it fast.',
		long: 'Food is dropped into boiling water for a short time and then chilled in ice water.'
	}
};

const FR_SOUS_VIDE = {
	id: 'sous-vide',
	name: 'Cuisson sous vide',
	short: "Cuire des aliments scellés dans un bain d'eau chauffé avec précision.",
	long: "Les aliments sont scellés dans un sachet et cuits au bain-marie à 63 °C (145 °F) pendant 2 heures.",
	steps: ["Sceller l'aliment dans un sachet.", "Chauffer l'eau à 63 °C (145 °F).", 'Cuire pendant 2 heures.'],
	diagramAlt: "Un sachet scellé plongé dans un bain d'eau avec un thermomètre."
};
const FR_POACH = {
	id: 'poach',
	name: 'Pocher',
	short: 'Cuire doucement un aliment dans un liquide chaud.',
	long: "L'aliment cuit doucement dans un liquide juste en dessous de l'ébullition."
};
const JA_POACH = {
	id: 'poach',
	name: 'ポーチ',
	short: '熱い液体の中で食材をやさしく加熱すること。',
	long: '沸騰の少し手前の液体で、食材をゆっくりと加熱します。'
};

const makeData = (contentByLang = {}) => ({
	terms: clone(TERMS),
	diagrams: clone(DIAGRAMS),
	contentByLang: { en: clone(EN), ...clone(contentByLang) }
});
const check = (lang, batch, data = makeData(), overwrite = false) =>
	checkBatch({ lang, batch: clone(batch), data, overwrite });

describe('checkBatch happy path', () => {
	it('accepts a valid batch and strips ids from the entries', () => {
		const { errors, entries } = check('fr', [FR_POACH, FR_SOUS_VIDE]);
		expect(errors).toEqual([]);
		expect([...entries.keys()]).toEqual(['poach', 'sous-vide']);
		expect(entries.get('poach')).toEqual({
			name: 'Pocher',
			short: FR_POACH.short,
			long: FR_POACH.long
		});
	});
});

describe('checkBatch rejections', () => {
	it('rejects the English language', () => {
		expect(byRule(check('en', [FR_POACH]).errors)).toEqual(['-:lang']);
	});

	it('rejects an unsupported language', () => {
		expect(byRule(check('xx', [FR_POACH]).errors)).toEqual(['-:lang']);
	});

	it('rejects a non-array, an empty batch and rows without an id', () => {
		expect(byRule(check('fr', { id: 'poach' }).errors)).toEqual(['-:batch']);
		expect(byRule(check('fr', []).errors)).toEqual(['-:batch']);
		expect(byRule(check('fr', [{ name: 'x' }]).errors)).toEqual(['-:batch']);
	});

	it('rejects an unknown id and does not accept the rest', () => {
		const { errors, entries } = check('fr', [FR_POACH, { ...FR_POACH, id: 'poachh' }]);
		expect(byRule(errors)).toEqual(['poachh:unknown-id']);
		expect(entries.size).toBe(0);
	});

	it('rejects duplicate ids within the batch', () => {
		expect(byRule(check('fr', [FR_POACH, FR_POACH]).errors)).toEqual(['poach:duplicate-id']);
	});

	it('rejects Latin text submitted for ja', () => {
		const bad = { ...FR_POACH, name: 'Pochi', short: EN.poach.short + ' x', long: EN.poach.long + ' x' };
		const e = check('ja', [bad]).errors;
		expect(e.every((x) => x.rule === 'target-script')).toBe(true);
		expect(e.length).toBe(3);
	});

	it('rejects a digit mismatch (63 vs 36)', () => {
		const bad = { ...FR_SOUS_VIDE, long: FR_SOUS_VIDE.long.replace('63', '36') };
		const e = check('fr', [bad]).errors;
		expect(byRule(e)).toEqual(['sous-vide:digit-mismatch']);
		expect(e[0].message).toContain('36');
		expect(e[0].message).toContain('63');
	});

	it('rejects a step-count mismatch', () => {
		const bad = { ...FR_SOUS_VIDE, steps: FR_SOUS_VIDE.steps.slice(0, 2) };
		const r = byRule(check('fr', [bad]).errors);
		expect(r).toContain('sous-vide:steps-count');
	});

	it('rejects a missing diagramAlt; steps on a term without a diagram are allowed', () => {
		const noAlt = { ...FR_SOUS_VIDE };
		delete noAlt.diagramAlt;
		expect(byRule(check('fr', [noAlt]).errors)).toEqual(['sous-vide:diagram-alt']);
		expect(byRule(check('fr', [{ ...FR_POACH, steps: ['Un.'] }]).errors)).not.toContain('poach:steps-unexpected');
	});

	it('rejects text copied from English', () => {
		const bad = { ...FR_POACH, short: EN.poach.short, long: EN.poach.long };
		expect(byRule(check('fr', [bad]).errors)).toEqual(['poach:copied-from-english', 'poach:copied-from-english']);
	});

	it.each([
		['angle brackets', 'Cuire <b>doucement</b> un aliment.'],
		['bold markers', 'Cuire **doucement** un aliment.'],
		['backtick', 'Cuire `doucement` un aliment.'],
		['literal backslash-n', 'Cuire doucement\\nun aliment dans un liquide.']
	])('rejects %s', (_n, short) => {
		const r = byRule(check('fr', [{ ...FR_POACH, short }]).errors);
		expect(r.some((x) => x === 'poach:markup' || x === 'poach:literal-backslash-n')).toBe(true);
	});

	it('rejects a long identical to another language', () => {
		const data = makeData({ it: { poach: { name: 'Sbollentare', short: 'Cuocere piano.', long: FR_POACH.long } } });
		expect(byRule(check('fr', [FR_POACH], data).errors)).toEqual(['poach:copied-from-language']);
	});

	it('rejects unknown fields instead of ignoring them', () => {
		expect(byRule(check('fr', [{ ...FR_POACH, category: 'moist-heat' }]).errors)).toEqual(['poach:unknown-field']);
	});

	it('rejects already-present terms unless overwrite', () => {
		const data = makeData({ fr: { poach: normalizeEntry(FR_POACH) } });
		expect(byRule(check('fr', [FR_POACH], data).errors)).toEqual(['poach:already-present']);
		expect(check('fr', [FR_POACH], data, true).errors).toEqual([]);
	});

	it('lets an existing invalid entry be replaced without overwrite', () => {
		const stale = { ...normalizeEntry(FR_POACH), short: EN.poach.short };
		const data = makeData({ fr: { poach: stale } });
		expect(check('fr', [FR_POACH], data).errors).toEqual([]);
	});

	it('rejects the whole batch when one term is bad', () => {
		const bad = { ...FR_SOUS_VIDE, long: FR_SOUS_VIDE.long.replace('63', '36') };
		const { errors, entries } = check('fr', [FR_POACH, bad]);
		expect(errors).toHaveLength(1);
		expect(entries.size).toBe(0);
	});
});

describe('mergeBatch and serialization', () => {
	it('merges in terms.json order regardless of arrival order', () => {
		const existing = { blanch: { name: 'Blanchir', short: 'x', long: 'y' } };
		const entries = new Map([
			['poach', normalizeEntry(FR_POACH)],
			['sous-vide', normalizeEntry(FR_SOUS_VIDE)]
		]);
		const merged = mergeBatch({ terms: TERMS, existing, entries });
		expect(Object.keys(merged)).toEqual(['sous-vide', 'poach', 'blanch']);
	});

	it('keeps stray keys at the end rather than deleting them', () => {
		const merged = mergeBatch({ terms: TERMS, existing: { zzz: { name: 'z' } }, entries: new Map() });
		expect(Object.keys(merged)).toEqual(['zzz']);
	});

	it('is idempotent', () => {
		const entries = new Map([['poach', normalizeEntry(FR_POACH)]]);
		const once = mergeBatch({ terms: TERMS, existing: {}, entries });
		const twice = mergeBatch({ terms: TERMS, existing: once, entries });
		expect(serializeContent(twice)).toBe(serializeContent(once));
	});

	it('serializes with 2-space indent, LF, trailing newline and a stable key order', () => {
		const out = serializeContent({ poach: normalizeEntry({ long: 'l', short: 's', name: 'n', id: 'poach' }) });
		expect(out).toBe('{\n  "poach": {\n    "name": "n",\n    "short": "s",\n    "long": "l"\n  }\n}\n');
		expect(out).not.toContain('\r');
	});
});

describe('pendingTerms and buildBatchRow', () => {
	it('lists missing and invalid terms in terms order', () => {
		const broken = { ...normalizeEntry(FR_POACH), short: EN.poach.short };
		const data = makeData({ fr: { poach: broken, blanch: { name: 'Blanchir', short: 'Plonger brièvement dans l\'eau bouillante.', long: "L'aliment est plongé quelques instants dans l'eau bouillante puis refroidi dans de l'eau glacée." } } });
		const pending = pendingTerms({ lang: 'fr', data, content: data.contentByLang.fr });
		expect([...pending.keys()]).toEqual(['sous-vide', 'poach']);
		expect(pending.get('sous-vide').missing).toBe(true);
		expect(pending.get('poach').missing).toBe(false);
		expect(pending.get('poach').issues[0].rule).toBe('copied-from-english');
	});

	it('builds the agent-facing row with related names and diagram marks', () => {
		const row = buildBatchRow({ term: TERMS[0], data: makeData() });
		expect(row).toMatchObject({
			id: 'sous-vide',
			category: 'modernist',
			related_names: ['Poach'],
			diagram_marks: 3,
			en: { name: 'Sous vide', tips: null }
		});
		expect(buildBatchRow({ term: TERMS[1], data: makeData() }).diagram_marks).toBeNull();
	});
});

describe('loadGlossaryData / writeContent', () => {
	it('reads a partial dataset and round-trips content', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'glossary-lib-'));
		try {
			expect(loadGlossaryData(root)).toMatchObject({ terms: [], diagrams: [], contentByLang: {} });
			writeFileSync(path.join(root, 'terms.json'), JSON.stringify(TERMS));
			mkdirSync(path.join(root, 'content'));
			writeContent(root, 'fr', { poach: normalizeEntry(FR_POACH) });
			const data = loadGlossaryData(root);
			expect(data.terms).toHaveLength(3);
			expect(Object.keys(data.contentByLang)).toEqual(['fr']);
			const raw = readFileSync(path.join(root, 'content', 'fr.json'), 'utf8');
			expect(raw.endsWith('}\n')).toBe(true);
			expect(raw.charCodeAt(0)).toBe(0x7b);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('names the file when JSON is invalid', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'glossary-lib-'));
		try {
			writeFileSync(path.join(root, 'terms.json'), '{oops');
			expect(() => loadGlossaryData(root)).toThrow(/terms\.json/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
