import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	CATEGORY_IDS,
	MAX_SHORT,
	REQUIRE_COMPLETE_LANGS,
	digitRuns,
	formatIssue,
	missingIds,
	validateAll,
	validateCompleteness,
	validateLangContent,
	validateStructure
} from './glossary_gate.mjs';
import { SUPPORTED_LANGS } from './langs.mjs';

const clone = (v) => structuredClone(v);
const rules = (issues) => issues.map((i) => i.rule);

const TERMS = [
	{
		id: 'sous-vide',
		en: 'Sous vide',
		category: 'modernist',
		aliases: ['vacuum cooking'],
		related: ['poach'],
		diagram: 'sous-vide'
	},
	{ id: 'poach', en: 'Poach', category: 'moist-heat', aliases: [], related: ['sous-vide'] }
];
const DIAGRAMS = [{ id: 'sous-vide', marks: 3, directional: false, drawn: true }];

const EN = {
	'sous-vide': {
		name: 'Sous vide',
		short: 'Cooking sealed food in a precisely heated water bath.',
		long: 'Food is sealed in a bag and cooked in a water bath at 57 °C (135 °F) for 2 hours.\n\nThe low, steady heat keeps the texture even.',
		steps: ['Seal the food in a bag.', 'Heat the water to 57 °C (135 °F).', 'Cook for 2 hours.'],
		tips: ['Chill quickly after cooking.'],
		aliases: ['vacuum cooking'],
		diagramAlt: 'A sealed bag sitting in a water bath with a thermometer.'
	},
	poach: {
		name: 'Poach',
		short: 'Gently cooking food in hot liquid.',
		long: 'Food is gently cooked in liquid just below simmering.'
	}
};

const FR = {
	'sous-vide': {
		name: 'Cuisson sous vide',
		short: "Cuire des aliments scellés dans un bain d'eau chauffé avec précision.",
		long: "Les aliments sont scellés dans un sachet et cuits au bain-marie à 57 °C (135 °F) pendant 2 heures.\n\nLa chaleur basse et constante garde une texture homogène.",
		steps: ["Sceller l'aliment dans un sachet.", "Chauffer l'eau à 57 °C (135 °F).", 'Cuire pendant 2 heures.'],
		tips: ['Refroidir rapidement après la cuisson.'],
		diagramAlt: "Un sachet scellé plongé dans un bain d'eau avec un thermomètre."
	},
	poach: {
		name: 'Pocher',
		short: 'Cuire doucement un aliment dans un liquide chaud.',
		long: "L'aliment cuit doucement dans un liquide juste en dessous de l'ébullition."
	}
};

const JA = {
	'sous-vide': {
		name: '真空低温調理',
		short: '密封した食品を正確に温めた湯せんで調理する方法。',
		long: '食品を袋に密封し、57 °C (135 °F) の湯せんで2時間調理します。\n\n低く安定した熱で、食感が均一に仕上がります。',
		steps: ['食品を袋に密封する。', '水を57 °C (135 °F)に温める。', '2時間調理する。'],
		tips: ['調理後はすぐに冷やす。'],
		diagramAlt: '温度計を差した湯せんの中に、密封された袋が入っている。'
	},
	poach: {
		name: 'ポーチ',
		short: '熱い液体の中で食材をやさしく加熱すること。',
		long: '沸騰の少し手前の液体で、食材をゆっくりと加熱します。'
	}
};

const PNB = {
	poach: {
		name: 'پوچ',
		short: 'گرم پانی وچ ہولی ہولی پکانا۔',
		long: 'کھانا ابلنے توں تھوڑا ہیٹھاں پانی وچ ہولی ہولی پکایا جاندا ہے۔'
	}
};

const baseStructure = () => ({
	terms: clone(TERMS),
	diagrams: clone(DIAGRAMS),
	contentByLang: { en: clone(EN) },
	diagramFileExists: () => true
});

const lang = (code, content, extra = {}) =>
	validateLangContent({ lang: code, terms: TERMS, en: EN, content, ...extra });

