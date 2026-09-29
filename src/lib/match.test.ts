import { describe, it, expect } from 'vitest';
import { matchRecipes, resolveIngredientIds, slackFor, type MatchParams } from './match';
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
		expect(result).toEqual({ results: [], total: 0 });
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
			excludeAllergens: ['gluten', 'dairy', 'nut'],
			sort: 'kcal',
			slack: 1,
			mustUse: [1, 2]
		});
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
	});

	it.each([
		{},
		{ cuisine: 'italian' },
		{ mealType: 'dinner' },
		{ diet: 'vegan' },
		{ excludeAllergens: ['gluten'] },
		{ excludeAllergens: ['gluten', 'dairy', 'nut'] },
		{ slack: 1, mustUse: [1] },
		{ slack: 1, mustUse: [1, 2] },
		{ slack: 1, mustUse: [1, 2], excludeAllergens: ['gluten', 'nut'] }
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

	it.each([base, { ...base, have: [1, 2, 3, 4, 5] }, { ...base, cuisine: 'italian', excludeAllergens: ['gluten', 'dairy'] }])(
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

	it('sort is never bound as a value — it only selects one of four fixed ORDER BY clauses', async () => {
		const { db: dbDefault, calls: defaultCalls } = spyDb();
		await matchRecipes(dbDefault, base);
		expect(defaultCalls[0].sql).toContain('ORDER BY missing ASC');
		expect(defaultCalls[0].binds).not.toContain('kcal');
		expect(defaultCalls[0].binds).not.toContain('grade');
		expect(defaultCalls[0].binds).not.toContain('time');

		const { db: dbKcal, calls: kcalCalls } = spyDb();
		await matchRecipes(dbKcal, { ...base, sort: 'kcal' });
		expect(kcalCalls[0].sql).toContain('r.kcal ASC');

		const { db: dbGrade, calls: gradeCalls } = spyDb();
		await matchRecipes(dbGrade, { ...base, sort: 'grade' });
		expect(gradeCalls[0].sql).toContain('r.balance_grade ASC');

		const { db: dbTime, calls: timeCalls } = spyDb();
		await matchRecipes(dbTime, { ...base, sort: 'time' });
		expect(timeCalls[0].sql).toContain('(r.total_minutes IS NULL) ASC, r.total_minutes ASC');
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
		expect(result).toEqual({ results: [], total: 0 });
	});
});

describe('matchRecipes — total', () => {
	it('reports the window-function total, not how many rows came back', async () => {
		// The bug this fixes: the UI showed `results.length`, which is capped by the
		// page size, so a selection matching 395 recipes displayed "50 recipes".
		const page = Array.from({ length: 50 }, (_, i) => ({ id: i, total: 395 }));
		const { db } = spyDb(page);
		const { results, total } = await matchRecipes(db, base);
		expect(results).toHaveLength(50);
		expect(total).toBe(395);
	});

	it('selects the total as a window function so no second round-trip is needed', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].sql).toContain('COUNT(*) OVER () AS total');
		// One query, still.
		expect(calls).toHaveLength(1);
	});

	it('reports 0 when nothing matched, since there is no row to read it from', async () => {
		const { db } = spyDb([]);
		expect(await matchRecipes(db, base)).toEqual({ results: [], total: 0 });
	});
});

