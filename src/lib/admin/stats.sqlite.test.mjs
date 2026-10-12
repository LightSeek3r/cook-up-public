// /admin queries against SQLite (every migration applied): topRecipes against
// the single-level query it replaced, and the dashboard memo. `.mjs` for
// node:sqlite.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { topRecipes, cachedDashboard, resetDashboardCache, loadDashboard, DASHBOARD_TTL_MS } from './stats';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
const REPLACED = (where) => `SELECT pv.recipe_id AS id,
		COALESCE(t.title, src.title, 'recipe ' || pv.recipe_id) AS title, COUNT(*) AS views
	FROM page_view pv
	JOIN recipes r             ON r.id = pv.recipe_id
	LEFT JOIN recipe_i18n t    ON t.recipe_id = r.id AND t.lang = 'en'
	LEFT JOIN recipe_i18n src  ON src.recipe_id = r.id AND src.lang = r.source_lang
	WHERE pv.recipe_id IS NOT NULL ${where}
	GROUP BY pv.recipe_id ORDER BY views DESC, id ASC LIMIT ?`;

let sqlite;
let statements = 0;
let failNext = false;

function d1(lite) {
	const run = (fn) => {
		statements++;
		if (failNext) {
			failNext = false;
			return Promise.reject(new Error('D1_ERROR: boom'));
		}
		return Promise.resolve(fn());
	};
	return {
		prepare: (sql) => {
			const make = (binds) => ({
				bind: (...b) => make(b),
				all: () => run(() => ({ results: lite.prepare(sql).all(...binds) })),
				first: () => run(() => lite.prepare(sql).get(...binds) ?? null)
			});
			return make([]);
		}
	};
}

beforeAll(() => {
	sqlite = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort())
		sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
	const recipe = sqlite.prepare(`INSERT INTO recipes (id, source_url, source_lang, license) VALUES (?, 'u', ?, 'PD')`);
	const title = sqlite.prepare(`INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES (?, ?, ?, '')`);
	for (let id = 10; id < 70; id++) {
		recipe.run(id, id % 7 ? 'en' : 'fr');
		title.run(id, id % 7 ? 'en' : 'fr', `Recipe ${id}`);
	}
	const view = sqlite.prepare(`INSERT INTO page_view (path, recipe_id, lang, viewed_at) VALUES ('/x', ?, 'en', datetime('now', ?))`);
	let seed = 3;
	const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
	for (let k = 0; k < 3000; k++) {
		// Ids 1-3 have views but no recipe (deleted since), and the most views of all.
		const id = k % 10 === 0 ? 1 + (k % 3) : k % 13 === 0 ? null : 10 + Math.floor(rnd() * rnd() * 60);
		view.run(id, `-${Math.floor(rnd() * 90 * 24)} hours`);
	}
});

beforeEach(() => {
	statements = 0;
	failNext = false;
	resetDashboardCache();
});

describe('topRecipes', () => {
	it.each([
		[null, 25],
		[30, 25],
		[1, 25],
		[null, 3],
		[7, 1000]
	])('returns what the replaced query returned (days=%s, limit=%s)', async (days, limit) => {
		const expected = days === null
			? sqlite.prepare(REPLACED('')).all(limit)
			: sqlite.prepare(REPLACED(`AND pv.viewed_at >= datetime('now', ?)`)).all(`-${days} day`, limit);
		expect(expected.length).toBeGreaterThan(0);
		expect(await topRecipes(d1(sqlite), days, limit)).toEqual(expected);
	});

	it('leaves out views of recipes that no longer exist, before ranking', async () => {
		const ids = (await topRecipes(d1(sqlite), null, 1000)).map((r) => r.id);
		expect(ids).not.toContain(1);
		expect(ids.length).toBe(sqlite.prepare('SELECT COUNT(DISTINCT pv.recipe_id) n FROM page_view pv JOIN recipes r ON r.id = pv.recipe_id').get().n);
	});
});

describe('cachedDashboard', () => {
	it('loads once per TTL and returns what loadDashboard returns', async () => {
		const db = d1(sqlite);
		const first = await cachedDashboard(db, 1_000);
		const perLoad = statements;
		expect(perLoad).toBeGreaterThan(10);
		expect(await cachedDashboard(db, 1_000 + DASHBOARD_TTL_MS - 1)).toBe(first);
		expect(statements).toBe(perLoad);
		expect(first).toEqual(await loadDashboard(db));

		statements = 0;
		await cachedDashboard(db, 1_000 + DASHBOARD_TTL_MS);
		expect(statements).toBe(perLoad);
	});

	it('does not keep a failed load', async () => {
		const db = d1(sqlite);
		failNext = true;
		await expect(cachedDashboard(db, 5_000)).rejects.toThrow('boom');
		await expect(cachedDashboard(db, 5_001)).resolves.toMatchObject({ coverageMin: expect.any(Number) });
	});
});
