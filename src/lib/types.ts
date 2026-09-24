import type { BalanceGrade, IngredientCategory } from '$lib/config';

export interface IngredientTile {
	id: number;
	name: string;
	/** Language-independent English slug; the icon is resolved from this, never from `name`. */
	canonical_key: string;
	category: IngredientCategory;
	recipe_count: number;
}

export interface MatchResult {
	id: number;
	title: string;
	cuisine: string | null;
	meal_type: string | null;
	prep_minutes: number | null;
	total_minutes: number | null;
	kcal: number | null;
	balance_grade: BalanceGrade | null;
	balance_score: number | null;
	nutrition_coverage: number;
	servings_assumed: number;
	/** Number of distinct selected ingredients the recipe uses. */
	matched: number;
	/** Non-staple ingredients the recipe needs that were not selected. */
	missing: number;
	required_non_staple: number;
	/** Comma-separated names of the `missing` ingredients, NULL when `missing` is 0. */
	missing_names: string | null;
	/** Names of the *selected* ingredients this recipe does not use — the
	 *  mirror of `missing_names`. NULL when the recipe uses all of them, which
	 *  is always the case unless the query ran with slack. */
	unused_names: string | null;
}

/** A recipe-title search hit. Intentionally a thin projection — the search block
 *  shows a name and a couple of orientation details, not a full result card. */
export interface RecipeHit {
	id: number;
	title: string;
	cuisine: string | null;
	total_minutes: number | null;
	balance_grade: BalanceGrade | null;
	nutrition_coverage: number;
}

export interface MicroNutrient {
	nutrient_key: string;
	amount: number;
	unit: string;
	pct_nrv: number | null;
}

export interface SubstitutionTip {
	/** canonical_key of the recipe ingredient this tip applies to. */
	from: string;
	/** canonical_key of the suggested substitute. */
	to: string;
	fromName: string;
	toName: string;
	/** Suffix of the `sub.<benefit>` i18n key. */
	benefit: string;
}

export interface RecipeDetail {
	id: number;
	title: string;
	instructions: string;
	is_machine: number;
	source_url: string;
	source_lang: string;
	license: string;
	attribution: string | null;
	cuisine: string | null;
	meal_type: string | null;
	/** 1–4 from the source infobox; null for the ~3% of recipes without one. */
	difficulty: number | null;
	/** Newline-separated "notes, tips and variations" bullets, in the recipe's
	 *  SOURCE language — deliberately untranslated, so only render these when the
	 *  reader's language matches `source_lang`. */
	notes: string | null;
	/** Lead photograph, hotlinked from Wikimedia Commons. Present on ~22% of
	 *  recipes. `image_licence` is NEVER null when `image_url` is set — stage 08
	 *  refuses to emit a row without one, because most of these licences are
	 *  share-alike and require credit. `image_author` may legitimately be null for
	 *  CC0/public-domain files, which require no attribution. */
	image_url: string | null;
	image_width: number | null;
	image_height: number | null;
	image_page: string | null;
	image_author: string | null;
	image_licence: string | null;
	prep_minutes: number | null;
	total_minutes: number | null;
	servings: number | null;
	servings_assumed: number;
	kcal: number | null;
	protein_g: number | null;
	fat_g: number | null;
	sat_fat_g: number | null;
	carb_g: number | null;
	sugar_g: number | null;
	fiber_g: number | null;
	sodium_mg: number | null;
	balance_grade: BalanceGrade | null;
	balance_score: number | null;
	nutrition_coverage: number;
	ingredients: {
		id: number;
		name: string;
		canonical_key: string;
		category: IngredientCategory;
		raw_text: string | null;
		/** Parsed amount, null when the source stated none ("salt, to taste"). */
		quantity: number | null;
		/** Our canonical unit, null for a bare count ("4 eggs"). */
		unit: string | null;
		/** Weight resolved by the pipeline from FDC's own portion data, null where
		 *  it could not be — roughly a third of rows. Never treat null as zero. */
		grams: number | null;
	}[];
	micronutrients: MicroNutrient[];
}
