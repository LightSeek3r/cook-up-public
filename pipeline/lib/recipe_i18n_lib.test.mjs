import { describe, it, expect } from 'vitest';
import { checkBatch, coverage, docFrequency, MAX_BATCH, mergeEntries, nextBatch, recurringTerms } from './recipe_i18n_lib.mjs';
import { srcHash } from './recipe_i18n_store.mjs';

const RECIPES = [
	{ id: 1, title: 'Chicken Soup', instructions: '1. Boil the chicken for 40 minutes.\n2. Add salt.', cuisine: 'american', meal: 'dinner', ingredients: ['chicken'] },
	{ id: 2, title: 'Rhubarb Pie II', instructions: '1. Bake at 180 °C for 35 minutes.', cuisine: 'british', meal: 'dessert', ingredients: ['rhubarb', 'flour'] },
	{ id: 3, title: 'Tiramisu', instructions: '1. Layer the biscuits and the cream.\n2. Chill for 4 hours.', cuisine: 'italian', meal: 'dessert', ingredients: ['mascarpone'] }
];
const FR_TEXT = {
	1: '1. Faites bouillir le poulet 40 minutes.\n2. Salez.',
	2: '1. Faites cuire à 180 °C pendant 35 minutes.',
	3: '1. Alternez les biscuits et la crème.\n2. Réfrigérez 4 heures.'
};

/** A corpus as loadCorpus returns it, without any file. */
function corpus({ titles = {}, instructions = {} } = {}) {
	const map = (o) => Object.fromEntries(Object.entries(o).map(([lang, rows]) => [lang, new Map(rows.map((r) => [r.recipe_id, r]))]));
	return { recipes: new Map(RECIPES.map((r) => [r.id, r])), store: { titles: map(titles), instructions: map(instructions) } };
}
const frTexts = () =>
	RECIPES.map((r) => ({ recipe_id: r.id, instructions: FR_TEXT[r.id], is_machine: 1, src: srcHash(r.instructions), origin: 'backup', reviewed: false }));
const title = (id, t, extra = {}) => ({ recipe_id: id, title: t, src: srcHash(RECIPES.find((r) => r.id === id).title), origin: 'batch', reviewed: false, ...extra });
const errors = (result) => result.errors.map((e) => `${e.id ?? '-'}:${e.rule}`);

describe('docFrequency', () => {
	it('counts each word once per text', () => {
		expect(docFrequency(['Soup soup', 'soup and bread'])).toEqual(new Map([['soup', 2], ['and', 1], ['bread', 1]]));
	});
});

describe('nextBatch', () => {
	it('hands out missing recipes first, then invalid or stale ones, with context and previous issues', () => {
		const c = corpus({
			titles: { fr: [title(1, 'Soupe au poulet'), { ...title(2, 'Tarte à la rhubarbe'), src: 'old' }] },
			instructions: { fr: frTexts() }
		});
		const { rows, remaining, pending } = nextBatch({ corpus: c, kind: 'titles', lang: 'fr', n: 10 });
		expect(rows.map((r) => r.id)).toEqual([3, 2]);
		expect(remaining).toBe(2);
		expect(pending).toBe(2);
		expect(rows[0]).toEqual({ id: 3, en: 'Tiramisu', cuisine: 'italian', meal: 'dessert', ingredients: ['mascarpone'], first_step: 'Layer the biscuits and the cream.' });
		expect(rows[1].current).toBe('Tarte à la rhubarbe');
		expect(rows[1].previous_issues.join(' ')).toMatch(/\[stale\].*\[variant-numeral\]|\[variant-numeral\].*\[stale\]/);
	});

	it('hands a reviewer the valid entries nobody has reviewed, and instructions with their line count', () => {
		const c = corpus({ titles: { fr: [title(1, 'Soupe au poulet'), title(3, 'Tiramisu', { reviewed: true })] }, instructions: { fr: frTexts() } });
		expect(nextBatch({ corpus: c, kind: 'titles', lang: 'fr', n: 10, review: true }).rows.map((r) => [r.id, r.current])).toEqual([[1, 'Soupe au poulet']]);
		const texts = nextBatch({ corpus: c, kind: 'instructions', lang: 'bn', n: 2 });
		expect(texts.rows).toEqual([
			{ id: 1, en_title: 'Chicken Soup', lines: 2, en: RECIPES[0].instructions },
			{ id: 2, en_title: 'Rhubarb Pie II', lines: 1, en: RECIPES[1].instructions }
		]);
		expect(texts.remaining).toBe(3);
		expect(nextBatch({ corpus: c, kind: 'instructions', lang: 'bn', n: 5, ids: [3] }).rows.map((r) => r.id)).toEqual([3]);
	});
});

