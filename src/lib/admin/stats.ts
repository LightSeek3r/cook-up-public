import type { D1Database } from '@cloudflare/workers-types';
import { COVERAGE_MIN } from '$lib/config';
import { compareBinary, type loadCorpus } from '$lib/data';
import { vocabOrNull } from '$lib/data/core.js';

/**
 * Everything behind /admin.
 *
 * Traffic comes from D1's page_view, the one corpus-independent table the
 * Worker writes. Every corpus figure (recipe and ingredient counts, grades,
 * nutrition coverage, translation counts, the titles of the most viewed
 * recipes) comes from the data artefacts the site itself serves: D1 no longer
 * holds the recipe corpus (migrations/0013_retire_recipe_corpus.sql), and the
 * dashboard then describes exactly what is deployed.
 *
 * SQL lives here rather than in the route so it can be exercised against a
 * spy. The `column` of the generic breakdown is whitelisted rather than
 * interpolated; it is the one place in this file where a string reaches the
 * SQL text.
 */

type Corpus = ReturnType<typeof loadCorpus>;

/** The artefacts the corpus figures come from: core.bin with English loaded, and manifest.json's `counts`. */
export interface CorpusSource {
	corpus: Corpus;
	counts: unknown;
}

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
	/** null while the artefacts do not record it (manifest `counts.recipe_i18n_machine`). */
	machine: number | null;
}

/** A null figure is one the deployed artefacts do not carry; the page leaves its bar out. */
export interface ContentHealth {
	recipes: number;
	withImage: number | null;
	withKcal: number;
	withNotes: number | null;
	withDifficulty: number | null;
	withCuisine: number;
	nutritionVisible: number;
}

export interface IngredientHealth {
	ingredients: number;
	withNutrition: number | null;
	orphans: number;
}

