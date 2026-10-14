// /admin's figures. Traffic runs on a D1 with every migration applied (the
// runtime schema, no recipe corpus); every corpus figure comes from artefacts
// built from a corpus database (migrations up to CORPUS_SCHEMA_LAST) and is
// checked against the D1 query it replaced, run on that same database with
// the same page views. `.mjs` for node:sqlite.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
	cachedDashboard,
	corpusFigures,
	DASHBOARD_TTL_MS,
	loadDashboard,
	rankRecipes,
	recipeViews,
	resetDashboardCache,
	translationRows,
	unseenRecipes
} from './stats';
import { COVERAGE_MIN } from '$lib/config';
import { corpusFor, manifestCounts } from '$lib/server/data';
import { DataUnavailableError } from '$lib/apiError';
import { artefactAssets } from '$lib/test/assets';
import { buildArtefacts } from '../../../pipeline/lib/artefacts.mjs';
import { applyMigrations, CORPUS_SCHEMA_LAST, CORPUS_TABLES } from '../../../pipeline/lib/migrations.mjs';

/** The queries this dashboard ran against D1 before the corpus left it. */
const REPLACED = {
	topRecipes: (where) => `SELECT pv.recipe_id AS id,
			COALESCE(t.title, src.title, 'recipe ' || pv.recipe_id) AS title, COUNT(*) AS views
		FROM page_view pv
		JOIN recipes r             ON r.id = pv.recipe_id
		LEFT JOIN recipe_i18n t    ON t.recipe_id = r.id AND t.lang = 'en'
		LEFT JOIN recipe_i18n src  ON src.recipe_id = r.id AND src.lang = r.source_lang
		WHERE pv.recipe_id IS NOT NULL ${where}
		GROUP BY pv.recipe_id ORDER BY views DESC, id ASC LIMIT ?`,
	translations: `SELECT lang, COUNT(*) AS translated, COALESCE(SUM(is_machine), 0) AS machine
		FROM recipe_i18n GROUP BY lang ORDER BY translated DESC, lang`,
	content: `SELECT COUNT(*) AS recipes,
			SUM(CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) AS withImage,
			SUM(CASE WHEN kcal IS NOT NULL THEN 1 ELSE 0 END) AS withKcal,
			SUM(CASE WHEN notes IS NOT NULL AND notes <> '' THEN 1 ELSE 0 END) AS withNotes,
			SUM(CASE WHEN difficulty IS NOT NULL THEN 1 ELSE 0 END) AS withDifficulty,
			SUM(CASE WHEN cuisine IS NOT NULL AND cuisine <> '' THEN 1 ELSE 0 END) AS withCuisine,
			SUM(CASE WHEN nutrition_coverage >= ? THEN 1 ELSE 0 END) AS nutritionVisible
		FROM recipes`,
	grades: `SELECT COALESCE(balance_grade, '—') AS key, COUNT(*) AS n FROM recipes GROUP BY key ORDER BY key`,
	coverage: `SELECT CAST(MIN(nutrition_coverage, 0.999) * 10 AS INTEGER) AS key, COUNT(*) AS n
		FROM recipes GROUP BY key ORDER BY key`,
	ingredients: `SELECT COUNT(*) AS ingredients,
			SUM(CASE WHEN n.ingredient_id IS NOT NULL THEN 1 ELSE 0 END) AS withNutrition,
			SUM(CASE WHEN i.recipe_count = 0 THEN 1 ELSE 0 END) AS orphans
		FROM ingredients i LEFT JOIN ingredient_nutrition n ON n.ingredient_id = i.id`,
	// The original had no tie-break (`ORDER BY i.recipe_count DESC`); the id
	// is what the artefact side ties on.
	topIngredients: `SELECT COALESCE(en.name, i.canonical_key) AS key, i.recipe_count AS n
		FROM ingredients i LEFT JOIN ingredient_i18n en ON en.ingredient_id = i.id AND en.lang = 'en'
		ORDER BY i.recipe_count DESC, i.id LIMIT 20`,
	unseen: `SELECT COUNT(*) AS n FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM page_view pv WHERE pv.recipe_id = r.id)`
};

