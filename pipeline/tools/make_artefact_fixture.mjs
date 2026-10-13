/**
 * Writes pipeline/fixtures/artefact-corpus.sql: a small, real slice of the
 * snapshot database for the artefact parity tests, which must run in CI where
 * pipeline/out and the translation backup do not exist.
 *
 * Picks recipes that exercise every rule the artefacts reproduce (generic
 * ingredients and multi-parent specific forms, staples, every sort key with
 * its NULLs, filters, allergens, title overrides, languages with missing
 * rows, non-ASCII titles, related lists pointing outside the slice), keeps
 * their ingredients and renumbers those 1..N as the seeds do. Instructions
 * are cut short; everything else is verbatim.
 *
 * Usage: node pipeline/tools/make_artefact_fixture.mjs [--db=<snapshot.sqlite>]
 * (without --db the snapshot is rebuilt from pipeline/out + backup)
 */

import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { esc } from '../lib/d1.mjs';
import { snapshotDb } from '../lib/artefacts.mjs';

const OUT = 'pipeline/fixtures/artefact-corpus.sql';
const LANGS = ['en', 'fr', 'de', 'ar', 'hi', 'zh', 'bn', 'jv'];
const INSTRUCTIONS_CHARS = 40;

const dbArg = process.argv.find((a) => a.startsWith('--db='))?.slice(5);
const db = dbArg ? new DatabaseSync(dbArg, { readOnly: true }) : (await snapshotDb()).db;
/** @param {string} sql @param {...any} args @returns {any[]} */
const all = (sql, ...args) => db.prepare(sql).all(...args);
const ids = (/** @type {string} */ sql, /** @type {any[]} */ ...args) => all(sql, ...args).map((r) => Number(r.id));

const picked = new Set();
/** @param {number[]} list @param {number} n */
const take = (list, n) => list.slice(0, n).forEach((id) => picked.add(id));
const usingKey = (/** @type {string} */ key, /** @type {number} */ n) =>
	take(ids(`SELECT ri.recipe_id AS id FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE i.canonical_key = ? ORDER BY ri.recipe_id`, key), n);

for (const key of ['onion', 'garlic', 'tomato', 'egg', 'flour', 'butter', 'milk', 'salt', 'water', 'egg_yolk', 'egg_white', 'brown_sugar', 'cassava_flour', 'chicken', 'rice'])
	usingKey(key, 3);
take(ids(`SELECT recipe_id AS id FROM recipe_i18n t JOIN recipes r ON r.id = t.recipe_id WHERE t.lang = 'zh' AND t.title <> (SELECT s.title FROM recipe_i18n s WHERE s.recipe_id = r.id AND s.lang = r.source_lang) ORDER BY id`), 6);
take(ids(`SELECT recipe_id AS id FROM recipe_i18n t JOIN recipes r ON r.id = t.recipe_id WHERE t.lang = 'hi' AND t.title <> (SELECT s.title FROM recipe_i18n s WHERE s.recipe_id = r.id AND s.lang = r.source_lang) ORDER BY id`), 4);
take(ids(`SELECT r.id FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM recipe_i18n t WHERE t.recipe_id = r.id AND t.lang = 'bn') ORDER BY r.id`), 6);
take(ids(`SELECT r.id FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM recipe_i18n t WHERE t.recipe_id = r.id AND t.lang = 'zh') ORDER BY r.id`), 1);
take(ids(`SELECT recipe_id AS id FROM recipe_i18n WHERE lang = 'en' AND title GLOB '*[^ -~]*' ORDER BY recipe_id`), 8);
take(ids(`SELECT id FROM recipes WHERE kcal IS NULL ORDER BY id`), 4);
take(ids(`SELECT id FROM recipes WHERE kcal IS NOT NULL AND nutrition_coverage < 0.7 ORDER BY id`), 4);
take(ids(`SELECT id FROM recipes WHERE total_minutes IS NOT NULL ORDER BY total_minutes, id`), 4);
take(ids(`SELECT id FROM recipes WHERE balance_grade IS NULL ORDER BY id`), 3);
for (const g of ['A', 'D']) take(ids(`SELECT id FROM recipes WHERE balance_grade = ? ORDER BY id`, g), 3);
for (const diet of ['vegan', 'pescatarian', 'dairy_free']) take(ids(`SELECT recipe_id AS id FROM recipe_diets WHERE diet = ? ORDER BY recipe_id`, diet), 3);
take(ids(`SELECT id FROM recipes WHERE cuisine = 'indian' ORDER BY id`), 4);
take(ids(`SELECT id FROM recipes WHERE meal_type = 'dessert' ORDER BY id`), 3);
take(ids(`SELECT id FROM recipes WHERE image_url IS NOT NULL AND notes IS NOT NULL ORDER BY id`), 2);
take(ids(`SELECT id FROM recipes WHERE non_staple_count = (SELECT MAX(non_staple_count) FROM recipes) ORDER BY id`), 1);
take(ids(`SELECT recipe_id AS id FROM recipe_related WHERE related_ids = '[]' ORDER BY recipe_id`), 2);

