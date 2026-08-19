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
import { loadFdc, matchFdc } from './lib/fdc.mjs';
import { MACRO_NUTRIENT_IDS, KCAL_NUTRIENT_IDS, MICRONUTRIENTS } from './lib/nrv.mjs';

const OUT_DIR = path.resolve('pipeline/out');
const FDC_DIR = path.resolve('pipeline/data/fdc');

/** True mass units convert exactly, always — FDC portion data can't improve
 *  on "1 kg = 1000 g" and must never be consulted for these. */
const EXACT_GRAMS_PER_UNIT = { g: 1, kg: 1000, oz: 28.35, lb: 453.59 };

/** Volume units whose mass genuinely depends on the food (a cup of flour vs.
 *  a cup of honey) — try the food's own FDC portion first, this water-density
 *  approximation only as a fallback. */
const VOLUME_GRAMS_PER_UNIT = { ml: 1, l: 1000, tsp: 4.93, tbsp: 14.79, cup: 236.59 };

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

function resolveGrams(quantity, unit, portions) {
	if (quantity == null || !unit) return null;
	if (EXACT_GRAMS_PER_UNIT[unit] != null) return Number((quantity * EXACT_GRAMS_PER_UNIT[unit]).toFixed(2));
	const perUnit = fdcPortionGrams(unit, portions) ?? VOLUME_GRAMS_PER_UNIT[unit] ?? null;
	return perUnit == null ? null : Number((quantity * perUnit).toFixed(2));
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
	const unmatched = [];
	let matchedFoundation = 0;
	let matchedSrLegacy = 0;

	for (const ing of ingredients) {
		const name = ing.names.en ?? ing.canonical_key.replace(/_/g, ' ');
		const match = matchFdc(name, fdc);
		if (!match) {
			unmatched.push(ing.canonical_key);
			continue;
		}
		fdcByKey.set(ing.canonical_key, {
			fdc_id: match.fdc_id,
			portions: fdc.portionsByFood.get(match.fdc_id) ?? []
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

	const isStapleByKey = new Map(ingredients.map((i) => [i.canonical_key, i.is_staple]));
	const gramsLines = [];
	let resolvedCount = 0;
	for (const ri of recipeIngredients) {
		const entry = fdcByKey.get(ri.canonical_key);
		const grams = entry ? resolveGrams(ri.quantity, ri.unit, entry.portions) : null;
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
			`(${matchedFoundation} foundation, ${matchedSrLegacy} sr_legacy, ${unmatched.length} unmatched — see unmatched_fdc.txt)`
	);
	console.log(`04_map_fdc: ${collisions.length} ingredients collided onto an already-used fdc_id — see fdc_collisions.txt`);
	console.log(
		`04_map_fdc: resolved grams for ${resolvedCount}/${recipeIngredients.length} recipe_ingredients rows`
	);
}

await main();
