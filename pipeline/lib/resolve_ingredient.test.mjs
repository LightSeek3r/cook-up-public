import { describe, it, expect } from 'vitest';
import { parseTaxonomy } from './taxonomy.mjs';
import { splitIngredientLine } from './measure.mjs';
import {
	resolveKey,
	candidateReadings,
	beats,
	matchWithOverrides,
	PREPARATION_FORMS
} from './resolve_ingredient.mjs';

/** The goulash case, reduced to the entries that actually matter: `purée` is a
 *  real OFF entry with no parent at all (a preparation, not a food), while
 *  `tomato purée` is a proper child of `tomato`. */
const TOMATO_TAXONOMY = parseTaxonomy(
	[
		'en: tomato, tomatoes',
		'',
		'en: purée, puree, mash',
		'vegan:en: maybe',
		'',
		'< en: tomato',
		'en: tomato purée, tomato puree, passata',
		'',
		'en: cup'
	].join('\n')
);

/** A pepper/salt fixture for the specificity-beats-position cases. */
const PEPPER_TAXONOMY = parseTaxonomy(
	[
		'en: pepper',
		'',
		'< en: pepper',
		'en: black pepper',
		'',
		'< en: black pepper',
		'en: black peppercorns',
		'',
		'en: lemon',
		'',
		'< en: lemon',
		'en: lemon juice'
	].join('\n')
);

const resolve = (line, links, taxonomy) =>
	resolveKey(line, links, splitIngredientLine(line), taxonomy);

describe('resolveKey — the goulash regression', () => {
	it('reads a name split across two wikilinks instead of taking only the last', () => {
		// `½ [[Cookbook:Cup|cup]] [[Cookbook:Tomato|tomato]] [[Cookbook:Puree|puree]]`
		// used to resolve to bare `puree`: the last-link heuristic returned
		// "Puree" and discarded "Tomato", and the first-hit-wins chain then
		// stopped before ever trying the line's own words.
		expect(resolve('½ cup tomato puree', ['Cup', 'Tomato', 'Puree'], TOMATO_TAXONOMY)).toBe(
			'tomato_puree'
		);
	});

	it('degrades to the best single link when the combined reading is not in the taxonomy', () => {
		// "pumpkin puree" isn't an OFF entry, so the individual links have to
		// stay in play — otherwise blacklisting `puree` would lose the line
		// entirely rather than falling back to something true.
		const t = parseTaxonomy(['en: pumpkin', '', 'en: purée, puree'].join('\n'));
		expect(resolve('1 can pumpkin puree', ['Pumpkin', 'Puree'], t)).toBe('pumpkin');
	});

	it('refuses a preparation form outright, so the failure is loud', () => {
		const t = parseTaxonomy('en: purée, puree\n');
		expect(resolve('75 g puree', ['Puree'], t)).toBeNull();
	});

	it('keeps every preparation form out of a resolved key', () => {
		// Guards the blacklist itself: each of these is a real OFF entry, so
		// without the refusal they match and win silently.
		for (const form of PREPARATION_FORMS) {
			const t = parseTaxonomy(`en: ${form}\n`);
			expect(resolve(`1 cup ${form}`, [form], t)).toBeNull();
		}
	});
});

