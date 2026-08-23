/**
 * Stage 04 — map canonical ingredients to USDA FoodData Central and resolve
 * recipe quantities to grams (the "hard part": FDC's own portion weights,
 * e.g. "2 tbsp = 35.8 g", not a generic density table — used first, generic
 * volume/mass conversion is only the fallback).
 *
 * Input:  pipeline/out/ingredients.jsonl, recipe_ingredients.jsonl,
 *         pipeline/data/fdc/{foundation,sr_legacy}
 * Output: pipeline/out/ingredient_nutrition.jsonl,
 *         pipeline/out/ingredient_micronutrient.jsonl,
 *         pipeline/out/recipe_ingredients.grams.jsonl,
 *         pipeline/out/unmatched_fdc.txt
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadFdc, matchFdc, matchFdcCandidates } from './lib/fdc.mjs';
import { MACRO_NUTRIENT_IDS, KCAL_NUTRIENT_IDS, MICRONUTRIENTS, FDC_OVERRIDES } from './lib/nrv.mjs';
import { MANUAL_INGREDIENTS } from './lib/manual_ingredients.mjs';
import { GENERIC_PAIRS } from './lib/generic_ingredients.mjs';

// specific -> generic, for nutrition fallback only. FDC describes foods, not
// every culinary form of them: it has "thyme" but not "dried thyme", "pepper"
// but not "black peppercorns". Per-gram nutrition is a property of the food, so
// the generic is a far better estimate for a variety or form of it than no
// estimate at all — and without this, making ingredient matching *more*
// specific silently costs nutrition coverage (measured: 1,032 graded recipes
// down to 887 before this fallback existed).
//
// Deliberately built from the curated generic_of list rather than the raw
// taxonomy DAG, for the reason that list documents: its pairs are already
// vetted as same-food relationships, and its rule-1 exclusions keep whole
// category anchors out. Falling back to "spice" or "cheese" would invent a
// number rather than approximate one.
const GENERIC_OF = new Map();
for (const [generic, specific] of GENERIC_PAIRS) {
	if (!GENERIC_OF.has(specific)) GENERIC_OF.set(specific, []);
	GENERIC_OF.get(specific).push(generic);
}

/** Fallback keys for an ingredient, nearest generic first. */
function nutritionFallbacks(key) {
	const out = [];
	const seen = new Set([key]);
	let frontier = [key];
	while (frontier.length) {
		const next = [];
		for (const k of frontier) {
			for (const generic of GENERIC_OF.get(k) ?? []) {
				if (seen.has(generic)) continue;
				seen.add(generic);
				out.push(generic);
				next.push(generic);
			}
		}
		frontier = next;
	}
	return out;
}

const OUT_DIR = path.resolve('pipeline/out');
const FDC_DIR = path.resolve('pipeline/data/fdc');

/** True mass units convert exactly, always — FDC portion data can't improve
 *  on "1 kg = 1000 g" and must never be consulted for these. */
const EXACT_GRAMS_PER_UNIT = { g: 1, kg: 1000, oz: 28.35, lb: 453.59 };

/** Volume units whose mass genuinely depends on the food (a cup of flour vs.
 *  a cup of honey) — try the food's own FDC portion first, this water-density
 *  approximation only as a fallback.
 *
 *  dl/cl/quart/pint are pure unit definitions, added because the corpus uses them
 *  and their absence made 149 rows unweighable for no reason. `drop` and the two
 *  below are conventions rather than measurements, and are labelled as such. */
const VOLUME_GRAMS_PER_UNIT = {
	ml: 1, l: 1000, tsp: 4.93, tbsp: 14.79, cup: 236.59,
	dl: 100, cl: 10, quart: 946.35, pint: 473.18,
	// Conventional, not measured: a pinch is defined as 1/16 tsp and a dash as
	// 1/8 in US practice, and a drop as ~0.05 ml. Used because "a pinch of salt"
	// contributing literally nothing understates sodium, and a stated convention
	// is honest in a way a guessed number is not.
	pinch: 4.93 / 16, dash: 4.93 / 8, drop: 0.05
};

