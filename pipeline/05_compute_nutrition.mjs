import { balanceFor } from './lib/balance.mjs';

/**
 * Stage 05 — aggregate nutrition per recipe, then grade it.
 *
 * Input:  pipeline/out/recipe_ingredients.grams.jsonl, ingredient_nutrition.jsonl
 * Output: pipeline/out/recipes.nutrition.jsonl, recipe_micronutrient.jsonl
 *
 * Algorithm:
 *   1. total_mass   = sum of resolved grams (staples with no mass are skipped)
 *   2. coverage     = resolved grams / (resolved + unresolved-but-required grams)
 *                     -> stored on recipes.nutrition_coverage; the UI hides
 *                        everything below COVERAGE_MIN (0.70) instead of showing
 *                        a misleading estimate
 *   3. servings     = stated, else DEFAULT_SERVINGS with servings_assumed = 1
 *   4. per serving  = totals / servings
 *   5. per 100 g    = totals / total_mass * 100  -> balanceFor() -> grade + score
 *   6. micronutrients per serving, with pct_nrv against the bundled EU NRV table
 *      (Reg. 1169/2011); the UI surfaces >=15% as "source of", >=30% as "high in"
 */

void balanceFor; // wired up in phase 3

// TODO(phase 3): implement aggregation, NRV table, and the micronutrient rollup.
console.log('05_compute_nutrition: not implemented');