/** manifest.counts fields requested from the artefact generator (C:\tmp\p35\manifest-counts-spec.md), by their SQL. */
const SPEC_COUNTS = (db) => ({
	recipes_with: db.prepare(`SELECT
			SUM(image_url IS NOT NULL) AS image,
			SUM(notes IS NOT NULL AND notes <> '') AS notes,
			SUM(difficulty IS NOT NULL) AS difficulty FROM recipes`).get(),
	ingredient_nutrition: db.prepare(`SELECT COUNT(*) AS n FROM ingredients i
			WHERE EXISTS (SELECT 1 FROM ingredient_nutrition n WHERE n.ingredient_id = i.id)`).get().n,
	recipe_i18n_machine: Object.fromEntries(
		db.prepare('SELECT lang, COALESCE(SUM(is_machine), 0) AS m FROM recipe_i18n GROUP BY lang').all().map((r) => [r.lang, r.m])
	)
});

let corpusDb;
let runtimeDb;
let files;
let source;
let statements = [];
let failNext = false;

/** A D1 over node:sqlite that records every statement and can fail the next one. */
function d1(lite) {
	const run = (sql, fn) => {
		statements.push(sql);
		if (failNext) {
			failNext = false;
			return Promise.reject(new Error('D1_ERROR: boom'));
		}
		// D1 reports SQL errors as a rejected promise, never a synchronous throw.
		try {
			return Promise.resolve(fn());
		} catch (err) {
			return Promise.reject(err);
		}
	};
	return {
		prepare: (sql) => {
			const make = (binds) => ({
				bind: (...b) => make(b),
				all: () => run(sql, () => ({ results: lite.prepare(sql).all(...binds) })),
				first: () => run(sql, () => lite.prepare(sql).get(...binds) ?? null)
			});
			return make([]);
		}
	};
}

const platform = () => ({ env: { ASSETS: artefactAssets(files) } });
const loadSource = async () => {
	const p = platform();
	const [corpus, counts] = await Promise.all([corpusFor(p, 'en'), manifestCounts(p)]);
	return { corpus, counts };
};

beforeAll(async () => {
	corpusDb = applyMigrations(new DatabaseSync(':memory:'), { upTo: CORPUS_SCHEMA_LAST });
	runtimeDb = applyMigrations(new DatabaseSync(':memory:'));

	const ingredient = corpusDb.prepare(`INSERT INTO ingredients (id, canonical_key, category, recipe_count) VALUES (?, ?, 'other', ?)`);
	const name = corpusDb.prepare(`INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES (?, 'en', ?)`);
	const nutrition = corpusDb.prepare(`INSERT INTO ingredient_nutrition (ingredient_id, kcal) VALUES (?, 1)`);
	for (let id = 1; id <= 30; id++) {
		ingredient.run(id, `ing_${id}`, id % 9 === 0 ? 0 : (id * 7) % 23);
		if (id % 4) name.run(id, `Ingredient ${id}`);
		if (id % 3 === 0) nutrition.run(id);
	}

	const recipe = corpusDb.prepare(`INSERT INTO recipes (id, source_url, source_lang, license, cuisine, kcal, balance_grade,
		nutrition_coverage, image_url, notes, difficulty, total_minutes) VALUES (?, 'u', ?, 'PD', ?, ?, ?, ?, ?, ?, ?, ?)`);
	const title = corpusDb.prepare(`INSERT INTO recipe_i18n (recipe_id, lang, title, instructions, is_machine) VALUES (?, ?, ?, '', ?)`);
	const GRADES = ['A', 'B', 'C', 'D', 'E', null];
	const CUISINES = ['italian', '', null, 'indian'];
	for (let id = 10; id < 70; id++) {
		const src = id % 7 ? 'en' : 'fr';
		recipe.run(
			id, src, CUISINES[id % 4], id % 5 ? 100 + id : null, GRADES[id % 6],
			[0, 0.05, 0.42, 0.69, 0.7, 0.75, 0.999, 1][id % 8],
			id % 3 ? null : `https://img/${id}`, [null, '', 'note'][id % 3], id % 4 ? 1 + (id % 4) : null, id % 2 ? 10 + id : null
		);
		title.run(id, src, `Recipe ${id}`, 0);
		// Some French-source recipes have an English title of their own.
		if (src === 'fr' && id % 2) title.run(id, 'en', `English ${id}`, 1);
		for (const lang of id % 3 ? ['de', 'ja'] : ['de']) title.run(id, lang, `Recipe ${id}`, 1);
	}

	let seed = 3;
	const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
	const views = [];
	for (let k = 0; k < 3000; k++) {
		// Ids 1-3 have views but no recipe (deleted since), and the most views of all.
		const id = k % 10 === 0 ? 1 + (k % 3) : k % 13 === 0 ? null : 10 + Math.floor(rnd() * rnd() * 55);
		views.push([id, `-${Math.floor(rnd() * 90 * 24)} hours`]);
	}
	for (const db of [corpusDb, runtimeDb]) {
		const view = db.prepare(`INSERT INTO page_view (path, recipe_id, lang, viewed_at) VALUES ('/x', ?, 'en', datetime('now', ?))`);
		for (const v of views) view.run(...v);
	}

	files = buildArtefacts(corpusDb).files;
	source = await loadSource();
});

