import { describe, it, expect } from 'vitest';
import { substitutionsFor } from './substitutions';

describe('substitutionsFor', () => {
	it('suggests a substitute for an ingredient present in the recipe', () => {
		const result = substitutionsFor(['butter', 'flour', 'sugar']);
		expect(result).toContainEqual({ from: 'butter', to: 'olive_oil', benefit: 'betterFats' });
	});

	it('never suggests a substitute that is already in the recipe', () => {
		// The recipe already has both butter and olive_oil — swapping one for the
		// other already-present ingredient would be a nonsensical tip.
		const result = substitutionsFor(['butter', 'olive_oil']);
		expect(result.some((r) => r.to === 'olive_oil')).toBe(false);
	});

	it('can return more than one substitute for the same source ingredient', () => {
		const result = substitutionsFor(['butter']);
		const targets = result.filter((r) => r.from === 'butter').map((r) => r.to);
		expect(targets).toEqual(expect.arrayContaining(['olive_oil', 'avocado', 'banana']));
	});

	it('returns [] when nothing in the recipe has a rule', () => {
		expect(substitutionsFor(['tomato', 'basil', 'garlic'])).toEqual([]);
	});

	it('returns [] for an empty ingredient list', () => {
		expect(substitutionsFor([])).toEqual([]);
	});

	it('deliberately excludes butter -> coconut_oil (not an actual improvement)', () => {
		const result = substitutionsFor(['butter']);
		expect(result.some((r) => r.to === 'coconut_oil')).toBe(false);
	});

	it('every benefit tag used maps to a real sub.* key family', () => {
		const result = substitutionsFor(['salt', 'butter', 'sugar', 'flour', 'vegetable_oil', 'cream',
			'heavy_cream', 'sour_cream', 'mayonnaise', 'rice', 'bacon', 'margarine']);
		const allowed = new Set([
			'lessSatFat', 'lessSugar', 'lessSalt', 'moreFibre', 'lessCalories', 'betterFats', 'dairyFree', 'inBaking'
		]);
		for (const tip of result) expect(allowed.has(tip.benefit), tip.benefit).toBe(true);
	});
});
