/**
 * Stage 05 — aggregate nutrition per recipe, then grade it.
 *
 * Input:  pipeline/out/recipe_ingredients.grams.jsonl, ingredient_nutrition.jsonl,
 *         ingredient_micronutrient.jsonl, ingredients.jsonl, recipes.jsonl
 * Output: pipeline/out/recipes.nutrition.jsonl, recipe_micronutrient.jsonl
 *
 * Coverage: the original header comment here read "resolved grams / (resolved
 * + unresolved-but-required grams)" — literally uncomputable, since an
 * unresolved row's mass is by definition unknown. Read instead as *count*
 * coverage — same "is_staple never counts as missing" convention already
 * used everywhere else in this app: staples are excluded from both sides;
 * `resolved non-staple rows / all non-staple rows`. `total_mass` (used to
 * normalise to per-100g for `balanceFor()`) is a genuine mass sum over every
 * resolved row, staple included — a pinch of salt's sodium is real even
 * though its dry mass doesn't count toward "how much of this dish we can
 * account for."
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { balanceFor } from './lib/balance.mjs';
import { MACRO_NUTRIENT_IDS, MICRONUTRIENTS } from './lib/nrv.mjs';

const OUT_DIR = path.resolve('pipeline/out');

// Must track src/lib/config.ts — pipeline/ is plain Node ESM and can't import
// the SvelteKit TS module directly.
const COVERAGE_MIN = 0.7;
const DEFAULT_SERVINGS = 4;

/**
 * Per-serving plausibility ceiling — real bug, found on real data: a
 * large-batch recipe (e.g. "5 lbs chicken, 18 lbs broth") with no stated
 * `servings` falls back to `DEFAULT_SERVINGS = 4`, and dividing a genuinely
 * ~13 kg batch by 4 produces a "6,533 kcal/serving" result that is
 * *correctly computed* from correctly-resolved masses but not a trustworthy
 * claim. Excluding every `servings_assumed` recipe instead would cost half
 * of all coverage for a failure mode that only actually shows up in ~7% of
 * that group (measured on the real corpus) — this targets the actual
 * symptom. 2000 kcal/serving is comfortably above even a rich single
 * serving (p99 of the real distribution is 2250) and only trims the
 * genuine outlier tail.
 */
const KCAL_PLAUSIBILITY_MAX = 2000;

const MACRO_FIELDS = ['kcal', ...Object.values(MACRO_NUTRIENT_IDS)];

