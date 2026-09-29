import { describe, it, expect } from 'vitest';
import { relatedRecipes } from './related';
import type { D1Database } from '@cloudflare/workers-types';

/** Records every prepare().bind() call and returns queued result sets in call
 *  order — `relatedRecipes` makes at most two db round trips (rank query, then
 *  `getRecipesByIds`), so a short queue is enough without needing to branch on
 *  SQL text. */
function spyDb(resultQueue: unknown[][] = []) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	let i = 0;
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					const results = resultQueue[i++] ?? [];
					return { all: async () => ({ results }) };
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

describe('relatedRecipes', () => {
	it('binds RELATED_MAX_INGREDIENT_RECIPES, id, RELATED_MIN_SHARED, RELATED_LIMIT in that order for the rank query', async () => {
		const { db, calls } = spyDb([[rankRow(5, 3)], [hit(5)]]);
		await relatedRecipes(db, { id: 42, lang: 'en' });
		expect(calls[0].binds).toEqual([200, 42, 2, 6]);
		expect(calls[0].sql).toContain('HAVING shared >= ?');
	});

	it('placeholder count in the rank query equals its bind array length', async () => {
		const { db, calls } = spyDb([[rankRow(5, 3)], [hit(5)]]);
		await relatedRecipes(db, { id: 42, lang: 'en' });
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
	});

	it('preserves rank-query order even when getRecipesByIds returns rows shuffled', async () => {
		const rank = [rankRow(3, 5), rankRow(1, 4), rankRow(2, 2)];
		// getRecipesByIds makes no ordering promise; return it out of rank order.
		const shuffledHits = [hit(2), hit(3), hit(1)];
		const { db } = spyDb([rank, shuffledHits]);
		const result = await relatedRecipes(db, { id: 99, lang: 'en' });
		expect(result.map((r) => r.id)).toEqual([3, 1, 2]);
	});

	it('drops a ranked id that getRecipesByIds does not return, without reordering the rest', async () => {
		const rank = [rankRow(3, 5), rankRow(1, 4), rankRow(2, 2)];
		const partialHits = [hit(1), hit(2)]; // id 3 missing
		const { db } = spyDb([rank, partialHits]);
		const result = await relatedRecipes(db, { id: 99, lang: 'en' });
		expect(result.map((r) => r.id)).toEqual([1, 2]);
	});

	it('never calls getRecipesByIds (no second query) when the rank query returns nothing', async () => {
		const { db, calls } = spyDb([[]]);
		const result = await relatedRecipes(db, { id: 7, lang: 'en' });
		expect(result).toEqual([]);
		expect(calls).toHaveLength(1);
	});
});