/**
 * FDC portion units that mean "one of this item" — the only ones the implicit
 * count path below is allowed to use.
 *
 * Deliberately excludes `whole` and `slice`, even though both are real portion
 * modifiers: "whole" word-matches inside descriptions like "cup leaves, whole"
 * (which is a volume, not a count) and "slice" belongs to processed forms
 * (`Beef, bologna` has one) rather than to the raw item a recipe counts.
 */
const COUNT_PORTION_UNITS = ['medium', 'large', 'fruit'];

/**
 * Categories where "3 onions" is a countable whole item. Gated because a bare
 * count is meaningless for the others: "2 flour" or "1 salt" has no natural unit
 * weight, and resolving it from whatever portion a sibling food happens to carry
 * is how `sugar` came to weigh 155 g per unit (via "Sugar-apples (sweetsop)").
 */
const COUNTABLE_CATEGORIES = new Set(['vegetable', 'fruit', 'protein', 'dairy']);

/** Our canonical unit -> FDC `measure_unit.name`, where they differ in spelling. */
const UNIT_TO_FDC_NAME = { tbsp: 'tablespoon', tsp: 'teaspoon', l: 'liter', ml: 'milliliter' };

/** Finds the FDC portion whose unit name or free-text description/modifier
 *  names our recipe unit, for this specific matched food — as a whole word,
 *  never a bare substring (an earlier version matched the *letter* "g" inside
 *  words like "large", corrupting every plain-gram row). Null if none —
 *  callers fall back to the generic table, never guess a portion. */
function fdcPortionGrams(unit, portions) {
	if (!portions?.length) return null;
	const fdcName = UNIT_TO_FDC_NAME[unit] ?? unit;
	const isWordMatch = (text) => new RegExp(`\\b${fdcName}\\b`, 'i').test(text);
	const hit = portions.find(
		(p) => p.unit_name === fdcName || isWordMatch(p.description) || isWordMatch(p.modifier)
	);
	return hit ? hit.gram_weight_per_unit : null;
}

/**
 * Grams for one recipe line, or null.
 *
 * `entry.portions` is the matched food's own portion list; `entry.borrowed` is the
 * concatenated portion lists of lower-ranked FDC foods matching the same
 * ingredient name (see `matchFdcCandidates`). The borrow exists because the
 * Foundation-Foods preference that picks the best *nutrition* frequently picks a
 * food with no portions at all — 229 of 322 Foundation matches have none.
 *
 * Only a gram weight is ever borrowed. Nutrition always comes from the primary
 * match, so a sibling can tell us what one medium onion weighs without lending
 * the recipe its own macros.
 */
function resolveGrams(quantity, unit, entry, category) {
	if (quantity == null) return null;
	const portions = entry?.portions;
	const borrowed = entry?.borrowed;

	if (unit) {
		// Mass is arithmetic and must never consult portion data (an earlier
		// version word-matched the letter "g" inside "large").
		if (EXACT_GRAMS_PER_UNIT[unit] != null) {
			return Number((quantity * EXACT_GRAMS_PER_UNIT[unit]).toFixed(2));
		}
		const perUnit =
			fdcPortionGrams(unit, portions) ??
			fdcPortionGrams(unit, borrowed) ??
			VOLUME_GRAMS_PER_UNIT[unit] ??
			null;
		return perUnit == null ? null : Number((quantity * perUnit).toFixed(2));
	}

	// No unit at all: "4 eggs", "2 onions". A bare number in front of a countable
	// whole food is a count, and FDC states what one of them weighs — but only for
	// categories where that is meaningful, and only from portions that actually
	// denote one item. 3,579 corpus rows are this shape.
	if (!COUNTABLE_CATEGORIES.has(category)) return null;
	for (const countUnit of COUNT_PORTION_UNITS) {
		const perUnit = fdcPortionGrams(countUnit, portions) ?? fdcPortionGrams(countUnit, borrowed);
		if (perUnit != null) return Number((quantity * perUnit).toFixed(2));
	}
	return null;
}

