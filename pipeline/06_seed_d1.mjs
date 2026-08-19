/**
 * Stage 06 — seed D1 from the phase-2 + phase-3 pipeline output.
 *
 * Input:  pipeline/out/{recipes,ingredients,recipe_ingredients,recipe_diets,
 *          recipes.nutrition,ingredient_nutrition,ingredient_micronutrient,
 *          recipe_micronutrient}.jsonl
 * Output: pipeline/out/seed.sql, applied with:
 *   wrangler d1 execute cook-up-db --local --file=pipeline/out/seed.sql
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('pipeline/out');
const ALLERGENS = ['gluten', 'dairy', 'nut', 'peanut', 'egg', 'soy', 'fish', 'shellfish', 'sesame'];

function esc(v) {
	if (v === null || v === undefined) return 'NULL';
	if (typeof v === 'number') return String(v);
	return `'${String(v).replace(/'/g, "''")}'`;
}

function batchInsert(sql, table, columns, rows, batchSize = 200) {
	for (let i = 0; i < rows.length; i += batchSize) {
		const batch = rows.slice(i, i + batchSize);
		const values = batch.map((row) => `(${columns.map((c) => esc(row[c])).join(',')})`).join(',\n');
		sql.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES\n${values};`);
	}
}

async function readJsonl(name) {
	const raw = await readFile(path.join(OUT_DIR, name), 'utf8');
	return raw
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l));
}

async function main() {
	const [recipes, ingredients, recipeIngredients, recipeDiets, recipeNutrition, ingredientNutrition, ingredientMicros, recipeMicros] =
		await Promise.all([
			readJsonl('recipes.jsonl'),
			readJsonl('ingredients.jsonl'),
			readJsonl('recipe_ingredients.jsonl'),
			readJsonl('recipe_diets.jsonl'),
			readJsonl('recipes.nutrition.jsonl'),
			readJsonl('ingredient_nutrition.jsonl'),
			readJsonl('ingredient_micronutrient.jsonl'),
			readJsonl('recipe_micronutrient.jsonl')
		]);

	const keptRecipeIds = new Set(recipeIngredients.map((r) => r.recipe_id));
	const keptRecipes = recipes.filter((r) => keptRecipeIds.has(r.id));
	const nutritionById = new Map(recipeNutrition.map((n) => [n.id, n]));

	const ingredientId = new Map(ingredients.map((ing, i) => [ing.canonical_key, i + 1]));

	const sql = [
		'DELETE FROM recipe_micronutrient;',
		'DELETE FROM recipe_diets;',
		'DELETE FROM recipe_ingredients;',
		'DELETE FROM recipe_i18n;',
		'DELETE FROM recipes;',
		'DELETE FROM ingredient_allergens;',
		'DELETE FROM ingredient_micronutrient;',
		'DELETE FROM ingredient_nutrition;',
		'DELETE FROM ingredient_i18n;',
		'DELETE FROM ingredients;',
		'DELETE FROM allergens;'
	];

	batchInsert(
		sql,
		'allergens',
		['id', 'key'],
		ALLERGENS.map((key, i) => ({ id: i + 1, key }))
	);

	batchInsert(
		sql,
		'ingredients',
		['id', 'canonical_key', 'category', 'is_staple', 'beneficial', 'recipe_count'],
		ingredients.map((ing) => ({
			id: ingredientId.get(ing.canonical_key),
			canonical_key: ing.canonical_key,
			category: ing.category,
			is_staple: ing.is_staple,
			beneficial: ing.beneficial,
			recipe_count: 0 // refreshed below once recipe_ingredients is loaded
		}))
	);

	const i18nRows = [];
	for (const ing of ingredients) {
		for (const [lang, name] of Object.entries(ing.names)) {
			i18nRows.push({ ingredient_id: ingredientId.get(ing.canonical_key), lang, name });
		}
	}
	batchInsert(sql, 'ingredient_i18n', ['ingredient_id', 'lang', 'name'], i18nRows);

	const allergenId = new Map(ALLERGENS.map((a, i) => [a, i + 1]));
	const allergenRows = [];
	for (const ing of ingredients) {
		for (const a of ing.allergens) {
			allergenRows.push({ ingredient_id: ingredientId.get(ing.canonical_key), allergen_id: allergenId.get(a) });
		}
	}
	batchInsert(sql, 'ingredient_allergens', ['ingredient_id', 'allergen_id'], allergenRows);

	batchInsert(
		sql,
		'recipes',
		[
			'id', 'source_url', 'source_lang', 'license', 'attribution', 'cuisine', 'meal_type',
			'prep_minutes', 'total_minutes', 'servings', 'servings_assumed',
			'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg',
			'balance_grade', 'balance_score', 'nutrition_coverage'
		],
		keptRecipes.map((r) => {
			const n = nutritionById.get(r.id);
			return {
				id: r.id,
				source_url: r.source_url,
				source_lang: r.source_lang,
				license: r.license,
				attribution: r.attribution,
				cuisine: r.cuisine,
				meal_type: r.meal_type,
				prep_minutes: r.prep_minutes,
				total_minutes: r.total_minutes,
				servings: r.servings,
				servings_assumed: r.servings ? 0 : 1,
				kcal: n?.kcal ?? null,
				protein_g: n?.protein_g ?? null,
				fat_g: n?.fat_g ?? null,
				sat_fat_g: n?.sat_fat_g ?? null,
				carb_g: n?.carb_g ?? null,
				sugar_g: n?.sugar_g ?? null,
				fiber_g: n?.fiber_g ?? null,
				sodium_mg: n?.sodium_mg ?? null,
				balance_grade: n?.balance_grade ?? null,
				balance_score: n?.balance_score ?? null,
				nutrition_coverage: n?.nutrition_coverage ?? 0
			};
		})
	);

	batchInsert(
		sql,
		'recipe_i18n',
		['recipe_id', 'lang', 'title', 'instructions', 'is_machine'],
		keptRecipes.map((r) => ({
			recipe_id: r.id,
			lang: r.source_lang,
			title: r.title,
			instructions: r.instructions,
			is_machine: 0
		})),
		20 // full instruction text per row — long enough to hit D1's per-statement size cap at the default batch size
	);

	batchInsert(
		sql,
		'recipe_ingredients',
		['recipe_id', 'ingredient_id', 'raw_text', 'quantity', 'unit'],
		recipeIngredients.map((ri) => ({
			recipe_id: ri.recipe_id,
			ingredient_id: ingredientId.get(ri.canonical_key),
			raw_text: ri.raw_text,
			quantity: ri.quantity,
			unit: ri.unit
		}))
	);

	batchInsert(sql, 'recipe_diets', ['recipe_id', 'diet'], recipeDiets);

	batchInsert(
		sql,
		'ingredient_nutrition',
		['ingredient_id', 'fdc_id', 'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carb_g', 'sugar_g', 'fiber_g', 'sodium_mg'],
		ingredientNutrition.map((n) => ({
			ingredient_id: ingredientId.get(n.canonical_key),
			fdc_id: n.fdc_id,
			kcal: n.kcal, protein_g: n.protein_g, fat_g: n.fat_g, sat_fat_g: n.sat_fat_g,
			carb_g: n.carb_g, sugar_g: n.sugar_g, fiber_g: n.fiber_g, sodium_mg: n.sodium_mg
		}))
	);

	batchInsert(
		sql,
		'ingredient_micronutrient',
		['ingredient_id', 'nutrient_key', 'amount', 'unit'],
		ingredientMicros.map((m) => ({
			ingredient_id: ingredientId.get(m.canonical_key),
			nutrient_key: m.nutrient_key,
			amount: m.amount,
			unit: m.unit
		}))
	);

	batchInsert(
		sql,
		'recipe_micronutrient',
		['recipe_id', 'nutrient_key', 'amount', 'unit', 'pct_nrv'],
		recipeMicros
	);

	sql.push(
		"UPDATE ingredients SET recipe_count = (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = ingredients.id);",
		"INSERT INTO ingredient_fts(ingredient_fts) VALUES('rebuild');",
		"INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('rebuild');"
	);

	await writeFile(path.join(OUT_DIR, 'seed.sql'), sql.join('\n\n') + '\n');
	console.log(
		`06_seed_d1: wrote pipeline/out/seed.sql — ${keptRecipes.length} recipes, ${ingredients.length} ingredients, ${recipeIngredients.length} recipe_ingredients rows`
	);
}

await main();
