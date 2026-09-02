import type { D1Database } from '@cloudflare/workers-types';
import { COVERAGE_MIN } from '$lib/config';

/**
 * Every query behind /admin.
 *
 * SQL lives here rather than in the route for the reason the rest of `src/lib`
 * does: it can then be exercised against a spy instead of a real D1. The
 * `column` of the generic breakdown is whitelisted rather than interpolated —
 * it is the one place in this file where a string reaches the SQL text.
 */

export interface Kpi {
	today: number;
	last7: number;
	prev7: number;
	last30: number;
	prev30: number;
	total: number;
}

export interface Traffic {
	views: Kpi;
	visits: Kpi;
	recipeViews: Kpi;
}

export interface DayPoint {
	day: string;
	views: number;
	visits: number;
}

export interface TopRecipe {
	id: number;
	title: string;
	views: number;
}

export interface Slice {
	key: string;
	n: number;
}

export interface LangRow {
	lang: string;
	translated: number;
	machine: number;
}

export interface ContentHealth {
	recipes: number;
	withImage: number;
	withKcal: number;
	withNotes: number;
	withDifficulty: number;
	withCuisine: number;
	nutritionVisible: number;
}

export interface IngredientHealth {
	ingredients: number;
	withNutrition: number;
	orphans: number;
}

export interface TranslateNext {
	id: number;
	title: string;
	lang: string;
	views: number;
}

const zeroKpi = (): Kpi => ({ today: 0, last7: 0, prev7: 0, last30: 0, prev30: 0, total: 0 });

const KPI_WINDOWS: [keyof Kpi, string][] = [
	['today', `viewed_at >= date('now')`],
	['last7', `viewed_at >= datetime('now','-7 day')`],
	['prev7', `viewed_at >= datetime('now','-14 day') AND viewed_at < datetime('now','-7 day')`],
	['last30', `viewed_at >= datetime('now','-30 day')`],
	['prev30', `viewed_at >= datetime('now','-60 day') AND viewed_at < datetime('now','-30 day')`],
	['total', `1=1`]
];

const KPI_FAMILIES: [keyof Traffic, string][] = [
	['views', '1=1'],
	['visits', 'is_new_visit = 1'],
	['recipeViews', 'recipe_id IS NOT NULL']
];

/**
 * One pass over page_view for all three KPI families. Eighteen aliased SUMs in
 * a single scan beats eighteen statements, and D1 bills per statement. Every
 * column is explicitly aliased rather than read back positionally, so adding a
 * window later cannot silently shift the mapping.
 */
export async function traffic(db: D1Database): Promise<Traffic> {
	const columns = KPI_FAMILIES.flatMap(([family, familyPredicate]) =>
		KPI_WINDOWS.map(
			([window, windowPredicate]) =>
				`SUM(CASE WHEN (${familyPredicate}) AND (${windowPredicate}) THEN 1 ELSE 0 END) AS ${family}_${window}`
		)
	);

	const row = await db
		.prepare(`SELECT ${columns.join(', ')} FROM page_view`)
		.first<Record<string, number | null>>();

	const out = { views: zeroKpi(), visits: zeroKpi(), recipeViews: zeroKpi() };
	for (const [family] of KPI_FAMILIES) {
		for (const [window] of KPI_WINDOWS) {
			out[family][window] = row?.[`${family}_${window}`] ?? 0;
		}
	}
	return out;
}

export async function dailySeries(db: D1Database, days = 90): Promise<DayPoint[]> {
	const { results } = await db
		.prepare(
			`SELECT date(viewed_at) AS day,
              COUNT(*) AS views,
              COALESCE(SUM(is_new_visit), 0) AS visits
       FROM page_view
       WHERE viewed_at >= datetime('now', ?)
       GROUP BY day ORDER BY day`
		)
		.bind(`-${Math.max(1, Math.trunc(days))} day`)
		.all<DayPoint>();
	return results ?? [];
}

