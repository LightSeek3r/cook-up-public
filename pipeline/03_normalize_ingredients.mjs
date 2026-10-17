/**
 * Stage 03 — ingredient normalisation, quantity parsing, and derivation of
 * category / allergens / diets from the Open Food Facts taxonomy (not
 * regexes over ingredient names — see the unpublished project notes for why that burned
 * us once already on eggplant/coconut).
 *
 * Input:  pipeline/out/recipes.jsonl, pipeline/data/off-ingredients.txt
 * Output: pipeline/out/ingredients.jsonl, recipe_ingredients.jsonl,
 *         recipe_diets.jsonl, unmatched_ingredients.txt
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseTaxonomy, ancestors, walkAnchors, walkProperty } from './lib/taxonomy.mjs';
import { splitIngredientLine } from './lib/measure.mjs';
import { resolveKey } from './lib/resolve_ingredient.mjs';
import { MANUAL_INGREDIENTS } from './lib/manual_ingredients.mjs';
import { SUPPORTED_LANGS } from './lib/langs.mjs';

const OUT_DIR = path.resolve('pipeline/out');

// A recipe missing more than this share of its ingredient lines ships
// nothing useful and would misrepresent "you can make this" — drop it
// rather than seed a half-empty ingredient list. Pipeline-internal only,
// not a runtime concept, so it doesn't belong in src/lib/config.ts.
const INGREDIENT_MATCH_MIN = 0.7;

const CATEGORY_ANCHORS = new Map(
	Object.entries({
		legume: 'legume',
		nut: 'nut',
		sesame: 'nut',
		meat: 'protein',
		animal: 'protein', // OFF parents e.g. "beef" under "en:animal", not "en:meat"
		poultry: 'protein',
		fish: 'protein',
		shellfish: 'protein',
		crustacean: 'protein',
		mollusc: 'protein',
		milk: 'dairy',
		cheese: 'dairy',
		egg: 'dairy',
		cereal: 'grain',
		pasta: 'grain',
		spice: 'spice',
		herb: 'spice',
		seed: 'spice', // generic fallback; more specific anchors (nut/sesame) win via priority
		vegetable: 'vegetable',
		fruit: 'fruit'
	})
);
// Specific-over-generic: dried pulses/nuts etc. often also chain up through
// "vegetable" in OFF's own DAG (a DAG node can have more than one parent), so
// the more specific bucket has to win the tie deliberately rather than by
// whichever parent happened to be listed first.
const CATEGORY_PRIORITY = [
	'legume',
	'nut',
	'protein',
	'dairy',
	'grain',
	'spice',
	'fruit',
	'vegetable'
];

// A meaningful slice of common ingredients have no `<` parent line in OFF's
// taxonomy at all (rice, tofu, salt, ...) — there's nothing to walk. Seeded
// from the first real pipeline run; extend deliberately as the "other"
// category-distribution tail in the run summary below shows more gaps.
const CATEGORY_OVERRIDES = {
	rice: 'grain', oats: 'grain', oat: 'grain', quinoa: 'grain', couscous: 'grain',
	bread: 'grain', breadcrumbs: 'grain', pasta: 'grain', macaroni: 'grain', noodle: 'grain', sago: 'grain',
	tofu: 'legume', tempeh: 'legume', lentil: 'legume', lentils: 'legume',
	chickpea: 'legume', chickpeas: 'legume', edamame: 'legume', soybean: 'legume', soybeans: 'legume',
	salt: 'spice', pepper: 'spice', black_pepper: 'spice', cumin: 'spice',
	mushroom: 'vegetable', beef: 'protein',
	sugar: 'other', white_sugar: 'other', honey: 'other', water: 'other', yeast: 'other'
};

// OFF's `allergens:en:` property value is itself a taxonomy key (e.g.
// "en:soybeans"). EU allergen taxonomy is a superset of our 9 — celery,
// mustard, lupin, sulphites map to nothing here and are intentionally
// dropped, not an error.
const ALLERGEN_PROPERTY_MAP = {
	'en:gluten': 'gluten',
	'en:milk': 'dairy',
	'en:nuts': 'nut',
	'en:peanuts': 'peanut',
	'en:eggs': 'egg',
	'en:soybeans': 'soy',
	'en:fish': 'fish',
	'en:crustaceans': 'shellfish',
	'en:molluscs': 'shellfish',
	'en:sesame-seeds': 'sesame'
};

// "Assume the kitchen already has it" — filtered out of the mosaic and out of a
// recipe's missing-ingredient list. These are *roots*: membership walks the
// taxonomy (see `isStaple`) rather than comparing keys directly, because once
// matching became specificity-aware, `kosher_salt` and
// `extra_virgin_olive_oil` started landing where `salt` and `olive_oil` used
// to. Hand-listing every varietal would be a permanent maintenance tax and a
// silent UX bug the first time one was missed — a recipe reading "missing
// kosher salt" when salt is the one thing every kitchen has.
const STAPLE_ROOTS = new Set([
	'salt', 'sea_salt', 'water', 'black_pepper', 'pepper',
	'oil', 'olive_oil', 'vegetable_oil', 'sunflower_oil', 'cooking_oil'
]);

function isStaple(key, taxonomy) {
	if (STAPLE_ROOTS.has(key)) return 1;
	for (const k of ancestors(key, taxonomy)) if (STAPLE_ROOTS.has(k)) return 1;
	return 0;
}

const BENEFICIAL_CATEGORIES = new Set(['vegetable', 'fruit', 'legume', 'nut']);

function categoryFor(key, taxonomy) {
	if (MANUAL_INGREDIENTS[key]) return MANUAL_INGREDIENTS[key].category;
	if (CATEGORY_OVERRIDES[key]) return CATEGORY_OVERRIDES[key];
	return walkAnchors(key, taxonomy, CATEGORY_ANCHORS, CATEGORY_PRIORITY) ?? 'other';
}

function allergensFor(key, taxonomy) {
	if (MANUAL_INGREDIENTS[key]) return MANUAL_INGREDIENTS[key].allergens;
	const value = walkProperty(key, taxonomy, 'allergens');
	if (!value) return [];
	return value
		.split(',')
		.map((v) => ALLERGEN_PROPERTY_MAP[v.trim()])
		.filter(Boolean);
}

/** OFF convention: "maybe" only counts against the claim if the ingredient
 *  has no sub-ingredients to resolve it further — we don't decompose
 *  composite ingredients here, so treat "maybe" as disqualifying, same
 *  "don't fabricate a claim" posture as nutrition_coverage. */
