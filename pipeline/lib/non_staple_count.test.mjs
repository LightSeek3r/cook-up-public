import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { nonStapleCounts } from './non_staple_count.mjs';

const ingredients = [
	{ canonical_key: 'salt', is_staple: 1 },
	{ canonical_key: 'water', is_staple: 1 },
	{ canonical_key: 'onion', is_staple: 0 },
	{ canonical_key: 'egg', is_staple: 0 },
	{ canonical_key: 'flour', is_staple: 0 }
];
const recipeIngredients = [
	{ recipe_id: 1, canonical_key: 'salt' },
	{ recipe_id: 1, canonical_key: 'onion' },
	{ recipe_id: 1, canonical_key: 'egg' },
	{ recipe_id: 2, canonical_key: 'salt' },
	{ recipe_id: 2, canonical_key: 'water' },
	{ recipe_id: 3, canonical_key: 'flour' }
];

describe('nonStapleCounts', () => {
	it('counts only non-staple rows per recipe', () => {
		const counts = nonStapleCounts(ingredients, recipeIngredients);
		expect(counts.get(1)).toBe(2);
		expect(counts.get(3)).toBe(1);
	});

	it('leaves a staples-only recipe out, which the seeds read as 0', () => {
		const counts = nonStapleCounts(ingredients, recipeIngredients);
		expect(counts.has(2)).toBe(false);
		expect(counts.get(2) ?? 0).toBe(0);
	});

	it('ignores rows whose ingredient is unknown, which the seed could not insert either', () => {
		const rows = [{ recipe_id: 9, canonical_key: 'onion' }, { recipe_id: 9, canonical_key: 'not_an_ingredient' }];
		expect(nonStapleCounts(ingredients, rows).get(9)).toBe(1);
	});

	it('agrees with migration 0009 on a database seeded from the same rows', () => {
		// The migration fills existing remote rows, the seeds fill every later one;
		// match.ts can't tell which wrote a value, so the two must never disagree.
		const db = new DatabaseSync(':memory:');
		const dir = new URL('../../migrations/', import.meta.url);
		const MIGRATION = '0009_recipe_non_staple_count.sql';
		const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
		expect(files).toContain(MIGRATION);
		for (const f of files.filter((f) => f < MIGRATION)) db.exec(readFileSync(new URL(f, dir), 'utf8'));

		const id = new Map(ingredients.map((ing, i) => [ing.canonical_key, i + 1]));
		const insIng = db.prepare("INSERT INTO ingredients (id, canonical_key, category, is_staple) VALUES (?, ?, 'other', ?)");
		for (const ing of ingredients) insIng.run(id.get(ing.canonical_key), ing.canonical_key, ing.is_staple);
		const insRecipe = db.prepare("INSERT INTO recipes (id, source_url, source_lang, license) VALUES (?, 'u', 'en', 'PD')");
		for (const r of [1, 2, 3]) insRecipe.run(r);
		const insRow = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (?, ?)');
		for (const ri of recipeIngredients) insRow.run(ri.recipe_id, id.get(ri.canonical_key));

		db.exec(readFileSync(new URL(MIGRATION, dir), 'utf8'));
		const fromSql = db.prepare('SELECT id, non_staple_count FROM recipes ORDER BY id').all();
		const counts = nonStapleCounts(ingredients, recipeIngredients);
		expect(fromSql.map((r) => [r.id, r.non_staple_count])).toEqual([1, 2, 3].map((r) => [r, counts.get(r) ?? 0]));
	});
});
