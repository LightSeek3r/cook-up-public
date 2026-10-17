// Runs the real matchRecipes SQL against SQLite (the corpus schema: migrations
// up to CORPUS_SCHEMA_LAST, then a small fixture) and compares it with a brute-force reference of the documented
// rules. match.test.ts only sees SQL text through a spy, which cannot catch a
// query that is invalid or merely wrong. `.mjs` for node:sqlite / node:fs
// without @types/node (see the unpublished project notes).
import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { matchRecipes, resolveIngredientIds } from './match';
import { slackFor } from '$lib/match';
import { sqliteD1 } from '../d1';
import { applyMigrations, CORPUS_SCHEMA_LAST, MIGRATIONS_DIR } from '../../../../pipeline/lib/migrations.mjs';

const SEP = String.fromCharCode(31);

// [id, canonical_key, is_staple]
const INGREDIENTS = [
	[1, 'egg', 0], [2, 'egg_yolk', 0], [3, 'egg_white', 0], [4, 'flour', 0], [5, 'cassava', 0],
	[6, 'cassava_flour', 0], [7, 'salt', 1], [8, 'water', 1], [9, 'onion', 0], [10, 'garlic', 0],
	[11, 'tomato', 0], [12, 'milk', 0], [13, 'butter', 0], [14, 'sugar', 0], [15, 'brown_sugar', 0],
	[16, 'dark_brown_sugar', 0], [17, 'saffron', 0]
];
// [specific_id, generic_id] — transitively closed like GENERIC_PAIRS_CLOSED, and
// cassava_flour has two parents.
const GENERIC_OF = [[2, 1], [3, 1], [6, 4], [6, 5], [15, 14], [16, 15], [16, 14]];
const NAMES = {
	en: Object.fromEntries(INGREDIENTS.filter(([id]) => id !== 16).map(([id, key]) => [id, key.replace(/_/g, ' ')])),
	fr: { 1: 'œuf', 9: 'oignon', 12: 'lait', 14: 'sucre' },
	ja: { 1: '卵' }
};
const ALLERGENS = [[1, 'gluten'], [2, 'dairy'], [3, 'egg']];
const INGREDIENT_ALLERGENS = [[4, 1], [12, 2], [13, 2], [1, 3], [2, 3], [3, 3]];
// id, source_lang, cuisine, meal_type, prep, total, kcal, grade, score, coverage, servings_assumed, ingredient ids
const RECIPES = [
	[101, 'en', 'french', 'breakfast', 5, 10, 300, 'B', 70, 0.9, 0, [1, 9, 7, 12, 13]],
	[102, 'en', 'french', 'side', 10, null, 700, 'E', 10, 0.8, 0, [2, 7, 8, 10]],
	[103, 'en', null, 'dessert', 15, 90, 120, 'C', 50, 0.5, 1, [3, 14]],
	[104, 'en', 'african', null, 30, 60, null, null, null, 0.2, 0, [6, 8, 7]],
	[105, 'en', 'american', 'breakfast', 10, 25, 450, 'C', 55, 0.95, 0, [4, 1, 12, 14, 13]],
	[106, 'en', 'italian', 'dinner', 10, 40, 150, 'A', 90, 1, 0, [11, 9, 10, 7, 8]],
	[107, 'en', null, 'dessert', 5, 20, 500, 'D', 30, 0.75, 0, [16, 13]],
	[108, 'en', null, null, null, 1, 0, 'A', 100, 1, 1, [7, 8]],
	[109, 'fr', 'french', 'dessert', 20, 40, 350, 'B', 72, 0.9, 0, [2, 3, 12, 14]],
	[110, 'en', 'italian', 'side', 10, 25, 400, 'D', 35, 0.85, 0, [4, 10, 13, 7]],
	[111, 'en', 'american', 'dessert', 20, 45, 480, 'D', 25, 0.7, 0, [4, 1, 15, 13]],
	[112, 'en', null, null, null, null, null, null, null, 0, 0, []],
	[113, 'en', 'african', 'dinner', 5, 25, 200, 'B', 70, 0.9, 0, [5, 9, 11, 10]]
];
const TITLES = {
	en: { 101: 'Omelette', 102: 'Aioli', 103: 'Meringue', 104: 'Cassava bread', 105: 'Pancakes', 106: 'Tomato soup',
		107: 'Caramel', 108: 'Brine', 110: 'Garlic bread', 111: 'Brownie', 112: 'Nothing', 113: 'Cassava stew' },
	fr: { 101: 'Omelette française', 109: 'Crème anglaise' }
};
const DIETS = [[101, 'vegetarian'], [103, 'vegan'], [104, 'vegan'], [106, 'vegan'], [108, 'vegan'], [113, 'vegan'],
	[105, 'vegetarian'], [109, 'vegetarian'], [110, 'vegetarian']];
