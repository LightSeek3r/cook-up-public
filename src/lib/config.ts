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

/**
 * Each language's name **in that language** — for the UI language switcher.
 * Distinct from LANG_NAMES below, which is deliberately English and exists only
 * to address the translation model in its own prompt. Showing "HI" or
 * "Simplified Chinese" in the picker is useless to the person looking for it.
 */
export const LANG_ENDONYMS: Record<Lang, string> = {
	en: 'English',
	es: 'Español',
	fr: 'Français',
	de: 'Deutsch',
	ar: 'العربية',
	hi: 'हिन्दी',
	zh: '简体中文',
	ja: '日本語',
	ko: '한국어',
	vi: 'Tiếng Việt'
};

/** English exonyms, used to address the translation model in its own prompt. */
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

/**
 * Fixed vocabularies — labels come from the bundled i18n files, never the DB.
 *
 * Must track `CUISINES` in `pipeline/02_parse.mjs`, which builds its category-tag
 * patterns mechanically from this list (so a value here matches an "X recipes"
 * tag automatically, with no second edit).
 *
 * Grown from 19 to 43 by measuring which nationality tags the corpus actually
 * carries on recipes that had no cuisine. The bar for inclusion is **5 recipes**:
 * below that a filter option matches almost nothing and is noise in a dropdown
 * this long. The tail left out for that reason is real cuisine, not junk — Czech,
 * Portuguese, Swiss, Ukrainian, Serbian, Argentine, Georgian, Armenian and ~30
 * more sit at 1-3 recipes each; raise the bar's payoff by fetching more of the
 * corpus, not by adding one-recipe values.
 */
export const CUISINES = [
	'african', 'albanian', 'american', 'australian', 'austrian', 'belgian', 'brazilian',
	'british', 'bulgarian', 'canadian', 'caribbean', 'chinese', 'colombian', 'danish',
	'dutch', 'filipino', 'finnish', 'french', 'german', 'greek', 'hungarian', 'indian',
	'indonesian', 'irish', 'italian', 'japanese', 'korean', 'malaysian', 'mexican',
	'middle_eastern', 'moroccan', 'new_zealand', 'norwegian', 'peruvian', 'polish',
	'romanian', 'russian', 'spanish', 'swedish', 'thai', 'turkish', 'venezuelan',
	'vietnamese'
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

/**
 * Top of the source infobox's difficulty scale, and the number of pips the recipe
 * page draws. Must track `DIFFICULTY_MAX` in `pipeline/02_parse.mjs`, which clamps
 * to it — the corpus contains a stray 5 and an 8 that are editor error, not a
 * wider scale.
 */
export const DIFFICULTY_MAX = 4;

/**
 * Separator for match.ts's `missing_names` GROUP_CONCAT. The ASCII Unit
 * Separator control character (0x1F), not `", "`: ingredient names are
 * translated content across ten languages, and any name containing a
 * comma-space would otherwise be split into two phantom "missing" ingredients
 * on the client. Built via fromCharCode rather than a literal control
 * character in the source — a literal is invisible and silently unreliable to
 * round-trip through editors/tools (confirmed the hard way: an edit here once
 * quietly became an *empty* string, which would have collapsed the separator
 * between every concatenated name to nothing). Lives here rather than in
 * match.ts so client components (ResultCard) don't need to import a module
 * that pulls in @cloudflare/workers-types.
 */
export const MISSING_NAMES_SEP = String.fromCharCode(31);