async function readJsonl(name) {
	const raw = await readFile(path.join(OUT_DIR, name), 'utf8');
	return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

async function main() {
	const [gramsRows, ingredientNutrition, ingredientMicros, ingredients, recipes] = await Promise.all([
		readJsonl('recipe_ingredients.grams.jsonl'),
		readJsonl('ingredient_nutrition.jsonl'),
		readJsonl('ingredient_micronutrient.jsonl'),
		readJsonl('ingredients.jsonl'),
		readJsonl('recipes.jsonl')
	]);

	const macrosByKey = new Map(ingredientNutrition.map((n) => [n.canonical_key, n]));
	const microsByKey = new Map();
	for (const m of ingredientMicros) {
		if (!microsByKey.has(m.canonical_key)) microsByKey.set(m.canonical_key, []);
		microsByKey.get(m.canonical_key).push(m);
	}
	const beneficialByKey = new Map(ingredients.map((i) => [i.canonical_key, i.beneficial]));
	const servingsByRecipe = new Map(recipes.map((r) => [r.id, r.servings]));

	const byRecipe = new Map();
	for (const row of gramsRows) {
		if (!byRecipe.has(row.recipe_id)) byRecipe.set(row.recipe_id, []);
		byRecipe.get(row.recipe_id).push(row);
	}

	const nutritionLines = [];
	const microLines = [];
	let coveredCount = 0;
	let implausibleCount = 0;
	const gradeDist = {};

	for (const [recipeId, rows] of byRecipe) {
		const nonStaple = rows.filter((r) => !r.is_staple);
		const resolvedNonStaple = nonStaple.filter((r) => r.grams != null);
		const coverage = nonStaple.length ? resolvedNonStaple.length / nonStaple.length : 0;

		const servings = servingsByRecipe.get(recipeId) || DEFAULT_SERVINGS;
		const totals = Object.fromEntries(MACRO_FIELDS.map((f) => [f, 0]));
		const microTotals = Object.fromEntries(Object.keys(MICRONUTRIENTS).map((k) => [k, 0]));
		let totalMass = 0;
		let beneficialMass = 0;

		for (const row of rows) {
			if (row.grams == null) continue;
			totalMass += row.grams;
			if (beneficialByKey.get(row.canonical_key)) beneficialMass += row.grams;

			const macros = macrosByKey.get(row.canonical_key);
			if (macros) {
				for (const field of MACRO_FIELDS) {
					if (macros[field] != null) totals[field] += (row.grams / 100) * macros[field];
				}
			}
			for (const micro of microsByKey.get(row.canonical_key) ?? []) {
				microTotals[micro.nutrient_key] += (row.grams / 100) * micro.amount;
			}
		}

		let nutritionRow = { id: recipeId, nutrition_coverage: Number(coverage.toFixed(4)) };
		const kcalPerServing = totals.kcal / servings;
		const plausible = Number.isFinite(kcalPerServing) && kcalPerServing <= KCAL_PLAUSIBILITY_MAX;
		if (!plausible && coverage >= COVERAGE_MIN && totalMass > 0) implausibleCount++;

		if (coverage >= COVERAGE_MIN && totalMass > 0 && plausible) {
			coveredCount++;
			const per100g = Object.fromEntries(MACRO_FIELDS.map((f) => [f, (totals[f] / totalMass) * 100]));
			const beneficialPct = (beneficialMass / totalMass) * 100;
			const { grade, score } = balanceFor({ ...per100g, beneficial_pct: beneficialPct });
			gradeDist[grade] = (gradeDist[grade] ?? 0) + 1;

			for (const field of MACRO_FIELDS) {
				nutritionRow[field] = Number((totals[field] / servings).toFixed(2));
			}
			nutritionRow.balance_grade = grade;
			nutritionRow.balance_score = score;

			for (const [key, { unit, nrv }] of Object.entries(MICRONUTRIENTS)) {
				const perServing = microTotals[key] / servings;
				if (perServing <= 0) continue;
				microLines.push(
					JSON.stringify({
						recipe_id: recipeId,
						nutrient_key: key,
						amount: Number(perServing.toFixed(3)),
						unit,
						pct_nrv: Number(((perServing / nrv) * 100).toFixed(1))
					})
				);
			}
		} else {
			// Below the visibility threshold — don't store a low-confidence
			// macro/grade value even though the UI's own gate would hide it too;
			// `nutrition_coverage` alone should never be paired with real numbers.
			for (const field of MACRO_FIELDS) nutritionRow[field] = null;
			nutritionRow.balance_grade = null;
			nutritionRow.balance_score = null;
		}
		nutritionLines.push(JSON.stringify(nutritionRow));
	}

	await Promise.all([
		writeFile(path.join(OUT_DIR, 'recipes.nutrition.jsonl'), nutritionLines.join('\n') + '\n'),
		writeFile(path.join(OUT_DIR, 'recipe_micronutrient.jsonl'), microLines.join('\n') + '\n')
	]);

	console.log(
		`05_compute_nutrition: ${byRecipe.size} recipes, ${coveredCount} clear ${COVERAGE_MIN * 100}% coverage ` +
			`(${implausibleCount} additionally excluded for exceeding ${KCAL_PLAUSIBILITY_MAX} kcal/serving)`
	);
	console.log('05_compute_nutrition: grade distribution', gradeDist);
}

await main();