/** `days = null` means all time. */
export async function topRecipes(
	db: D1Database,
	days: number | null,
	limit = 25
): Promise<TopRecipe[]> {
	const where = days === null ? '' : `AND pv.viewed_at >= datetime('now', ?)`;
	const stmt = db.prepare(
		`SELECT pv.recipe_id AS id,
            COALESCE(t.title, src.title, 'recipe ' || pv.recipe_id) AS title,
            COUNT(*) AS views
     FROM page_view pv
     JOIN recipes r             ON r.id = pv.recipe_id
     LEFT JOIN recipe_i18n t    ON t.recipe_id = r.id AND t.lang = 'en'
     LEFT JOIN recipe_i18n src  ON src.recipe_id = r.id AND src.lang = r.source_lang
     WHERE pv.recipe_id IS NOT NULL ${where}
     GROUP BY pv.recipe_id
     ORDER BY views DESC, id ASC
     LIMIT ?`
	);
	const bound =
		days === null ? stmt.bind(limit) : stmt.bind(`-${Math.trunc(days)} day`, limit);
	const { results } = await bound.all<TopRecipe>();
	return results ?? [];
}

const BREAKDOWN_COLUMNS = ['lang', 'country', 'referrer_host', 'device'] as const;
export type BreakdownColumn = (typeof BREAKDOWN_COLUMNS)[number];

export async function breakdown(
	db: D1Database,
	column: BreakdownColumn,
	{ days = 30, limit = 10 } = {}
): Promise<Slice[]> {
	// Not user input today, but the only interpolated identifier in this file —
	// so it is checked against the whitelist rather than trusted by convention.
	if (!BREAKDOWN_COLUMNS.includes(column)) throw new Error(`unsupported breakdown: ${column}`);

	const { results } = await db
		.prepare(
			`SELECT COALESCE(${column}, '—') AS key, COUNT(*) AS n
       FROM page_view
       WHERE viewed_at >= datetime('now', ?) AND ${column} IS NOT NULL
       GROUP BY key ORDER BY n DESC LIMIT ?`
		)
		.bind(`-${Math.trunc(days)} day`, limit)
		.all<Slice>();
	return results ?? [];
}

/**
 * Rows in `recipe_i18n` per language. Note this counts the source-language rows
 * the pipeline writes for every recipe too, which is why English reads as
 * complete: `07_translate.mjs` stores the untranslated title in every language,
 * so `machine` is the honest measure of translation work actually done.
 */
export async function translationRows(db: D1Database): Promise<LangRow[]> {
	const { results } = await db
		.prepare(
			`SELECT lang, COUNT(*) AS translated, COALESCE(SUM(is_machine), 0) AS machine
       FROM recipe_i18n GROUP BY lang ORDER BY translated DESC`
		)
		.all<LangRow>();
	return results ?? [];
}

/**
 * Recipes with real readership in a language that has no row for them yet —
 * a demand-ranked worklist for `db:translate:daily`, which otherwise drips
 * through the corpus in id order regardless of whether anyone reads it.
 */
export async function translateNext(db: D1Database, limit = 20): Promise<TranslateNext[]> {
	const { results } = await db
		.prepare(
			`SELECT v.recipe_id AS id,
              COALESCE(src.title, 'recipe ' || v.recipe_id) AS title,
              v.lang, v.views
       FROM (SELECT recipe_id, lang, COUNT(*) AS views
             FROM page_view
             WHERE recipe_id IS NOT NULL AND lang IS NOT NULL
               AND viewed_at >= datetime('now','-30 day')
             GROUP BY recipe_id, lang) v
       JOIN recipes r            ON r.id = v.recipe_id
       LEFT JOIN recipe_i18n t   ON t.recipe_id = v.recipe_id AND t.lang = v.lang
       LEFT JOIN recipe_i18n src ON src.recipe_id = r.id AND src.lang = r.source_lang
       WHERE t.recipe_id IS NULL
       ORDER BY v.views DESC, id ASC
       LIMIT ?`
		)
		.bind(limit)
		.all<TranslateNext>();
	return results ?? [];
}