async function main() {
	const [ingredientsRaw, recipeIngredientsRaw] = await Promise.all([
		readFile(path.join(OUT_DIR, 'ingredients.jsonl'), 'utf8'),
		readFile(path.join(OUT_DIR, 'recipe_ingredients.jsonl'), 'utf8')
	]);
	const ingredients = ingredientsRaw.trim().split('\n').map((l) => JSON.parse(l));
	const recipeIngredients = recipeIngredientsRaw.trim().split('\n').map((l) => JSON.parse(l));

	const fdc = await loadFdc(FDC_DIR);
	console.log(`04_map_fdc: ${ingredients.length} ingredients, ${fdc.foods.size} FDC foods loaded`);

	const fdcByKey = new Map(); // canonical_key -> { fdc_id, data_type, portions }
	const manualNutritionByKey = new Map(); // canonical_key -> hand-authored macros, no fdc_id at all
	const unmatched = [];
	const fallbackSources = new Map(); // canonical_key -> generic key its nutrition came from
	let matchedFoundation = 0;
	let matchedSrLegacy = 0;
	let matchedOverride = 0;

	for (const ing of ingredients) {
		// Curated fixes for ingredients where free-text matching lands on a
		// plausible-but-wrong entry (see FDC_OVERRIDES' own doc comment) — an
		// exact fdc_id lookup, checked before ever calling the text matcher.
		let match = null;
		const overrideId = FDC_OVERRIDES[ing.canonical_key];
		if (overrideId != null) {
			const food = fdc.foods.get(overrideId);
			if (food) {
				match = { fdc_id: food.fdc_id, data_type: food.data_type };
				matchedOverride++;
			} else {
				// A typo in our own table is a bug, not a silent fallback — loud on
				// purpose, then behave as if no override existed for this key.
				console.warn(
					`04_map_fdc: FDC_OVERRIDES['${ing.canonical_key}'] = '${overrideId}' is not in the loaded FDC data — falling back to matchFdc`
				);
			}
		}

		if (!match) {
			const name = ing.names.en ?? ing.canonical_key.replace(/_/g, ' ');
			match = matchFdc(name, fdc);
		}
		if (!match) {
			// No entry for this exact form — approximate from the nearest generic
			// (see GENERIC_OF above). Records which key supplied the numbers so
			// the run summary can report how much of the corpus is estimated
			// this way rather than measured directly.
			for (const fallbackKey of nutritionFallbacks(ing.canonical_key)) {
				const fallbackOverride = FDC_OVERRIDES[fallbackKey];
				const food = fallbackOverride != null ? fdc.foods.get(fallbackOverride) : null;
				match = food
					? { fdc_id: food.fdc_id, data_type: food.data_type }
					: matchFdc(fallbackKey.replace(/_/g, ' '), fdc);
				if (match) {
					fallbackSources.set(ing.canonical_key, fallbackKey);
					break;
				}
			}
		}
		if (!match) {
			// A hand-authored ingredient (pipeline/lib/manual_ingredients.mjs)
			// with no FDC match either can still carry real, chemistry-sourced
			// macros directly — not a substitute for a real match, only used
			// when one was confirmed not to exist (see that file's own comments
			// for which of its entries qualify and why).
			const manual = MANUAL_INGREDIENTS[ing.canonical_key]?.manualNutrition;
			if (manual) {
				manualNutritionByKey.set(ing.canonical_key, manual);
			} else {
				unmatched.push(ing.canonical_key);
			}
			continue;
		}
		fdcByKey.set(ing.canonical_key, {
			fdc_id: match.fdc_id,
			portions: fdc.portionsByFood.get(match.fdc_id) ?? [],
			// Portions from the other FDC foods this ingredient name matches, for
			// weight-only borrowing when the primary match carries none. Built from
			// the ingredient's display name, the same string `matchFdc` was given.
			borrowed: matchFdcCandidates(ing.names?.en ?? ing.canonical_key.replace(/_/g, ' '), fdc)
				.filter((c) => c.fdc_id !== match.fdc_id)
				.flatMap((c) => fdc.portionsByFood.get(c.fdc_id) ?? []),
			category: ing.category
		});
		if (match.data_type === 'foundation_food') matchedFoundation++;
		else matchedSrLegacy++;
	}

	const nutritionLines = [];
	const microLines = [];
	const collisions = []; // two ingredients matched to the same fdc_id — flag, don't silently merge
	const seenFdcIds = new Set();
	for (const [key, { fdc_id }] of fdcByKey) {
		const nutrients = fdc.nutrientsByFood.get(fdc_id);
		if (!nutrients) continue;

		// ingredient_nutrition.fdc_id is UNIQUE — a second ingredient landing on
		// the same food (imperfect matching on a free-text description, e.g.
		// "cider" and "cider_vinegar" both resolving to one FDC entry) keeps its
		// nutrient *values* but not the fdc_id link, so the insert doesn't fail
		// and no data is silently dropped. `unmatched_fdc.txt`'s sibling.
		const isCollision = seenFdcIds.has(fdc_id);
		if (isCollision) collisions.push(`${key}\t${fdc_id}\t${fdc.foods.get(fdc_id)?.description ?? ''}`);
		seenFdcIds.add(fdc_id);

		const macros = { canonical_key: key, fdc_id: isCollision ? null : Number(fdc_id) };
		for (const [id, field] of Object.entries(MACRO_NUTRIENT_IDS)) {
			macros[field] = nutrients.get(id) ?? null;
		}
		macros.kcal = null;
		for (const id of KCAL_NUTRIENT_IDS) {
			const value = nutrients.get(String(id));
			if (value != null) {
				macros.kcal = value;
				break;
			}
		}
		// Last resort: standard Atwater general-factor formula from this food's
		// own macros — the same calculation used on nutrition labels when energy
		// wasn't measured directly. Closes the residual gap where none of the
		// three energy ids above were reported but the macros themselves were.
		if (macros.kcal == null && macros.protein_g != null && macros.carb_g != null && macros.fat_g != null) {
			macros.kcal = Number((macros.protein_g * 4 + macros.carb_g * 4 + macros.fat_g * 9).toFixed(1));
		}
		nutritionLines.push(JSON.stringify(macros));

		for (const [nutrientKey, { id, unit }] of Object.entries(MICRONUTRIENTS)) {
			const amount = nutrients.get(String(id));
			if (amount == null) continue;
			microLines.push(JSON.stringify({ canonical_key: key, nutrient_key: nutrientKey, amount, unit }));
		}
	}

	// Hand-authored macros, no fdc_id and no micronutrients (none were
	// sourced — see manual_ingredients.mjs) — same row shape otherwise so
	// downstream code (06_seed_d1.mjs, resolveGrams below) needs no
	// manual-vs-FDC branching of its own.
	for (const [key, macros] of manualNutritionByKey) {
		nutritionLines.push(JSON.stringify({ canonical_key: key, fdc_id: null, ...macros }));
	}

	const isStapleByKey = new Map(ingredients.map((i) => [i.canonical_key, i.is_staple]));
	const gramsLines = [];
	let resolvedCount = 0;
	for (const ri of recipeIngredients) {
		const entry = fdcByKey.get(ri.canonical_key);
		const grams = entry ? resolveGrams(ri.quantity, ri.unit, entry, entry.category) : null;
		if (grams != null) resolvedCount++;
		gramsLines.push(
			JSON.stringify({
				recipe_id: ri.recipe_id,
				canonical_key: ri.canonical_key,
				grams,
				is_staple: isStapleByKey.get(ri.canonical_key) ?? 0
			})
		);
	}

	await Promise.all([
		writeFile(path.join(OUT_DIR, 'ingredient_nutrition.jsonl'), nutritionLines.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'ingredient_micronutrient.jsonl'), microLines.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'recipe_ingredients.grams.jsonl'), gramsLines.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'unmatched_fdc.txt'), unmatched.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'fdc_collisions.txt'), collisions.join('\n') + '\n')
	]);

	console.log(
		`04_map_fdc: matched ${fdcByKey.size}/${ingredients.length} ingredients ` +
			`(${matchedFoundation} foundation, ${matchedSrLegacy} sr_legacy, ${matchedOverride} via FDC_OVERRIDES, ` +
			`${manualNutritionByKey.size} via hand-authored nutrition, ${unmatched.length} unmatched — see unmatched_fdc.txt)`
	);
	console.log(`04_map_fdc: ${collisions.length} ingredients collided onto an already-used fdc_id — see fdc_collisions.txt`);
	console.log(
		`04_map_fdc: ${fallbackSources.size} ingredients took nutrition from a more generic key (FDC has no entry for that exact form)`
	);
	console.log(
		`04_map_fdc: resolved grams for ${resolvedCount}/${recipeIngredients.length} recipe_ingredients rows`
	);
}

await main();
