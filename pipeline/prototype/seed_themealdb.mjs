/**
 * PROTOTYPE SEEDER — TheMealDB (~300 recipes).
 *
 * ⚠ Decision ADR-A3: this exists purely to exercise the mosaic, the ranking
 *   query and the filters with realistic volume during phase 1. TheMealDB is
 *   NOT part of the commercial-safe data plan (ADR-A1 = Wikibooks CC BY-SA +
 *   public domain). Rows written here are marked
 *   `license = 'THEMEALDB-PROTOTYPE'` and MUST NOT reach production.
 *
 * It deliberately lives outside pipeline/01..06, which is the real,
 * licence-clean ingest.
 *
 * What it does NOT do, on purpose:
 *  - no nutrition. There is no FDC mapping yet, so every recipe gets
 *    nutrition_coverage = 0 and the UI correctly hides the panel rather than
 *    inventing numbers.
 *  - no translations. Ingredient names are English only; the API falls back to
 *    English for the other nine languages.
 *
 * Usage:
 *   node pipeline/prototype/seed_themealdb.mjs        # fetch (cached) + emit SQL
 *   npm run db:seed:prototype                         # the above, then apply to local D1
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('pipeline/out');
const RAW_FILE = path.join(OUT_DIR, 'themealdb.raw.json');
const SQL_FILE = path.join(OUT_DIR, 'seed_themealdb.sql');
const LICENSE = 'THEMEALDB-PROTOTYPE';

// ---------------------------------------------------------------------------
// Vocabulary mapping — TheMealDB's areas/categories onto our canonical keys.
// Anything unmapped becomes NULL rather than being forced into a wrong bucket.
// ---------------------------------------------------------------------------
const AREA_TO_CUISINE = {
	American: 'american', British: 'british', Chinese: 'chinese', French: 'french',
	Greek: 'greek', Indian: 'indian', Italian: 'italian', Japanese: 'japanese',
	Mexican: 'mexican', Moroccan: 'moroccan', Spanish: 'spanish', Thai: 'thai',
	Turkish: 'turkish', Vietnamese: 'vietnamese', Jamaican: 'caribbean',
	Egyptian: 'middle_eastern', Tunisian: 'african', Kenyan: 'african'
};

const CATEGORY_TO_MEAL = {
	Breakfast: 'breakfast', Dessert: 'dessert', Side: 'side', Starter: 'side',
	Beef: 'dinner', Chicken: 'dinner', Lamb: 'dinner', Pork: 'dinner',
	Seafood: 'dinner', Pasta: 'dinner', Vegetarian: 'dinner', Vegan: 'dinner',
	Goat: 'dinner', Miscellaneous: 'dinner'
};

/** Always-available pantry items: never counted as a missing ingredient. */
const STAPLES = /^(salt|sea_salt|pepper|black_pepper|white_pepper|water|oil|olive_oil|vegetable_oil|sunflower_oil|cooking_oil)$/;

// Shared pattern sources: category, allergen and diet derivation must agree, so
// they are built from the same strings rather than three hand-kept copies.
const MEAT = 'beef|chicken|pork|lamb|bacon|sausage|ham|turkey|duck|veal|goat|mince|steak|gelatin|lard|chorizo|salami|pepperoni|prosciutto';
const FISH = 'fish|salmon|tuna|cod|haddock|anchov|sardine|herring|mackerel|trout|bass|snapper|tilapia|hake|pollock|sole|halibut|eel|roe|caviar|whitebait|kipper|seafood';
const SHELLFISH = 'prawn|shrimp|crab|lobster|mussel|clam|scallop|squid|oyster|octopus';
const DAIRY = 'milk|cream|butter|cheese|yoghurt|yogurt|mascarpone|ricotta|parmesan|parmigiano|pecorino|mozzarella|ghee|feta|halloumi|paneer|cheddar|gouda|brie|gruyere|emmental|provolone|manchego|camembert|stilton|roquefort|quark|custard|buttermilk';
const GLUTEN = 'flour|bread|pasta|spaghetti|noodle|couscous|semolina|barley|pastry|cracker|breadcrumb|soy_sauce';

/** Nut and seed butters must not be swept into dairy by the bare word "butter". */
const NUT_BUTTER = /peanut|almond|cashew|hazelnut|nut_butter|tahini|coconut/;
const isDairy = (key) => new RegExp(DAIRY).test(key) && !NUT_BUTTER.test(key);

