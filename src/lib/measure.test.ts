import { describe, it, expect } from 'vitest';
import { equivalentOf } from './measure';

describe('equivalentOf — cross-system conversion', () => {
	it('converts imperial volume to metric', () => {
		expect(equivalentOf(0.5, 'cup', null)).toBe('118 ml');
		expect(equivalentOf(3, 'tbsp', null)).toBe('44.4 ml');
		expect(equivalentOf(1, 'tsp', null)).toBe('4.93 ml');
	});

	it('converts metric volume to imperial, picking a sensible unit for the size', () => {
		expect(equivalentOf(1, 'l', null)).toBe('4.23 cup');
		expect(equivalentOf(15, 'ml', null)).toBe('1.01 tbsp');
	});

	it('converts imperial mass to grams and metric mass to imperial', () => {
		expect(equivalentOf(1, 'lb', null)).toBe('454 g');
		expect(equivalentOf(2, 'oz', null)).toBe('56.7 g');
		expect(equivalentOf(500, 'g', null)).toBe('1.1 lb');
		expect(equivalentOf(200, 'g', null)).toBe('7.05 oz');
	});

	it('never converts within the same system — that would be noise, not information', () => {
		// "1 cup (16 tbsp)" tells a cook nothing they didn't already know.
		expect(equivalentOf(1, 'cup', null)).not.toContain('tbsp');
		expect(equivalentOf(1, 'kg', null)).not.toContain(' g');
		expect(equivalentOf(100, 'g', null)).not.toContain('kg');
	});
});

describe('equivalentOf — weights, and the honesty rules', () => {
	it('shows a resolved weight for a bare count, which has no other equivalent', () => {
		// "2 large onions" converts to nothing; its weight is the whole point.
		expect(equivalentOf(2, null, 300)).toBe('300 g');
	});

	it('shows a resolved weight for a countable unit that converts to nothing', () => {
		expect(equivalentOf(3, 'clove', 9)).toBe('9 g');
		expect(equivalentOf(1, 'can', 400)).toBe('400 g');
	});

	it('adds a weight to a volume only when it differs from the water-density value', () => {
		// A cup of flour really is ~125 g, not 237 g — that came from FDC's portion
		// table and is worth showing.
		expect(equivalentOf(1, 'cup', 125)).toBe('237 ml · 125 g');
	});

	it('SUPPRESSES a weight that merely restates the volume', () => {
		// The guard that matters. Stage 04 falls back to 1 ml = 1 g when FDC has no
		// portion for the food, so `grams` is often just `ml` again. Printing it
		// would present an assumption as a measurement.
		expect(equivalentOf(3, 'tbsp', 44.4)).toBe('44.4 ml');
		expect(equivalentOf(1, 'tsp', 4.93)).toBe('4.93 ml');
		expect(equivalentOf(1, 'l', 1000)).toBe('4.23 cup');
	});

	it('says nothing at all rather than guessing', () => {
		// No quantity ("salt, to taste"), or a unit that converts to nothing with no
		// weight resolved — both must stay silent.
		expect(equivalentOf(null, 'cup', null)).toBeNull();
		expect(equivalentOf(null, null, null)).toBeNull();
		expect(equivalentOf(1, 'pinch', null)).toBeNull();
		expect(equivalentOf(2, 'sprig', null)).toBeNull();
		expect(equivalentOf(4, null, null)).toBeNull();
	});

	it('rounds to something a cook can act on', () => {
		// Not "236.588 ml".
		expect(equivalentOf(1, 'cup', null)).toBe('237 ml');
		expect(equivalentOf(2, 'lb', null)).toBe('907 g');
	});
});