describe('resolveIngredientIds', () => {
	it('binds the keys as one JSON array, so a big selection cannot hit D1s bind cap', async () => {
		const { db, calls } = spyDb([{ id: 7 }, { id: 9 }]);
		const ids = await resolveIngredientIds(db, ['onion', 'garlic']);
		expect(ids).toEqual([7, 9]);
		expect(calls[0].binds).toEqual([JSON.stringify(['onion', 'garlic'])]);
		expect(calls[0].sql).toContain('json_each');
	});

	it('never queries for an empty selection', async () => {
		const { db, calls } = spyDb();
		expect(await resolveIngredientIds(db, [])).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it('silently drops keys that do not exist rather than failing', async () => {
		// A stale or hand-edited link should degrade to a smaller selection.
		const { db } = spyDb([{ id: 7 }]);
		expect(await resolveIngredientIds(db, ['onion', 'not_a_real_food'])).toEqual([7]);
	});
});

describe('slackFor', () => {
	it('gives no slack below three selections', () => {
		// The strict list is already broad with one or two ingredients, and the
		// feature exists for "I picked several and a recipe uses most of them".
		expect(slackFor(0)).toBe(0);
		expect(slackFor(1)).toBe(0);
		expect(slackFor(2)).toBe(0);
	});

	it('scales with the selection rather than being fixed', () => {
		// A fixed slack of 2 would let a 3-ingredient selection match on any
		// single one of them — "unrelated", not "almost there".
		expect(slackFor(3)).toBe(1);
		expect(slackFor(5)).toBe(1);
		expect(slackFor(6)).toBe(2);
	});

	it('caps at 2 however much is selected', () => {
		expect(slackFor(20)).toBe(2);
		expect(slackFor(100)).toBe(2);
	});
});

describe('matchRecipes — slack', () => {
	it('is behaviourally identical to the old strict equality when slack is 0', async () => {
		// `matched` is capped at have.length by construction, so `>= have.length`
		// is the old `= have.length`. Guards against the relaxation leaking into
		// the default path.
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].sql).toContain('HAVING matched >= ?');
		expect(calls[0].binds).toContain(3);
		expect(calls[0].sql).not.toContain('matched DESC');
	});

	it('lowers the floor by exactly the slack given', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, have: [1, 2, 3, 4, 5, 6], slack: 2 });
		// 6 selected, 2 unused allowed -> a recipe must use at least 4.
		const havingBind = calls[0].binds[calls[0].binds.length - 3];
		expect(havingBind).toBe(4);
	});

	it('never lets the floor reach zero, so a recipe matching nothing is excluded', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, have: [1, 2], slack: 9 });
		expect(calls[0].binds[calls[0].binds.length - 3]).toBe(1);
	});

	it('ranks full matches ahead of near-misses only when slack is on', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1 });
		expect(calls[0].sql).toContain('matched DESC');
		expect(calls[0].sql.indexOf('matched DESC')).toBeLessThan(calls[0].sql.indexOf('missing ASC'));
	});

	it('keeps full matches first even under an explicit nutrition sort', async () => {
		// Coverage is a different kind of answer, not a worse score — so it
		// outranks the user's chosen sort, which then orders within each group.
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, sort: 'grade' });
		expect(calls[0].sql.indexOf('matched DESC')).toBeLessThan(
			calls[0].sql.indexOf('r.balance_grade ASC')
		);
	});

	it('selects unused_names so a near-miss can say which selections went unused', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1 });
		expect(calls[0].sql).toContain('AS unused_names');
	});

	it.each([{ slack: 0 }, { slack: 1 }, { slack: 2 }, { slack: 9 }])(
		'placeholder count still equals bind length with %o',
		async (extra) => {
			const { db, calls } = spyDb();
			await matchRecipes(db, {
				...base,
				...extra,
				cuisine: 'italian',
				excludeAllergens: ['gluten', 'dairy']
			});
			const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
			expect(placeholders).toBe(calls[0].binds.length);
		}
	);
});

describe('matchRecipes — missing_keys', () => {
	it('selects missing_keys positioned right after missing_names, aggregating canonical_key instead of the display name', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].sql).toContain('AS missing_names');
		expect(calls[0].sql).toContain('AS missing_keys');
		expect(calls[0].sql.indexOf('AS missing_names')).toBeLessThan(calls[0].sql.indexOf('AS missing_keys'));
		// missing_keys reuses the same `notSatisfied` CASE condition as
		// missing_names, so it needs the have-set bound twice more, the same as
		// every other use of that condition.
		expect(calls[0].sql).toContain('THEN i.canonical_key END');
	});

	it('binds the have-set for missing_keys the same way as missing_names, keeping placeholder count in sync', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
	});
});

describe('matchRecipes — excludeAllergens by key', () => {
	it('filters on allergens.key, not allergens.id, binding the keys themselves', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, excludeAllergens: ['gluten', 'shellfish'] });
		expect(calls[0].sql).toContain('JOIN allergens a ON a.id = ia.allergen_id');
		expect(calls[0].sql).toContain('a.key IN (?,?)');
		expect(calls[0].binds).toContain('gluten');
		expect(calls[0].binds).toContain('shellfish');
	});

	it('omits the allergen join entirely when no allergens are excluded', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].sql).not.toContain('ingredient_allergens');
	});
});

describe('matchRecipes — mustUse', () => {
	it('adds no clause and no bind when mustUse is absent', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1 });
		expect(calls[0].sql).not.toContain('json_each(?) m');
	});

	it('adds no clause and no bind when mustUse is an empty array', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [] });
		expect(calls[0].sql).not.toContain('json_each(?) m');
	});

	it('dedupes mustUse before binding', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [1, 1, 2] });
		expect(calls[0].sql).toContain('json_each(?) m');
		expect(calls[0].binds).toContain(JSON.stringify([1, 2]));
	});

	it('drops mustUse ids that are not in have, rather than trusting the caller', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [1, 999] });
		expect(calls[0].binds).toContain(JSON.stringify([1]));
		expect(calls[0].binds).not.toContain(JSON.stringify([1, 999]));
	});

	it('omits the clause entirely once every id is filtered out as not in have', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [999] });
		expect(calls[0].sql).not.toContain('json_each(?) m');
	});

	it('binds mustUse before the HAVING bind', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [1, 2] });
		// binds: ... mustUse JSON, HAVING floor, limit, offset — the last three
		// are HAVING/limit/offset, so mustUse's bind sits right before them.
		const havingBind = calls[0].binds.at(-3);
		expect(havingBind).toBe(2); // have.length(3) - slack(1)
		const mustUseBind = calls[0].binds.at(-4);
		expect(mustUseBind).toBe(JSON.stringify([1, 2]));
	});

	it('placeholder count matches binds with mustUse present', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [1, 2] });
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
	});
});