describe('CATEGORY_IDS', () => {
	it('matches the list in src/lib/glossary/types.ts', () => {
		const ts = readFileSync(
			fileURLToPath(new URL('../../src/lib/glossary/types.ts', import.meta.url)),
			'utf8'
		);
		const block = ts.match(/CATEGORY_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
		expect(block).not.toBeNull();
		const parsed = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
		expect(CATEGORY_IDS).toEqual(parsed);
		expect(CATEGORY_IDS).toHaveLength(11);
	});
});

describe('validateStructure', () => {
	it('accepts a well-formed dataset', () => {
		expect(validateStructure(baseStructure())).toEqual([]);
	});

	it('accepts empty data', () => {
		expect(validateStructure({ terms: [], diagrams: [], contentByLang: {} })).toEqual([]);
	});

	it('rejects non-kebab, duplicate and reserved ids', () => {
		const s = baseStructure();
		s.terms.push({ ...clone(TERMS[1]), id: 'Bad_Id' });
		s.terms.push({ ...clone(TERMS[1]), id: 'poach' });
		s.terms.push({ ...clone(TERMS[1]), id: 'constructor' });
		const r = rules(validateStructure(s));
		expect(r).toContain('id-format');
		expect(r).toContain('id-unique');
		expect(r).toContain('id-reserved');
	});

	it('rejects an unknown category', () => {
		const s = baseStructure();
		s.terms[1].category = 'desserts';
		expect(rules(validateStructure(s))).toEqual(['category']);
	});

	it('rejects bad related lists: missing, self, duplicate, too many', () => {
		const s = baseStructure();
		s.terms[1].related = ['ghost', 'poach', 'sous-vide', 'sous-vide'];
		const msgs = validateStructure(s).map((i) => i.message);
		expect(msgs.some((m) => m.includes('does not exist'))).toBe(true);
		expect(msgs.some((m) => m.includes('itself'))).toBe(true);
		expect(msgs.some((m) => m.includes('duplicate'))).toBe(true);

		const many = baseStructure();
		for (let i = 0; i < 7; i++) many.terms.push({ id: `t${i}`, en: `T${i}`, category: 'dry-heat', aliases: [], related: [] });
		many.terms[1].related = many.terms.slice(2).map((t) => t.id);
		expect(validateStructure(many).some((i) => i.message.includes('limit 6'))).toBe(true);
	});

	it('rejects a diagram reference missing from diagrams.json', () => {
		const s = baseStructure();
		s.terms[1].diagram = 'nope';
		expect(rules(validateStructure(s))).toContain('diagram-ref');
	});

	it('requires a component file for drawn diagrams only', () => {
		const s = baseStructure();
		s.diagramFileExists = () => false;
		expect(rules(validateStructure(s))).toEqual(['diagram-file']);
		s.diagrams[0].drawn = false;
		expect(validateStructure(s)).toEqual([]);
	});

	it('rejects content keys that are not term ids and unsupported languages', () => {
		const s = baseStructure();
		s.contentByLang.en.ghost = clone(EN.poach);
		s.contentByLang.xx = {};
		const r = validateStructure(s);
		expect(r.find((i) => i.rule === 'unknown-id')).toMatchObject({ lang: 'en', id: 'ghost' });
		expect(r.find((i) => i.rule === 'unknown-lang')).toMatchObject({ lang: 'xx' });
	});

	it('rejects empty strings and empty arrays anywhere in an entry', () => {
		const s = baseStructure();
		s.contentByLang.en['sous-vide'].steps[1] = '  ';
		s.contentByLang.en['sous-vide'].tips = [];
		s.contentByLang.en.poach.long = '';
		const r = validateStructure(s).filter((i) => i.rule === 'empty');
		expect(r.map((i) => i.message).join('|')).toMatch(/steps\[1\].*tips.*long/);
	});

	it.each([
		['angle bracket', 'Use <b>bold</b>'],
		['bold markers', 'Use **bold** text'],
		['underscore markers', 'Use __bold__ text'],
		['backtick', 'Use `code` here'],
		['heading', 'First line\n# Heading'],
		['list marker', 'Intro\n- item one'],
		['literal backslash-n', 'Line one\\nLine two']
	])('rejects %s in long text', (_name, long) => {
		const s = baseStructure();
		s.contentByLang.en.poach.long = long;
		expect(rules(validateStructure(s)).some((r) => r === 'markup' || r === 'literal-backslash-n')).toBe(true);
	});

	it('allows real newlines and a mid-line hyphen', () => {
		const s = baseStructure();
		s.contentByLang.en.poach.long = 'A well-known method.\n\nSecond paragraph, 5-6 minutes.';
		expect(validateStructure(s)).toEqual([]);
	});

	it(`rejects short longer than ${MAX_SHORT} chars`, () => {
		const s = baseStructure();
		s.contentByLang.en.poach.short = 'x'.repeat(MAX_SHORT + 1);
		expect(rules(validateStructure(s))).toEqual(['short-length']);
		s.contentByLang.en.poach.short = 'x'.repeat(MAX_SHORT);
		expect(validateStructure(s)).toEqual([]);
	});

	it('requires steps.length to equal diagram marks', () => {
		const s = baseStructure();
		s.contentByLang.en['sous-vide'].steps.pop();
		expect(validateStructure(s)).toEqual([
			expect.objectContaining({ rule: 'steps-count', lang: 'en', id: 'sous-vide' })
		]);
	});

	it('requires steps and diagramAlt for diagrammed terms, forbids them otherwise', () => {
		const s = baseStructure();
		delete s.contentByLang.en['sous-vide'].diagramAlt;
		delete s.contentByLang.en['sous-vide'].steps;
		expect(rules(validateStructure(s)).sort()).toEqual(['diagram-alt', 'steps-count']);

		const t = baseStructure();
		t.contentByLang.en.poach.steps = ['one'];
		t.contentByLang.en.poach.diagramAlt = 'a drawing';
		expect(rules(validateStructure(t)).sort()).toEqual(['diagram-alt']);
	});

	it('requires the English name to equal terms.json en', () => {
		const s = baseStructure();
		s.contentByLang.en.poach.name = 'Poaching';
		expect(rules(validateStructure(s))).toEqual(['en-name']);
	});

	it('rejects unknown fields', () => {
		const s = baseStructure();
		s.contentByLang.en.poach.category = 'moist-heat';
		expect(rules(validateStructure(s))).toEqual(['unknown-field']);
	});
});

describe('validateLangContent', () => {
	it('accepts good French and Japanese', () => {
		expect(lang('fr', clone(FR))).toEqual([]);
		expect(lang('ja', clone(JA))).toEqual([]);
	});

	it('does nothing for en', () => {
		expect(lang('en', clone(EN))).toEqual([]);
	});

	it('flags English unit words left in prose but not accented look-alikes', () => {
		const fr = clone(FR);
		fr.poach.long = 'Les aliments cuisent doucement dans une cup de liquide.';
		expect(rules(lang('fr', fr))).toContain('english-leftover');

		const ok = clone(FR);
		ok.poach.long = 'Récupérez les aliments cuits doucement dans le liquide.';
		expect(rules(lang('fr', ok))).not.toContain('english-leftover');
	});

	it('pins one decimal separator per language', () => {
		const comma = (code, extra) => {
			const c = clone(code === 'fr' ? FR : JA);
			c.poach.short = `Cuire à 0${extra}5 pour cent.`;
			return rules(lang(code, c));
		};
		expect(comma('fr', '.')).toContain('decimal-separator');
		expect(comma('fr', ',')).not.toContain('decimal-separator');
		expect(comma('ja', ',')).toContain('decimal-separator');
		expect(comma('ja', '.')).not.toContain('decimal-separator');
	});

	it('flags English text submitted for a non-Latin language', () => {
		const ja = clone(JA);
		ja.poach.short = EN.poach.short;
		ja.poach.long = EN.poach.long;
		const r = lang('ja', ja);
		expect(r.filter((i) => i.rule === 'target-script').map((i) => i.message)).toEqual([
			expect.stringContaining('short'),
			expect.stringContaining('long')
		]);
	});

	it('flags a Latin name for ja but allows a loanword equal to the English name', () => {
		const ja = clone(JA);
		ja.poach.name = 'Pochi';
		expect(rules(lang('ja', ja))).toEqual(['target-script']);
		ja.poach.name = 'Poach';
		expect(lang('ja', ja)).toEqual([]);
	});

	it('accepts kanji-only Japanese names and Shahmukhi names without pnb-only letters', () => {
		const ja = clone(JA);
		ja.poach.name = '燻製';
		expect(lang('ja', ja)).toEqual([]);
		expect(lang('pnb', clone(PNB))).toEqual([]);
	});

	it('flags English copied through for Latin-script languages', () => {
		const fr = clone(FR);
		fr.poach.short = EN.poach.short;
		fr['sous-vide'].long = EN['sous-vide'].long;
		fr['sous-vide'].steps[0] = EN['sous-vide'].steps[0];
		const r = lang('fr', fr);
		expect(r.filter((i) => i.rule === 'copied-from-english').map((i) => `${i.id}:${i.message}`)).toEqual([
			'sous-vide:long is identical to the English text',
			'sous-vide:steps[0] is identical to the English text',
			'poach:short is identical to the English text'
		]);
	});

	it('does not compare names against English (Sauté stays Sauté)', () => {
		const fr = clone(FR);
		fr.poach.name = 'Poach';
		expect(lang('fr', fr)).toEqual([]);
	});

	it('flags a digit mismatch, including transposed digits', () => {
		const fr = clone(FR);
		fr['sous-vide'].long = fr['sous-vide'].long.replace('57', '75');
		expect(rules(lang('fr', fr))).toEqual(['digit-mismatch']);

		const swapped = clone(FR);
		swapped['sous-vide'].steps[1] = swapped['sous-vide'].steps[1].replace('135', '153');
		expect(rules(lang('fr', swapped))).toEqual(['digit-mismatch']);
	});

	it('flags non-Western digits', () => {
		const ja = clone(JA);
		ja['sous-vide'].steps[2] = '２時間調理する。';
		const r = rules(lang('ja', ja));
		expect(r).toContain('digits');
		expect(r).toContain('digit-mismatch');
	});

	it('flags steps and tips count differences', () => {
		const fr = clone(FR);
		fr['sous-vide'].steps.shift();
		fr['sous-vide'].tips.push('Une astuce de trop.');
		expect(rules(lang('fr', fr)).sort()).toEqual(['steps-count', 'tips-count']);
		expect(lang('fr', fr).every((i) => i.id === 'sous-vide')).toBe(true);
	});

	it('flags degenerate lengths', () => {
		const fr = clone(FR);
		fr.poach.long = 'Oui.';
		expect(rules(lang('fr', fr))).toEqual(['length-ratio']);
	});

	it('loosens the length floor for CJK only', () => {
		const en = { ...EN, poach: { ...EN.poach, long: 'a'.repeat(100) } };
		const ja = clone(JA);
		ja.poach.long = 'あ'.repeat(12);
		expect(validateLangContent({ lang: 'ja', terms: TERMS, en, content: ja }).map((i) => i.rule)).toEqual([]);
		const fr = clone(FR);
		fr.poach.long = 'a'.repeat(12);
		expect(validateLangContent({ lang: 'fr', terms: TERMS, en, content: fr }).map((i) => i.rule)).toEqual([
			'length-ratio'
		]);
	});

	it('flags a long text copied from another language', () => {
		const fr = clone(FR);
		const it_ = clone(FR);
		it_.poach.name = 'Sbollentare';
		const r = lang('fr', fr, { allContentByLang: { fr, it: it_ } });
		expect(r).toEqual([
			expect.objectContaining({ rule: 'copied-from-language', id: 'sous-vide' }),
			expect.objectContaining({ rule: 'copied-from-language', id: 'poach' })
		]);
		expect(r[0].message).toContain('it');
	});

	it('reports missing English source and ignores unknown ids', () => {
		const fr = clone(FR);
		const en = { poach: EN.poach };
		expect(validateLangContent({ lang: 'fr', terms: TERMS, en, content: fr }).map((i) => `${i.id}:${i.rule}`)).toEqual([
			'sous-vide:missing-english'
		]);
		expect(lang('fr', { ghost: fr.poach })).toEqual([]);
	});

	it('tolerates malformed entries (shape rules report those)', () => {
		expect(() => lang('fr', { poach: { name: 5, short: null, long: [], steps: 'x' } })).not.toThrow();
	});
});

describe('digitRuns', () => {
	it('returns sorted digit runs and tells 63 from 36', () => {
		expect(digitRuns('at 63 °C then 2 min')).toEqual(['2', '63']);
		expect(digitRuns('at 36 °C then 2 min')).not.toEqual(digitRuns('at 63 °C then 2 min'));
	});
});

describe('completeness', () => {
	it('lists missing ids in terms order', () => {
		expect(missingIds(TERMS, { poach: {} })).toEqual(['sous-vide']);
		expect(missingIds(TERMS, undefined)).toEqual(['sous-vide', 'poach']);
	});

	it('reports one issue per incomplete language', () => {
		const issues = validateCompleteness({
			terms: TERMS,
			contentByLang: { en: EN, fr: { poach: FR.poach } },
			langs: ['en', 'fr', 'ja']
		});
		expect(issues.map((i) => i.lang)).toEqual(['fr', 'ja']);
		expect(issues[0].message).toContain('sous-vide');
	});

	it('only requires English at this stage and uses real language codes', () => {
		expect(REQUIRE_COMPLETE_LANGS).toContain('en');
		for (const l of REQUIRE_COMPLETE_LANGS) expect(SUPPORTED_LANGS).toContain(l);
	});
});

describe('validateAll / formatIssue', () => {
	it('combines structural and per-language issues', () => {
		const s = baseStructure();
		s.contentByLang.fr = clone(FR);
		s.contentByLang.fr.poach.short = EN.poach.short;
		const issues = validateAll(s);
		expect(issues.map(formatIssue)).toEqual([
			'fr poach: [copied-from-english] short is identical to the English text'
		]);
	});
});
