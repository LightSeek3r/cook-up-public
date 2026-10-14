import { describe, it, expect } from 'vitest';
import { matchRecipes, resolveIngredientIds, type MatchParams } from './match';
import type { D1Database } from '@cloudflare/workers-types';
import { assertD1Binds } from '../d1';

/** Records the exact SQL text and bind array passed to db.prepare().bind(),
 *  without needing a real D1 — matchRecipes touches `db` exactly once, via
 *  `.prepare(sql).bind(...binds).all()`. These tests pin the query's *shape*;
 *  match.sqlite.test.mjs executes it against real SQLite. */
function spyDb(results: unknown[] = []) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					return {
						all: async () => {
							assertD1Binds(binds);
							return { results };
						}
					};
				}
			};
		}
	} as unknown as D1Database;
	return { db, calls };
}

/** Every `?N` in the SQL must name a bound value and every bound value must be
 *  used: with numbered placeholders an unused trailing bind is a D1 error and a
 *  `?N` past the end silently binds NULL. Bare `?` must never appear — SQLite
 *  won't resolve it alongside numbered ones. */
function expectPlaceholdersMatchBinds(call: { sql: string; binds: unknown[] }) {
	expect(call.sql).not.toMatch(/\?(?!\d)/);
	const used = new Set([...call.sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
	expect([...used].sort((a, b) => a - b)).toEqual(call.binds.map((_, i) => i + 1));
}

// Fixed bind positions: ?1 have JSON, ?2 lang, ?3 floor, ?4 limit, ?5 offset.
const HAVE = 0;
const LANG = 1;
const FLOOR = 2;
const LIMIT = 3;
const OFFSET = 4;

const base: MatchParams = { have: [1, 2, 3], lang: 'en' };
const everyFilter: Partial<MatchParams> = {
	cuisine: 'italian',
	mealType: 'dinner',
	diet: 'vegan',
	excludeAllergens: ['gluten', 'dairy', 'nut'],
	sort: 'kcal',
	slack: 1,
	mustUse: [1, 2]
};

describe('matchRecipes', () => {
	it('never touches the database when have is empty', async () => {
		const { db, calls } = spyDb();
		const result = await matchRecipes(db, { ...base, have: [] });
		expect(result).toEqual({ results: [], total: 0 });
		expect(calls).toHaveLength(0);
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
		{ slack: 1, mustUse: [1, 2], excludeAllergens: ['gluten', 'nut'] },
		everyFilter
	])('numbered placeholders match the bind array exactly for %j', async (extra) => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, ...extra });
		expectPlaceholdersMatchBinds(calls[0]);
	});

	it('dedupes `have` before binding, so [1, 1] does not silently demand matched = 2', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, have: [1, 1, 2] });
		// The floor is compared with a count of *distinct* satisfied selections, so
		// it must be computed from the deduped set, as must the JSON every
		// json_each(?1) unpacks.
		expect(calls[0].binds[HAVE]).toBe(JSON.stringify([1, 2]));
		expect(calls[0].binds[FLOOR]).toBe(2);
	});

	it('binds the have-set once as JSON, unpacked via json_each — not once per id', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, have: [5, 7, 9] });
		// `json_each(?1)` replaces one `?` per selected id: D1 caps bound
		// parameters at 100, and a placeholder-per-id design hit that ceiling at
		// just 16 selected ingredients (95 -> 101 binds).
		const haveJson = JSON.stringify([5, 7, 9]);
		expect(calls[0].binds[HAVE]).toBe(haveJson);
		expect(calls[0].binds.filter((b) => b === haveJson)).toHaveLength(1);
		expect(calls[0].sql).toContain('json_each(?1)');
		expect(calls[0].sql).toContain('ingredient_generic_of');
	});

	it('bind count stays constant and far under D1s 100 cap however many ingredients are selected', async () => {
		// Regression test for a real production bug: a placeholder-per-id design
		// bound ~6 params per selected id and 500'd /api/match at 16 selections.
		const counts = [];
		for (const n of [3, 40, 500]) {
			const { db, calls } = spyDb();
			const have = Array.from({ length: n }, (_, i) => i + 1);
			await matchRecipes(db, { ...base, ...everyFilter, have, mustUse: have.slice(0, n - 1) });
			counts.push(calls[0].binds.length);
		}
		expect(new Set(counts).size).toBe(1);
		// 5 fixed (?1-?5) + cuisine, meal, diet, allergen list, must list, must count.
		expect(counts[0]).toBe(11);
	});

	it.each([base, { ...base, have: [1, 2, 3, 4, 5] }, { ...base, ...everyFilter }])(
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
		expect(calls[0].sql).not.toMatch(/WHERE\s*\)/);
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

	it('applies the same ORDER BY to the page and to the final SELECT, so LIMIT order survives the title joins', async () => {
		for (const sort of [undefined, 'kcal', 'grade', 'time'] as const) {
			const { db, calls } = spyDb();
			await matchRecipes(db, { ...base, slack: 1, sort });
			const orders = [...calls[0].sql.matchAll(/ORDER BY ([^\n]+)/g)].map((m) => m[1].trim());
			expect(orders).toHaveLength(2);
			expect(orders[0]).toBe(orders[1]);
			expect(orders[0]).toMatch(/r\.id ASC$/);
		}
	});

	it('defaults limit to MATCH_PAGE_SIZE and offset to 0', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, ...everyFilter });
		expect([calls[0].binds[LIMIT], calls[0].binds[OFFSET]]).toEqual([50, 0]);
	});

	it('passes an explicit limit/offset and the lang through at fixed positions', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, ...everyFilter, lang: 'fr', limit: 10, offset: 20 });
		expect(calls[0].binds[LANG]).toBe('fr');
		expect([calls[0].binds[LIMIT], calls[0].binds[OFFSET]]).toEqual([10, 20]);
		expect(calls[0].sql).toContain('LIMIT ?4 OFFSET ?5');
	});

	it('returns [] rather than undefined when D1 reports no results', async () => {
		const { db } = spyDb(undefined as never);
		const result = await matchRecipes(db, base);
		expect(result).toEqual({ results: [], total: 0 });
	});
});