/**
 * "egg" as an ingredient word, not the "egg" inside "eggplant" — canonicalKey()
 * turns "Egg Plants" into `egg_plants`, which a bare `/^egg|egg_/` test also
 * matches, wrongly pulling aubergine into dairy/egg (category colour, the
 * `egg` allergen, and vegan exclusion all derive from this one predicate).
 */
const EGGPLANT = /egg_?plant/;
const isEgg = (key) => !EGGPLANT.test(key) && /(^|_)eggs?(_|$)/.test(key);

/**
 * Tree-nut allergen — deliberately narrower than "contains the letters n-u-t".
 * EU Reg. 1169/2011 Annex II's "Nuts" entry is almond/hazelnut/walnut/cashew/
 * pecan/Brazil/pistachio/macadamia; peanut is its own separate Annex II entry
 * (ALLERGEN_KEYS already keeps `nut` and `peanut` apart for that reason), and
 * coconut isn't on the list at all — the project's own CATEGORY_RULES already
 * files coconut under `fruit`, not `nut`. A bare `/nut$/` test, tried first,
 * matched all three by accident (coconut, peanut, chestnut, even doughnut all
 * end in "nut"), the mirror image of the `egg_plant` bug above.
 */
const TREE_NUT = 'almond|walnut|cashew|pistachio|pecan|hazelnut|macadamia|brazil_nut|pine_nut';
/** "groundnut" is British/Indian English for peanut, its own separate allergen
 *  below; "Grape-Nuts" is a wheat/barley cereal brand with no nuts in it at all. */
const NUT_EXCLUDE = /coconut|peanut|chestnut|doughnut|donut|grape_nut|ground_?nut/;
const isNut = (key) => !NUT_EXCLUDE.test(key) && (new RegExp(TREE_NUT).test(key) || /(^|_)nuts?(_|$)/.test(key));

/** Rules are either a RegExp over the canonical key, or a predicate. */
const test = (rule, key) => (typeof rule === 'function' ? rule(key) : rule.test(key));

/** First match wins, so order matters. */
const CATEGORY_RULES = [
	['spice', /pepper|salt|paprika|cumin|coriander_seed|turmeric|cinnamon|nutmeg|clove|cardamom|oregano|thyme|rosemary|basil|parsley|mint|dill|sage|bay_leaf|chilli|chili|cayenne|curry|masala|saffron|vanilla|spice|herb|seasoning|stock_cube|zest/],
	['nut', /peanut|nut_butter|almond_butter|cashew_butter|tahini/],
	['dairy', (key) => isDairy(key) || isEgg(key)],
	['protein', new RegExp(`${MEAT}|${FISH}|${SHELLFISH}|tofu`)],
	['legume', /bean|lentil|chickpea|pea$|peas|soy/],
	['nut', /almond|walnut|cashew|pistachio|pecan|hazelnut|peanut|seed|sesame|tahini/],
	['grain', /flour|bread|rice|pasta|spaghetti|noodle|oat|couscous|semolina|cornflour|cornmeal|tortilla|barley|quinoa|cracker|pastry/],
	['fruit', /apple|banana|orange|lemon|lime|berr|cherry|peach|pear|plum|mango|pineapple|grape|raisin|date|fig|apricot|coconut|avocado/],
	['vegetable', /onion|garlic|tomato|potato|carrot|celery|pepper|spinach|cabbage|broccoli|cauliflower|courgette|zucchini|aubergine|egg_?plant|mushroom|leek|cucumber|lettuce|kale|corn|squash|pumpkin|beetroot|turnip|parsnip|ginger|shallot|chive|radish|asparagus/],
	['other', /.*/]
];

/** Beneficial mass for the Balance Grade: fruit, veg, legumes, nuts, seeds. */
const BENEFICIAL = new Set(['vegetable', 'fruit', 'legume', 'nut']);

const ALLERGEN_KEYS = ['gluten', 'dairy', 'nut', 'peanut', 'egg', 'soy', 'fish', 'shellfish', 'sesame'];
const ALLERGEN_RULES = {
	gluten: new RegExp(GLUTEN),
	dairy: isDairy,
	nut: isNut,
	peanut: /peanut|(^|_)ground_?nuts?(_|$)/,
	egg: isEgg,
	soy: /soy|tofu|edamame|miso/,
	fish: new RegExp(FISH),
	shellfish: new RegExp(SHELLFISH),
	sesame: /sesame|tahini/
};