beforeEach(() => {
	statements = [];
	failNext = false;
	resetDashboardCache();
});

describe('top recipes', () => {
	it.each([
		[null, 25],
		[30, 25],
		[1, 25],
		[null, 3],
		[7, 1000]
	])('ranks as the replaced query did (days=%s, limit=%s)', async (days, limit) => {
		const expected = days === null
			? corpusDb.prepare(REPLACED.topRecipes('')).all(limit)
			: corpusDb.prepare(REPLACED.topRecipes(`AND pv.viewed_at >= datetime('now', ?)`)).all(`-${days} day`, limit);
		expect(expected.length).toBeGreaterThan(0);
		expect(rankRecipes(await recipeViews(d1(runtimeDb), days), source.corpus, limit)).toEqual(expected.map((r) => ({ ...r })));
	});

	it('leaves out views of recipes that no longer exist, before ranking', async () => {
		const ids = rankRecipes(await recipeViews(d1(runtimeDb), null), source.corpus, 1000).map((r) => r.id);
		expect(ids).not.toContain(1);
		expect(ids.length).toBe(corpusDb.prepare('SELECT COUNT(DISTINCT pv.recipe_id) n FROM page_view pv JOIN recipes r ON r.id = pv.recipe_id').get().n);
	});

	it('counts the never-opened recipes as the replaced query did', async () => {
		const unseen = corpusDb.prepare(REPLACED.unseen).get().n;
		expect(unseen).toBeGreaterThan(0);
		expect(unseenRecipes(await recipeViews(d1(runtimeDb), null), source.corpus)).toBe(unseen);
	});
});

describe('corpus figures', () => {
	const sql = (query, ...binds) => corpusDb.prepare(query).all(...binds).map((r) => ({ ...r }));
	// The manifest lists every language, with 0 where the SQL had no row at all.
	const present = (rows) => {
		expect(rows.filter((r) => r.translated === 0).length).toBe(rows.length - 4);
		return rows.filter((r) => r.translated > 0);
	};

	it('match the replaced queries once the manifest records every figure', () => {
		const counts = { ...source.counts, ...SPEC_COUNTS(corpusDb) };
		const f = corpusFigures({ corpus: source.corpus, counts });
		expect(f.content).toEqual({ ...corpusDb.prepare(REPLACED.content).get(COVERAGE_MIN) });
		expect(f.grades).toEqual(sql(REPLACED.grades));
		expect(f.coverage).toEqual(sql(REPLACED.coverage).map((r) => ({ key: String(r.key), n: r.n })));
		expect(f.ingredients).toEqual({ ...corpusDb.prepare(REPLACED.ingredients).get() });
		expect(f.topIngredients).toEqual(sql(REPLACED.topIngredients));
		expect(present(f.translations)).toEqual(sql(REPLACED.translations));
		// The fixture exercises every bucket it claims to.
		expect(f.grades.map((g) => g.key)).toContain('—');
		expect(f.content.withCuisine).toBeLessThan(f.content.recipes);
		expect(f.ingredients.orphans).toBeGreaterThan(0);
	});

	it('come from manifest counts the generator writes with the replaced queries\' semantics', () => {
		const spec = SPEC_COUNTS(corpusDb);
		expect(source.counts.recipes_with).toEqual({ ...spec.recipes_with });
		expect(source.counts.ingredient_nutrition).toBe(spec.ingredient_nutrition);
		for (const [lang, machine] of Object.entries(spec.recipe_i18n_machine)) expect(source.counts.recipe_i18n_machine[lang], lang).toBe(machine);
		const f = corpusFigures(source);
		expect(f.content.withImage).toBe(spec.recipes_with.image);
		expect(f.translations.every((t) => t.machine !== null)).toBe(true);
	});

	it('leave out, as null, the figures the manifest does not record', () => {
		const f = corpusFigures({ corpus: source.corpus, counts: { recipe_i18n: source.counts.recipe_i18n } });
		expect(f.content).toMatchObject({ withImage: null, withNotes: null, withDifficulty: null });
		expect(f.content.withKcal).toBe(corpusDb.prepare(REPLACED.content).get(COVERAGE_MIN).withKcal);
		expect(f.ingredients.withNutrition).toBeNull();
		expect(present(f.translations).map((t) => [t.lang, t.translated, t.machine])).toEqual(
			sql(REPLACED.translations).map((t) => [t.lang, t.translated, null])
		);
	});

	it('take the translated-row counts from the manifest the generator writes today', () => {
		expect(present(translationRows(source.counts)).map(({ lang, translated }) => ({ lang, translated }))).toEqual(
			sql(REPLACED.translations).map(({ lang, translated }) => ({ lang, translated }))
		);
	});

	it('ignore malformed counts rather than show them', () => {
		const f = corpusFigures({
			corpus: source.corpus,
			counts: { recipes_with: { image: -1, notes: 'x', difficulty: 1.5 }, ingredient_nutrition: null, recipe_i18n: { en: 'many', fr: 3 } }
		});
		expect(f.content).toMatchObject({ withImage: null, withNotes: null, withDifficulty: null });
		expect(f.ingredients.withNutrition).toBeNull();
		expect(f.translations).toEqual([{ lang: 'fr', translated: 3, machine: null }]);
		expect(corpusFigures({ corpus: source.corpus, counts: null }).translations).toEqual([]);
	});
});