describe('resolveKey — specificity beats position', () => {
	it("prefers the line's own words over a less specific link target", () => {
		expect(resolve('1 tsp black pepper', ['Pepper'], PEPPER_TAXONOMY)).toBe('black_pepper');
		expect(resolve('3 tbsp lemon juice', ['Lemon'], PEPPER_TAXONOMY)).toBe('lemon_juice');
	});

	it('prefers a descendant even when its phrase is shorter than the rival match', () => {
		// `ghee` (one word) sits below `clarified butter` (two). Word count alone
		// would pick the ancestor; taxonomy position must win.
		const t = parseTaxonomy(['en: clarified butter', '', '< en: clarified butter', 'en: ghee'].join('\n'));
		expect(resolve('1 tbsp ghee', ['Clarified Butter'], t)).toBe('ghee');
	});

	it('does not let an override onto a coarse key outrank a more specific match', () => {
		// SYNONYM_OVERRIDES maps the three-word "white granulated sugar" onto
		// bare `sugar` on purpose. Scoring that override by its *phrase* length
		// let it beat the two-word `granulated_sugar` whenever both were
		// reachable, quietly making 29 corpus lines less specific than before.
		// Taxonomy position has to decide instead.
		const t = parseTaxonomy(['en: sugar', '', '< en: sugar', 'en: granulated sugar'].join('\n'));
		expect(resolve('2 tbsp granulated sugar', ['Sugar'], t)).toBe('granulated_sugar');
		expect(
			beats({ key: 'granulated_sugar', words: 2 }, { key: 'sugar', words: 3 }, t)
		).toBe(true);
	});

	it('still lets an override coarsen a phrase the taxonomy does not carry', () => {
		// The flip side, and deliberate: "white granulated sugar" is not an OFF
		// entry, so the override is the only thing that resolves it at all. No
		// reading of this line yields `granulated_sugar`, and inventing sub-phrase
		// readings to find one would be exactly the fuzzy matching this pipeline
		// refuses elsewhere.
		const t = parseTaxonomy(['en: sugar', '', '< en: sugar', 'en: granulated sugar'].join('\n'));
		expect(resolve('½ cup white granulated sugar', ['Sugar'], t)).toBe('sugar');
	});

	it('falls back to the last link when nothing more specific matches', () => {
		// The original heuristic is still correct for the common shape, and must
		// keep working: units precede the ingredient, so the last link wins ties.
		const t = parseTaxonomy(['en: flour', '', 'en: cup'].join('\n'));
		expect(resolve('2 cups flour', ['Cup', 'Flour'], t)).toBe('flour');
	});

	it('resolves a line with no links at all from its own text', () => {
		expect(resolve('black pepper', [], PEPPER_TAXONOMY)).toBe('black_pepper');
	});

	it('returns null rather than guessing when no reading matches', () => {
		expect(resolve('2 sprigs of nothing-in-particular', [], PEPPER_TAXONOMY)).toBeNull();
	});
});

describe('candidateReadings', () => {
	it('offers the split name before any link, so it wins equally specific ties', () => {
		const readings = candidateReadings('2 cups flour', ['Cup', 'Flour'], {
			name: 'flour',
			quantity: 2,
			unit: 'cup'
		});
		expect(readings[0]).toBe('flour');
		expect(readings.indexOf('flour')).toBeLessThan(readings.indexOf('Flour'));
	});

	it('includes every contiguous run of links, longest first', () => {
		const readings = candidateReadings('x', ['Cup', 'Tomato', 'Puree'], { name: 'x' });
		expect(readings).toContain('Cup Tomato Puree');
		expect(readings).toContain('Tomato Puree');
		expect(readings).toContain('Cup Tomato');
		expect(readings.indexOf('Cup Tomato Puree')).toBeLessThan(readings.indexOf('Tomato Puree'));
	});

	it('orders individual links last-first, matching the unit-words-come-first rule', () => {
		const readings = candidateReadings('x', ['Cup', 'Flour'], { name: 'x' });
		expect(readings.indexOf('Flour')).toBeLessThan(readings.indexOf('Cup'));
	});

	it('drops empty readings and tolerates a missing split', () => {
		expect(candidateReadings('', [], {})).toEqual([]);
		expect(candidateReadings('salt', [], null)).toContain('salt');
	});
});

describe('beats', () => {
	const t = PEPPER_TAXONOMY;

	it('is false for the same key, so an incumbent is never replaced by itself', () => {
		expect(beats({ key: 'pepper', words: 5 }, { key: 'pepper', words: 1 }, t)).toBe(false);
	});

	it('prefers the descendant regardless of phrase length, in both argument orders', () => {
		expect(beats({ key: 'black_pepper', words: 1 }, { key: 'pepper', words: 9 }, t)).toBe(true);
		expect(beats({ key: 'pepper', words: 9 }, { key: 'black_pepper', words: 1 }, t)).toBe(false);
	});

	it('handles a grandchild, not just a direct child', () => {
		expect(beats({ key: 'black_peppercorns', words: 1 }, { key: 'pepper', words: 3 }, t)).toBe(true);
	});

	it('falls back to the longer matched phrase for unrelated keys', () => {
		expect(beats({ key: 'lemon_juice', words: 2 }, { key: 'pepper', words: 1 }, t)).toBe(true);
		expect(beats({ key: 'pepper', words: 1 }, { key: 'lemon_juice', words: 2 }, t)).toBe(false);
	});

	it('keeps the incumbent when unrelated keys tie, leaving trust order to decide', () => {
		expect(beats({ key: 'lemon', words: 1 }, { key: 'pepper', words: 1 }, t)).toBe(false);
	});
});

