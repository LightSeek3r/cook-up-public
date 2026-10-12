import { describe, it, expect } from 'vitest';
import { filterTiles, TILE_SEARCH_LIMIT } from './tileSearch';
import type { IngredientTile } from './types';

const tile = (id: number, name: string, recipe_count = 100 - id): IngredientTile => ({
	id,
	name,
	canonical_key: `k${id}`,
	category: 'vegetable',
	recipe_count
});

const mosaic = [
	tile(1, 'onion'),
	tile(2, 'Tomato'),
	tile(3, 'potato'),
	tile(4, 'Échalote'),
	tile(5, 'échalote verte'),
	tile(6, '豆腐'),
	tile(7, '50% cream')
];

describe('filterTiles', () => {
	it('returns the whole mosaic for an empty or blank query', () => {
		expect(filterTiles(mosaic, '')).toEqual(mosaic);
		expect(filterTiles(mosaic, '   ')).toEqual(mosaic);
	});

	it('matches a substring anywhere in the displayed name, keeping mosaic order', () => {
		expect(filterTiles(mosaic, 'to').map((t) => t.id)).toEqual([2, 3]);
	});

	it('folds ASCII case both ways, like SQLite LIKE', () => {
		expect(filterTiles(mosaic, 'TO').map((t) => t.id)).toEqual([2, 3]);
		expect(filterTiles(mosaic, 'tom').map((t) => t.id)).toEqual([2]);
	});

	it('does not fold non-ASCII case, which SQLite LIKE leaves distinct', () => {
		expect(filterTiles(mosaic, 'éc').map((t) => t.id)).toEqual([5]);
		expect(filterTiles(mosaic, 'Éc').map((t) => t.id)).toEqual([4]);
	});

	it('handles CJK, the reason short queries exist at all', () => {
		expect(filterTiles(mosaic, '豆').map((t) => t.id)).toEqual([6]);
	});

	it('treats LIKE wildcards as literal characters, as the escaped server query does', () => {
		expect(filterTiles(mosaic, '%').map((t) => t.id)).toEqual([7]);
		expect(filterTiles(mosaic, '_')).toEqual([]);
	});

	it('trims the query like the route', () => {
		expect(filterTiles(mosaic, ' to ').map((t) => t.id)).toEqual([2, 3]);
	});

	it('breaks recipe_count ties by id, as the route does, even at the cap', () => {
		// The mosaic orders ties by name; the route's LIKE branch yields id order.
		const tied = [tile(9, 'apple', 5), tile(3, 'grape', 5), tile(7, 'pear', 5), tile(1, 'plum', 8)];
		expect(filterTiles(tied, 'p').map((t) => t.id)).toEqual([1, 3, 7, 9]);

		const many = Array.from({ length: 70 }, (_, i) => tile(100 - i, `pea ${i}`, 1));
		const hits = filterTiles(many, 'pe');
		expect(hits.map((t) => t.id)).toEqual(Array.from({ length: 60 }, (_, i) => 31 + i));
	});

	it('caps the result at the route limit', () => {
		const many = Array.from({ length: 100 }, (_, i) => tile(i, `pea ${i}`));
		const hits = filterTiles(many, 'pe');
		expect(hits).toHaveLength(TILE_SEARCH_LIMIT);
		expect(hits[0].id).toBe(0);
	});
});
