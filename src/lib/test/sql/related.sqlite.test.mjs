// Runs relatedRecipes against SQLite (the corpus schema: migrations up to
// CORPUS_SCHEMA_LAST) on a generated corpus, with recipe_related filled by the seeds' own pipeline module, and
// checks every recipe's stored list against the live SQL ranking it replaces.
// related.test.ts only sees SQL text through a spy. `.mjs` for node:sqlite.
import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { relatedRecipes, liveRelatedRecipes, storedRelatedRecipes } from './related';
import { RELATED_LIMIT, RELATED_MAX_INGREDIENT_RECIPES, RELATED_MIN_SHARED } from '$lib/config';
import * as pipeline from '../../../../pipeline/lib/related_recipes.mjs';
import { applyMigrations, CORPUS_SCHEMA_LAST } from '../../../../pipeline/lib/migrations.mjs';
import { sqliteD1 as d1 } from '../d1';


// Deterministic corpus: enough recipes for one ingredient to cross the
// recipe_count cap, a few staples, and ties on the shared count.
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
const INGREDIENTS = Array.from({ length: 30 }, (_, k) => ({ id: k + 1, canonical_key: `ing_${k + 1}`, is_staple: k < 3 ? 1 : 0 }));
const COMMON = INGREDIENTS[3]; // in more recipes than the cap
const RECIPES = Array.from({ length: RELATED_MAX_INGREDIENT_RECIPES + 40 }, (_, k) => {
	const id = 1000 + k * 7;
	const keys = new Set(INGREDIENTS.filter((i) => i !== COMMON && rnd() < 0.12).map((i) => i.canonical_key));
	if (k < RELATED_MAX_INGREDIENT_RECIPES + 5) keys.add(COMMON.canonical_key);
	return { id, keys: [...keys] };
});
const RECIPE_INGREDIENTS = RECIPES.flatMap((r) => r.keys.map((canonical_key) => ({ recipe_id: r.id, canonical_key })));
const DELETED = RECIPES[5].id;

let sqlite;
let db;

beforeAll(() => {
	sqlite = new DatabaseSync(':memory:');
	applyMigrations(sqlite, { upTo: CORPUS_SCHEMA_LAST });
	const id = new Map(INGREDIENTS.map((i) => [i.canonical_key, i.id]));
	const ins = (sql, rows) => { const st = sqlite.prepare(sql); for (const r of rows) st.run(...r); };
	ins(`INSERT INTO ingredients (id, canonical_key, category, is_staple) VALUES (?, ?, 'other', ?)`, INGREDIENTS.map((i) => [i.id, i.canonical_key, i.is_staple]));
	ins(`INSERT INTO recipes (id, source_url, source_lang, license, total_minutes, balance_grade, nutrition_coverage) VALUES (?, 'u', 'en', 'PD', ?, ?, 0.9)`,
		RECIPES.map((r, k) => [r.id, k % 4 ? 10 + k : null, k % 3 ? 'B' : null]));
	ins(`INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES (?, ?, ?, '')`, [
		...RECIPES.map((r) => [r.id, 'en', `Recipe ${r.id}`]),
		...RECIPES.filter((_, k) => k % 5 === 0).map((r) => [r.id, 'fr', `Recette ${r.id}`])
	]);
	ins('INSERT INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (?, ?)', RECIPE_INGREDIENTS.map((ri) => [ri.recipe_id, id.get(ri.canonical_key)]));
	// What both seeds do after loading recipe_ingredients.
	sqlite.exec('UPDATE ingredients SET recipe_count = (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = ingredients.id)');
	ins('INSERT INTO recipe_related (recipe_id, related_ids) VALUES (?, ?)',
		pipeline.relatedRows(INGREDIENTS, RECIPE_INGREDIENTS, RECIPES.map((r) => r.id)).map((r) => [r.recipe_id, r.related_ids]));
	// A recipe gone after seeding (its other rows left behind, as a remote
	// orphan would be): both paths must drop it from other lists.
	sqlite.exec('PRAGMA foreign_keys = OFF');
	sqlite.prepare('DELETE FROM recipes WHERE id = ?').run(DELETED);
	db = d1(sqlite);
});

describe('recipe_related (pipeline) against the live ranking (SQL)', () => {
	it('ranks with the same constants as config.ts', () => {
		expect([pipeline.RELATED_LIMIT, pipeline.RELATED_MAX_INGREDIENT_RECIPES, pipeline.RELATED_MIN_SHARED])
			.toEqual([RELATED_LIMIT, RELATED_MAX_INGREDIENT_RECIPES, RELATED_MIN_SHARED]);
	});

	it('the fixture exercises the cap, the minimum and the limit', () => {
		const count = sqlite.prepare('SELECT recipe_count FROM ingredients WHERE id = ?').get(COMMON.id).recipe_count;
		expect(count).toBeGreaterThan(RELATED_MAX_INGREDIENT_RECIPES);
		const lengths = sqlite.prepare('SELECT json_array_length(related_ids) n FROM recipe_related').all().map((r) => r.n);
		expect(lengths).toContain(0);
		expect(lengths).toContain(RELATED_LIMIT);
	});

	it.each(['en', 'fr'])('gives every recipe the live list, from its stored row (%s)', async (lang) => {
		for (const { id } of RECIPES) {
			const stored = await storedRelatedRecipes(db, { id, lang });
			expect(stored, `recipe ${id}`).not.toBeNull();
			expect(stored, `recipe ${id}`).toEqual(await liveRelatedRecipes(db, { id, lang }));
		}
	});

	it('drops a listed recipe that no longer exists, like the live path', async () => {
		const listing = RECIPES.find((r) => JSON.parse(sqlite.prepare('SELECT related_ids FROM recipe_related WHERE recipe_id = ?').get(r.id).related_ids).includes(DELETED));
		expect(listing).toBeDefined();
		const got = await relatedRecipes(db, { id: listing.id, lang: 'en' });
		expect(got.map((r) => r.id)).not.toContain(DELETED);
		expect(got).toEqual(await liveRelatedRecipes(db, { id: listing.id, lang: 'en' }));
	});

	it('falls back to the live ranking for a recipe with no stored row', async () => {
		const { id } = RECIPES.find((r) => sqlite.prepare("SELECT 1 FROM recipe_related WHERE recipe_id = ? AND related_ids <> '[]'").get(r.id));
		const live = await liveRelatedRecipes(db, { id, lang: 'en' });
		expect(live.length).toBeGreaterThan(0);
		sqlite.prepare('DELETE FROM recipe_related WHERE recipe_id = ?').run(id);
		expect(await storedRelatedRecipes(db, { id, lang: 'en' })).toBeNull();
		expect(await relatedRecipes(db, { id, lang: 'en' })).toEqual(live);
	});

	it('falls back when migration 0010 has not been applied yet', async () => {
		const bare = new DatabaseSync(':memory:');
		bare.exec(sqlite.prepare("SELECT GROUP_CONCAT(sql, ';') s FROM sqlite_master WHERE type = 'table' AND name IN ('recipes', 'recipe_i18n', 'recipe_ingredients', 'ingredients')").get().s);
		const { id } = RECIPES[0];
		expect(await relatedRecipes(d1(bare), { id, lang: 'en' })).toEqual([]);
		await expect(storedRelatedRecipes(d1(bare), { id, lang: 'en' })).rejects.toThrow(/no such table: recipe_related/);
	});
});