describe('parenthetical asides', () => {
	it('reads a line whose only content is a name plus an aside', () => {
		// No quantity and no unit, so splitIngredientLine's anchored strippers never
		// run and "(optional)" stayed part of the name.
		const t = parseTaxonomy('en: pine nut, pine nuts\n');
		expect(resolve('Pine nuts (optional)', [], t)).toBe('pine_nut');
	});

	it('reads a name that an aside splits in two', () => {
		// Removing the aside is what makes "taro leaves" contiguous at all.
		const t = parseTaxonomy(['en: taro', '', '< en: taro', 'en: taro leaves'].join('\n'));
		expect(resolve('12 taro (dasheen or callaloo) leaves', [], t)).toBe('taro_leaves');
	});

	it('handles a multi-unit conversion aside, which the old narrow pattern left behind', () => {
		const t = parseTaxonomy('en: caster sugar\n');
		expect(resolve('6 imperial tbsp (108 ml / 7.2 US tbsp) caster sugar', [], t)).toBe('caster_sugar');
	});

	it('prefers the primary ingredient over one named inside an aside', () => {
		// "margarine (or butter)" is a margarine line. The last-link heuristic used
		// to return the parenthesised substitute.
		const t = parseTaxonomy(['en: butter', '', 'en: margarine'].join('\n'));
		expect(resolve('⅓ cup margarine (or butter)', ['Butter'], t)).toBe('margarine');
	});
});

describe('suffix-anchored approximate matching', () => {
	const SUGAR = parseTaxonomy(['en: sugar', '', 'en: salt'].join('\n'));

	it('drops a qualifier the taxonomy does not carry', () => {
		expect(resolve('1 tsp castor sugar', [], SUGAR)).toBe('sugar');
		expect(resolve('1 tablespoon pickling salt', [], SUGAR)).toBe('salt');
	});

	it('refuses a match that does not include the head noun', () => {
		// The guardrail that matters. Unanchored, "Spinach and Ricotta Bake" resolves
		// to `spinach` — but it is a section heading, not an ingredient, and the head
		// noun is "Bake". Same shape as the real "Raw groundnuts" -> `apples`.
		const t = parseTaxonomy(['en: spinach', '', 'en: ricotta'].join('\n'));
		expect(resolve('Spinach and Ricotta Bake', [], t)).toBeNull();
	});

	it('refuses a whole food group as an answer', () => {
		// `cheese` is a category, not something you can put in a shopping list.
		const t = parseTaxonomy('en: cheese\n');
		expect(resolve('2 cups grated Velveeta cheese', [], t)).toBeNull();
	});

	it('stops after two dropped words', () => {
		// Past two, real corpus output includes "A flame-resistant towel ... soaked
		// in oil" -> `oil`. One and two words are the useful range.
		const t = parseTaxonomy('en: oil\n');
		expect(resolve('hot oil', [], t)).toBe('oil');
		expect(resolve('very hot oil', [], t)).toBe('oil');
		expect(resolve('a towel soaked in oil', [], t)).toBeNull();
	});

	it('never runs when an exact reading already matched', () => {
		// Exactness must win: `dried_thyme` exists, so nothing should approximate
		// its way down to `thyme`.
		const t = parseTaxonomy(['en: thyme', '', '< en: thyme', 'en: dried thyme'].join('\n'));
		expect(resolve('1 tsp dried thyme', [], t)).toBe('dried_thyme');
	});
});

describe('matchWithOverrides', () => {
	it('reports the matched phrase length as specificity', () => {
		expect(matchWithOverrides('tomato puree', TOMATO_TAXONOMY)).toEqual({
			key: 'tomato_puree',
			words: 2
		});
		expect(matchWithOverrides('puree', TOMATO_TAXONOMY)).toEqual({ key: 'puree', words: 1 });
	});

	it('applies an exact-phrase override ahead of the taxonomy', () => {
		expect(matchWithOverrides('all-purpose flour', TOMATO_TAXONOMY)?.key).toBe('flour');
	});

	it('returns null for empty or unmatched input', () => {
		expect(matchWithOverrides('', TOMATO_TAXONOMY)).toBeNull();
		expect(matchWithOverrides(null, TOMATO_TAXONOMY)).toBeNull();
		expect(matchWithOverrides('!!!', TOMATO_TAXONOMY)).toBeNull();
	});
});