describe('matchRecipes — candidate-first shape (D1 rows read)', () => {
	it('drives from the selected ingredients through idx_ri_ingredient, never from the recipes table', async () => {
		// The previous shape was `FROM recipes r JOIN recipe_ingredients ri ...
		// GROUP BY r.id`, which read every recipe_ingredients row in the corpus
		// (~430k-690k D1 rows per call). recipes may only be reached by joining
		// from the candidate set.
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, ...everyFilter });
		const sql = calls[0].sql;
		expect(sql).toMatch(/sat\(have_id, ing_id, staple\) AS MATERIALIZED/);
		expect(sql).toMatch(/FROM sat s\s+JOIN recipe_ingredients ri ON ri\.ingredient_id = s\.ing_id/);
		expect(sql).not.toMatch(/FROM recipes\b/);
		expect(sql).toMatch(/FROM hit\s+JOIN recipes r ON r\.id = hit\.recipe_id/);
	});

	it('keys every other recipe_ingredients reference on one recipe, so it stays a point lookup', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, ...everyFilter });
		const sql = calls[0].sql;
		const aliases = [...sql.matchAll(/recipe_ingredients (\w+)/g)].map((m) => m[1]);
		expect(aliases.length).toBeGreaterThanOrEqual(5);
		for (const alias of aliases) {
			const keyed =
				sql.includes(`${alias}.recipe_id = r.id`) || sql.includes(`${alias}.ingredient_id = s.ing_id`);
			expect(keyed, alias).toBe(true);
		}
	});

	it('computes display columns only for the LIMITed page', async () => {
		// Titles and ingredient names are per-row work; done before LIMIT they would
		// run for every candidate (thousands for a common ingredient).
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		const sql = calls[0].sql;
		const limitAt = sql.indexOf('LIMIT ?4 OFFSET ?5');
		expect(limitAt).toBeGreaterThan(0);
		for (const marker of ['AS unused_names', 'AS missing_names', 'AS missing_keys', 'JOIN recipe_i18n t']) {
			expect(sql.indexOf(marker), marker).toBeGreaterThan(limitAt);
		}
	});

	it('reads the precomputed non_staple_count, falling back to a live count only when it is NULL', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].sql).toMatch(/COALESCE\(r\.non_staple_count, \(\s*SELECT COUNT\(\*\) FROM recipe_ingredients x/);
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

	it('selects the total as a window function before LIMIT, so no second round-trip is needed', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		const sql = calls[0].sql;
		expect(sql).toContain('COUNT(*) OVER () AS total');
		expect(sql.indexOf('COUNT(*) OVER () AS total')).toBeLessThan(sql.indexOf('LIMIT ?4'));
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

describe('matchRecipes — slack', () => {
	it('is behaviourally identical to the old strict equality when slack is 0', async () => {
		// `matched` is capped at have.length by construction, so `>= have.length`
		// is the old `= have.length`. Guards against the relaxation leaking into
		// the default path.
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		expect(calls[0].sql).toContain('HAVING matched >= ?3');
		expect(calls[0].binds[FLOOR]).toBe(3);
		expect(calls[0].sql).not.toContain('matched DESC');
	});

	it('lowers the floor by exactly the slack given', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, ...everyFilter, have: [1, 2, 3, 4, 5, 6], slack: 2 });
		// 6 selected, 2 unused allowed -> a recipe must use at least 4.
		expect(calls[0].binds[FLOOR]).toBe(4);
	});

	it('never lets the floor reach zero, so a recipe matching nothing is excluded', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, have: [1, 2], slack: 9 });
		expect(calls[0].binds[FLOOR]).toBe(1);
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
});

