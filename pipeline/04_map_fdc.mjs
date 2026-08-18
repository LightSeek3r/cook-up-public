/**
 * Stage 04 — map canonical ingredients to USDA FoodData Central and resolve mass.
 *
 * Input:  pipeline/out/ingredients.jsonl, pipeline/data/fdc/*
 * Output: pipeline/out/ingredient_nutrition.jsonl,
 *         pipeline/out/recipe_ingredients.grams.jsonl
 *
 * Volume -> mass is the hard part: use FDC portion weights ("1 cup, chopped =
 * 160 g", "1 medium = 110 g") rather than a generic density table. Lines that
 * cannot be resolved keep grams = NULL and lower the recipe's coverage.
 *
 * Prefer Foundation Foods / SR Legacy over Branded Foods: raw commodity entries
 * match recipe ingredients far better than supermarket products.
 */

// TODO(phase 3): fdc_id mapping table, portion lookup, unit conversion.
console.log('04_map_fdc: not implemented');
