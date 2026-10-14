// Both seeds applied to node:sqlite with the corpus schema (migrations up to
// CORPUS_SCHEMA_LAST) and foreign keys on (D1 enforces them), on a small
// synthetic corpus.
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { buildLocalSeed } from './06_seed_d1.mjs';
import { buildRemoteSeed, buildRelatedUnits, buildRestoreUnits } from './gen_remote_seed.mjs';
import { applyMigrations, CORPUS_SCHEMA_LAST, CORPUS_TABLES } from './lib/migrations.mjs';
import { packChunks, schemaIndexes, checkWriteBudget, WriteBudgetExceeded, mergeIngredientNames, mergeRecipeI18n, titleFtsRefresh } from './lib/seed_sql.mjs';

const indexes = schemaIndexes();

const KEYS = ['chicken', 'onion', 'garlic', 'tomato', 'beef', 'rice', 'egg', 'egg_yolk', 'milk', 'flour', 'salt', 'water', 'saffron', 'leek'];
const TITLES = [
	'Chicken soup', 'Beef stew', 'Chicken curry', 'Tomato rice', 'Garlic bread', 'Leek tart',
	'Lemon chicken', 'Onion soup', 'Egg fried rice', 'Saffron rice', 'Chickpea salad', 'Roast beef'
];

function corpus() {
	const ingredients = KEYS.map((k, i) => ({
		canonical_key: k,
		category: 'other',
		is_staple: k === 'salt' || k === 'water' ? 1 : 0,
		beneficial: i % 2,
		allergens: k === 'flour' ? ['gluten'] : k === 'milk' ? ['dairy'] : [],
		names: { en: k.replace('_', ' '), fr: `${k}-fr`, ...(i % 3 ? {} : { de: `${k}-de` }) }
	}));
	const recipes = TITLES.map((title, i) => ({
		id: 1000 + i * 7,
		source_url: `https://example.org/${i}`,
		source_lang: 'en',
		license: 'CC-BY-SA-3.0',
		attribution: `Wikibooks — ${title}`,
		cuisine: i % 2 ? 'italian' : 'american',
		meal_type: 'dinner',
		difficulty: i % 3 ? 'easy' : null,
		notes: i % 4 ? [] : ['Keeps a day.'],
		prep_minutes: 10 + i,
		total_minutes: 30 + i,
		servings: i % 5 ? 4 : null,
		title,
		instructions: `1. Step one of ${title}.\n2. It's done.`
	}));
	// Recipe 11 (Roast beef) has no ingredients, so the pipeline drops it.
	const recipeIngredients = recipes.slice(0, 11).flatMap((r, i) =>
		[KEYS[i % KEYS.length], KEYS[(i + 3) % KEYS.length], 'salt', KEYS[(i + 5) % KEYS.length]]
			.filter((k, j, a) => a.indexOf(k) === j)
			.map((k, j) => ({ recipe_id: r.id, canonical_key: k, raw_text: `${j + 1} ${k}`, quantity: j + 1, unit: 'g' }))
	);
	return {
		recipes,
		ingredients,
		recipeIngredients,
		recipeGrams: recipeIngredients.filter((_, i) => i % 2).map((ri) => ({ recipe_id: ri.recipe_id, canonical_key: ri.canonical_key, grams: 50 })),
		recipeDiets: recipes.slice(0, 11).flatMap((r, i) => (i % 2 ? [{ recipe_id: r.id, diet: 'gluten_free' }] : [{ recipe_id: r.id, diet: 'vegetarian' }, { recipe_id: r.id, diet: 'dairy_free' }])),
		recipeNutrition: recipes.slice(0, 9).map((r, i) => ({ id: r.id, nutrition_coverage: 0.5 + i / 20, kcal: 300 + i, protein_g: 10, fat_g: 5, carb_g: 40, fiber_g: 2, sodium_mg: 100, sat_fat_g: 1, sugar_g: 3, balance_grade: 'B', balance_score: 70 })),
		ingredientNutrition: ingredients.slice(0, 6).map((g, i) => ({ canonical_key: g.canonical_key, fdc_id: 9000 + i, kcal: 100, protein_g: 1, fat_g: 1, carb_g: 1, fiber_g: null, sodium_mg: 1, sat_fat_g: null, sugar_g: null })),
		ingredientMicros: ingredients.slice(0, 4).map((g) => ({ canonical_key: g.canonical_key, nutrient_key: 'iron', amount: 1.5, unit: 'mg' })),
		recipeMicros: recipes.slice(0, 11).flatMap((r) => ['iron', 'calcium'].map((k) => ({ recipe_id: r.id, nutrient_key: k, amount: 2, unit: 'mg', pct_nrv: 14 }))),
		recipeImages: [{ recipe_id: 1000, url: 'https://upload.example/a.jpg', width: 640, height: 480, page: 'https://commons.example/a', author: 'A', licence: 'CC-BY-4.0' }]
	};
}