describe('matchRecipes — missing_keys', () => {
	it('selects missing_keys after missing_names, over the same unsatisfied non-staple rows', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, base);
		const sql = calls[0].sql;
		expect(sql.indexOf('AS missing_names')).toBeLessThan(sql.indexOf('AS missing_keys'));
		// Same filter in both subqueries, so they walk the same rows in the same
		// primary-key order and stay positionally aligned.
		const condition = 'ri.ingredient_id NOT IN (SELECT ing_id FROM sat)';
		expect(sql.split(condition)).toHaveLength(3);
		expect(sql).toContain("GROUP_CONCAT(i.canonical_key, '\u001f')");
	});
});

describe('matchRecipes — excludeAllergens by key', () => {
	it('filters on allergens.key, not allergens.id, binding the keys themselves as one JSON list', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, excludeAllergens: ['gluten', 'shellfish'] });
		expect(calls[0].sql).toContain('JOIN allergens a ON a.id = ia.allergen_id');
		expect(calls[0].sql).toContain('a.key IN (SELECT value FROM json_each(?6))');
		expect(calls[0].binds[5]).toBe(JSON.stringify(['gluten', 'shellfish']));
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
		expect(calls[0].sql).not.toContain('must_hit');
		expect(calls[0].binds).toHaveLength(5);
	});

	it('adds no clause and no bind when mustUse is an empty array', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [] });
		expect(calls[0].sql).not.toContain('must_hit');
		expect(calls[0].binds).toHaveLength(5);
	});

	it('dedupes mustUse before binding, and requires every listed id', async () => {
		const { db, calls } = spyDb();
		await matchRecipes(db, { ...base, slack: 1, mustUse: [1, 1, 2] });
		expect(calls[0].binds.slice(5)).toEqual([JSON.stringify([1, 2]), 2]);
		expect(calls[0].sql).toContain('HAVING matched >= ?3 AND must_hit = ?7');
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
		expect(calls[0].sql).not.toContain('must_hit');
	});
});
