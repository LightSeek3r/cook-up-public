/**
 * Healthier-swap tips for the recipe page. Rendered structurally (source
 * ingredient -> substitute ingredient + a benefit tag), not as prose — every
 * ingredient name here is already a canonical_key with its own translated
 * name via `ingredient_i18n`, so no new sentence-level i18n is needed, only
 * the short `sub.*` benefit tags.
 *
 * Deliberately excludes butter -> coconut_oil: a popular swap, but coconut
 * oil is ~90% saturated fat — not an actual improvement, so it has no place
 * in a table that only claims real ones.
 */

export interface SubstitutionRule {
	/** canonical_key that must be present in the recipe for this rule to apply. */
	from: string;
	/** canonical_key of the suggested substitute. */
	to: string;
	/** Suffix of the `sub.<benefit>` i18n key describing why this swap helps. */
	benefit: string;
}

export interface Substitution {
	from: string;
	to: string;
	benefit: string;
}

/** Weighted toward the most common ingredients across the corpus (see
 *  the unpublished project notes Wave 4 note for the recipe-count figures behind this order). */
const RULES: SubstitutionRule[] = [
	{ from: 'salt', to: 'herb', benefit: 'lessSalt' },
	{ from: 'salt', to: 'lemon_juice', benefit: 'lessSalt' },
	{ from: 'butter', to: 'olive_oil', benefit: 'betterFats' },
	{ from: 'butter', to: 'avocado', benefit: 'lessSatFat' },
	{ from: 'butter', to: 'banana', benefit: 'inBaking' },
	{ from: 'sugar', to: 'banana', benefit: 'lessSugar' },
	{ from: 'sugar', to: 'date', benefit: 'lessSugar' },
	{ from: 'flour', to: 'whole_wheat_flour', benefit: 'moreFibre' },
	{ from: 'vegetable_oil', to: 'olive_oil', benefit: 'betterFats' },
	{ from: 'cream', to: 'yogurt', benefit: 'lessSatFat' },
	{ from: 'heavy_cream', to: 'yogurt', benefit: 'lessSatFat' },
	{ from: 'sour_cream', to: 'yogurt', benefit: 'lessSatFat' },
	{ from: 'mayonnaise', to: 'yogurt', benefit: 'lessCalories' },
	{ from: 'mayonnaise', to: 'avocado', benefit: 'betterFats' },
	{ from: 'rice', to: 'quinoa', benefit: 'moreFibre' },
	{ from: 'bacon', to: 'mushroom', benefit: 'lessSatFat' },
	{ from: 'margarine', to: 'olive_oil', benefit: 'betterFats' },
	{ from: 'cream', to: 'coconut_milk', benefit: 'dairyFree' }
];

/**
 * Returns every rule whose source ingredient is in the recipe and whose
 * substitute isn't already there too — suggesting yogurt for a recipe that
 * already contains yogurt is noise, not a tip.
 */
export function substitutionsFor(canonicalKeys: readonly string[]): Substitution[] {
	const present = new Set(canonicalKeys);
	return RULES.filter((rule) => present.has(rule.from) && !present.has(rule.to)).map(
		({ from, to, benefit }) => ({ from, to, benefit })
	);
}
