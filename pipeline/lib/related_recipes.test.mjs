import { describe, it, expect } from 'vitest';
import {
	relatedLists,
	relatedRows,
	RELATED_LIMIT,
	RELATED_MAX_INGREDIENT_RECIPES,
	RELATED_MIN_SHARED
} from './related_recipes.mjs';

const ing = (canonical_key, is_staple = 0) => ({ canonical_key, is_staple });
const rows = (recipe_id, ...keys) => keys.map((canonical_key) => ({ recipe_id, canonical_key }));

describe('relatedLists', () => {
	it('ranks by shared distinctive ingredients, then by id, and needs RELATED_MIN_SHARED', () => {
		expect(RELATED_MIN_SHARED).toBe(2);
		const ingredients = [ing('a'), ing('b'), ing('c'), ing('d')];
		const ri = [
			...rows(1, 'a', 'b', 'c'),
			...rows(5, 'a', 'b'), // shares 2
			...rows(3, 'a', 'b'), // shares 2, lower id first
			...rows(4, 'a', 'b', 'c'), // shares 3
			...rows(2, 'a', 'd') // shares 1: not related
		];
		expect(relatedLists(ingredients, ri, [1]).get(1)).toEqual([4, 3, 5]);
	});

	it('never lists the recipe itself, and gives an empty list rather than no entry', () => {
		const lists = relatedLists([ing('a'), ing('b')], [...rows(1, 'a', 'b'), ...rows(2, 'a')], [1, 2, 99]);
		expect(lists.get(1)).toEqual([]);
		expect(lists.get(2)).toEqual([]);
		expect(lists.get(99)).toEqual([]);
	});

	it('ignores staples and ingredients the seed could not insert', () => {
		const ingredients = [ing('salt', 1), ing('water', 1), ing('a')];
		const ri = [...rows(1, 'salt', 'water', 'a', 'ghost'), ...rows(2, 'salt', 'water', 'ghost'), ...rows(3, 'a', 'salt')];
		expect(relatedLists(ingredients, ri, [1]).get(1)).toEqual([]);
	});

	it('skips an ingredient used by more than RELATED_MAX_INGREDIENT_RECIPES recipes, counting every recipe that uses it', () => {
		const ingredients = [ing('common'), ing('rare'), ing('other')];
		const users = (n) => Array.from({ length: n }, (_, k) => rows(100 + k, 'common')).flat();
		const base = [...rows(1, 'common', 'rare'), ...rows(2, 'common', 'rare')];
		// 1 and 2 plus filler: exactly at the cap, 'common' still counts.
		const atCap = [...base, ...users(RELATED_MAX_INGREDIENT_RECIPES - 2)];
		expect(relatedLists(ingredients, atCap, [1]).get(1)).toEqual([2]);
		// One recipe more and it no longer does, so 1 and 2 share only 'rare'.
		const overCap = [...base, ...users(RELATED_MAX_INGREDIENT_RECIPES - 1)];
		expect(relatedLists(ingredients, overCap, [1]).get(1)).toEqual([]);
	});

	it('keeps at most RELATED_LIMIT', () => {
		const ri = [rows(1, 'a', 'b'), ...Array.from({ length: 10 }, (_, k) => rows(10 + k, 'a', 'b'))].flat();
		expect(relatedLists([ing('a'), ing('b')], ri, [1]).get(1)).toEqual([10, 11, 12, 13, 14, 15].slice(0, RELATED_LIMIT));
	});
});

describe('relatedRows', () => {
	it('emits one row per recipe with the list as JSON text', () => {
		const ri = [...rows(1, 'a', 'b'), ...rows(2, 'a', 'b')];
		expect(relatedRows([ing('a'), ing('b')], ri, [1, 2, 3])).toEqual([
			{ recipe_id: 1, related_ids: '[2]' },
			{ recipe_id: 2, related_ids: '[1]' },
			{ recipe_id: 3, related_ids: '[]' }
		]);
	});
});