describe('manifestCounts', () => {
	it('refuses a manifest from another data build', async () => {
		const other = new Map(files);
		const manifest = JSON.parse(other.get('manifest.json').toString('utf8'));
		other.set('manifest.json', Buffer.from(JSON.stringify({ ...manifest, version: 'ffffffffffffffff' })));
		await expect(manifestCounts({ env: { ASSETS: artefactAssets(other) } })).rejects.toBeInstanceOf(DataUnavailableError);
	});
});

describe('loadDashboard', () => {
	it('sends D1 page_view queries only', async () => {
		const dashboard = await loadDashboard(d1(runtimeDb), loadSource);
		expect(dashboard.topAll.length).toBeGreaterThan(0);
		expect(statements.length).toBeGreaterThan(5);
		for (const sql of statements) {
			expect(sql).toMatch(/\bFROM page_view\b/);
			for (const table of CORPUS_TABLES) expect(sql).not.toMatch(new RegExp(`\\b${table}\\b`));
		}
	});

	it('gives the same dashboard as the replaced queries on the same rows', async () => {
		const dashboard = await loadDashboard(d1(runtimeDb), loadSource);
		expect(dashboard.top30).toEqual(corpusDb.prepare(REPLACED.topRecipes(`AND pv.viewed_at >= datetime('now', ?)`)).all('-30 day', 25).map((r) => ({ ...r })));
		expect(dashboard.unseen).toBe(corpusDb.prepare(REPLACED.unseen).get().n);
		expect(dashboard.content.recipes).toBe(60);
		expect(dashboard.coverageMin).toBe(COVERAGE_MIN);
	});
});

describe('cachedDashboard', () => {
	it('loads once per TTL and returns what loadDashboard returns', async () => {
		const db = d1(runtimeDb);
		let sourced = 0;
		const counted = () => (sourced++, loadSource());
		const first = await cachedDashboard(db, counted, 1_000);
		const perLoad = statements.length;
		expect(perLoad).toBeGreaterThan(5);
		expect(await cachedDashboard(db, counted, 1_000 + DASHBOARD_TTL_MS - 1)).toBe(first);
		expect(statements.length).toBe(perLoad);
		expect(sourced).toBe(1);
		expect(first).toEqual(await loadDashboard(db, loadSource));

		statements = [];
		await cachedDashboard(db, counted, 1_000 + DASHBOARD_TTL_MS);
		expect(statements.length).toBe(perLoad);
		expect(sourced).toBe(2);
	});

	it('does not keep a failed load', async () => {
		const db = d1(runtimeDb);
		failNext = true;
		await expect(cachedDashboard(db, loadSource, 5_000)).rejects.toThrow('boom');
		await expect(cachedDashboard(db, loadSource, 5_001)).resolves.toMatchObject({ coverageMin: expect.any(Number) });
	});

	it('does not keep a load whose artefacts failed', async () => {
		const db = d1(runtimeDb);
		await expect(cachedDashboard(db, () => manifestCounts({ env: {} }).then(() => source), 6_000)).rejects.toBeInstanceOf(DataUnavailableError);
		await expect(cachedDashboard(db, loadSource, 6_001)).resolves.toMatchObject({ coverageMin: expect.any(Number) });
	});
});