function isVegan(key, taxonomy) {
	if (MANUAL_INGREDIENTS[key]) return MANUAL_INGREDIENTS[key].vegan;
	return walkProperty(key, taxonomy, 'vegan') === 'yes';
}
function isVegetarian(key, taxonomy) {
	if (MANUAL_INGREDIENTS[key]) return MANUAL_INGREDIENTS[key].vegetarian;
	return walkProperty(key, taxonomy, 'vegetarian') === 'yes';
}

async function main() {
	const [recipesRaw, taxonomyRaw] = await Promise.all([
		readFile(path.join(OUT_DIR, 'recipes.jsonl'), 'utf8'),
		readFile(path.resolve('pipeline/data/off-ingredients.txt'), 'utf8')
	]);
	const taxonomy = parseTaxonomy(taxonomyRaw);
	const recipes = recipesRaw
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	console.log(`03_normalize: ${recipes.length} recipes, ${taxonomy.byKey.size} taxonomy entries`);

	const usedKeys = new Set();
	const recipeIngredientLines = [];
	const dietLines = [];
	const unmatched = [];
	let recipesKept = 0;
	let recipesDroppedLowMatch = 0;
	let dietDisagreements = 0;

	for (const recipe of recipes) {
		let resolved = [];
		for (let i = 0; i < recipe.ingredient_lines.length; i++) {
			const line = recipe.ingredient_lines[i];
			const links = recipe.ingredient_links[i] ?? [];

			// Quantity/unit extraction is independent of how the ingredient's
			// *name* gets matched — always split the line, even when a wikilink
			// target alone is enough to resolve the key (the common case, since
			// most Wikibooks lines link the ingredient).
			const split = splitIngredientLine(line);
			const key = resolveKey(line, links, split, taxonomy);

			if (!key) {
				unmatched.push(`${recipe.id}\t${line}`);
				continue;
			}
			resolved.push({ key, raw_text: line, quantity: split?.quantity ?? null, unit: split?.unit ?? null });
		}

		// (recipe_id, ingredient_id) is the table's primary key — a recipe
		// naming the same canonical ingredient on two separate lines (e.g.
		// "milk" in both the batter and the glaze) would otherwise collide.
		// Keep the first mention; merging quantities across possibly-different
		// units isn't worth the complexity for what's a rare, cosmetic case.
		// Measured BEFORE the dedup below, and that ordering is the whole point.
		// `matchRate` asks "did we understand this recipe's ingredient list?" — a
		// recipe naming butter in both its cake and its frosting has been
		// understood perfectly, but scoring it on the *deduplicated* count made it
		// look like two lines had failed to parse. That dropped 52 otherwise-fine
		// recipes, mostly baking (r111781: 18 lines, 16 matched, 12 distinct ->
		// scored 67% and discarded).
		const matchedLines = resolved.length;

		const seenKeys = new Set();
		resolved = resolved.filter((r) => (seenKeys.has(r.key) ? false : seenKeys.add(r.key)));

		const matchRate = recipe.ingredient_lines.length
			? matchedLines / recipe.ingredient_lines.length
			: 0;
		if (matchRate < INGREDIENT_MATCH_MIN) {
			recipesDroppedLowMatch++;
			continue;
		}

		for (const r of resolved) {
			usedKeys.add(r.key);
			recipeIngredientLines.push(
				JSON.stringify({
					recipe_id: recipe.id,
					canonical_key: r.key,
					raw_text: r.raw_text,
					quantity: r.quantity,
					unit: r.unit
				})
			);
		}

		const vegan = resolved.every((r) => isVegan(r.key, taxonomy));
		const vegetarian = vegan || resolved.every((r) => isVegetarian(r.key, taxonomy));
		const allergenSets = resolved.map((r) => new Set(allergensFor(r.key, taxonomy)));
		const hasAllergen = (a) => allergenSets.some((s) => s.has(a));
		const hasFish = hasAllergen('fish') || hasAllergen('shellfish');
		const hasMeatOrFish = resolved.some((r) => categoryFor(r.key, taxonomy) === 'protein');

		const diets = [];
		if (vegan) diets.push('vegan');
		if (vegetarian) diets.push('vegetarian');
		if (!vegetarian && !hasMeatOrFish && hasFish) diets.push('pescatarian');
		if (!hasAllergen('gluten')) diets.push('gluten_free');
		if (!hasAllergen('dairy')) diets.push('dairy_free');

		const tagsLower = recipe.category_tags.map((t) => t.toLowerCase());
		const taggedVegan = tagsLower.some((t) => t.includes('vegan'));
		if (taggedVegan && !vegan) dietDisagreements++;

		for (const diet of diets) {
			dietLines.push(JSON.stringify({ recipe_id: recipe.id, diet }));
		}

		recipesKept++;
	}

	const ingredientLines = [...usedKeys].map((key) => {
		const manual = MANUAL_INGREDIENTS[key];
		const names = {};
		if (manual) {
			Object.assign(names, manual.names);
		} else {
			const entry = taxonomy.byKey.get(key);
			for (const lang of SUPPORTED_LANGS) {
				const value = entry.names.get(lang)?.[0];
				if (value) names[lang] = value;
			}
		}
		return JSON.stringify({
			canonical_key: key,
			category: categoryFor(key, taxonomy),
			is_staple: isStaple(key, taxonomy),
			beneficial: BENEFICIAL_CATEGORIES.has(categoryFor(key, taxonomy)) ? 1 : 0,
			allergens: allergensFor(key, taxonomy),
			names
		});
	});

	await Promise.all([
		writeFile(path.join(OUT_DIR, 'ingredients.jsonl'), ingredientLines.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'recipe_ingredients.jsonl'), recipeIngredientLines.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'recipe_diets.jsonl'), dietLines.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'unmatched_ingredients.txt'), unmatched.join('\n') + '\n')
	]);

	const categoryDist = {};
	for (const key of usedKeys) {
		const c = categoryFor(key, taxonomy);
		categoryDist[c] = (categoryDist[c] ?? 0) + 1;
	}

	console.log(`03_normalize: kept ${recipesKept} recipes, dropped ${recipesDroppedLowMatch} (< ${INGREDIENT_MATCH_MIN * 100}% ingredients matched)`);
	console.log(`03_normalize: ${usedKeys.size} distinct ingredients used, ${unmatched.length} unmatched lines (see unmatched_ingredients.txt)`);
	console.log('03_normalize: category distribution', categoryDist);
	console.log(`03_normalize: ${dietDisagreements} recipes tagged [[Category:Vegan]] but not derived vegan (logged, taxonomy wins)`);
}

await main();