/** Translation backup rows: `langs` per kept recipe (source rows included, as remote holds them). */
function i18nBackup(data, langs) {
	return data.recipes.flatMap((r) => [
		{ recipe_id: r.id, lang: 'en', title: r.title, instructions: r.instructions, is_machine: 0 },
		...langs.filter((l) => l !== 'en').map((l) => ({ recipe_id: r.id, lang: l, title: r.title, instructions: `1. ${l} ${r.id} — étape.\n2. Fin.`, is_machine: 1 }))
	]);
}

function migrated() {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON;');
	return applyMigrations(db, { upTo: CORPUS_SCHEMA_LAST });
}

const localSeed = (db, data, backup) => db.exec(buildLocalSeed(data, backup).sql.join('\n'));
const applyChunks = (db, chunks) => chunks.forEach((c) => db.exec(c.sql));
const ftsBytes = (db) => db.prepare('SELECT SUM(length(block)) AS b FROM recipe_title_fts_data').get().b;
const indexedRowids = (db) => db.prepare('SELECT id FROM recipe_title_fts_docsize ORDER BY id').all().map((r) => r.id);
const sourceRowids = (db) =>
	db.prepare('SELECT i.rowid AS id FROM recipe_i18n i JOIN recipes r ON r.id = i.recipe_id AND i.lang = r.source_lang ORDER BY i.rowid').all().map((r) => r.id);

/** Title search the way src/lib/search.ts resolves FTS hits: by rowid. */
function titleHits(db, term) {
	return db
		.prepare(
			`SELECT m.recipe_id, m.lang, m.title FROM recipe_title_fts f JOIN recipe_i18n m ON m.rowid = f.rowid
			 WHERE f.title MATCH ? ORDER BY m.recipe_id`
		)
		.all(`"${term}"`);
}

function expectConsistentFts(db) {
	expect(indexedRowids(db)).toEqual(sourceRowids(db));
	const want = db.prepare(`SELECT r.id FROM recipes r JOIN recipe_i18n i ON i.recipe_id = r.id AND i.lang = r.source_lang WHERE i.title LIKE '%chicken%' ORDER BY r.id`).all();
	const got = titleHits(db, 'chicken');
	expect(got.map((h) => h.recipe_id)).toEqual(want.map((r) => r.id));
	for (const h of got) expect([h.lang, /chicken/i.test(h.title)]).toEqual(['en', true]);
}

function remoteSeed(db, data, { names = null, maxBytes } = {}) {
	const remoteRecipeIds = new Set(db.prepare('SELECT id FROM recipes').all().map((r) => r.id));
	const seed = buildRemoteSeed(data, { remoteRecipeIds, ingredientNames: names, indexes, maxBytes });
	return { seed, chunks: packChunks(seed.units, maxBytes ?? 20_000) };
}

