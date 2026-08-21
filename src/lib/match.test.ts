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
		// The have-set is bound many times now (once per selected id in the
		// matched EXISTS-sum, twice more for missing/missing_names) plus once
		// more as HAVING matched = ? — every occurrence must reflect the deduped
		// set, or a duplicated id would make "uses every selected ingredient"
		// mean matched = 3 from what is really only 2 ingredients.
		const havingBind = calls[0].binds.at(-3); // limit, offset are last two
		expect(havingBind).toBe(2);
	});

	it('the matched expression binds the have-set once as JSON, unpacked via json_each — not once per id', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, have: [5, 7, 9] });
		// `json_each(?)` replaces one `?` per selected id: D1 caps bound
		// parameters at 100, and a placeholder-per-id design hit that ceiling
		// at just 16 selected ingredients (95 -> 101 binds). Binding `have`
		// once as JSON keeps the total bind count constant regardless of
		// selection size — see the matchedExpr comment in match.ts.
		const haveJson = JSON.stringify([5, 7, 9]);
		expect(calls[0].binds.slice(0, 2)).toEqual([haveJson, haveJson]);
		expect(calls[0].sql).toContain('json_each');
		expect(calls[0].sql).toContain('ingredient_generic_of');
	});

	it('total bind count stays constant regardless of how many ingredients are selected', async () => {
		// Regression test for a real production bug: a placeholder-per-id
		// design bound ~6 params per selected id, hitting D1's 100-bind
		// ceiling (and 500ing /api/match) at 16 selected ingredients.
		const { db: dbFew, calls: fewCalls } = spyDb();
		await matchRecipes(dbFew, { ...base, have: [1, 2, 3] });

		const { db: dbMany, calls: manyCalls } = spyDb();
		const manyIds = Array.from({ length: 40 }, (_, i) => i + 1);
		await matchRecipes(dbMany, { ...base, have: manyIds });

		expect(manyCalls[0].binds.length).toBe(fewCalls[0].binds.length);
		expect(manyCalls[0].binds.length).toBeLessThan(20);
	});

	it.each([base, { ...base, have: [1, 2, 3, 4, 5] }, { ...base, cuisine: 'italian', excludeAllergens: [1, 2] }])(
		'generated SQL has balanced parentheses (mock verification can\'t catch a mismatched paren the way a real DB would)',
		async (params) => {
			const { db, calls } = spyDb();
			await matchRecipes(db, params);
			const opens = (calls[0].sql.match(/\(/g) ?? []).length;
			const closes = (calls[0].sql.match(/\)/g) ?? []).length;
			expect(opens).toBe(closes);
		}
	);

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
