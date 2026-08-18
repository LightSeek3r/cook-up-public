/**
 * Stage 03 — ingredient normalisation and quantity parsing.
 *
 * Input:  pipeline/out/recipes.jsonl, pipeline/data/off-taxonomy.json
 * Output: pipeline/out/ingredients.jsonl, pipeline/out/recipe_ingredients.jsonl
 *
 * Two jobs:
 *  1. Map each raw ingredient line to a canonical key from the Open Food Facts
 *     taxonomy (handles scallion/green onion/spring onion) and carry its
 *     translations for all SUPPORTED_LANGS straight into ingredient_i18n.
 *  2. Split the line into { quantity, unit, ingredient }, e.g.
 *     "2 cups diced tomato" -> { quantity: 2, unit: 'cup', key: 'tomato' }.
 *     Vulgar fractions, ranges ("2-3"), counts ("1 medium onion") and vague
 *     amounts ("to taste" -> staple, no mass) all need handling.
 *
 * Also derives: category, is_staple, beneficial (fruit/veg/legume/nut, used by
 * the Balance Grade), and allergen links.
 */

// TODO(phase 2): implement matcher (exact -> synonym -> stemmed -> fuzzy) and
// report the unmatched tail so the taxonomy can be extended deliberately.
console.log('03_normalize_ingredients: not implemented');
