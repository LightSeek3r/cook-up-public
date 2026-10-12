import { describe, it, expect } from 'vitest';
import { relatedRecipes } from './related';
import type { D1Database } from '@cloudflare/workers-types';

/** Records every prepare().bind() call and returns queued result sets in call
 *  order — `relatedRecipes` makes at most three db round trips (stored list,
 *  then on fallback the rank query and `getRecipesByIds`), so a short queue is
 *  enough without needing to branch on SQL text. An `Error` in the queue is
 *  thrown by that call instead. */
function spyDb(resultQueue: (unknown[] | Error)[] = []) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	let i = 0;
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					const results = resultQueue[i++] ?? [];
					return {
						all: async () => {
							if (results instanceof Error) throw results;
							return { results };
						}
					};
				}
			};
		}
	} as unknown as D1Database;
	return { db, calls };
}

const rankRow = (id: number, shared: number) => ({ id, shared });
const hit = (id: number) => ({
	id,
	title: `Recipe ${id}`,
	cuisine: null,
	total_minutes: null,
	balance_grade: null,
	nutrition_coverage: 0
});
/** What the stored-list query returns for a stored empty list (LEFT JOINs, no match). */
const emptyStored = { id: null, title: null, cuisine: null, total_minutes: null, balance_grade: null, nutrition_coverage: null };
/** "No stored row": the stored-list query returns nothing, so the live ranking runs. */
const NOT_STORED: unknown[] = [];

describe('relatedRecipes, stored list', () => {
	it('answers from recipe_related in one statement, binding lang then id', async () => {
		const { db, calls } = spyDb([[hit(3), hit(1), hit(2)]]);
		const result = await relatedRecipes(db, { id: 42, lang: 'fr' });
		expect(result.map((r) => r.id)).toEqual([3, 1, 2]);
		expect(calls).toHaveLength(1);
		expect(calls[0].sql).toContain('FROM recipe_related rr');
		expect(calls[0].sql).toContain('ORDER BY j.key');
		expect(calls[0].binds).toEqual(['fr', 42]);
		expect((calls[0].sql.match(/\?/g) ?? []).length).toBe(calls[0].binds.length);
	});

	it('treats an all-NULL row as a stored empty list, without the live query', async () => {
		const { db, calls } = spyDb([[emptyStored]]);
		expect(await relatedRecipes(db, { id: 42, lang: 'en' })).toEqual([]);
		expect(calls).toHaveLength(1);
	});

	it('drops a listed id whose recipe no longer exists, keeping the order of the rest', async () => {
		const { db } = spyDb([[hit(3), emptyStored, hit(2)]]);
		expect((await relatedRecipes(db, { id: 42, lang: 'en' })).map((r) => r.id)).toEqual([3, 2]);
	});

	it('falls back to the live ranking when the table does not exist yet', async () => {
		const { db, calls } = spyDb([
			new Error('D1_ERROR: no such table: recipe_related: SQLITE_ERROR'),
			[rankRow(5, 3)],
			[hit(5)]
		]);
		expect((await relatedRecipes(db, { id: 42, lang: 'en' })).map((r) => r.id)).toEqual([5]);
		expect(calls).toHaveLength(3);
	});

	it('does not hide any other failure behind the fallback', async () => {
		const { db, calls } = spyDb([new Error('D1_ERROR: network connection lost')]);
		await expect(relatedRecipes(db, { id: 42, lang: 'en' })).rejects.toThrow('network connection lost');
		expect(calls).toHaveLength(1);
	});
});

describe('relatedRecipes, live fallback (no stored row)', () => {
	it('binds RELATED_MAX_INGREDIENT_RECIPES, id, RELATED_MIN_SHARED, RELATED_LIMIT in that order for the rank query', async () => {
		const { db, calls } = spyDb([NOT_STORED, [rankRow(5, 3)], [hit(5)]]);
		await relatedRecipes(db, { id: 42, lang: 'en' });
		expect(calls[1].binds).toEqual([200, 42, 2, 6]);
		expect(calls[1].sql).toContain('HAVING shared >= ?');
	});

	it('placeholder count in the rank query equals its bind array length', async () => {
		const { db, calls } = spyDb([NOT_STORED, [rankRow(5, 3)], [hit(5)]]);
		await relatedRecipes(db, { id: 42, lang: 'en' });
		const placeholders = (calls[1].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[1].binds.length);
	});

	it('preserves rank-query order even when getRecipesByIds returns rows shuffled', async () => {
		const rank = [rankRow(3, 5), rankRow(1, 4), rankRow(2, 2)];
		// getRecipesByIds makes no ordering promise; return it out of rank order.
		const shuffledHits = [hit(2), hit(3), hit(1)];
		const { db } = spyDb([NOT_STORED, rank, shuffledHits]);
		const result = await relatedRecipes(db, { id: 99, lang: 'en' });
		expect(result.map((r) => r.id)).toEqual([3, 1, 2]);
	});

	it('drops a ranked id that getRecipesByIds does not return, without reordering the rest', async () => {
		const rank = [rankRow(3, 5), rankRow(1, 4), rankRow(2, 2)];
		const partialHits = [hit(1), hit(2)]; // id 3 missing
		const { db } = spyDb([NOT_STORED, rank, partialHits]);
		const result = await relatedRecipes(db, { id: 99, lang: 'en' });
		expect(result.map((r) => r.id)).toEqual([1, 2]);
	});

	it('never calls getRecipesByIds (no third query) when the rank query returns nothing', async () => {
		const { db, calls } = spyDb([NOT_STORED, []]);
		const result = await relatedRecipes(db, { id: 7, lang: 'en' });
		expect(result).toEqual([]);
		expect(calls).toHaveLength(2);
	});
});