const recipeIds = [...picked].sort((a, b) => a - b);
const inList = recipeIds.join(',');
// Ingredients of the slice plus their generic forms: selecting a generic is
// what credits a recipe's specific form, so those pairs matter; specifics no
// recipe here uses would only add rows.
const used = new Set(ids(`SELECT DISTINCT ingredient_id AS id FROM recipe_ingredients WHERE recipe_id IN (${inList})`));
for (const r of all(`SELECT generic_id, specific_id FROM ingredient_generic_of`)) {
	if (used.has(Number(r.specific_id))) used.add(Number(r.generic_id));
}
const oldIds = [...used].sort((a, b) => a - b);
const newId = new Map(oldIds.map((id, i) => [id, i + 1]));
const ingIn = oldIds.join(',');

/** @param {string} table @param {any[]} rows */
function insert(table, rows) {
	if (!rows.length) return '';
	const cols = Object.keys(rows[0]);
	const values = rows.map((r) => `(${cols.map((c) => esc(r[c])).join(',')})`);
	return `INSERT INTO ${table} (${cols.join(',')}) VALUES\n${values.join(',\n')};\n`;
}
const mapIng = (/** @type {any} */ r, /** @type {string[]} */ cols) => ({ ...r, ...Object.fromEntries(cols.map((c) => [c, newId.get(Number(r[c]))])) });
const langIn = LANGS.map((l) => `'${l}'`).join(',');
const cut = (/** @type {string} */ s) => ([...s].length > INSTRUCTIONS_CHARS ? [...s].slice(0, INSTRUCTIONS_CHARS).join('') : s);

const sql = [
	`-- Generated by pipeline/tools/make_artefact_fixture.mjs from the pipeline snapshot: ${recipeIds.length} real recipes,`,
	`-- ${oldIds.length} ingredients renumbered 1..N, languages ${LANGS.join(' ')}, instructions cut to ${INSTRUCTIONS_CHARS} characters.`,
	`-- Applied after every migration by the artefact parity tests (pipeline/lib/artefacts.mjs fixtureDb). Do not edit by hand.`,
	'',
	insert('allergens', all(`SELECT * FROM allergens ORDER BY id`)),
	insert('ingredients', all(`SELECT * FROM ingredients WHERE id IN (${ingIn}) ORDER BY id`).map((r) => mapIng(r, ['id']))),
	insert('ingredient_i18n', all(`SELECT * FROM ingredient_i18n WHERE ingredient_id IN (${ingIn}) AND lang IN (${langIn}) ORDER BY ingredient_id, lang`).map((r) => mapIng(r, ['ingredient_id']))),
	insert('ingredient_allergens', all(`SELECT * FROM ingredient_allergens WHERE ingredient_id IN (${ingIn}) ORDER BY ingredient_id, allergen_id`).map((r) => mapIng(r, ['ingredient_id']))),
	insert('ingredient_generic_of', all(`SELECT * FROM ingredient_generic_of WHERE specific_id IN (${ingIn}) AND generic_id IN (${ingIn}) ORDER BY specific_id, generic_id`).map((r) => mapIng(r, ['specific_id', 'generic_id']))),
	insert('recipes', all(`SELECT * FROM recipes WHERE id IN (${inList}) ORDER BY id`)),
	insert('recipe_i18n', all(`SELECT * FROM recipe_i18n WHERE recipe_id IN (${inList}) AND lang IN (${langIn}) ORDER BY recipe_id, lang`).map((r) => ({ ...r, instructions: cut(r.instructions) }))),
	insert('recipe_ingredients', all(`SELECT * FROM recipe_ingredients WHERE recipe_id IN (${inList}) ORDER BY recipe_id, ingredient_id`).map((r) => mapIng(r, ['ingredient_id']))),
	insert('recipe_diets', all(`SELECT * FROM recipe_diets WHERE recipe_id IN (${inList}) ORDER BY recipe_id, diet`)),
	insert('recipe_micronutrient', all(`SELECT * FROM recipe_micronutrient WHERE recipe_id IN (${inList}) ORDER BY recipe_id, nutrient_key`)),
	insert('recipe_related', all(`SELECT * FROM recipe_related WHERE recipe_id IN (${inList}) ORDER BY recipe_id`))
].join('\n');
writeFileSync(OUT, sql);
console.log(`wrote ${OUT}: ${recipeIds.length} recipes, ${oldIds.length} ingredients, ${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB`);
