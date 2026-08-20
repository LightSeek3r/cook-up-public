import { describe, it, expect } from 'vitest';
import { parseIds, requireDb, requireKv, requireAi } from './db';

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

describe('requireDb / requireKv / requireAi', () => {
	it('return the binding when present', () => {
		const db = {} as never;
		expect(requireDb({ env: { DB: db } } as never)).toBe(db);
		const kv = {} as never;
		expect(requireKv({ env: { TRANSLATIONS: kv } } as never)).toBe(kv);
		const ai = {} as never;
		expect(requireAi({ env: { AI: ai } } as never)).toBe(ai);
	});

	it('throw a 500 when the platform or binding is missing', () => {
		expect(() => requireDb(undefined)).toThrow();
		expect(() => requireDb({ env: {} } as never)).toThrow();
		expect(() => requireKv({ env: {} } as never)).toThrow();
		expect(() => requireAi({ env: {} } as never)).toThrow();
	});
});
