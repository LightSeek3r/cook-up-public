/**
 * Stage 06 — the corpus database's statements, from the phase-2 + phase-3
 * pipeline output.
 *
 * Input:  pipeline/out/{recipes,ingredients,recipe_ingredients,recipe_diets,
 *          recipes.nutrition,ingredient_nutrition,ingredient_micronutrient,
 *          recipe_micronutrient}.jsonl (lib/seed_sql.mjs readSeedInputs), and
 *          the translation backup in pipeline/data/i18n-backup
 *
 * A library, no longer a command. It used to write pipeline/out/seed.sql for
 * a local D1; since migrations/0013_retire_recipe_corpus.sql neither D1 (local
 * or remote) has the corpus tables, and nothing at runtime reads them. Its
 * statements now fill an SQLite with the corpus schema (migrations up to
 * CORPUS_SCHEMA_LAST, pipeline/lib/migrations.mjs) for:
 *   - the data artefacts (pipeline/lib/artefacts.mjs snapshotDb, stage 09),
 *   - the remote restore after 0013 (gen_remote_seed.mjs --restore-corpus),
 *   - the seed tests (pipeline/seed.test.mjs).
 * A local copy of that database, for inspection: `node
 * pipeline/09_build_artefacts.mjs --save-db=<file>`.
 *
 * recipe_i18n and ingredient_i18n come from the backup, so the database holds
 * the same translated text remote served; the pipeline's own rows fill only
 * what the backup lacks (a recipe or name remote has never had). Without a
 * backup the seed is English-only.
 */

import {
	COLUMNS,
	batchInsert,
	i18nStatsRefresh,
	ingredientFtsRefresh,
	mergeIngredientNames,
	mergeRecipeI18n,
	recipeCountRefresh,
	seedRows,
	stmt,
	titleFtsRefresh,
	writeCost
} from './lib/seed_sql.mjs';

// 50 for recipes: a row carries a Commons image URL, a file-page URL, an author
// and the notes text, and 200 of those exceeded SQLite's statement-length cap
// (SQLITE_TOOBIG). recipe_i18n rows are capped by bytes instead (up to ~14 KB).
const BATCH = { recipes: 50 };

/** Child tables before parents, so the deletes satisfy every foreign key. */
const DELETE_ORDER = [
	'recipe_related',
	'recipe_micronutrient',
	'recipe_diets',
	'recipe_ingredients',
	'recipe_i18n',
	'recipes',
	'ingredient_allergens',
	'ingredient_generic_of',
	'ingredient_micronutrient',
	'ingredient_nutrition',
	'ingredient_i18n',
	'ingredients',
	'allergens'
];

/**
 * The seed's statements, in order. `backup` is `{ recipe_i18n, ingredient_i18n }`
 * rows or nulls. `opts.maxBytes` caps each INSERT's size (default: lib/seed_sql.mjs
 * MAX_STATEMENT_BYTES); `opts.indexes` (schemaIndexes()) makes `statements[].writes`
 * the rows D1 would bill; `opts.deletes: false` leaves out the leading DELETEs,
 * for a database whose tables are known to be empty.
 * @returns {{ sql: string[], statements: { sql: string, writes: number }[], rows: any, names: any, i18n: any }}
 */
export function buildLocalSeed(data, backup = {}, { maxBytes, indexes, deletes = true } = {}) {
	const rows = seedRows(data);
	const names = mergeIngredientNames(data.ingredients, backup.ingredient_i18n);
	const i18n = mergeRecipeI18n(rows.keptRecipes, backup.recipe_i18n);
	const cost = writeCost(indexes ?? {});
	const insert = (table, list) =>
		batchInsert(table, COLUMNS[table], list, {
			batchSize: BATCH[table] ?? 200,
			sep: ',\n',
			writesPerRow: cost.insert(table, 1),
			...(maxBytes ? { maxBytes } : {})
		});

	const statements = [
		...(deletes ? DELETE_ORDER.map((table) => stmt(`DELETE FROM ${table};`)) : []),
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
		recipeCountRefresh(cost, rows.ingredients.length),
		...ingredientFtsRefresh(),
		...titleFtsRefresh(rows.keptRecipes.length),
		...i18nStatsRefresh()
	];
	return { sql: statements.map((s) => s.sql), statements, rows, names: names.stats, i18n: i18n.stats };
}
