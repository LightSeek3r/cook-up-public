import { describe, it, expect } from 'vitest';
import { ALLERGENS, CUISINES, DIETS, INGREDIENT_CATEGORIES, MEAL_TYPES } from '$lib/config';
import { EMOJI_KEYS, FALLBACK_EMOJI, emojiUrl, hasEmoji } from '$lib/emoji';
import { CATEGORY_ICON, INGREDIENT_ICON_KEYS, iconFor } from '$lib/ingredientIcon';
import {
	ALLERGEN_ICON,
	CUISINE_ICON,
	DIET_ICON,
	DIET_SLASHED,
	MEAL_ICON,
	allergenIcon,
	cuisineIcon,
	dietIcon,
	mealIcon
} from './index';

const TABLES = [
	['cuisine', CUISINES, cuisineIcon],
	['meal', MEAL_TYPES, mealIcon],
	['diet', DIETS, dietIcon],
	['allergen', ALLERGENS, allergenIcon]
] as const;

describe('meal, diet, cuisine and allergen icons', () => {
	it.each(TABLES)('every %s slug has its own entry with a file', (_name, slugs, lookup) => {
		for (const slug of slugs) {
			const key = lookup(slug);
			expect(key, slug).not.toBe(FALLBACK_EMOJI);
			expect(hasEmoji(key), `${slug} -> ${key}`).toBe(true);
		}
	});

	it('maps exactly the config vocabularies, nothing stale', () => {
		expect(Object.keys(CUISINE_ICON).sort()).toEqual([...CUISINES].sort());
		expect(Object.keys(MEAL_ICON).sort()).toEqual([...MEAL_TYPES].sort());
		expect(Object.keys(DIET_ICON).sort()).toEqual([...DIETS].sort());
		expect(Object.keys(ALLERGEN_ICON).sort()).toEqual([...ALLERGENS].sort());
	});

	it('every ingredient category resolves to a glyph with a file', () => {
		for (const category of INGREDIENT_CATEGORIES) {
			expect(hasEmoji(iconFor('', category)), category).toBe(true);
		}
	});

	it('slashes only real diets', () => {
		for (const diet of DIET_SLASHED) expect(DIETS).toContain(diet);
	});

	it('unknown and inherited slugs get the generic bowl, not undefined', () => {
		expect(cuisineIcon('atlantean')).toBe(FALLBACK_EMOJI);
		expect(mealIcon('toString')).toBe(FALLBACK_EMOJI);
	});
});

describe('src/lib/emoji', () => {
	const referenced = new Set<string>([
		FALLBACK_EMOJI,
		...INGREDIENT_ICON_KEYS,
		...Object.values(CATEGORY_ICON),
		...Object.values(MEAL_ICON),
		...Object.values(DIET_ICON),
		...Object.values(CUISINE_ICON),
		...Object.values(ALLERGEN_ICON)
	]);

	it('ships no Noto file that no table references', () => {
		const orphans = EMOJI_KEYS.filter((key) => !key.startsWith('x-') && !referenced.has(key));
		expect(orphans).toEqual([]);
	});

	it('names files by lowercase codepoint or x-<name>', () => {
		for (const key of EMOJI_KEYS) expect(key).toMatch(/^(?:[0-9a-f]{4,6}(?:-[0-9a-f]{4,6})*|x-[a-z]+)$/);
	});

	it('resolves every key to a URL, and an unknown key to the bowl', () => {
		for (const key of EMOJI_KEYS) expect(emojiUrl(key)).toBeTruthy();
		expect(emojiUrl('not-a-key')).toBe(emojiUrl(FALLBACK_EMOJI));
	});
});
