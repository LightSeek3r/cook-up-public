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
	}[];
	micronutrients: MicroNutrient[];
}
