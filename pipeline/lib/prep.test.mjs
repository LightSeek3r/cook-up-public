import { describe, it, expect } from 'vitest';
import { stripPrepDescriptors } from './prep.mjs';

describe('stripPrepDescriptors', () => {
	it('strips a single trailing preparation word after a comma', () => {
		expect(stripPrepDescriptors('onion, finely chopped')).toBe('onion');
		expect(stripPrepDescriptors('garlic, minced')).toBe('garlic');
		expect(stripPrepDescriptors('tomatoes, diced')).toBe('tomatoes');
		expect(stripPrepDescriptors('flour, sifted')).toBe('flour');
	});

	it('strips a multi-word clause chained with "and"/"or"/"into"', () => {
		expect(stripPrepDescriptors('lemons, zested and juiced')).toBe('lemons');
		expect(stripPrepDescriptors('chicken breast, cut into pieces')).toBe('chicken breast');
		expect(stripPrepDescriptors('onion, split in half and toasted')).toBe('onion');
		expect(stripPrepDescriptors('basil, torn into small pieces')).toBe('basil');
		expect(stripPrepDescriptors('orange, sliced into thin rings')).toBe('orange');
	});

	it('strips the "to taste" / "as needed" / "as desired" idioms with or without a comma', () => {
		expect(stripPrepDescriptors('Salt to taste')).toBe('Salt');
		expect(stripPrepDescriptors('Salt, to taste')).toBe('Salt');
		expect(stripPrepDescriptors('onion, or to taste')).toBe('onion');
		expect(stripPrepDescriptors('pepper, as needed')).toBe('pepper');
	});

	it('strips a trailing "for X" clause, with or without a preceding comma', () => {
		expect(stripPrepDescriptors('Oil for deep frying')).toBe('Oil');
		expect(stripPrepDescriptors('Vegetable oil for brushing griddle')).toBe('Vegetable oil');
		expect(stripPrepDescriptors('bay leaf, for flavor')).toBe('bay leaf');
	});

	it('chains an idiom strip and a word-list clause strip on the same line without leaving a dangling comma', () => {
		// Regression: stripping " for garnish" first left a trailing "," that
		// the word-list loop couldn't then match (no letters after it).
		expect(stripPrepDescriptors('Fresh parsley or cilantro, chopped, for garnish')).toBe(
			'Fresh parsley or cilantro'
		);
		expect(stripPrepDescriptors('sugar, plus extra for dusting')).toBe('sugar');
	});

	it('room temperature / at room temperature both strip fully', () => {
		expect(stripPrepDescriptors('butter, room temperature')).toBe('butter');
		expect(stripPrepDescriptors('butter, at room temperature')).toBe('butter');
	});

	it('never strips text before the first comma, even if it looks like a prep word', () => {
		// "or" is prep vocabulary when it's part of a trailing clause, but here
		// it's a real either-or ingredient choice before any comma at all.
		expect(stripPrepDescriptors('Fresh parsley or cilantro, chopped')).toBe('Fresh parsley or cilantro');
	});

	it('leaves a line with no trailing comma-clause or idiom untouched', () => {
		expect(stripPrepDescriptors('Cooking spray')).toBe('Cooking spray');
		expect(stripPrepDescriptors('garlic')).toBe('garlic');
	});

	it('strips a single recognized leading word with no comma at all', () => {
		expect(stripPrepDescriptors('Ground crayfish')).toBe('crayfish');
		expect(stripPrepDescriptors('grated garlic')).toBe('garlic');
		expect(stripPrepDescriptors('warm water')).toBe('water');
		expect(stripPrepDescriptors('crushed tomatoes')).toBe('tomatoes');
	});

	it('never strips a leading word that describes a genuinely different product form', () => {
		// "fresh"/"dried"/"raw"/"frozen" change real nutrition per gram (dried
		// herbs are far more concentrated than fresh) — left alone rather than
		// guessed, same reasoning as "whole milk" below.
		expect(stripPrepDescriptors('fresh basil')).toBe('fresh basil');
		expect(stripPrepDescriptors('dried oregano')).toBe('dried oregano');
	});

	it('does not strip a descriptor that could carry real product identity, not just prep instruction', () => {
		// "whole" is deliberately excluded from the word list: "whole milk" is a
		// real, distinct product (fat content), not just a shape/prep word the
		// way "chopped"/"diced" always are — stripping it risks silently
		// collapsing a real nutritional distinction, so this is left unmatched
		// rather than guessed.
		expect(stripPrepDescriptors('milk, whole')).toBe('milk, whole');
	});

	it('handles null/empty input', () => {
		expect(stripPrepDescriptors(null)).toBe(null);
		expect(stripPrepDescriptors('')).toBe('');
	});
});
