/**
 * Stage 06 — seed D1 from the phase-2 + phase-3 pipeline output.
 *
 * Input:  pipeline/out/{recipes,ingredients,recipe_ingredients,recipe_diets,
 *          recipes.nutrition,ingredient_nutrition,ingredient_micronutrient,
 *          recipe_micronutrient}.jsonl, and the translation backup in
 *          pipeline/data/i18n-backup (pipeline/tools/export_remote_i18n.mjs)
 * Output: pipeline/out/seed.sql, applied with:
 *   wrangler d1 execute cook-up-db --local --file=pipeline/out/seed.sql
 *
 * recipe_i18n and ingredient_i18n come from the backup, so a local database
 * serves the same translated text as remote; the pipeline's own rows fill
 * only what the backup lacks (a recipe or name remote has never had). Without
 * a backup the seed is English-only, as it was before the backup existed.
 * Needs every migration applied locally first (recipe_i18n_stats is 0011's).
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBackup } from './lib/i18n_backup.mjs';
import {
	COLUMNS,
	batchInsert,
	i18nStatsRefresh,
	ingredientFtsRefresh,
	mergeIngredientNames,
	mergeRecipeI18n,
	readSeedInputs,
	recipeCountRefresh,
	seedRows,
	titleFtsRefresh,
	writeCost
} from './lib/seed_sql.mjs';

const OUT_DIR = path.resolve('pipeline/out');

// 50 for recipes: a row carries a Commons image URL, a file-page URL, an author
// and the notes text, and 200 of those exceeded SQLite's statement-length cap
// (SQLITE_TOOBIG). recipe_i18n rows are capped by bytes instead (up to ~14 KB).
const BATCH = { recipes: 50 };

/** seed.sql's statements, in order. `backup` is `{ recipe_i18n, ingredient_i18n }` rows or nulls. */
export function buildLocalSeed(data, backup = {}) {
	const rows = seedRows(data);
	const names = mergeIngredientNames(data.ingredients, backup.ingredient_i18n);
	const i18n = mergeRecipeI18n(rows.keptRecipes, backup.recipe_i18n);
	const insert = (table, list) =>
		batchInsert(table, COLUMNS[table], list, { batchSize: BATCH[table] ?? 200, sep: ',\n' }).map((s) => s.sql);
	const noCost = writeCost({});

	const sql = [
		'DELETE FROM recipe_related;',
		'DELETE FROM recipe_micronutrient;',
		'DELETE FROM recipe_diets;',
		'DELETE FROM recipe_ingredients;',
		'DELETE FROM recipe_i18n;',
		'DELETE FROM recipes;',
		'DELETE FROM ingredient_allergens;',
		'DELETE FROM ingredient_generic_of;',
		'DELETE FROM ingredient_micronutrient;',
		'DELETE FROM ingredient_nutrition;',
		'DELETE FROM ingredient_i18n;',
		'DELETE FROM ingredients;',
		'DELETE FROM allergens;',
		...insert('allergens', rows.allergens),
		...insert('ingredients', rows.ingredients),
		...insert(
			'ingredient_i18n',
			names.rows.map((r) => ({ ingredient_id: rows.ingredientId.get(r.canonical_key), lang: r.lang, name: r.name }))
		),
		...insert('ingredient_allergens', rows.ingredientAllergens),
		...insert('ingredient_generic_of', rows.genericOf),
		...insert('recipes', rows.recipes),
		...insert('recipe_i18n', i18n.rows),
		...insert('recipe_ingredients', rows.recipeIngredients),
		...insert('recipe_diets', rows.recipeDiets),
		...insert('recipe_related', rows.recipeRelated),
		...insert('ingredient_nutrition', rows.ingredientNutrition),
		...insert('ingredient_micronutrient', rows.ingredientMicros),
		...insert('recipe_micronutrient', rows.recipeMicros),
		...[
			recipeCountRefresh(noCost, 0),
			...ingredientFtsRefresh(),
			...titleFtsRefresh(0),
			...i18nStatsRefresh()
		].map((s) => s.sql)
	];
	return { sql, rows, names: names.stats, i18n: i18n.stats };
}

async function main() {
	const data = await readSeedInputs(OUT_DIR);
	const recipeBackup = readBackup('recipe_i18n');
	const nameBackup = readBackup('ingredient_i18n');
	if (!recipeBackup) console.warn('06_seed_d1: no translation backup in pipeline/data/i18n-backup; seeding source-language rows only');
	const seed = buildLocalSeed(data, { recipe_i18n: recipeBackup?.rows ?? null, ingredient_i18n: nameBackup?.rows ?? null });

	await writeFile(path.join(OUT_DIR, 'seed.sql'), seed.sql.join('\n\n') + '\n');
	console.log(
		`06_seed_d1: wrote pipeline/out/seed.sql — ${seed.rows.keptRecipes.length} recipes, ${seed.rows.ingredients.length} ingredients, ` +
			`${seed.rows.recipeIngredients.length} recipe_ingredients rows, ${seed.rows.genericOf.length} generic-ingredient pairs`
	);
	console.log(
		`06_seed_d1: recipe_i18n ${seed.i18n.fromBackup} rows from the backup (${recipeBackup?.exported_at ?? 'none'}), ` +
			`${seed.i18n.fromPipeline} source rows from recipes.jsonl, ${seed.i18n.notKept} backup rows of recipes not kept, ` +
			`${seed.i18n.sourceDiffers} source rows where recipes.jsonl differs from the backup (backup kept); ` +
			`ingredient_i18n ${seed.names.fromBackup} from the backup, ${seed.names.fromPipeline} from ingredients.jsonl`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
