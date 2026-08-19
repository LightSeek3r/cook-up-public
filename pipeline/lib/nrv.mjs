/**
 * FDC nutrient IDs and EU NRV reference values for the macros and the curated
 * 10-nutrient micronutrient set. IDs confirmed against the real downloaded
 * `nutrient.csv` in both Foundation Foods and SR Legacy (they agree, except
 * Vitamin A: SR Legacy's `food_nutrient.csv` almost never uses `2067` despite
 * it existing in `nutrient.csv` — the actually-populated id in both datasets
 * is `1106`, "Vitamin A, RAE").
 */

/** nutrient_id -> our recipes.* macro column, amount already per 100g. */
export const MACRO_NUTRIENT_IDS = {
	1003: 'protein_g',
	1004: 'fat_g',
	1258: 'sat_fat_g',
	1005: 'carb_g',
	2000: 'sugar_g',
	1079: 'fiber_g',
	1093: 'sodium_mg'
};

/**
 * kcal ("Energy", id 1008) is only populated for 299/423 of our matched
 * foods — Foundation Foods frequently reports energy under the Atwater
 * conversion-factor ids instead (confirmed against the real data: 1008
 * covers 299, +2048 "Specific Factors" covers another 110, +2047 "General
 * Factors" a further 123). Tried in this priority order; USDA's own
 * convention prefers food-specific Atwater factors over the generic ones.
 */
export const KCAL_NUTRIENT_IDS = [1008, 2048, 2047];

/**
 * nutrient_key -> { id, unit, nrv }. `nrv` is the EU Reg. 1169/2011 Annex XIII
 * reference value used for `pct_nrv`. A curated subset of the full 28-nutrient
 * Annex — see the phase-3 plan for why: these are the ones people actually
 * search for, and the ones FDC reports consistently.
 */
export const MICRONUTRIENTS = {
	vitamin_c: { id: 1162, unit: 'mg', nrv: 80 },
	vitamin_d: { id: 1114, unit: 'ug', nrv: 5 },
	vitamin_a: { id: 1106, unit: 'ug', nrv: 800 },
	vitamin_b12: { id: 1178, unit: 'ug', nrv: 2.5 },
	folate: { id: 1177, unit: 'ug', nrv: 200 },
	iron: { id: 1089, unit: 'mg', nrv: 14 },
	calcium: { id: 1087, unit: 'mg', nrv: 800 },
	potassium: { id: 1092, unit: 'mg', nrv: 2000 },
	magnesium: { id: 1090, unit: 'mg', nrv: 375 },
	zinc: { id: 1095, unit: 'mg', nrv: 10 }
};
