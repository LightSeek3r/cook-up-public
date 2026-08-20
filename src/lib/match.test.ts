import { describe, it, expect } from 'vitest';
import { matchRecipes, type MatchParams } from './match';
import type { D1Database } from '@cloudflare/workers-types';

/** Records the exact SQL text and bind array passed to db.prepare().bind(),
 *  without needing a real D1 — matchRecipes touches `db` exactly once, via
 *  `.prepare(sql).bind(...binds).all()`. */
function spyDb(results: unknown[] = []) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					return { all: async () => ({ results }) };
				}
			};
		}
	} as unknown as D1Database;
	return { db, calls };
}

const base: MatchParams = { have: [1, 2, 3], lang: 'en' };

describe('matchRecipes', () => {
	it('never touches the database when have is empty', async () => {
		const { db, calls } = spyDb();
		const result = await matchRecipes(db, { ...base, have: [] });
		expect(result).toEqual({ results: [] });
		expect(calls).toHaveLength(0);
	});

	it('placeholder count in the SQL equals the bind array length (no filters)', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
	});

	it('placeholder count matches binds with every filter supplied at once', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, {
			...base,
			cuisine: 'italian',
			mealType: 'dinner',
			diet: 'vegan',
			excludeAllergens: [10, 20, 30],
			sort: 'kcal'
		});
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
	});

	it.each([
		{},
		{ cuisine: 'italian' },
		{ mealType: 'dinner' },
		{ diet: 'vegan' },
		{ excludeAllergens: [10] },
		{ excludeAllergens: [10, 20, 30] }
	])('placeholder count matches binds for filter combination %j', async (extra) => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, ...extra });
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
	});

	it('dedupes `have` before binding, so [1, 1] does not silently demand matched = 2', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, have: [1, 1, 2] });
		// The have-set is bound 3 times (matched/missing/missing_names) plus
		// once more as HAVING matched = ? — every occurrence must reflect the
		// deduped set, or a duplicated id would make "uses every selected
		// ingredient" mean matched = 3 from what is really only 2 ingredients.
		const havingBind = calls[0].binds.at(-3); // limit, offset are last two
		expect(havingBind).toBe(2);
	});

	it('has no dangling WHERE when no filters are supplied', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].sql).not.toMatch(/WHERE\s*$/m);
		expect(calls[0].sql).not.toContain('WHERE\n');
	});

	it('sort is never bound as a value — it only selects one of three fixed ORDER BY clauses', async () => {
		const { db: dbDefault, calls: defaultCalls } = spyDb();
		await matchRecipes(dbDefault, base);
		expect(defaultCalls[0].sql).toContain('ORDER BY missing ASC');
		expect(defaultCalls[0].binds).not.toContain('kcal');
		expect(defaultCalls[0].binds).not.toContain('grade');

		const { db: dbKcal, calls: kcalCalls } = spyDb();
		await matchRecipes(dbKcal, { ...base, sort: 'kcal' });
		expect(kcalCalls[0].sql).toContain('r.kcal ASC');

		const { db: dbGrade, calls: gradeCalls } = spyDb();
		await matchRecipes(dbGrade, { ...base, sort: 'grade' });
		expect(gradeCalls[0].sql).toContain('r.balance_grade ASC');
	});

	it('defaults limit to MATCH_PAGE_SIZE and offset to 0', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].binds.slice(-2)).toEqual([50, 0]);
	});

	it('passes an explicit limit/offset through unchanged', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, limit: 10, offset: 20 });
		expect(calls[0].binds.slice(-2)).toEqual([10, 20]);
	});

	it('returns [] rather than undefined when D1 reports no results', async () => {
		const { db } = spyDb(undefined as never);
		const result = await matchRecipes(db, base);
		expect(result).toEqual({ results: [] });
	});
});
