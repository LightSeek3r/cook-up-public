import { describe, it, expect } from 'vitest';
import { FAVORITES_KEY, parseFavorites, withFavorite, withoutFavorite } from './favorites';

describe('parseFavorites', () => {
	it('parses a comma-separated id list, preserving order', () => {
		expect(parseFavorites('3,1,2')).toEqual([3, 1, 2]);
	});
	it('returns [] for null/empty', () => {
		expect(parseFavorites(null)).toEqual([]);
		expect(parseFavorites('')).toEqual([]);
	});
});

describe('withFavorite', () => {
	it('adds to the front', () => {
		expect(withFavorite([2, 1], 3)).toEqual([3, 2, 1]);
	});
	it('is a no-op if already present', () => {
		expect(withFavorite([2, 1], 1)).toEqual([2, 1]);
	});
});

describe('withoutFavorite', () => {
	it('removes by id', () => {
		expect(withoutFavorite([3, 2, 1], 2)).toEqual([3, 1]);
	});
	it('is a no-op if absent', () => {
		expect(withoutFavorite([3, 1], 9)).toEqual([3, 1]);
	});
});

describe('FAVORITES_KEY', () => {
	it('has a storage key', () => {
		expect(FAVORITES_KEY.length).toBeGreaterThan(0);
	});
});