/** Collapses obvious duplicates before they pollute the mosaic. */
const SYNONYMS = {
	spring_onions: 'spring_onion', green_onions: 'spring_onion', scallions: 'spring_onion',
	scallion: 'spring_onion', coriander: 'coriander', cilantro: 'coriander',
	tomatoes: 'tomato', onions: 'onion', red_onions: 'red_onion', potatoes: 'potato',
	carrots: 'carrot', eggs: 'egg', mushrooms: 'mushroom', lemons: 'lemon',
	plain_flour: 'flour', all_purpose_flour: 'flour', self_raising_flour: 'flour',
	caster_sugar: 'sugar', granulated_sugar: 'sugar', olive_oil: 'olive_oil',
	extra_virgin_olive_oil: 'olive_oil', unsalted_butter: 'butter',
	chicken_breasts: 'chicken_breast', chicken_breast_fillets: 'chicken_breast'
};

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------
const VULGAR = {
	'¼': 0.25, '½': 0.5, '¾': 0.75, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
	'⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
	'⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

const UNIT_ALIASES = {
	g: 'g', gr: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l',
	tsp: 'tsp', tspn: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
	tbs: 'tbsp', tbsp: 'tbsp', tblsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
	cup: 'cup', cups: 'cup', oz: 'oz', ounce: 'oz', ounces: 'oz',
	lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
	pinch: 'pinch', pinches: 'pinch', dash: 'dash', dashes: 'dash',
	clove: 'clove', cloves: 'clove', can: 'can', cans: 'can', tin: 'can', tins: 'can',
	sprig: 'sprig', sprigs: 'sprig', handful: 'handful', handfuls: 'handful',
	slice: 'slice', slices: 'slice', bunch: 'bunch', bunches: 'bunch',
	packet: 'packet', pack: 'packet', jar: 'jar', bottle: 'bottle'
};

function canonicalKey(raw) {
	const key = raw
		.toLowerCase()
		.replace(/\(.*?\)/g, ' ')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return SYNONYMS[key] ?? key;
}

function categoryFor(key) {
	for (const [category, rule] of CATEGORY_RULES) if (test(rule, key)) return category;
	return 'other';
}

function allergensFor(key) {
	return ALLERGEN_KEYS.filter((allergen) => test(ALLERGEN_RULES[allergen], key));
}

/**
 * "1 1/2 cups", "225g", "2-3 tbsp", "½ tsp", "Dash" -> { quantity, unit }.
 * Ranges take the lower bound; unresolvable measures return nulls, which is the
 * same signal the real pipeline uses to lower nutrition coverage.
 */
function parseMeasure(text) {
	if (!text) return { quantity: null, unit: null };
	const cleaned = text.trim().toLowerCase().replace(/\s+/g, ' ');
	if (!cleaned || /to taste|to serve|as needed|optional/.test(cleaned)) {
		return { quantity: null, unit: null };
	}

	let quantity = 0;
	let rest = cleaned;
	let matched = false;

	// Leading whole number or decimal, optionally a range ("2-3" -> 2).
	const whole = rest.match(/^(\d+(?:[.,]\d+)?)(?:\s*[-–/]\s*\d+(?:[.,]\d+)?)?\s*/);
	if (whole && !/^\d+\s*\/\s*\d+/.test(rest)) {
		quantity += Number(whole[1].replace(',', '.'));
		rest = rest.slice(whole[0].length);
		matched = true;
	}

	// Common fraction, either "1/2" or a vulgar glyph.
	const fraction = rest.match(/^(\d+)\s*\/\s*(\d+)\s*/);
	if (fraction) {
		quantity += Number(fraction[1]) / Number(fraction[2]);
		rest = rest.slice(fraction[0].length);
		matched = true;
	} else if (VULGAR[rest[0]]) {
		quantity += VULGAR[rest[0]];
		rest = rest.slice(1).trim();
		matched = true;
	}

	const unitWord = rest.match(/^([a-z]+)/)?.[1];
	const unit = unitWord ? (UNIT_ALIASES[unitWord] ?? null) : null;

	if (!matched) {
		// Unit-only measures still carry information ("dash", "pinch").
		return { quantity: null, unit: unit ?? null };
	}
	return { quantity: Number(quantity.toFixed(4)), unit: unit ?? 'unit' };
}

// ---------------------------------------------------------------------------
// Fetch (cached on disk so re-runs are offline and deterministic)
// ---------------------------------------------------------------------------
async function fetchMeals() {
	if (existsSync(RAW_FILE)) {
		console.log('using cached', path.relative(process.cwd(), RAW_FILE));
		return JSON.parse(await readFile(RAW_FILE, 'utf8'));
	}

	const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
	const meals = [];
	for (const letter of letters) {
		const url = `https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`${url} -> ${response.status}`);
		const body = await response.json();
		if (body.meals) meals.push(...body.meals);
		process.stdout.write(`\rfetched ${letter}: ${meals.length} meals`);
	}
	process.stdout.write('\n');

	await mkdir(OUT_DIR, { recursive: true });
	await writeFile(RAW_FILE, JSON.stringify(meals));
	return meals;
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------
function transform(meals) {
	/** @type {Map<string, {id:number,key:string,name:string,category:string,staple:boolean}>} */
	const ingredients = new Map();
	const recipes = [];
	const links = [];

	const idFor = (rawName) => {
		const key = canonicalKey(rawName);
		if (!key) return null;
		if (!ingredients.has(key)) {
			const category = categoryFor(key);
			ingredients.set(key, {
				id: ingredients.size + 1,
				key,
				name: rawName.trim().replace(/\s+/g, ' '),
				category,
				staple: STAPLES.test(key)
			});
		}
		return ingredients.get(key).id;
	};

	for (const meal of meals) {
		const recipeId = Number(meal.idMeal);
		if (!Number.isInteger(recipeId)) continue;

		const used = new Map();
		for (let index = 1; index <= 20; index += 1) {
			const rawName = (meal[`strIngredient${index}`] ?? '').trim();
			if (!rawName) continue;
			const ingredientId = idFor(rawName);
			if (!ingredientId || used.has(ingredientId)) continue;

			const rawMeasure = (meal[`strMeasure${index}`] ?? '').trim();
			const { quantity, unit } = parseMeasure(rawMeasure);
			used.set(ingredientId, {
				recipeId,
				ingredientId,
				rawText: [rawMeasure, rawName].filter(Boolean).join(' ').trim(),
				quantity,
				unit
			});
		}
		if (used.size === 0 || !meal.strInstructions) continue;

		links.push(...used.values());

		const keys = [...used.keys()].map(
			(id) => [...ingredients.values()].find((entry) => entry.id === id).key
		);
		recipes.push({
			id: recipeId,
			sourceUrl: meal.strSource || `https://www.themealdb.com/meal/${recipeId}`,
			attribution: `TheMealDB — ${meal.strMeal}`,
			title: meal.strMeal,
			instructions: meal.strInstructions.replace(/\r\n/g, '\n').trim(),
			cuisine: AREA_TO_CUISINE[meal.strArea] ?? null,
			mealType: CATEGORY_TO_MEAL[meal.strCategory] ?? null,
			diets: dietsFor(keys)
		});
	}

	return { ingredients: [...ingredients.values()], recipes, links };
}

