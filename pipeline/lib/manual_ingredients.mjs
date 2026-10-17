/**
 * Ingredients confirmed genuinely absent from the Open Food Facts taxonomy —
 * not a matching bug, not a synonym gap `SYNONYM_OVERRIDES` could fix, an
 * actual missing entry (verified by searching the raw taxonomy file for
 * every spelling variant tried before adding anything here). A standing,
 * reusable mechanism per the project's own decision (see the unpublished project notes) —
 * the next gap like this goes here too, not another one-off list.
 *
 * Each entry supplies everything the taxonomy would normally provide:
 * category, allergens, vegan/vegetarian status, and the English name used
 * both for matching raw recipe text and for FDC lookup in 04_map_fdc.mjs
 * (add a `pipeline/lib/nrv.mjs` FDC_OVERRIDES entry there if a real FDC
 * match exists — most of these do, since USDA FoodData Central and Open
 * Food Facts are entirely separate systems with different coverage gaps).
 *
 * `matchPatterns` are exact, slugified text alternatives real recipe lines
 * actually use for this ingredient (checked against `unmatched_ingredients.txt`,
 * not guessed) — matched the same way `SYNONYM_OVERRIDES` matches a phrase,
 * just resolving to a brand-new key instead of an existing taxonomy one.
 */
export const MANUAL_INGREDIENTS = {
	baking_soda: {
		matchPatterns: ['baking soda', 'bicarbonate of soda', 'sodium bicarbonate'],
		category: 'other', // same bucket as salt/sugar/water/yeast — a pantry leavening agent, not a food group
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'baking soda' }
		// Real FDC match exists — see FDC_OVERRIDES in pipeline/lib/nrv.mjs
		// ("Leavening agents, baking soda", fdc_id 175040).
	},
	cream_of_tartar: {
		matchPatterns: ['cream of tartar'],
		category: 'other',
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'cream of tartar' }
		// Real FDC match exists after all ("Leavening agents, cream of
		// tartar", fdc_id 175041) — an earlier search for it missed this by
		// searching too narrowly. 258 kcal/100g, 61.5g carb, 16,500mg
		// potassium — confirms cream of tartar is *not* the near-zero-calorie
		// compound a first-principles chemistry guess would suggest (that
		// guess was caught and discarded before shipping it). No
		// FDC_OVERRIDES entry needed either — the plain matcher already
		// finds it unaided.
	},
	stock_cube: {
		matchPatterns: ['stock cube', 'stock cubes', 'bouillon cube', 'bouillon cubes', 'seasoning cube', 'seasoning cubes'],
		category: 'other',
		allergens: [],
		vegan: false, // most common (beef/chicken) stock cubes aren't — see the module header
		vegetarian: false,
		names: { en: 'stock cube' }
		// Real FDC match: "Soup, beef broth or bouillon, powder, dry"
		// (fdc_id 171560) — closer to a dry cube's actual water content than
		// any of the ready-to-serve liquid broth entries.
	},
	berbere_spice_blend: {
		matchPatterns: ['berbere spice blend', 'berbere spice', 'berbere'],
		category: 'spice',
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'berbere spice blend' }
		// No manual/FDC nutrition — a home/regional spice-blend recipe, not
		// one fixed product; there is no single correct number to add.
	},
	adobo_sauce: {
		matchPatterns: ['adobo sauce'],
		category: 'other',
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'adobo sauce' }
		// No manual/FDC nutrition — varies significantly by regional recipe
		// (Filipino soy-vinegar braise vs. Mexican chili-vinegar paste).
	},
	pandan_leaf: {
		matchPatterns: ['pandan leaf', 'pandan leaves', 'screwpine leaf', 'screwpine leaves'],
		category: 'spice', // used as a flavoring leaf, same bucket as bay leaf
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'pandan leaf' }
		// No manual/FDC nutrition — no verified source at hand; used in trace
		// amounts for flavor only, same posture as bouquet garni.
	},
	oyster_sauce: {
		matchPatterns: ['oyster sauce'],
		category: 'other',
		allergens: ['shellfish'], // real allergen: made from oyster extract
		vegan: false,
		vegetarian: false,
		names: { en: 'oyster sauce' }
		// No manual/FDC nutrition — no verified source at hand.
	},
	bouquet_garni: {
		matchPatterns: ['bouquet garni'],
		category: 'spice',
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'bouquet garni' }
		// No manual/FDC nutrition — a bundle of herbs removed before serving
		// in most preparations; no single recipe-independent number applies.
	},
	digestive_biscuit: {
		matchPatterns: ['digestive biscuit', 'digestive biscuits'],
		category: 'grain', // wheat-flour based, closest existing bucket to a plain biscuit
		allergens: ['gluten'],
		vegan: false, // traditional recipe includes butter/milk
		vegetarian: true,
		names: { en: 'digestive biscuit' }
		// No manual/FDC nutrition — no verified source at hand.
	},

	// The four below came from a frequency ranking of unmatched_ingredients.txt.
	// Each was checked against the raw taxonomy file for every spelling variant
	// before being added here, and each is genuinely absent rather than a synonym
	// SYNONYM_OVERRIDES could have aliased. `saffron` being missing from a food
	// taxonomy is surprising enough that it was worth double-checking.
	saffron: {
		matchPatterns: ['saffron', 'saffron threads', 'saffron thread', 'saffron strands'],
		category: 'spice',
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'saffron' }
		// Real FDC match exists ("Spices, saffron") and the plain matcher finds it
		// unaided, so no FDC_OVERRIDES entry is needed. Used in such small
		// quantities that its nutrition contribution is negligible either way.
	},
	curry_leaf: {
		matchPatterns: ['curry leaf', 'curry leaves', 'kadi patta', 'curry patta'],
		category: 'spice', // an aromatic leaf used as a herb, same bucket as bay leaf
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'curry leaf' }
		// Deliberately its own key and NOT aliased to `curry` — a curry leaf is a
		// leaf from Murraya koenigii and has nothing to do with curry powder, a
		// spice blend. The suffix-subphrase matcher would happily have produced
		// `curry` for "curry leaves"; that would be wrong, which is why this entry
		// exists. 28 corpus lines.
		// No manual/FDC nutrition — usually fried whole and eaten incidentally.
	},
	hoisin_sauce: {
		matchPatterns: ['hoisin sauce', 'hoisin'],
		category: 'other', // a condiment, like the adobo_sauce entry above
		allergens: ['soy', 'gluten'], // fermented soybean paste, usually wheat-thickened
		vegan: true,
		vegetarian: true,
		names: { en: 'hoisin sauce' }
		// No manual/FDC nutrition added — recipes vary widely in sugar content and
		// no single product is canonical. 13 corpus lines.
	},
	citric_acid: {
		matchPatterns: ['citric acid', 'sour salt'],
		category: 'other', // a pantry acidulant, same bucket as baking_soda
		allergens: [],
		vegan: true,
		vegetarian: true,
		names: { en: 'citric acid' }
		// No manual/FDC nutrition — an isolated acid used in pinch quantities;
		// contributes no meaningful energy or macros at recipe scale.
	}
};
