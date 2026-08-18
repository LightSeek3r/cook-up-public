/**
 * Single source of truth for product-level constants.
 *
 * GRADE.label is deliberately isolated here: the custom nutrition grade must NOT
 * collide with registered marks (Nutri-Score, Nutri-Grade, NuVal, Guiding Stars,
 * Health Star Rating). Run USPTO TESS + EUIPO eSearch clearance on the final name
 * before commercial launch; renaming is then a one-line change.
 */
export const GRADE = {
	key: 'BALANCE',
	label: 'Balance Grade',
	scoreLabel: 'Balance Score',
	scale: ['A', 'B', 'C', 'D', 'E'] as const
} as const;

export type BalanceGrade = (typeof GRADE.scale)[number];

/** Below this share of resolved ingredient mass, nutrition is hidden rather than estimated. */
export const COVERAGE_MIN = 0.7;

/** Used when the source recipe does not state a yield; flagged via recipes.servings_assumed. */
export const DEFAULT_SERVINGS = 4;

/** EU Reg. 1169/2011 labelling thresholds, as % of NRV per serving. */
export const NRV_SOURCE_PCT = 15;
export const NRV_HIGH_PCT = 30;

export const SUPPORTED_LANGS = ['en', 'es', 'fr', 'de', 'ar', 'hi', 'zh', 'ja', 'ko', 'vi'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = 'en';
export const RTL_LANGS = new Set<Lang>(['ar']);

/** English endonyms, used to address the translation model in its own prompt. */
export const LANG_NAMES: Record<Lang, string> = {
	en: 'English',
	es: 'Spanish',
	fr: 'French',
	de: 'German',
	ar: 'Arabic',
	hi: 'Hindi',
	zh: 'Simplified Chinese',
	ja: 'Japanese',
	ko: 'Korean',
	vi: 'Vietnamese'
};

/** Fixed vocabularies — labels come from the bundled i18n files, never the DB. */
export const CUISINES = [
	'african', 'american', 'british', 'caribbean', 'chinese', 'french', 'german',
	'greek', 'indian', 'italian', 'japanese', 'korean', 'mexican', 'middle_eastern',
	'moroccan', 'spanish', 'thai', 'turkish', 'vietnamese'
] as const;

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'side'] as const;

export const DIETS = ['vegan', 'vegetarian', 'pescatarian', 'gluten_free', 'dairy_free'] as const;

export const ALLERGENS = [
	'gluten', 'dairy', 'nut', 'peanut', 'egg', 'soy', 'fish', 'shellfish', 'sesame'
] as const;

export const INGREDIENT_CATEGORIES = [
	'vegetable', 'fruit', 'protein', 'dairy', 'grain', 'legume', 'nut', 'spice', 'other'
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

/** Result page size for /api/match. */
export const MATCH_PAGE_SIZE = 50;