// Left NULL after seeding, so its required_non_staple goes through match.ts's fallback count.
const NULL_COUNT_RECIPE = 111;

let db;
let sqlite;

beforeAll(() => {
	sqlite = new DatabaseSync(':memory:');
	applyMigrations(sqlite, { upTo: CORPUS_SCHEMA_LAST });

	const run = (sql, rows) => { const st = sqlite.prepare(sql); for (const r of rows) st.run(...r); };
	run('INSERT INTO ingredients (id, canonical_key, category, is_staple) VALUES (?, ?, \'other\', ?)', INGREDIENTS);
	run('INSERT INTO ingredient_generic_of (specific_id, generic_id) VALUES (?, ?)', GENERIC_OF);
	for (const [lang, names] of Object.entries(NAMES))
		run('INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES (?, ?, ?)', Object.entries(names).map(([id, n]) => [Number(id), lang, n]));
	run('INSERT INTO allergens (id, key) VALUES (?, ?)', ALLERGENS);
	run('INSERT INTO ingredient_allergens (ingredient_id, allergen_id) VALUES (?, ?)', INGREDIENT_ALLERGENS);
	run(`INSERT INTO recipes (id, source_url, source_lang, license, cuisine, meal_type, prep_minutes, total_minutes,
		kcal, balance_grade, balance_score, nutrition_coverage, servings_assumed) VALUES (?, 'u', ?, 'PD', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		RECIPES.map((r) => r.slice(0, 11)));
	run('INSERT INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (?, ?)', RECIPES.flatMap((r) => r[11].map((i) => [r[0], i])));
	for (const [lang, titles] of Object.entries(TITLES))
		run('INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES (?, ?, ?, \'\')', Object.entries(titles).map(([id, t]) => [Number(id), lang, t]));
	run('INSERT INTO recipe_diets (recipe_id, diet) VALUES (?, ?)', DIETS);

	// Fill non_staple_count with the migration's own statement, so the stored
	// value under test is the one remote D1 gets.
	const update = readFileSync(path.join(MIGRATIONS_DIR, '0009_recipe_non_staple_count.sql'), 'utf8').match(/UPDATE recipes[\s\S]*?;/);
	sqlite.exec(update[0]);
	sqlite.prepare('UPDATE recipes SET non_staple_count = NULL WHERE id = ?').run(NULL_COUNT_RECIPE);

	db = sqliteD1(sqlite);
});

// ---- brute-force reference of the documented rules ----------------------------------------
const staple = new Map(INGREDIENTS.map(([id, , s]) => [id, s]));
const keyOf = new Map(INGREDIENTS.map(([id, key]) => [id, key]));
const nameOf = (id, lang) => NAMES[lang]?.[id] ?? NAMES.en[id] ?? keyOf.get(id);
const allergensOf = (id) => INGREDIENT_ALLERGENS.filter(([i]) => i === id).map(([, a]) => ALLERGENS.find(([x]) => x === a)[1]);

// SQLite ordering: NULL sorts before every value in ASC.
const asc = (a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1);
const ORDER = {
	default: (r) => [r.missing, r.required_non_staple, r.total_minutes, r.id],
	kcal: (r) => [r.nutrition_coverage < 0.7 || r.kcal === null ? 1 : 0, r.kcal, r.missing, r.id],
	grade: (r) => [r.balance_grade === null ? 1 : 0, r.balance_grade, r.missing, r.id],
	time: (r) => [r.total_minutes === null ? 1 : 0, r.total_minutes, r.missing, r.id]
};

function reference(p) {
	const have = [...new Set(p.have)];
	if (have.length === 0) return { results: [], total: 0 };
	const slack = Math.max(0, p.slack ?? 0);
	const floor = Math.max(1, have.length - slack);
	const satisfies = new Map(
		have.filter((h) => keyOf.has(h)).map((h) => [h, new Set([h, ...GENERIC_OF.filter(([, g]) => g === h).map(([s]) => s)])])
	);
	const anySat = new Set([...satisfies.values()].flatMap((s) => [...s]));
	const must = [...new Set(p.mustUse ?? [])].filter((id) => have.includes(id));
	const rows = [];
	for (const [id, src, cuisine, meal, prep, total, kcal, grade, score, coverage, assumed, ingIds] of RECIPES) {
		const ings = [...ingIds].sort((a, b) => a - b);
		const used = have.filter((h) => satisfies.get(h) && ings.some((i) => satisfies.get(h).has(i)));
		if (used.length < floor) continue;
		if (p.cuisine && cuisine !== p.cuisine) continue;
		if (p.mealType && meal !== p.mealType) continue;
		if (p.diet && !DIETS.some(([r, d]) => r === id && d === p.diet)) continue;
		if (p.excludeAllergens?.length && ings.some((i) => allergensOf(i).some((a) => p.excludeAllergens.includes(a)))) continue;
		if (!must.every((m) => used.includes(m))) continue;
		const nonStaple = ings.filter((i) => staple.get(i) === 0);
		const missingIds = nonStaple.filter((i) => !anySat.has(i));
		const unused = have.filter((h) => keyOf.has(h) && !used.includes(h));
		const join = (xs) => (xs.length ? xs.join(SEP) : null);
		rows.push({
			id, title: TITLES[p.lang]?.[id] ?? TITLES[src]?.[id], cuisine, meal_type: meal, prep_minutes: prep,
			total_minutes: total, kcal, balance_grade: grade, balance_score: score, nutrition_coverage: coverage,
			servings_assumed: assumed, matched: used.length,
			unused_names: join(unused.map((h) => nameOf(h, p.lang))),
			used_names: join(used.map((h) => nameOf(h, p.lang))),
			used_keys: join(used.map((h) => keyOf.get(h))),
			missing: missingIds.length, required_non_staple: nonStaple.length,
			missing_names: join(missingIds.map((i) => nameOf(i, p.lang))),
			missing_keys: join(missingIds.map((i) => keyOf.get(i))),
			total: 0
		});
	}
	const keyFn = ORDER[p.sort ?? 'default'];
	const sortKey = slack > 0 ? (r) => [-r.matched, ...keyFn(r)] : keyFn;
	rows.sort((a, b) => {
		const ka = sortKey(a), kb = sortKey(b);
		for (let i = 0; i < ka.length; i++) { const c = asc(ka[i], kb[i]); if (c) return c; }
		return 0;
	});
	for (const r of rows) r.total = rows.length;
	const offset = p.offset ?? 0;
	const page = rows.slice(offset, offset + (p.limit ?? 50));
	return { results: page, total: page.length ? rows.length : 0 };
}

const COLUMNS = ['id', 'title', 'cuisine', 'meal_type', 'prep_minutes', 'total_minutes', 'kcal', 'balance_grade',
	'balance_score', 'nutrition_coverage', 'servings_assumed', 'matched', 'unused_names', 'used_names', 'used_keys', 'missing',
	'required_non_staple', 'missing_names', 'missing_keys', 'total'];

function subsets(items, maxSize) {
	const out = [[]];
	for (const item of items) for (const s of [...out]) if (s.length < maxSize) out.push([...s, item]);
	return out.filter((s) => s.length);
}

const SELECTABLE = [1, 2, 4, 5, 7, 9, 10, 12, 14, 16, 17];
const OPTIONS = [
	{},
	{ lang: 'fr' },
	{ lang: 'ja', sort: 'kcal' },
	{ sort: 'grade' },
	{ sort: 'time', offset: 1, limit: 2 },
	{ cuisine: 'french' },
	{ mealType: 'dessert', diet: 'vegetarian' },
	{ excludeAllergens: ['dairy'] },
	{ excludeAllergens: ['gluten', 'egg'] }
];

describe('matchRecipes against real SQLite', () => {
	it('returns exactly the reference rows, columns and order for every selection of up to 3 ingredients × option set', async () => {
		let compared = 0;
		let nonEmpty = 0;
		for (const have of subsets(SELECTABLE, 3)) {
			for (const opt of OPTIONS) {
				const p = { have, lang: 'en', slack: slackFor(have.length), ...opt };
				const actual = await matchRecipes(db, p);
				expect(actual, JSON.stringify(p)).toEqual(reference(p));
				if (actual.results.length) {
					nonEmpty++;
					expect(Object.keys(actual.results[0])).toEqual(COLUMNS);
				}
				compared++;
			}
		}
		// Guard against a vacuous pass (e.g. every call returning nothing).
		expect(compared).toBe(231 * OPTIONS.length);
		expect(nonEmpty).toBeGreaterThan(500);
		// ~3s alone, past vitest's 5s default when the suite runs in parallel.
	}, 30_000);

	it.each([
		['mustUse narrows a slack match to recipes using that selection', { have: [1, 9, 12], slack: 1, mustUse: [9] }],
		['mustUse ids outside have are dropped, not enforced', { have: [1, 9, 12], slack: 1, mustUse: [999] }],
		['duplicated have ids count once', { have: [1, 1, 12] }],
		['a selection with no ingredients row stays unused, never matched', { have: [1, 999, 12], slack: 1 }],
		['slack larger than the selection still needs one match', { have: [5, 17], slack: 9 }],
		['offset beyond the end reports no rows and total 0', { have: [1], offset: 50 }],
		['generic credits two specific forms in one recipe once', { have: [1, 14], slack: 0 }],
		['both parents of a two-parent specific are credited', { have: [4, 5], slack: 0 }]
	])('%s', async (_name, params) => {
		const p = { lang: 'en', ...params };
		expect(await matchRecipes(db, p)).toEqual(reference(p));
	});

	it('uses the stored non_staple_count and falls back to counting when it is NULL', async () => {
		const stored = sqlite.prepare('SELECT id, non_staple_count FROM recipes WHERE id IN (105, 111) ORDER BY id').all();
		expect(stored.map((r) => ({ ...r }))).toEqual([{ id: 105, non_staple_count: 5 }, { id: 111, non_staple_count: null }]);
		const { results } = await matchRecipes(db, { have: [4], lang: 'en' });
		const byId = Object.fromEntries(results.map((r) => [r.id, r]));
		expect(byId[105].required_non_staple).toBe(5);
		expect(byId[111].required_non_staple).toBe(4);
		expect(byId[111].missing).toBe(3);
	});

	// The cost guarantee: no base table is ever scanned, only searched through an
	// index, so rows read stay proportional to the selection rather than to the
	// corpus. Without sqlite_stat1 the planner's estimates don't depend on table
	// sizes, so this tiny fixture gets the same plan as the real database. Scans
	// are allowed only on json_each, the CTEs, and (at the top level) the
	// already-LIMITed page.
	it.each([
		{ have: [1, 9, 12] },
		{ have: [1, 9, 12], slack: 1, mustUse: [1], sort: 'grade' },
		{ have: [4], cuisine: 'french', mealType: 'dessert' },
		{ have: [4, 14], diet: 'vegan', excludeAllergens: ['gluten', 'egg'], sort: 'kcal' }
	])('never scans a base table: %j', async (params) => {
		let captured;
		const spy = { prepare: (sql) => ({ bind: (...binds) => ({ all: async () => { captured = { sql, binds }; return { results: [] }; } }) }) };
		await matchRecipes(spy, { lang: 'en', ...params });
		const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${captured.sql}`).all(...captured.binds);
		const scans = plan.filter((row) => /^SCAN /.test(row.detail));
		expect(scans.length).toBeGreaterThan(0);
		const allowed = (row) =>
			/^SCAN (h|json_each) VIRTUAL TABLE/.test(row.detail) ||
			/^SCAN (s|sat|hit|\(subquery-\d+\))$/.test(row.detail) ||
			(row.detail === 'SCAN r' && row.parent === 0);
		expect(scans.filter((row) => !allowed(row)).map((row) => row.detail)).toEqual([]);
	});

	it('matches the reference for a recipe whose title exists only in its source language', async () => {
		const { results } = await matchRecipes(db, { have: [2], lang: 'en' });
		expect(results.find((r) => r.id === 109)?.title).toBe('Crème anglaise');
	});

	// /api/match responses are cached per URL, so any order of the same keys in
	// `?have=` must give the same response, `unused_names` order included.
	it('gives every permutation of a selection the same ids and the same response', async () => {
		const keys = ['tomato', 'onion', 'egg', 'not_a_real_food', 'milk'];
		const perms = [keys, [...keys].reverse(), [keys[2], keys[0], keys[4], keys[1], keys[3]]];
		const resolved = await Promise.all(perms.map((k) => resolveIngredientIds(db, k)));
		expect(resolved[0]).toEqual([1, 12, 9, 11]);
		for (const ids of resolved) expect(ids).toEqual(resolved[0]);
		const p = { lang: 'fr', slack: 2 };
		const first = await matchRecipes(db, { ...p, have: resolved[0] });
		expect(first.results.some((r) => r.unused_names?.includes(SEP))).toBe(true);
		for (const ids of resolved) expect(await matchRecipes(db, { ...p, have: ids })).toEqual(first);
	});
});
