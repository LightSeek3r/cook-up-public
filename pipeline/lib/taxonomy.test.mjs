import { describe, it, expect } from 'vitest';
import {
	parseTaxonomy,
	matchIngredient,
	matchIngredientDetailed,
	ancestors,
	walkAnchors,
	walkProperty,
	slugify
} from './taxonomy.mjs';

describe('matchIngredientDetailed', () => {
	it('reports the word count of the phrase that actually matched', () => {
		// This number is the whole specificity signal: it is what lets a caller
		// prefer "tomato purée" over the bare "purée" a wikilink handed it.
		const t = parseTaxonomy(['en: purée, puree', '', 'en: tomato purée, tomato puree'].join('\n'));
		expect(matchIngredientDetailed('puree', t)).toEqual({ key: 'puree', words: 1 });
		expect(matchIngredientDetailed('tomato puree', t)).toEqual({ key: 'tomato_puree', words: 2 });
	});

	it('counts the singular it fell back to, not the plural it was given', () => {
		const t = parseTaxonomy('en: onion\n');
		expect(matchIngredientDetailed('onions', t)).toEqual({ key: 'onion', words: 1 });
	});

	it('handles the English plurals a bare trailing-s chop cannot', () => {
		// The previous rule chopped one "s", so "tomatoes" became "tomatoe" and
		// "-ies" / "-ves" never resolved at all — those words could only match if
		// the taxonomy happened to register the plural spelling too.
		const t = parseTaxonomy(
			['en: tomato', '', 'en: berry', '', 'en: leaf', '', 'en: peach', '', 'en: loaf'].join('\n')
		);
		expect(matchIngredient('tomatoes', t)).toBe('tomato');
		expect(matchIngredient('berries', t)).toBe('berry');
		expect(matchIngredient('leaves', t)).toBe('leaf');
		expect(matchIngredient('peaches', t)).toBe('peach');
		expect(matchIngredient('loaves', t)).toBe('loaf');
	});

	it('inflects only the head noun, which in English is the last word', () => {
		// "bay leaves" pluralises "leaf", not "bay" — a whole-slug rule would have
		// to get lucky.
		const t = parseTaxonomy(['en: bay leaf', '', 'en: cherry tomato'].join('\n'));
		expect(matchIngredient('bay leaves', t)).toBe('bay_leaf');
		expect(matchIngredient('cherry tomatoes', t)).toBe('cherry_tomato');
	});

	it('does not strip a genuine double-s ending', () => {
		const t = parseTaxonomy('en: watercress\n');
		expect(matchIngredient('watercress', t)).toBe('watercress');
	});

	it('agrees with matchIngredient, which is now defined in terms of it', () => {
		const t = parseTaxonomy('en: onion, onions\n');
		expect(matchIngredientDetailed('onion', t).key).toBe(matchIngredient('onion', t));
		expect(matchIngredientDetailed('nope_xyz', t)).toBeNull();
		expect(matchIngredient('nope_xyz', t)).toBeNull();
	});

	it('returns null for empty or null input', () => {
		const t = parseTaxonomy('en: onion\n');
		expect(matchIngredientDetailed('', t)).toBeNull();
		expect(matchIngredientDetailed(null, t)).toBeNull();
	});
});

describe('ancestors', () => {
	it('includes the node itself and every reachable ancestor', () => {
		const raw = ['en: pepper', '', '< en: pepper', 'en: black pepper', '', '< en: black pepper', 'en: black peppercorns'].join('\n');
		const t = parseTaxonomy(raw);
		expect([...ancestors('black_peppercorns', t)].sort()).toEqual([
			'black_pepper',
			'black_peppercorns',
			'pepper'
		]);
		expect(ancestors('pepper', t).has('black_pepper')).toBe(false);
	});

	it('is cycle-safe', () => {
		const raw = ['en: a', '< en: b', '', 'en: b', '< en: a'].join('\n');
		const t = parseTaxonomy(raw);
		expect(ancestors('a', t).has('b')).toBe(true);
	});
});

describe('parseTaxonomy + matchIngredient', () => {
	it('matches the primary English name and its listed synonyms', () => {
		const t = parseTaxonomy('en: onion, onions\n');
		expect(matchIngredient('onion', t)).toBe('onion');
	});

	it('never matches a non-English synonym — only "en:" lines feed the match index', () => {
		// Real bug, found via the real OFF taxonomy file: Croatian's word for
		// "yam" is literally "jam" (`hr: jam` under the `yam` entry). Indexing
		// every language into one shared namespace meant plain English "jam"
		// (the fruit preserve) silently resolved to "yam" (a root vegetable)
		// instead of its own entry, because "yam" happens to appear earlier in
		// the raw file and first-registrant wins a slug. `yam` here comes
		// first, exactly reproducing that ordering.
		const raw = ['en: yam', 'hr: jam', '', 'en: jam, confiture'].join('\n');
		const t = parseTaxonomy(raw);
		expect(matchIngredient('jam', t)).toBe('jam');
		expect(matchIngredient('yam', t)).toBe('yam');
	});

	it('still matches an "en:" synonym that happens to be a loanword ("confiture")', () => {
		const t = parseTaxonomy('en: jam, confiture\n');
		expect(matchIngredient('confiture', t)).toBe('jam');
	});

	it('applies a naive plural strip when the exact singular is registered but the plural is not', () => {
		const t = parseTaxonomy('en: onion, onions\n');
		expect(matchIngredient('onions', t)).toBe('onion');
	});

	it('returns null for unmatched, empty, or null input — never guesses', () => {
		const t = parseTaxonomy('en: onion\n');
		expect(matchIngredient('totally_unknown_xyz', t)).toBeNull();
		expect(matchIngredient('', t)).toBeNull();
		expect(matchIngredient(null, t)).toBeNull();
	});

	it('resolves a DAG parent by name so ancestor-walking works', () => {
		const raw = ['en: onion', '', '< en: onion', 'en: red onion, red onions'].join('\n');
		const t = parseTaxonomy(raw);
		expect(walkAnchors('red_onion', t, new Map([['onion', 'vegetable']]), ['vegetable'])).toBe('vegetable');
	});

	it('walkProperty finds the nearest ancestor that actually states the property', () => {
		const raw = ['en: onion', 'vegan:en: yes', '', '< en: onion', 'en: red onion'].join('\n');
		const t = parseTaxonomy(raw);
		// red_onion doesn't restate vegan:en itself — must walk up to onion.
		expect(walkProperty('red_onion', t, 'vegan')).toBe('yes');
	});
});

describe('slugify', () => {
	it('lowercases, strips diacritics, and collapses non-alphanumerics to underscores', () => {
		expect(slugify('Crème Fraîche')).toBe('creme_fraiche');
		expect(slugify('  Red Onion!! ')).toBe('red_onion');
	});
});
