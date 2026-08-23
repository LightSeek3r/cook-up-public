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

/**
 * `canonical_key -> fdc_id` overrides for ingredients where `matchFdc`'s free-text
 * token matching lands on a plausible-but-wrong entry — English-name ambiguity no
 * amount of tokenizing/scoring can resolve (e.g. a bare "pepper" ingredient line
 * means the ground spice, but "Peppers, bell, green, raw" is a perfectly valid
 * *textual* match for the word "pepper"). Values MUST be strings: `loadFdc` keys
 * `fdc.foods` by the raw parsed-CSV `fdc_id` column, e.g. `'169967'`, never a
 * number — a numeric key here would silently miss on every `Map.get()` lookup
 * (`04_map_fdc.mjs` treats that as "typo, not a real override" and warns loudly
 * rather than silently falling through). Every id below was looked up directly in
 * the real `pipeline/data/fdc/{foundation,sr_legacy}/food.csv` and its exact
 * description + per-100g macros confirmed before being added here — see
 * `tasks/todo.md` phase 3 for the audit that produced this list (usage counts
 * against the real recipe corpus, and `pipeline/out/fdc_collisions.txt`).
 */
export const FDC_OVERRIDES = {
	// ---- From the Open Food Facts crosswalk audit ----
	// OFF records a `usda_ndb_code` for 660 of its ingredient entries, and
	// sr_legacy_food.csv maps NDB -> fdc_id. That is an upstream-CURATED opinion on
	// which FDC food an ingredient is, so it satisfies this table's admission bar
	// (verified, not guessed) in a way free-text matching does not. It agreed with
	// our matcher on 103 keys and disagreed on 80; each entry below was then read
	// individually, because the crosswalk is a candidate generator, not an oracle —
	// it also proposed `chili_pepper` -> "Peppers, hot chile, SUN-DRIED" (worse than
	// our fresh-chili match) and `bacon` -> "Lard" (not bacon at all). Both refused.
	//
	// Every id below was checked against the real CSVs for description AND that the
	// entry actually loads.
	//
	// Ours was a COOKIE. 100 corpus rows of icing sugar carrying biscuit macros.
	icing_sugar: '169656', // "Sugars, powdered"
	// Ours was a gluten-free BREAD whose description merely mentions corn starch.
	corn_starch: '169698', // "Cornstarch"
	// Ours was almond BUTTER — ~600 kcal/100 g of ground paste standing in for nuts.
	almond: '170567', // "Nuts, almonds"
	// Ours was "Strawberry-flavor beverage mix, POWDER". The real entry was never
	// even a candidate: the FDC tokenizer does not handle "-ies", so
	// "Strawberries" reduces to "strawberrie" and never meets "strawberry".
	strawberry: '167762', // "Strawberries, raw"
	raspberry: '167755', // "Raspberries, raw" — ours was "Raspberry juice concentrate"
	// Ours was "Bananas, OVERRIPE, raw", an oddly specific varietal with 1 portion.
	banana: '173944', // "Bananas, raw" (8 portions)
	// Ours was "Bacon, MEATLESS" — a vegetarian substitute standing in for pork on
	// 100 rows, wrong on protein and fat as well as sodium. OFF proposed "Lard",
	// also wrong; this is the entry that is actually bacon.
	bacon: '168277', // "Pork, cured, bacon, unprepared" — the raw form, since recipes cook it
	// Ours was "Salmon nuggets, breaded, frozen, heated".
	salmon: '173686', // "Fish, salmon, Atlantic, wild, raw"
	// Ours was "Cherry juice, tart".
	cherry: '171719', // "Cherries, sweet, raw" — ours was "Cherry juice, tart"

	// Twelve keys our matcher could not place at ALL (they sat in
	// unmatched_fdc.txt contributing nothing to any recipe's nutrition), which the
	// crosswalk resolves outright. Descriptions read and confirmed one by one.
	collard_greens: '170406', // "Collards, raw" — failed because "collard greens" is two tokens and FDC's row is one
	black_gram: '174259', // "Mungo beans, mature seeds, raw"
	beetroot: '169145', // "Beets, raw" — a British/US naming split, not a data gap
	gruyere: '171242', // "Cheese, gruyere"
	grape_leaf: '168575', // "Grape leaves, raw"
	roselle_flower: '168170', // "Roselle, raw"
	blackcurrant: '173963', // "Currants, european black, raw"
	wholemeal_flour: '168893', // "Wheat flour, whole-grain"
	soya_bean: '174270', // "Soybeans, mature seeds, raw"
	water_spinach: '169301', // "Water convolvulus,raw" (FDC's own missing space)
	white_walnut: '170570', // "Nuts, butternuts, dried"
	chayotte: '170402', // "Chayote, fruit, raw"

	// The broth family. Found by reading a rendered recipe page, not by a test:
	// Goulash Soup displayed **60,067 mg of sodium per serving** — sixty grams,
	// a lethal dose — because "1 L beef stock" was priced as a kilogram of dry
	// bouillon powder.
	//
	// "Soup, beef broth, cubed, dry" (171561) is 24,000 mg sodium/100 g. Correct
	// for a cube, catastrophically wrong for the litre of liquid a recipe means by
	// "beef stock" — a 63x overstatement across 39 corpus rows. -> "Soup, beef
	// broth or bouillon canned, ready-to-serve" (171538): 372 mg sodium, 7 kcal,
	// 1.14 g protein per 100 g, verified against the real CSVs.
	beef_broth: '171538',
	// "Chicken, canned, no broth" (the previous match) is canned chicken MEAT —
	// the wrong food outright, not merely the wrong form, and wrong on protein and
	// fat as well as sodium. 113 corpus rows, the most-used member of the family.
	// -> "Soup, chicken broth, ready-to-serve" (174536): 371 mg sodium, 6 kcal.
	chicken_broth: '174536',
	// Pinned for the opposite reason: `dehydrated_broth` was inheriting liquid
	// broth's per-gram values through the generic_of nutrition fallback, which
	// understates a dry product by the same factor the two above overstate a wet
	// one. Same entry `stock_cube` already uses deliberately (42 corpus rows).
	dehydrated_broth: '171560',
	// "Peppers, bell, green, raw" (2258588) — wrong: a bare "pepper" ingredient
	// line is the ground spice (631 uses, the single most common ingredient in
	// the corpus), not a vegetable. -> "Spices, pepper, black" (251 kcal/100g;
	// high-looking but correct for a dry ground spice, same shape as cinnamon
	// below — most of that mass is fiber/starch, not fat).
	pepper: '170931',
	// "Water convolvulus, raw" (169301) is water spinach, a leafy vegetable —
	// wrong on every axis for plain "water" (437 uses). -> "Water, bottled,
	// generic" (174158): kcal 0, every macro 0 except a trace 2 mg sodium.
	water: '174158',
	// "Vegetable oil, palm kernel" (171422) is ~82% saturated fat (tropical
	// kernel oil) — a recipe just saying "vegetable oil" (234 uses) means the
	// generic bottled blend, not that. -> "Oil, vegetable, soybean, refined"
	// (172370): fat 100 g/100 g, sat fat 15.25 g (15.25% of fat) — soybean oil
	// is what's actually in the bottle labeled "vegetable oil" on US shelves.
	vegetable_oil: '172370',
	// "Cinnamon buns, frosted (includes honey buns)" (167940) — a pastry, not
	// the spice "cinnamon" (201 uses) names. -> "Spices, cinnamon, ground"
	// (171320): 247 kcal/100g, which is the correct order of magnitude for a
	// dry ground spice (mostly fiber/carb by mass), not a bug.
	cinnamon: '171320',
	// "Fish broth" (171606) — a bare "broth" ingredient (187 uses) is a generic
	// pantry staple; tagging it fish implies a false allergen for every recipe
	// that uses it. -> "Soup, chicken broth, ready-to-serve" (174536): 6
	// kcal/100g, 371 mg sodium — a plain, ready-to-use broth default.
	broth: '174536',
	// "Rice, black, unenriched, raw" (2710825) — specialty rice, not the
	// sensible default for a bare "rice" ingredient (162 uses). -> "Rice,
	// white, long grain, unenriched, raw" (2512381, foundation_food): 369.6
	// kcal/100g, the ordinary white rice default.
	rice: '2512381',
	// "Flour, 00" (2003586) is a specific fine-milled Italian pizza/pasta
	// flour — not what a recipe means by bare "flour" (348 uses). -> "Flour,
	// wheat, all-purpose, enriched, bleached" (789890, foundation_food): 366
	// kcal/100g, the standard US all-purpose flour.
	flour: '789890',
	// Collision-audit fixes below (`fdc_collisions.txt` / prior review) — same
	// "textually plausible, semantically wrong" failure mode.

	// "Oil, coconut" (330458) — coconut *oil*, not the ingredient "coconut"
	// itself. -> "Nuts, coconut meat, raw" (170169): 354 kcal/100g, 33.5 g fat
	// (88.7% saturated — genuinely correct for coconut flesh, not a bug).
	coconut: '170169',
	// "Mushroom, oyster" (1750345) — a fungus, not the shellfish "oyster"
	// names. -> "Mollusks, oyster, eastern, wild, raw" (171978): 51 kcal/100g,
	// 5.7 g protein, the correct raw shellfish reference.
	oyster: '171978',
	// "Lemons, raw, without peel" (167746) is self-contradictory for the key
	// "lemon_peel" — it's explicitly the part with the peel removed. ->
	// "Lemon peel, raw" (167749): the literal, correct FDC entry exists and
	// was simply never reached by the matcher's scoring.
	lemon_peel: '167749',
	// "Ice creams, vanilla" (167575) — dessert, not frozen water. FDC has no
	// literal "ice" entry (confirmed: every "^ice" hit in both CSVs is an ice
	// cream/novelty variant), so per the audit this is intentionally pointed
	// at the same entry as `water` above: "Water, bottled, generic" (174158),
	// ~0 kcal and ~0 for every macro, same as real ice.
	ice: '174158',
	// "Vinegar, red wine" (172240, 19 kcal/100g) — an acid condiment, not the
	// alcoholic beverage "red_wine" names. -> "Alcoholic beverage, wine,
	// table, red" (173190): 85 kcal/100g, matches real red wine.
	red_wine: '173190',
	// "Vinegar, cider" (173469, 21 kcal/100g) — wrong for the same reason as
	// red_wine. FDC has no literal non-alcoholic "cider" entry either (only
	// cider vinegar and a specific hard-cider brand), so this is pointed at
	// the closest real nutritional equivalent: "Apple juice, canned or
	// bottled, unsweetened, without added ascorbic acid" (173933, 46
	// kcal/100g, 9.6 g sugar) — cider is unfiltered apple juice, and the two
	// are nutritionally near-identical; not a literal "cider" row, flagged
	// here rather than presented as an exact match.
	cider: '173933',
	// "Nuts, coconut milk, raw (liquid expressed from grated meat and water)"
	// (170172, 230 kcal/100g, 23.8 g fat) is coconut *milk* — much richer than
	// what "coconut_water" means. -> "Nuts, coconut water (liquid from
	// coconuts)" (170174): 19 kcal/100g, 0.2 g fat — the correct, much
	// leaner, entry that was sitting right next to the wrong one.
	coconut_water: '170174',
	// "Seeds, sesame butter, tahini, from raw and stone ground kernels"
	// (169410) is a ground paste, not whole seeds. -> "Seeds, sesame seeds,
	// whole, dried" (170150): macros end up close to tahini's (573 vs 570
	// kcal/100g — sesame seeds and tahini are nutritionally similar since
	// tahini is mostly just ground seeds), but this is the semantically
	// correct entry for "whole sesame seeds" rather than a processed product.
	sesame_seeds: '170150',
	// "Wheat flours, bread, unenriched" (168913) is a refined bread flour —
	// not actual whole wheat flour. -> "Flour, whole wheat, unenriched"
	// (790085, foundation_food): 370 kcal/100g, 10.6 g fiber (vs bread
	// flour's 2.4 g) — correctly higher-fiber, matching real whole wheat.
	whole_wheat_flour: '790085',
	// "Wheat, durum" (169721) is the specific pasta-making variety — not a
	// sensible generic default for bare "wheat". -> "Wheat, hard red winter"
	// (168890): 327 kcal/100g, the most commonly grown US wheat class, and
	// (unlike durum's row) has fiber populated (12.2 g), a more complete row.
	wheat: '168890',

	// Manually-authored ingredients (pipeline/lib/manual_ingredients.mjs) with
	// a real FDC match, even though they have no Open Food Facts taxonomy
	// entry at all — the two systems have entirely separate coverage gaps.
	// "Leavening agents, baking soda" (175040): exact match, no override
	// would even be needed except baking_soda's `names.en` text ("baking
	// soda") doesn't prefix-match this description, so the plain matcher
	// would fall through to its looser anywhere-pass regardless — pinning it
	// explicitly is simpler than relying on that.
	baking_soda: '175040',
	// "Soup, beef broth or bouillon, powder, dry" (171560): closer to a dry
	// stock cube's actual water content than any ready-to-serve liquid broth
	// entry — chosen over the canned/condensed soup entries for that reason.
	stock_cube: '171560'

	// NOT resolved, deliberately: "spice" (currently resolves to "Spices,
	// cardamom", 170919) is a genuinely generic term with no matching generic
	// FDC entry — every "^Spices," row in both CSVs names one specific spice
	// (paprika, cardamom, cumin, ...), none of them a catch-all. Per the audit,
	// left out of this table rather than force a guess; falls through to the
	// normal `matchFdc` path and stays visible in `unmatched_fdc.txt`/
	// `fdc_collisions.txt` as a known, bounded limitation.
};
