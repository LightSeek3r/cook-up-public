import { describe, it, expect } from 'vitest';
import { MANUAL_INGREDIENTS } from './manual_ingredients.mjs';

describe('MANUAL_INGREDIENTS', () => {
	it('every entry has at least one match pattern and an English name', () => {
		for (const [key, entry] of Object.entries(MANUAL_INGREDIENTS)) {
			expect(entry.matchPatterns.length, key).toBeGreaterThan(0);
			expect(entry.names.en, key).toBeTruthy();
		}
	});

	it('every entry declares category/allergens/vegan/vegetarian explicitly', () => {
		for (const [key, entry] of Object.entries(MANUAL_INGREDIENTS)) {
			expect(typeof entry.category, key).toBe('string');
			expect(Array.isArray(entry.allergens), key).toBe(true);
			expect(typeof entry.vegan, key).toBe('boolean');
			expect(typeof entry.vegetarian, key).toBe('boolean');
		}
	});

	it('vegan is never true when vegetarian is false (vegan implies vegetarian)', () => {
		for (const [key, entry] of Object.entries(MANUAL_INGREDIENTS)) {
			if (entry.vegan) expect(entry.vegetarian, key).toBe(true);
		}
	});

	it('oyster sauce is flagged with the real shellfish allergen', () => {
		expect(MANUAL_INGREDIENTS.oyster_sauce.allergens).toContain('shellfish');
	});

	it('manualNutrition, where present, has every macro field as a finite number', () => {
		const fields = ['kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg'];
		for (const [key, entry] of Object.entries(MANUAL_INGREDIENTS)) {
			if (!entry.manualNutrition) continue;
			for (const field of fields) {
				expect(Number.isFinite(entry.manualNutrition[field]), `${key}.${field}`).toBe(true);
			}
		}
	});
});
