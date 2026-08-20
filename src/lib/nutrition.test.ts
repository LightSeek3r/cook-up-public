import { describe, it, expect } from 'vitest';
import { nutritionVisible, highlightLevel, splitHighlights } from './nutrition';
import type { MicroNutrient } from './types';

describe('nutritionVisible', () => {
	it('is visible at exactly the 0.7 coverage threshold and above', () => {
		expect(nutritionVisible(0.7)).toBe(true);
		expect(nutritionVisible(1)).toBe(true);
	});

	it('is hidden just below the threshold', () => {
		expect(nutritionVisible(0.699)).toBe(false);
	});

	it('treats null/undefined as 0 (hidden), never as visible', () => {
		expect(nutritionVisible(null)).toBe(false);
		expect(nutritionVisible(undefined)).toBe(false);
	});
});

describe('highlightLevel', () => {
	it('is null below the 15% "source of" threshold', () => {
		expect(highlightLevel(14.9)).toBeNull();
		expect(highlightLevel(null)).toBeNull();
	});

	it('is "source" from 15% up to (not including) 30%', () => {
		expect(highlightLevel(15)).toBe('source');
		expect(highlightLevel(29.9)).toBe('source');
	});

	it('is "high" from 30% up', () => {
		expect(highlightLevel(30)).toBe('high');
		expect(highlightLevel(500)).toBe('high');
	});
});

describe('splitHighlights', () => {
	const micro = (key: string, pct: number | null): MicroNutrient => ({
		nutrient_key: key,
		amount: 1,
		unit: 'mg',
		pct_nrv: pct
	});

	it('partitions into high/source and drops anything below 15%', () => {
		const { high, source } = splitHighlights([
			micro('iron', 40),
			micro('zinc', 20),
			micro('folate', 10),
			micro('calcium', null)
		]);
		expect(high.map((m) => m.nutrient_key)).toEqual(['iron']);
		expect(source.map((m) => m.nutrient_key)).toEqual(['zinc']);
	});

	it('sorts each bucket descending by pct_nrv', () => {
		const { high } = splitHighlights([micro('a', 35), micro('b', 90), micro('c', 40)]);
		expect(high.map((m) => m.nutrient_key)).toEqual(['b', 'c', 'a']);
	});

	it('returns empty arrays for an empty input, not undefined', () => {
		expect(splitHighlights([])).toEqual({ high: [], source: [] });
	});
});