describe('checkBatch', () => {
	const base = () => corpus({ instructions: { fr: frTexts() } });

	it('accepts a good batch and builds store rows', () => {
		const result = checkBatch({
			corpus: base(),
			kind: 'titles',
			lang: 'fr',
			batch: [{ id: 1, title: 'Soupe au poulet' }, { id: 2, title: 'Tarte à la rhubarbe II' }, { id: 3, title: 'Tiramisu' }]
		});
		expect(result.errors).toEqual([]);
		expect(result.entries.get(2)).toEqual({ title: 'Tarte à la rhubarbe II', src: srcHash('Rhubarb Pie II'), origin: 'batch', reviewed: false });
	});

	it('rejects the whole batch with one message per problem', () => {
		const result = checkBatch({
			corpus: base(),
			kind: 'titles',
			lang: 'fr',
			batch: [
				{ id: 1, title: 'Soupe au poulet' },
				{ id: 2, title: 'Tarte à la rhubarbe' },
				{ id: 2, title: 'again' },
				{ id: 99, title: 'x' },
				{ id: 3, title: 'Tiramisu', note: 'mine' },
				{ title: 'no id' }
			]
		});
		expect(errors(result)).toEqual(['2:variant-numeral', '2:duplicate-id', '99:unknown-id', '3:unknown-field', '-:batch']);
		expect(result.entries.size).toBe(0);
	});

	it('refuses to replace a valid entry outside a review, and lets a pending one be replaced', () => {
		const c = corpus({ titles: { fr: [title(1, 'Soupe au poulet'), title(2, 'Tarte')] }, instructions: { fr: frTexts() } });
		const batch = [{ id: 1, title: 'Potage au poulet' }, { id: 2, title: 'Tarte à la rhubarbe II' }];
		expect(errors(checkBatch({ corpus: c, kind: 'titles', lang: 'fr', batch }))).toEqual(['1:already-present']);
		expect(checkBatch({ corpus: c, kind: 'titles', lang: 'fr', batch, overwrite: true }).errors).toEqual([]);
	});

	it('lets only a review keep an English title, with a reason, for exactly that title', () => {
		const c = corpus({ titles: { ja: [title(2, 'ルバーブパイ II')] } });
		const keep = [{ id: 2, title: 'Rhubarb Pie II', keep_source: 'the name of a British pudding' }];
		expect(errors(checkBatch({ corpus: corpus(), kind: 'titles', lang: 'ja', batch: keep }))).toEqual(['2:keep-source']);
		const reviewed = checkBatch({ corpus: c, kind: 'titles', lang: 'ja', batch: keep, review: true });
		expect(reviewed.errors).toEqual([]);
		expect(reviewed.entries.get(2)).toMatchObject({ title: 'Rhubarb Pie II', reviewed: true, keep: 'the name of a British pudding' });
		expect(errors(checkBatch({ corpus: c, kind: 'titles', lang: 'ja', batch: [{ id: 2, title: 'Rhubarb Pie', keep_source: 'because' }], review: true }))).toEqual(['2:keep-source']);
		expect(errors(checkBatch({ corpus: c, kind: 'titles', lang: 'ja', batch: [{ id: 1, title: 'チキンスープ' }], review: true }))).toEqual(['1:not-translated']);
	});

	it('holds instructions to the full gate and marks them machine-translated', () => {
		const ok = checkBatch({ corpus: base(), kind: 'instructions', lang: 'bn', batch: [{ id: 1, instructions: '1. মুরগি 40 মিনিট সেদ্ধ করুন।\n2. লবণ দিন।' }] });
		expect(ok.errors).toEqual([]);
		expect(ok.entries.get(1)).toMatchObject({ is_machine: 1, origin: 'batch', reviewed: false, src: srcHash(RECIPES[0].instructions) });
		const bad = checkBatch({
			corpus: base(),
			kind: 'instructions',
			lang: 'bn',
			batch: [{ id: 1, instructions: '1. মুরগি ৪০ মিনিট সেদ্ধ করুন। লবণ দিন।' }, { id: 2, instructions: RECIPES[1].instructions }, { id: 3, instructions: 7 }]
		});
		expect(errors(bad)).toEqual(['1:line-count', '1:digits', '1:digit-mismatch', '2:copied-from-english', '3:empty']);
	});

	it('refuses English, unknown languages and oversized batches', () => {
		expect(errors(checkBatch({ corpus: base(), kind: 'titles', lang: 'en', batch: [{ id: 1, title: 'x' }] }))).toEqual(['-:lang']);
		expect(errors(checkBatch({ corpus: base(), kind: 'titles', lang: 'fr', batch: [] }))).toEqual(['-:batch']);
		const big = Array.from({ length: MAX_BATCH.instructions + 1 }, (_, i) => ({ id: i, instructions: 'x' }));
		expect(errors(checkBatch({ corpus: base(), kind: 'instructions', lang: 'fr', batch: big }))).toEqual(['-:batch']);
	});
});

describe('coverage, merge and terms', () => {
	it('legacy instructions are pending only for the rules they were accepted under', () => {
		const texts = frTexts();
		texts[0] = { ...texts[0], instructions: '1. Faites bouillir le poulet 45 minutes.\n2. Salez.' };
		texts[1] = { ...texts[1], instructions: '1. Faites cuire à 180 °C pendant 35 minutes. Servez.\n2. Bon appétit.' };
		const states = coverage(corpus({ instructions: { fr: texts } }), 'instructions', 'fr');
		expect(states.map((s) => [s.id, s.blocking.map((i) => i.rule), s.advisory.map((i) => i.rule)])).toEqual([
			[1, [], ['digit-mismatch']],
			[2, ['line-count'], ['digit-mismatch']],
			[3, [], []]
		]);
	});

	it('merges entries over the existing rows', () => {
		const merged = mergeEntries(new Map([[1, { title: 'a' }], [2, { title: 'b' }]]), new Map([[2, { title: 'c' }]]));
		expect([...merged]).toEqual([[1, { title: 'a' }], [2, { title: 'c' }]]);
	});

	it('lists recurring English title words with the language titles that hold them', () => {
		const c = corpus({ titles: { fr: [title(1, 'Soupe au poulet')] } });
		const terms = recurringTerms(c, 'fr', { top: 3 });
		expect(terms.map((t) => t.word)).toEqual(['chicken', 'pie', 'rhubarb']);
		expect(terms[0].translated).toEqual([{ id: 1, en: 'Chicken Soup', title: 'Soupe au poulet' }]);
	});
});