describe('06_seed_d1 (local)', () => {
	it('keeps title search right when a reseed renumbers recipe_i18n', () => {
		const data = corpus();
		const db = migrated();
		localSeed(db, data, { recipe_i18n: i18nBackup(data, ['en', 'fr']) });
		expectConsistentFts(db);
		const before = sourceRowids(db);
		localSeed(db, data, { recipe_i18n: i18nBackup(data, ['en', 'de', 'fr', 'ar']) });
		expect(sourceRowids(db)).not.toEqual(before);
		expectConsistentFts(db);
	});

	it('the old append-only tail fails the same check (guards the test itself)', () => {
		const data = corpus();
		const db = migrated();
		localSeed(db, data, { recipe_i18n: i18nBackup(data, ['en', 'fr']) });
		const sql = buildLocalSeed(data, { recipe_i18n: i18nBackup(data, ['en', 'de', 'fr', 'ar']) }).sql;
		const [, appendOnly] = titleFtsRefresh(0);
		db.exec(sql.filter((s) => !s.includes("VALUES('delete-all')")).join('\n'));
		expect(sql).toContain(appendOnly.sql);
		expect(() => expectConsistentFts(db)).toThrow();
	});

	it('loads every backed-up translation of a kept recipe, so local serves what remote serves', () => {
		const data = corpus();
		const db = migrated();
		const backup = i18nBackup(data, ['en', 'fr', 'hi']);
		localSeed(db, data, { recipe_i18n: backup, ingredient_i18n: [{ ingredient_id: 99, canonical_key: 'leek', lang: 'jv', name: 'bawang prei' }] });
		const kept = new Set(data.recipeIngredients.map((r) => r.recipe_id));
		const want = backup.filter((r) => kept.has(r.recipe_id)).sort((a, b) => a.recipe_id - b.recipe_id || a.lang.localeCompare(b.lang));
		expect(db.prepare('SELECT recipe_id, lang, title, instructions, is_machine FROM recipe_i18n ORDER BY recipe_id, lang').all().map((r) => ({ ...r }))).toEqual(want);
		expect(db.prepare(`SELECT n.name FROM ingredient_i18n n JOIN ingredients i ON i.id = n.ingredient_id WHERE i.canonical_key = 'leek' AND n.lang = 'jv'`).get().name).toBe('bawang prei');
	});

	it('without a backup seeds the source-language rows only', () => {
		const data = corpus();
		const db = migrated();
		localSeed(db, data, {});
		expect(db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT lang) l FROM recipe_i18n`).get()).toEqual({ n: 11, l: 1 });
		expectConsistentFts(db);
	});

	it('writes recipe_i18n_stats equal to a live count', () => {
		const data = corpus();
		const db = migrated();
		localSeed(db, data, { recipe_i18n: i18nBackup(data, ['en', 'fr', 'ja']) });
		const live = db.prepare('SELECT lang, COUNT(*) AS translated, SUM(is_machine) AS machine FROM recipe_i18n GROUP BY lang ORDER BY lang').all();
		expect(db.prepare('SELECT lang, translated, machine FROM recipe_i18n_stats ORDER BY lang').all()).toEqual(live);
	});

	it('keeps every statement under D1’s statement-size cap, even with long translations', () => {
		const data = corpus();
		const long = i18nBackup(data, ['en', 'hi']).map((r) => (r.lang === 'hi' ? { ...r, instructions: 'क'.repeat(14_000) } : r));
		const sql = buildLocalSeed(data, { recipe_i18n: long }).sql;
		expect(Math.max(...sql.map((s) => Buffer.byteLength(s)))).toBeLessThan(100_000);
	});
});

describe('gen_remote_seed (remote)', () => {
	/** Remote as it is today: seeded once, then translated by the translation tooling. */
	function remote(data) {
		const db = migrated();
		localSeed(db, data, { recipe_i18n: i18nBackup(data, ['en', 'fr', 'ja', 'pnb']) });
		return db;
	}

	it('does not grow recipe_title_fts on repeated reseeds', () => {
		const data = corpus();
		const db = remote(data);
		const clean = ftsBytes(db);
		for (let run = 0; run < 3; run++) {
			applyChunks(db, remoteSeed(db, data).chunks);
			expect(ftsBytes(db)).toBe(clean);
			expectConsistentFts(db);
		}
	});

	it('the old append-only tail doubles the index (guards the test itself)', () => {
		const data = corpus();
		const db = remote(data);
		const clean = ftsBytes(db);
		const [, appendOnly] = titleFtsRefresh(0);
		db.exec(appendOnly.sql);
		expect(ftsBytes(db)).toBeGreaterThan(clean * 1.5);
	});

	it('never deletes or overwrites a translation, and keeps remote-only ingredient names', () => {
		const data = corpus();
		const db = remote(data);
		db.prepare(`INSERT INTO ingredient_i18n (ingredient_id, lang, name) SELECT id, 'jv', 'bawang prei' FROM ingredients WHERE canonical_key = 'leek'`).run();
		const names = db.prepare('SELECT n.ingredient_id, i.canonical_key, n.lang, n.name FROM ingredient_i18n n JOIN ingredients i ON i.id = n.ingredient_id').all();
		const before = db.prepare('SELECT recipe_id, lang, title, instructions, is_machine FROM recipe_i18n ORDER BY recipe_id, lang').all();
		const namesBefore = db.prepare('SELECT i.canonical_key, n.lang, n.name FROM ingredient_i18n n JOIN ingredients i ON i.id = n.ingredient_id ORDER BY 1, 2').all();

		applyChunks(db, remoteSeed(db, data, { names }).chunks);
		expect(db.prepare('SELECT recipe_id, lang, title, instructions, is_machine FROM recipe_i18n ORDER BY recipe_id, lang').all()).toEqual(before);
		expect(db.prepare('SELECT i.canonical_key, n.lang, n.name FROM ingredient_i18n n JOIN ingredients i ON i.id = n.ingredient_id ORDER BY 1, 2').all()).toEqual(namesBefore);
	});

	it('inserts a recipe remote has never seen, with its source row, and refreshes the stats', () => {
		const data = corpus();
		const db = remote(data);
		const id = data.recipes[3].id;
		for (const t of ['recipe_related', 'recipe_micronutrient', 'recipe_diets', 'recipe_ingredients', 'recipe_i18n']) db.prepare(`DELETE FROM ${t} WHERE recipe_id = ?`).run(id);
		db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
		const { seed, chunks } = remoteSeed(db, data);
		expect(seed.fresh.map((r) => r.id)).toEqual([id]);
		applyChunks(db, chunks);
		expect(db.prepare('SELECT lang, title FROM recipe_i18n WHERE recipe_id = ?').all(id)).toEqual([{ lang: 'en', title: TITLES[3] }]);
		const live = db.prepare('SELECT lang, COUNT(*) AS translated, SUM(is_machine) AS machine FROM recipe_i18n GROUP BY lang ORDER BY lang').all();
		expect(db.prepare('SELECT lang, translated, machine FROM recipe_i18n_stats ORDER BY lang').all()).toEqual(live);
		expectConsistentFts(db);
	});

	it('produces the same pipeline tables as the local seed', () => {
		const data = corpus();
		const db = remote(data);
		applyChunks(db, remoteSeed(db, data).chunks);
		const local = migrated();
		localSeed(local, data, { recipe_i18n: i18nBackup(data, ['en', 'fr', 'ja', 'pnb']) });
		for (const t of ['ingredients', 'ingredient_i18n', 'ingredient_allergens', 'ingredient_generic_of', 'recipes', 'recipe_ingredients', 'recipe_diets', 'recipe_related', 'recipe_micronutrient', 'ingredient_nutrition', 'ingredient_micronutrient', 'allergens']) {
			const all = (d) => d.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all();
			expect(all(db), t).toEqual(all(local));
		}
	});

	it('binds each recipe-keyed DELETE to its first INSERT, and FTS clears to their refills', () => {
		const data = corpus();
		const db = remote(data);
		const { chunks } = remoteSeed(db, data, { maxBytes: 700 });
		expect(chunks.length).toBeGreaterThan(15);
		for (const t of ['recipe_diets', 'recipe_micronutrient', 'recipe_related']) {
			const at = chunks.findIndex((c) => c.sql.includes(`DELETE FROM ${t};`));
			expect(chunks[at].sql, t).toContain(`INSERT INTO ${t} (`);
			expect(at, t).toBeGreaterThan(0);
		}
		const fts = chunks.find((c) => c.sql.includes("recipe_title_fts(recipe_title_fts) VALUES('delete-all')"));
		expect(fts.sql).toContain('INSERT INTO recipe_title_fts(rowid, title)');
		expect(chunks[0].sql).not.toContain('DELETE FROM recipe_diets');
	});

	it('a stop after any chunk never leaves a recipe-keyed table empty or the title index missing', () => {
		const data = corpus();
		const probe = remote(data);
		const { chunks } = remoteSeed(probe, data, { maxBytes: 700 });
		for (let k = 1; k < chunks.length; k++) {
			const db = remote(data);
			applyChunks(db, chunks.slice(0, k));
			for (const t of ['recipe_diets', 'recipe_micronutrient', 'recipe_related', 'recipe_i18n', 'recipe_title_fts_docsize']) {
				expect(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, `${t} after chunk ${k}`).toBeGreaterThan(0);
			}
		}
	});
});

describe('gen_remote_seed --restore-corpus (the rollback of migrations/0013)', () => {
	/** Remote after 0013: the corpus schema with every corpus table dropped, runtime rows kept. */
	function retired() {
		const db = migrated();
		db.exec(`INSERT INTO page_view (path, recipe_id) VALUES ('/recipe/1000', 1000)`);
		for (const t of CORPUS_TABLES) db.exec(`DROP TABLE ${t}`);
		return db;
	}
	const schema = (db) => db.prepare(`SELECT type, name, tbl_name FROM sqlite_master ORDER BY type, name`).all().map((r) => ({ ...r }));

	it('puts back the 0001-0012 corpus schema and every row the local seed writes, in chunks D1 accepts', () => {
		const data = corpus();
		const backup = { recipe_i18n: i18nBackup(data, ['en', 'fr', 'ja', 'pnb']) };
		const db = retired();
		const { units } = buildRestoreUnits(data, backup, { indexes });
		const chunks = packChunks(units, 20_000);
		for (const c of chunks) expect(Buffer.byteLength(c.sql)).toBeLessThanOrEqual(30_000);
		applyChunks(db, chunks);

		const local = migrated();
		localSeed(local, data, backup);
		expect(schema(db)).toEqual(schema(local));
		for (const t of CORPUS_TABLES.filter((t) => !t.endsWith('_fts'))) {
			const all = (d) => d.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all();
			expect(all(db), t).toEqual(all(local));
		}
		expectConsistentFts(db);
		expect(db.prepare('SELECT COUNT(*) AS n FROM page_view').get().n).toBe(1);
	});

	it('can be rerun from the start without harm to the schema (CREATE … IF NOT EXISTS)', () => {
		const db = retired();
		const [schemaUnit] = buildRestoreUnits(corpus(), {}, { indexes }).units;
		for (let i = 0; i < 2; i++) for (const s of schemaUnit) db.exec(s.sql);
		expect(db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n).toBe(0);
	});

	it('estimates its writes like the reseeds: a row plus one per index entry', () => {
		const data = corpus();
		const { units, seed } = buildRestoreUnits(data, {}, { indexes });
		const i18nWrites = units.flat().filter((s) => s.sql.startsWith('INSERT INTO recipe_i18n ')).reduce((n, s) => n + s.writes, 0);
		expect(i18nWrites).toBe((seed.i18n.fromBackup + seed.i18n.fromPipeline) * (1 + indexes.recipe_i18n.length));
		// Only the stats refresh's own clear, on a table the schema unit has just created.
		expect(units.flat().filter((s) => s.sql.startsWith('DELETE')).map((s) => s.sql)).toEqual(['DELETE FROM recipe_i18n_stats;']);
	});
});

describe('reseed write guard', () => {
	it('estimates writes from the schema: one per row plus one per index entry', () => {
		const data = corpus();
		const db = remote(data);
		const { seed, chunks } = remoteSeed(db, data);
		const planned = chunks.reduce((s, c) => s + c.writes, 0);
		const ri = seed.rows.recipeIngredients.length;
		// recipe_ingredients: PK autoindex + idx_ri_ingredient -> 3 per row inserted, 1 per row deleted.
		expect(chunks.filter((c) => c.sql.includes('INSERT INTO recipe_ingredients')).length).toBeGreaterThan(0);
		expect(planned).toBeGreaterThan(4 * ri);
		// After 0011 recipes has no secondary index: an in-place UPDATE writes 1 row.
		expect(indexes.recipes ?? []).toEqual([]);
		const update = seed.units.flat().find((s) => s.sql.startsWith('UPDATE recipes SET'));
		expect(update.writes).toBe(1);
		function remote(d) {
			const x = migrated();
			localSeed(x, d, {});
			return x;
		}
	});

	it('refuses a plan over budget unless on the paid plan', () => {
		expect(() => checkWriteBudget(80_001, { budget: 80_000 })).toThrow(WriteBudgetExceeded);
		expect(() => checkWriteBudget(80_000, { budget: 80_000 })).not.toThrow();
		expect(() => checkWriteBudget(313_753, { budget: 80_000, paidPlan: true })).not.toThrow();
		expect(() => checkWriteBudget(313_753, { budget: 80_000 })).toThrow(/--only=related/);
	});

	it('--only=related fits the free-plan budget on the real corpus size', () => {
		const data = corpus();
		const units = buildRelatedUnits(data, { indexes });
		const writes = units.flat().reduce((s, st) => s + st.writes, 0);
		// One DELETE and one INSERT per recipe: 2 x 3,478 = 6,956 on the full corpus.
		expect(writes).toBe(2 * 11);
		expect(units[0][0].sql).toBe('DELETE FROM recipe_related;');
	});
});

describe('migration 0011 index set', () => {
	it('drops the six unused indexes and keeps the ones runtime queries use', () => {
		const db = migrated();
		const names = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name`).all().map((r) => r.name);
		expect(names).toEqual(['idx_admin_otp_email', 'idx_admin_session_expires', 'idx_igo_generic', 'idx_page_view_at', 'idx_page_view_recipe', 'idx_recipe_i18n_lang', 'idx_ri_ingredient']);
	});
});