export async function contentHealth(db: D1Database): Promise<ContentHealth> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS recipes,
              SUM(CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) AS withImage,
              SUM(CASE WHEN kcal IS NOT NULL THEN 1 ELSE 0 END) AS withKcal,
              SUM(CASE WHEN notes IS NOT NULL AND notes <> '' THEN 1 ELSE 0 END) AS withNotes,
              SUM(CASE WHEN difficulty IS NOT NULL THEN 1 ELSE 0 END) AS withDifficulty,
              SUM(CASE WHEN cuisine IS NOT NULL AND cuisine <> '' THEN 1 ELSE 0 END) AS withCuisine,
              SUM(CASE WHEN nutrition_coverage >= ? THEN 1 ELSE 0 END) AS nutritionVisible
       FROM recipes`
		)
		.bind(COVERAGE_MIN)
		.first<ContentHealth>();

	return (
		row ?? {
			recipes: 0,
			withImage: 0,
			withKcal: 0,
			withNotes: 0,
			withDifficulty: 0,
			withCuisine: 0,
			nutritionVisible: 0
		}
	);
}

export async function gradeDistribution(db: D1Database): Promise<Slice[]> {
	const { results } = await db
		.prepare(
			`SELECT COALESCE(balance_grade, '—') AS key, COUNT(*) AS n
       FROM recipes GROUP BY key ORDER BY key`
		)
		.all<Slice>();
	return results ?? [];
}

/**
 * Ten-percent buckets of `nutrition_coverage`. The interesting part is the
 * shoulder just below COVERAGE_MIN: those recipes have their panel hidden and
 * are the cheapest ones for the pipeline to rescue.
 */
export async function coverageHistogram(db: D1Database): Promise<Slice[]> {
	const { results } = await db
		.prepare(
			`SELECT CAST(MIN(nutrition_coverage, 0.999) * 10 AS INTEGER) AS key, COUNT(*) AS n
       FROM recipes GROUP BY key ORDER BY key`
		)
		.all<{ key: number; n: number }>();
	return (results ?? []).map((r) => ({ key: String(r.key), n: r.n }));
}

export async function ingredientHealth(db: D1Database): Promise<IngredientHealth> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS ingredients,
              SUM(CASE WHEN n.ingredient_id IS NOT NULL THEN 1 ELSE 0 END) AS withNutrition,
              SUM(CASE WHEN i.recipe_count = 0 THEN 1 ELSE 0 END) AS orphans
       FROM ingredients i
       LEFT JOIN ingredient_nutrition n ON n.ingredient_id = i.id`
		)
		.first<IngredientHealth>();
	return row ?? { ingredients: 0, withNutrition: 0, orphans: 0 };
}

export async function topIngredients(db: D1Database, limit = 20): Promise<Slice[]> {
	const { results } = await db
		.prepare(
			`SELECT COALESCE(en.name, i.canonical_key) AS key, i.recipe_count AS n
       FROM ingredients i
       LEFT JOIN ingredient_i18n en ON en.ingredient_id = i.id AND en.lang = 'en'
       ORDER BY i.recipe_count DESC LIMIT ?`
		)
		.bind(limit)
		.all<Slice>();
	return results ?? [];
}

/** The long tail: how much of the corpus nobody has ever opened. */
export async function unseenRecipes(db: D1Database): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM recipes r
       WHERE NOT EXISTS (SELECT 1 FROM page_view pv WHERE pv.recipe_id = r.id)`
		)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

export async function loadDashboard(db: D1Database) {
	const [
		trafficTotals,
		series,
		top30,
		topAll,
		langs,
		countries,
		referrers,
		devices,
		translations,
		nextUp,
		content,
		grades,
		coverage,
		ingredients,
		topIngr,
		unseen
	] = await Promise.all([
		traffic(db),
		dailySeries(db),
		topRecipes(db, 30),
		topRecipes(db, null),
		breakdown(db, 'lang'),
		breakdown(db, 'country'),
		breakdown(db, 'referrer_host'),
		breakdown(db, 'device'),
		translationRows(db),
		translateNext(db),
		contentHealth(db),
		gradeDistribution(db),
		coverageHistogram(db),
		ingredientHealth(db),
		topIngredients(db),
		unseenRecipes(db)
	]);

	return {
		traffic: trafficTotals,
		series,
		top30,
		topAll,
		langs,
		countries,
		referrers,
		devices,
		translations,
		nextUp,
		content,
		grades,
		coverage,
		ingredients,
		topIngredients: topIngr,
		unseen,
		coverageMin: COVERAGE_MIN
	};
}