/**
 * Heuristic diet derivation, prototype-grade only. The real pipeline derives
 * these from the ingredient taxonomy, not from regexes over names.
 */
function dietsFor(keys) {
	const meat = new RegExp(`${MEAT}|stock`);
	const seafood = new RegExp(`${FISH}|${SHELLFISH}`);
	const dairyOrEgg = (key) => isDairy(key) || isEgg(key) || /honey/.test(key);

	const hasMeat = keys.some((key) => meat.test(key));
	const hasSeafood = keys.some((key) => seafood.test(key));
	const hasDairyOrEgg = keys.some((key) => dairyOrEgg(key));
	const hasGluten = keys.some((key) => test(ALLERGEN_RULES.gluten, key));
	const hasDairy = keys.some((key) => test(ALLERGEN_RULES.dairy, key));

	const diets = [];
	if (!hasMeat && !hasSeafood) diets.push('vegetarian');
	if (!hasMeat && !hasSeafood && !hasDairyOrEgg) diets.push('vegan');
	if (!hasMeat && hasSeafood) diets.push('pescatarian');
	if (!hasGluten) diets.push('gluten_free');
	if (!hasDairy) diets.push('dairy_free');
	return diets;
}

// ---------------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------------
const quote = (value) =>
	value === null || value === undefined
		? 'NULL'
		: `'${String(value)
				.replace(/'/g, "''")
				// eslint-disable-next-line no-control-regex
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')}'`;

const num = (value) => (value === null || value === undefined || Number.isNaN(value) ? 'NULL' : value);

function batched(header, rows, size = 100) {
	const statements = [];
	for (let index = 0; index < rows.length; index += size) {
		statements.push(`${header}\n${rows.slice(index, index + size).join(',\n')};`);
	}
	return statements.join('\n\n');
}