export interface RecipeViews {
	id: number;
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

/**
 * Views per viewed recipe id (`days = null`: all time), unranked. Walks
 * idx_page_view_recipe; the ranking and the titles are applied by
 * `rankRecipes` from the artefacts.
 *
 * deliberate: every viewed id comes back, not a LIMITed top list, because
 * views of recipes no longer in the corpus must drop out *before* the
 * ranking, and only the artefacts know which those are. One row per distinct
 * viewed recipe, so at most the corpus size (~3.5k) plus deleted ids; switch
 * to a LIMIT with headroom if that ever grows past ~20k.
 */
export async function recipeViews(db: D1Database, days: number | null): Promise<RecipeViews[]> {
	const where = days === null ? '' : `AND viewed_at >= datetime('now', ?)`;
	const stmt = db.prepare(
		`SELECT recipe_id AS id, COUNT(*) AS views
     FROM page_view
     WHERE recipe_id IS NOT NULL ${where}
     GROUP BY recipe_id`
	);
	const { results } = await (days === null ? stmt : stmt.bind(`-${Math.trunc(days)} day`)).all<RecipeViews>();
	return results ?? [];
}

/**
 * The `limit` most viewed recipes the corpus still has, most views first,
 * ties by id. Title: the English one, else the source-language one (the
 * artefacts' fallback), else "recipe <id>".
 */
export function rankRecipes(views: RecipeViews[], corpus: Corpus, limit = 25): TopRecipe[] {
	return views
		.filter((v) => corpus.recipeIndex(v.id) >= 0)
		.sort((a, b) => b.views - a.views || a.id - b.id)
		.slice(0, limit)
		.map((v) => ({ id: v.id, title: corpus.title(corpus.recipeIndex(v.id), 'en') ?? `recipe ${v.id}`, views: v.views }));
}

/** How many corpus recipes nobody has ever opened, from the all-time views. */
export function unseenRecipes(allTime: RecipeViews[], corpus: Corpus): number {
	const seen = new Set(allTime.map((v) => v.id).filter((id) => corpus.recipeIndex(id) >= 0));
	return corpus.core.recipes - seen.size;
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

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** A count from the manifest, or null when absent or not a count (an older artefact build). */
const countOrNull = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);

/**
 * Rows per language in recipe_i18n, from manifest `counts.recipe_i18n`, most
 * first. The source-language rows count too, which is why English reads as
 * complete: `machine` (`counts.recipe_i18n_machine`) is the honest measure of
 * translated rows.
 */
export function translationRows(counts: unknown): LangRow[] {
	const c = isRecord(counts) ? counts : {};
	const rows = isRecord(c.recipe_i18n) ? c.recipe_i18n : {};
	const machine = isRecord(c.recipe_i18n_machine) ? c.recipe_i18n_machine : {};
	return Object.entries(rows)
		.flatMap(([lang, n]) => {
			const translated = countOrNull(n);
			return translated === null ? [] : [{ lang, translated, machine: countOrNull(machine[lang]) }];
		})
		.sort((a, b) => b.translated - a.translated || compareBinary(a.lang, b.lang));
}

/** Counts per key, as `GROUP BY key ORDER BY key` (BINARY collation) gives them. */
function slices(keys: Iterable<string>, order: (a: string, b: string) => number = compareBinary): Slice[] {
	const n = new Map<string, number>();
	for (const key of keys) n.set(key, (n.get(key) ?? 0) + 1);
	return [...n].sort(([a], [b]) => order(a, b)).map(([key, count]) => ({ key, n: count }));
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * The corpus figures, from the artefacts. Each one is what the D1 query it
 * replaced returned over the same rows (src/lib/admin/stats.sqlite.test.mjs
 * keeps those queries as the reference); figures core.bin does not hold come
 * from manifest.json's `counts` and are null when an artefact build predates
 * them.
 */
export function corpusFigures({ corpus, counts }: CorpusSource) {
	const core = corpus.core;
	const recipes = range(core.recipes);
	const ingredients = range(core.ingredients);
	const c = isRecord(counts) ? counts : {};
	const recipesWith = isRecord(c.recipes_with) ? c.recipes_with : {};
	const tally = (rows: number[], test: (i: number) => boolean) => rows.filter(test).length;

	const content: ContentHealth = {
		recipes: core.recipes,
		withImage: countOrNull(recipesWith.image),
		withKcal: tally(recipes, (r) => !Number.isNaN(core.kcal[r])),
		withNotes: countOrNull(recipesWith.notes),
		withDifficulty: countOrNull(recipesWith.difficulty),
		withCuisine: tally(recipes, (r) => Boolean(vocabOrNull(core.vocab.cuisine, core.cuisine[r]))),
		nutritionVisible: tally(recipes, (r) => core.coverage[r] >= COVERAGE_MIN)
	};

	// `COALESCE(balance_grade, '—')`, ordered by key.
	const grades = slices(recipes.map((r) => vocabOrNull(core.vocab.grade, core.grade[r]) ?? '—'));

	// Ten-percent buckets of nutrition_coverage, `CAST(MIN(c, 0.999) * 10 AS
	// INTEGER)`, in numeric order. The shoulder just below COVERAGE_MIN is the
	// interesting part: those recipes have their panel hidden and are the
	// cheapest ones for the pipeline to rescue.
	const coverage = slices(
		recipes.map((r) => String(Math.trunc(Math.min(core.coverage[r], 0.999) * 10))),
		(a, b) => Number(a) - Number(b)
	);

	const ingredientHealth: IngredientHealth = {
		ingredients: core.ingredients,
		withNutrition: countOrNull(c.ingredient_nutrition),
		orphans: tally(ingredients, (g) => core.recipeCount[g] === 0)
	};

	// `COALESCE(en.name, canonical_key)`, by recipe_count, ties by id.
	const topIngredients: Slice[] = [...ingredients]
		.sort((a, b) => core.recipeCount[b] - core.recipeCount[a] || a - b)
		.slice(0, 20)
		.map((g) => ({ key: corpus.name(g, 'en'), n: core.recipeCount[g] }));

	return {
		content,
		grades,
		coverage,
		ingredients: ingredientHealth,
		topIngredients,
		translations: translationRows(counts)
	};
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

/** How long one isolate reuses a computed dashboard. */
export const DASHBOARD_TTL_MS = 5 * 60_000;

let memo: { at: number; value: Promise<Dashboard> } | null = null;

/**
 * `loadDashboard`, reused for DASHBOARD_TTL_MS within an isolate.
 *
 * One load reads every page_view row several times over (~150k rows at 30k
 * views) and every reload or form action on /admin runs the load again. The
 * figures are the same for every admin, so sharing them between requests
 * leaks nothing; they are at most five minutes old. A failed load is not
 * kept.
 */
export function cachedDashboard(
	db: D1Database,
	source: () => Promise<CorpusSource>,
	now = Date.now()
): Promise<Dashboard> {
	if (memo && now - memo.at < DASHBOARD_TTL_MS) return memo.value;
	const entry = { at: now, value: loadDashboard(db, source) };
	memo = entry;
	entry.value.catch(() => {
		if (memo === entry) memo = null;
	});
	return entry.value;
}

/** Test hook: forget the memoised dashboard. */
export function resetDashboardCache() {
	memo = null;
}

export async function loadDashboard(db: D1Database, source: () => Promise<CorpusSource>) {
	const [corpusSource, trafficTotals, series, views30, viewsAll, langs, countries, referrers, devices] =
		await Promise.all([
			source(),
			traffic(db),
			dailySeries(db),
			recipeViews(db, 30),
			recipeViews(db, null),
			breakdown(db, 'lang'),
			breakdown(db, 'country'),
			breakdown(db, 'referrer_host'),
			breakdown(db, 'device')
		]);
	const { corpus } = corpusSource;

	return {
		traffic: trafficTotals,
		series,
		top30: rankRecipes(views30, corpus),
		topAll: rankRecipes(viewsAll, corpus),
		langs,
		countries,
		referrers,
		devices,
		...corpusFigures(corpusSource),
		unseen: unseenRecipes(viewsAll, corpus),
		coverageMin: COVERAGE_MIN
	};
}