describe('backup merges', () => {
	const data = corpus();
	it('ingredient names: backup wins, pipeline fills gaps, unknown keys are counted', () => {
		const { rows, stats } = mergeIngredientNames(data.ingredients, [
			{ canonical_key: 'leek', lang: 'fr', name: 'poireau' },
			{ canonical_key: 'leek', lang: 'jv', name: 'bawang prei' },
			{ canonical_key: 'gone', lang: 'fr', name: 'x' }
		]);
		const leek = Object.fromEntries(rows.filter((r) => r.canonical_key === 'leek').map((r) => [r.lang, r.name]));
		expect(leek).toEqual({ en: 'leek', fr: 'poireau', jv: 'bawang prei' });
		expect(stats).toMatchObject({ fromBackup: 2, differs: 1, orphans: 1 });
	});

	it('recipe rows: backed-up rows of kept recipes plus missing source rows', () => {
		const kept = data.recipes.slice(0, 3);
		const { rows, stats } = mergeRecipeI18n(kept, [
			{ recipe_id: kept[0].id, lang: 'en', title: 'Edited on remote', instructions: 'x', is_machine: 0 },
			{ recipe_id: kept[0].id, lang: 'fr', title: kept[0].title, instructions: 'y', is_machine: 1 },
			{ recipe_id: 1, lang: 'fr', title: 'not kept', instructions: 'z', is_machine: 1 }
		]);
		expect(rows.map((r) => `${r.recipe_id}/${r.lang}`)).toEqual([`${kept[0].id}/en`, `${kept[0].id}/fr`, `${kept[1].id}/en`, `${kept[2].id}/en`]);
		expect(rows[0].title).toBe('Edited on remote');
		expect(stats).toEqual({ fromBackup: 2, fromPipeline: 2, notKept: 1, sourceDiffers: 1 });
	});
});