function toSql({ ingredients, recipes, links }) {
	const parts = [];

	parts.push(`-- Generated by pipeline/prototype/seed_themealdb.mjs — DO NOT COMMIT OUTPUT.
-- Prototype data only (license '${LICENSE}'), replaced by the phase-2 pipeline.`);

	parts.push(`DELETE FROM recipe_micronutrient;
DELETE FROM recipe_diets;
DELETE FROM recipe_ingredients;
DELETE FROM recipe_i18n;
DELETE FROM recipes;
DELETE FROM ingredient_allergens;
DELETE FROM ingredient_micronutrient;
DELETE FROM ingredient_nutrition;
DELETE FROM ingredient_i18n;
DELETE FROM ingredients;
DELETE FROM allergens;`);

	parts.push(
		batched(
			'INSERT INTO allergens (id, key) VALUES',
			ALLERGEN_KEYS.map((key, index) => `(${index + 1}, ${quote(key)})`)
		)
	);

	parts.push(
		batched(
			'INSERT INTO ingredients (id, canonical_key, category, is_staple, beneficial, recipe_count) VALUES',
			ingredients.map(
				(item) =>
					`(${item.id}, ${quote(item.key)}, ${quote(item.category)}, ${item.staple ? 1 : 0}, ${
						BENEFICIAL.has(item.category) ? 1 : 0
					}, 0)`
			)
		)
	);

	parts.push(
		batched(
			'INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES',
			ingredients.map((item) => `(${item.id}, 'en', ${quote(item.name)})`)
		)
	);

	const allergenLinks = [];
	for (const item of ingredients) {
		for (const allergen of allergensFor(item.key)) {
			allergenLinks.push(`(${item.id}, ${ALLERGEN_KEYS.indexOf(allergen) + 1})`);
		}
	}
	if (allergenLinks.length) {
		parts.push(
			batched('INSERT INTO ingredient_allergens (ingredient_id, allergen_id) VALUES', allergenLinks)
		);
	}

	parts.push(
		batched(
			`INSERT INTO recipes (id, source_url, source_lang, license, attribution, cuisine, meal_type,
        prep_minutes, total_minutes, servings, servings_assumed, nutrition_coverage) VALUES`,
			recipes.map(
				(recipe) =>
					`(${recipe.id}, ${quote(recipe.sourceUrl)}, 'en', ${quote(LICENSE)}, ${quote(
						recipe.attribution
					)}, ${quote(recipe.cuisine)}, ${quote(recipe.mealType)}, NULL, NULL, 4, 1, 0)`
			)
		)
	);

	parts.push(
		batched(
			'INSERT INTO recipe_i18n (recipe_id, lang, title, instructions, is_machine) VALUES',
			recipes.map(
				(recipe) => `(${recipe.id}, 'en', ${quote(recipe.title)}, ${quote(recipe.instructions)}, 0)`
			),
			50
		)
	);

	const dietRows = recipes.flatMap((recipe) =>
		recipe.diets.map((diet) => `(${recipe.id}, ${quote(diet)})`)
	);
	if (dietRows.length) {
		parts.push(batched('INSERT INTO recipe_diets (recipe_id, diet) VALUES', dietRows));
	}

	parts.push(
		batched(
			'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, raw_text, quantity, unit, grams) VALUES',
			links.map(
				(link) =>
					`(${link.recipeId}, ${link.ingredientId}, ${quote(link.rawText)}, ${num(
						link.quantity
					)}, ${quote(link.unit)}, NULL)`
			)
		)
	);

	// Mosaic tile weights, then the external-content FTS indexes.
	parts.push(`UPDATE ingredients SET recipe_count =
  (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = ingredients.id);`);
	parts.push(`INSERT INTO ingredient_fts(ingredient_fts) VALUES('rebuild');
INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('rebuild');`);

	return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
const meals = await fetchMeals();
const data = transform(meals);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(SQL_FILE, toSql(data));

const unresolved = data.links.filter((link) => link.quantity === null).length;
console.log(
	`recipes: ${data.recipes.length}\n` +
		`ingredients: ${data.ingredients.length} (staples: ${data.ingredients.filter((i) => i.staple).length})\n` +
		`recipe-ingredient links: ${data.links.length} (unparsed measures: ${unresolved})\n` +
		`sql: ${path.relative(process.cwd(), SQL_FILE)}`
);
