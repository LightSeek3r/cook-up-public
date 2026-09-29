import { describe, it, expect } from 'vitest';
import { FRIDGE_KEY, parseFridge } from './fridge';

describe('parseFridge', () => {
	it('parses a comma-separated canonical_key list, preserving order', () => {
		expect(parseFridge('tomato,onion,garlic')).toEqual(['tomato', 'onion', 'garlic']);
	});
	it('lowercases, trims and dedupes', () => {
		expect(parseFridge(' Tomato , tomato,onion ')).toEqual(['tomato', 'onion']);
	});
	it('drops values that are not a valid canonical_key shape', () => {
		expect(parseFridge('tomato,123,-bad,ok_1')).toEqual(['tomato', 'ok_1']);
	});
	it('returns [] for null/empty', () => {
		expect(parseFridge(null)).toEqual([]);
		expect(parseFridge('')).toEqual([]);
	});
});

describe('FRIDGE_KEY', () => {
	it('has a storage key', () => {
		expect(FRIDGE_KEY.length).toBeGreaterThan(0);
	});
});
