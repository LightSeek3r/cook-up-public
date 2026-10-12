import { describe, it, expect } from 'vitest';
import { parseIds, parseKeys, requireDb } from './db';

// parseIds is the input-validation boundary for /api/match's `have`/
// `noAllergen` params, and its dedupe behaviour is load-bearing for
// matchRecipes' `HAVING matched = have.length` invariant.
describe('parseIds', () => {
	it('parses a comma-separated list of positive integers', () => {
		expect(parseIds('1,2,3')).toEqual([1, 2, 3]);
	});

	it('dedupes', () => {
		expect(parseIds('1,2,2,3,1')).toEqual([1, 2, 3]);
	});

	it('rejects zero, negatives, and non-numeric junk', () => {
		expect(parseIds('0,-1,abc,3')).toEqual([3]);
	});

	it('accepts scientific notation that Number() parses to a positive integer', () => {
		// Number.isInteger(1000) is true regardless of how the string was
		// written — this is existing, documented behaviour, not something to
		// silently "fix" without a product decision.
		expect(parseIds('1e3')).toEqual([1000]);
	});

	it('rejects non-integers like 1.5', () => {
		expect(parseIds('1.5,2')).toEqual([2]);
	});

	it('trims whitespace around each id', () => {
		expect(parseIds(' 1 , 2 ')).toEqual([1, 2]);
	});

	it('returns [] for null, undefined, or empty string', () => {
		expect(parseIds(null)).toEqual([]);
		expect(parseIds('')).toEqual([]);
	});
});

describe('parseKeys', () => {
	it('parses, trims, lowercases and dedupes a comma-separated key list', () => {
		expect(parseKeys('onion,garlic,egg')).toEqual(['onion', 'garlic', 'egg']);
		expect(parseKeys(' Onion , GARLIC ')).toEqual(['onion', 'garlic']);
		expect(parseKeys('onion,onion,garlic')).toEqual(['onion', 'garlic']);
		expect(parseKeys('tomato_puree,black_pepper')).toEqual(['tomato_puree', 'black_pepper']);
	});

	it('drops the old numeric id form rather than sending it to the database', () => {
		// Shared links used to carry positional ids. Those ids were renumbered by
		// every reseed, so such a link already pointed at the wrong food — an empty
		// selection is the honest outcome, and this is why keys replaced them.
		expect(parseKeys('23,25,1')).toEqual([]);
		expect(parseKeys('onion,25')).toEqual(['onion']);
	});

	it('rejects anything that is not a canonical_key shape', () => {
		expect(parseKeys('DROP TABLE ingredients')).toEqual([]);
		expect(parseKeys("onion';--")).toEqual([]);
		expect(parseKeys('_leading,tráiling,with-dash')).toEqual([]);
		expect(parseKeys('')).toEqual([]);
		expect(parseKeys(null)).toEqual([]);
	});
});

describe('requireDb', () => {
	it('return the binding when present', () => {
		const db = {} as never;
		expect(requireDb({ env: { DB: db } } as never)).toBe(db);
	});

	it('throw a 500 when the platform or binding is missing', () => {
		expect(() => requireDb(undefined)).toThrow();
		expect(() => requireDb({ env: {} } as never)).toThrow();
	});
});
