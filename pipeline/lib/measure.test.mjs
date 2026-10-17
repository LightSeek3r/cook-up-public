import { describe, it, expect } from 'vitest';
import { splitIngredientLine } from './measure.mjs';

// Pins the exact class of bug this project hit: quantity/unit came back null
// for 98% of recipe_ingredients rows because splitIngredientLine was only
// called on the wikilink-match failure path (see the unpublished project notes). This suite
// exercises the function directly, independent of how the caller invokes it.
describe('splitIngredientLine', () => {
	it('parses a plain integer + unit + name', () => {
		expect(splitIngredientLine('2 cups diced tomato')).toEqual({
			quantity: 2,
			unit: 'cup',
			name: 'diced tomato'
		});
	});

	it('parses "1 1/2" as a whole number plus an a/b fraction', () => {
		expect(splitIngredientLine('1 1/2 cups flour')).toEqual({
			quantity: 1.5,
			unit: 'cup',
			name: 'flour'
		});
	});

	it('parses a bare a/b fraction with no leading whole number', () => {
		expect(splitIngredientLine('1/2 cup wine vinegar')).toEqual({
			quantity: 0.5,
			unit: 'cup',
			name: 'wine vinegar'
		});
	});

	it('parses a unicode vulgar fraction', () => {
		expect(splitIngredientLine('½ teaspoon salt')).toEqual({
			quantity: 0.5,
			unit: 'tsp',
			name: 'salt'
		});
	});

	it('takes the lower bound of a range', () => {
		expect(splitIngredientLine('2-3 tbsp olive oil')).toEqual({
			quantity: 2,
			unit: 'tbsp',
			name: 'olive oil'
		});
	});

	it('drops a parenthetical alt-unit right after the quantity', () => {
		// quantity is rounded to 4dp by the source (Number(quantity.toFixed(4))).
		expect(splitIngredientLine('⅓ cup (80 ml) milk')).toEqual({
			quantity: 0.3333,
			unit: 'cup',
			name: 'milk'
		});
	});

	it('drops a parenthetical alt-unit trailing the unit word', () => {
		expect(splitIngredientLine('1 medium (150 g) onion')).toEqual({
			quantity: 1,
			unit: 'medium',
			name: 'onion'
		});
	});

	// Verified against the real corpus: 915 ingredient lines use a size word as
	// the only "unit" ("1 large egg", "2 medium onions"). Before large/medium/
	// small/whole were added to UNIT_ALIASES, the leading word never became a
	// recognized unit, so `rest` never advanced past it — name came out as
	// "large egg" (breaking taxonomy matching whenever the wikilink match
	// fails) and stage 04 could never attempt an FDC portion lookup at all,
	// since resolveGrams() requires a non-null unit before it tries.
	it.each([
		['1 large egg', { quantity: 1, unit: 'large', name: 'egg' }],
		['2 medium onions', { quantity: 2, unit: 'medium', name: 'onions' }],
		['3 small potatoes', { quantity: 3, unit: 'small', name: 'potatoes' }],
		['1 whole chicken', { quantity: 1, unit: 'whole', name: 'chicken' }]
	])('treats a leading size word as a unit: %j', (line, expected) => {
		expect(splitIngredientLine(line)).toEqual(expected);
	});

	it.each(['to taste', 'to serve', 'as needed', 'as desired', 'optional', 'for garnish'])(
		'never fabricates a quantity for the vague phrase %j',
		(phrase) => {
			expect(splitIngredientLine(phrase)).toEqual({ quantity: null, unit: null, name: phrase });
		}
	);

	it('recognises a unit word with no leading quantity ("dash", "pinch")', () => {
		expect(splitIngredientLine('pinch of cayenne')).toEqual({
			quantity: null,
			unit: 'pinch',
			name: 'cayenne'
		});
	});

	it('returns nulls, never a guess, when nothing recognisable is found', () => {
		expect(splitIngredientLine('freshly ground black pepper')).toEqual({
			quantity: null,
			unit: null,
			name: 'freshly ground black pepper'
		});
	});

	it('handles empty/falsy input without throwing', () => {
		expect(splitIngredientLine('')).toEqual({ quantity: null, unit: null, name: '' });
		expect(splitIngredientLine(null)).toEqual({ quantity: null, unit: null, name: '' });
	});

	it('normalises internal whitespace before parsing', () => {
		expect(splitIngredientLine('2   cups   flour')).toEqual({
			quantity: 2,
			unit: 'cup',
			name: 'flour'
		});
	});

	it('strips a connector "of" between the unit and the ingredient ("2 cloves of garlic")', () => {
		// Real bug: without stripping it, `name` came out as "of garlic" instead
		// of "garlic", which then failed taxonomy matching for the same reason a
		// trailing prep clause does — confirmed against the real corpus to
		// affect 100+ lines ("cloves of garlic", "pinch of salt", ...).
		expect(splitIngredientLine('2 cloves of garlic, minced')).toEqual({
			quantity: 2,
			unit: 'clove',
			name: 'garlic, minced'
		});
		expect(splitIngredientLine('1 pinch of salt')).toEqual({ quantity: 1, unit: 'pinch', name: 'salt' });
	});

	it('recognizes the container/count/length units the corpus actually uses', () => {
		// Each taken from a real unmatched line. Without the unit alias the word
		// stays in `name` ("punnet blackcurrants") and no taxonomy match is possible.
		expect(splitIngredientLine('½ punnet blackcurrants').name).toBe('blackcurrants');
		expect(splitIngredientLine('20 strands saffron').name).toBe('saffron');
		expect(splitIngredientLine('¼ head red cabbage, shredded').name).toBe('red cabbage, shredded');
		expect(splitIngredientLine('1 package enoki mushrooms').name).toBe('enoki mushrooms');
		expect(splitIngredientLine('1 sheet puff pastry').name).toBe('puff pastry');
		expect(splitIngredientLine('1 stick of cinnamon').name).toBe('cinnamon');
		expect(splitIngredientLine('5.75 dl water').name).toBe('water');
	});

	it('drops any parenthetical after the quantity, not just a single "(N unit)"', () => {
		// The narrow pattern left multi-unit conversions behind, and whatever
		// survived became part of `name`.
		expect(splitIngredientLine('125 g (4.4 oz / ⅝ cup) superfine sugar').name).toBe('superfine sugar');
		expect(splitIngredientLine('2 tins (2 ½ cups / 600 g) sweetened condensed milk').name).toBe('sweetened condensed milk');
	});

	it('leaves a parenthetical alone when an unrecognized word precedes it', () => {
		// Deliberate, and the limit of what this function can do: "imperial" is not
		// a unit alias, so no unit is consumed and the aside is no longer in the
		// anchored position. Lines like this are recovered a level up, by the
		// paren-stripped reading in lib/resolve_ingredient.mjs — which is where the
		// whole-line rewrite belongs, since it must not disturb quantity parsing.
		expect(splitIngredientLine('6 imperial tbsp (108 ml / 7.2 US tbsp) caster sugar').name).toBe(
			'imperial tbsp (108 ml / 7.2 US tbsp) caster sugar'
		);
	});

	it('still drops a parenthetical sitting between the unit and the name', () => {
		expect(splitIngredientLine('½ cup (115 g) cold unsalted butter').name).toBe('cold unsalted butter');
		expect(splitIngredientLine('1 medium (150 g) onion').name).toBe('onion');
	});
});
