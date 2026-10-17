import { describe, it, expect } from 'vitest';
import { amountOf, equivalentOf } from './measure';

describe('equivalentOf — cross-system conversion', () => {
	it('converts imperial volume to metric', () => {
		expect(equivalentOf(0.5, 'cup', null)).toBe('118 ml');
		expect(equivalentOf(3, 'tbsp', null)).toBe('44 ml');
		expect(equivalentOf(1, 'tsp', null)).toBe('5 ml');
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
	it('never turns a count into a weight', () => {
		// "4 eggs" is the amount; "4 eggs (176 g)" is a figure nobody measures with.
		expect(equivalentOf(4, null, 176)).toBeNull();
		expect(equivalentOf(1, 'large', 50)).toBeNull();
		expect(equivalentOf(2, 'medium', 300)).toBeNull();
		expect(equivalentOf(3, 'clove', 9)).toBeNull();
		expect(equivalentOf(2, 'slice', 40)).toBeNull();
	});

	it('shows the resolved weight of a container, whose size varies by brand', () => {
		expect(equivalentOf(1, 'can', 400)).toBe('400 g');
		expect(equivalentOf(2, 'packet', 1200)).toBe('1.2 kg');
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
		expect(equivalentOf(3, 'tbsp', 44.4)).toBe('44 ml');
		expect(equivalentOf(1, 'tsp', 4.93)).toBe('5 ml');
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
		expect(equivalentOf(5, 'lb', null)).toBe('2.27 kg');
		expect(equivalentOf(3, 'quart', null)).toBe('2.84 l');
	});
});

describe('equivalentOf — units the parser missed', () => {
	// Stage 03 stops at quart/pint, so a gallon arrives as a bare count with a weight
	// FDC resolved for a count of the food: 1½ gallons of juice is not 241.5 g.
	it('recovers a gallon from the source wording and drops the bogus weight', () => {
		expect(equivalentOf(1.5, null, 241.5, '1½ gallons apple juice')).toBe('5.68 l');
		expect(equivalentOf(0.5, null, null, '½ US gallon (8 cups) water')).toBe('1.89 l');
		expect(equivalentOf(1, null, null, '1 imperial gallon water')).toBe('4.55 l');
	});

	it('recovers litres, which the parser only knows in the singular', () => {
		expect(equivalentOf(4, null, null, '4 liters (1 gallon) water')).toBe('16.9 cup');
	});

	it('leaves an unrelated bare count alone', () => {
		expect(equivalentOf(4, null, 176, '4 eggs')).toBeNull();
	});
});

describe('amountOf — the amount on a translated page', () => {
	const fmt = (n: number) => String(n).replace('.', ',');
	const label = (unit: string, _q: number, n: string) => (unit === 'clove' ? `${n} gousses` : null);
	const of = (q: number | null, unit: string | null, grams: number | null, raw?: string) =>
		amountOf(q, unit, grams, raw, fmt, label);

	it('shows a count as a count, never as grams', () => {
		expect(of(4, null, 176)).toEqual({ lead: '4 ×', note: null });
		expect(of(1, 'large', 50)).toEqual({ lead: '1 ×', note: null });
	});

	it('shows imperial mass and volume in metric, with the decimal comma of the language', () => {
		expect(of(1, 'lb', null)).toEqual({ lead: '454 g', note: null });
		expect(of(5, 'lb', null).lead).toBe('2,27 kg');
		expect(of(0.5, 'cup', null).lead).toBe('118 ml');
		expect(of(1.5, null, null, '1½ gallons water').lead).toBe('5,68 l');
	});

	it('keeps metric as metric', () => {
		expect(of(500, 'g', null).lead).toBe('500 g');
		expect(of(1, 'l', null).lead).toBe('1 l');
	});

	it('adds a weight to a volume only when it is informative', () => {
		expect(of(1, 'cup', 125)).toEqual({ lead: '237 ml', note: '125 g' });
		expect(of(1, 'cup', 237)).toEqual({ lead: '237 ml', note: null });
	});

	it('spells out a unit word when the language has one, else falls back to a count', () => {
		expect(of(2, 'clove', 9).lead).toBe('2 gousses');
		expect(of(2, 'pinch', null).lead).toBe('2 ×');
		expect(of(1, 'can', 400)).toEqual({ lead: '1 ×', note: '400 g' });
	});

	it('is silent when the source stated no amount', () => {
		expect(of(null, null, null)).toEqual({ lead: null, note: null });
	});
});
