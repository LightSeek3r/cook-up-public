import { describe, it, expect } from 'vitest';
import { PROCESSED_MARKER } from './seasons_gate.mjs';
import { TRIAGE_PROCESSED, suggestLike, triageKey } from './seasons_triage_rules.mjs';

const t = (canonical_key, category = 'other') => triageKey({ canonical_key, category });

describe('triageKey', () => {
	it('decides processed keys as all year, for every key the gate calls processed', () => {
		for (const key of ['dried_basil', 'ground_almonds', 'tomato_puree', 'apple_cider_vinegar', 'pickled_cucumber', 'maple_syrup']) {
			expect(t(key, 'vegetable')).toEqual({ ay: 'processed' });
		}
		for (const key of ['dried_x', 'x_powder', 'x_oil', 'smoked_x', 'canned_x', 'frozen_x']) {
			expect(PROCESSED_MARKER.test(key) && TRIAGE_PROCESSED.test(key)).toBe(true);
		}
	});

	it('decides pantry staples, farmed animals, generic and cultivated keys', () => {
		expect(t('salt', 'spice')).toEqual({ ay: 'staple' });
		expect(t('cinnamon', 'spice')).toEqual({ ay: 'traded' });
		expect(t('chicken', 'protein')).toEqual({ ay: 'farmed' });
		expect(t('fish', 'protein')).toEqual({ ay: 'generic' });
		expect(t('button_mushroom')).toEqual({ ay: 'cultivated' });
		expect(t('pasta', 'grain')).toEqual({ ay: 'processed' });
		expect(t('barley', 'grain')).toEqual({ ay: 'staple' });
		expect(t('cheddar', 'dairy')).toEqual({ ay: 'processed' });
		expect(t('basmati_rice')).toEqual({ ay: 'staple' });
	});

	it('routes fresh foods to writer families whatever their category', () => {
		expect(t('asparagus', 'vegetable')).toEqual({ family: 'produce', stage: 'write' });
		expect(t('parsley', 'spice')).toEqual({ family: 'herbs', stage: 'write' });
		expect(t('cep')).toEqual({ family: 'fungi_nuts', stage: 'write' });
		expect(t('chestnut', 'nut')).toEqual({ family: 'fungi_nuts', stage: 'write' });
		expect(t('herring', 'protein')).toEqual({ family: 'animal', stage: 'write' });
		expect(t('sweetcorn', 'grain')).toEqual({ family: 'produce', stage: 'write' });
	});

	it('sends judgement calls and unknown keys to classification, never to all year', () => {
		expect(t('ginger', 'spice')).toEqual({ family: 'herbs', stage: 'classify' });
		expect(t('goose', 'protein')).toEqual({ family: 'animal', stage: 'classify' });
		expect(t('mystery_thing')).toEqual({ family: 'produce', stage: 'classify' });
		expect(t('fava', 'legume')).toEqual({ family: 'produce', stage: 'classify' });
		expect(t('x', 'brand_new_category')).toEqual({ family: 'produce', stage: 'classify' });
	});
});

describe('suggestLike', () => {
	const pool = new Set(['basil', 'salmon', 'bell_pepper', 'tomato', 'broccoli']);
	const candidate = (k) => pool.has(k);
	it('uses GENERIC_PAIRS, then cut and plant-part affixes', () => {
		expect(suggestLike('fresh_basil', candidate)).toBe('basil');
		expect(suggestLike('red_bell_pepper', candidate)).toBe('bell_pepper');
		expect(suggestLike('salmon_fillet', candidate)).toBe('salmon');
		expect(suggestLike('broccoli_floret', candidate)).toBe('broccoli');
	});
	it('suggests nothing without a seasonal candidate', () => {
		expect(suggestLike('fresh_basil', () => false)).toBeUndefined();
		expect(suggestLike('asparagus', candidate)).toBeUndefined();
	});
});
