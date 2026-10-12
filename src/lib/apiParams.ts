import { ALLERGENS, CUISINES, DIETS, MEAL_TYPES, type Lang } from '$lib/config';
import { parseIds, parseKeys } from '$lib/db';
import { resolveLang } from '$lib/i18n';
import { VERSION_PARAM } from '$lib/httpCache';
import { slackFor } from '$lib/match';
import { normaliseQuery } from '$lib/search';

/**
 * Query parameters of the public D1-backed GET routes: one parser per route,
 * used by the route itself, and one serialiser that writes the parsed value
 * back as the route's canonical query string.
 *
 * The canonical string is the edge-cache key (`canonicalUrl`, used by
 * hooks.server.ts): the adapter keys `caches.default` on the raw URL, so
 * without it an unknown parameter, a reordered list or a different `v` is a
 * fresh D1 query. Every serialiser writes parameters in the order the page's
 * own fetches do (`apiUrl` + `matchRequest`, pinned by apiParams.test.ts), so a
 * real client's URL is already canonical and costs nothing extra.
 */

/**
 * Most ingredients one match may select. The largest recipe in the corpus has
 * 33 (2026-10-12) and a match must use all but at most two of the selection, so
 * a selection much past 35 finds nothing in practice, while each key makes the
 * query walk every recipe holding it. 50 leaves room for corpus growth. Over
 * the cap is a 400, not a truncation: matching a silently shortened selection
 * would report recipes that skip what the user picked.
 */
export const MAX_HAVE = 50;

/**
 * Most ids one `/api/recipes` call returns. The favorites page sends its whole
 * list, which has no cap of its own; past this, the highest ids are dropped
 * (deterministically, so the response is still one per list) rather than
 * failing the page.
 */
export const MAX_IDS = 500;

/** The corpus has 3,478 recipes; an offset past every possible match is junk. */
export const MAX_OFFSET = 10_000;

export const MATCH_SORTS = ['kcal', 'grade', 'time'] as const;

/** Whitelists a filter value; unknown values are dropped rather than passed through. */
const oneOf = <T extends string>(allowed: readonly T[], value: string | null): T | undefined =>
	value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

const asSet = <T extends string>(values: readonly T[]) => [...new Set(values)].sort();

/** Comma-separated allergen keys, trimmed/lowercased/whitelisted against
 *  ALLERGENS and deduped — the same treatment `parseKeys` gives ingredient
 *  canonical_keys, and for the same reason: `allergens.id` is positional and
 *  renumbers on reseed, so a shared/bookmarked link has to carry the stable
 *  key instead. */
function parseAllergenKeys(value: string | null): (typeof ALLERGENS)[number][] {
	if (!value) return [];
	const keys = value
		.split(',')
		.map((part) => part.trim().toLowerCase())
		.filter((key): key is (typeof ALLERGENS)[number] =>
			(ALLERGENS as readonly string[]).includes(key)
		);
	return asSet(keys);
}

/** A non-negative integer offset written in plain digits, or null. `Number()`
 *  alone accepts `2.5`, `1e999` (Infinity) and `0x10`, and SQLite rejects the
 *  first two at LIMIT/OFFSET with a 500. */
function parseOffset(value: string | null): number | null {
	if (value === null || value === '') return 0;
	if (!/^\d{1,6}$/.test(value)) return null;
	const offset = Number(value);
	return offset <= MAX_OFFSET ? offset : null;
}

// ---- /api/ingredients ---------------------------------------------------------------------

export interface IngredientsQuery {
	lang: Lang;
	q: string;
}

export function parseIngredientsQuery(params: URLSearchParams): IngredientsQuery {
	return { lang: resolveLang(params.get('lang')), q: normaliseQuery(params.get('q')) };
}

function ingredientsSearch({ lang, q }: IngredientsQuery): URLSearchParams {
	const search = new URLSearchParams({ lang });
	if (q) search.set('q', q);
	return search;
}

// ---- /api/search --------------------------------------------------------------------------

export interface SearchQuery {
	q: string;
	lang: Lang;
}

export function parseSearchQuery(params: URLSearchParams): SearchQuery {
	return { q: normaliseQuery(params.get('q')), lang: resolveLang(params.get('lang')) };
}

function searchSearch({ q, lang }: SearchQuery): URLSearchParams {
	const search = new URLSearchParams();
	if (q) search.set('q', q);
	search.set('lang', lang);
	return search;
}

// ---- /api/recipes -------------------------------------------------------------------------

export interface RecipesQuery {
	/** Ascending, unique, at most MAX_IDS. */
	ids: number[];
	lang: Lang;
}

export function parseRecipesQuery(params: URLSearchParams): RecipesQuery {
	const ids = parseIds(params.get('ids'))
		.sort((a, b) => a - b)
		.slice(0, MAX_IDS);
	return { ids, lang: resolveLang(params.get('lang')) };
}

function recipesSearch({ ids, lang }: RecipesQuery): URLSearchParams {
	const search = new URLSearchParams();
	if (ids.length) search.set('ids', ids.join(','));
	search.set('lang', lang);
	return search;
}

// ---- /api/match ---------------------------------------------------------------------------

export interface MatchQuery {
	/** canonical_keys, sorted and unique; at most MAX_HAVE. */
	have: string[];
	lang: Lang;
	cuisine?: (typeof CUISINES)[number];
	meal?: (typeof MEAL_TYPES)[number];
	diet?: (typeof DIETS)[number];
	sort?: (typeof MATCH_SORTS)[number];
	noAllergen: (typeof ALLERGENS)[number][];
	/** Sorted subset of `have`; empty when the selection is too small to have
	 *  slack, where pinning changes nothing (see slackFor). */
	must: string[];
	offset: number;
}

/** The parsed query, or null when it must be answered 400. */
export function parseMatchQuery(params: URLSearchParams): MatchQuery | null {
	const have = asSet(parseKeys(params.get('have')));
	const offset = parseOffset(params.get('offset'));
	if (have.length > MAX_HAVE || offset === null) return null;
	const must =
		slackFor(have.length) > 0
			? asSet(parseKeys(params.get('must'))).filter((key) => have.includes(key))
			: [];
	return {
		have,
		lang: resolveLang(params.get('lang')),
		cuisine: oneOf(CUISINES, params.get('cuisine')),
		meal: oneOf(MEAL_TYPES, params.get('meal')),
		diet: oneOf(DIETS, params.get('diet')),
		sort: oneOf(MATCH_SORTS, params.get('sort')),
		noAllergen: parseAllergenKeys(params.get('noAllergen')),
		must,
		offset
	};
}

function matchSearch(query: MatchQuery): URLSearchParams {
	const search = new URLSearchParams();
	if (query.have.length) search.set('have', query.have.join(','));
	search.set('lang', query.lang);
	if (query.cuisine) search.set('cuisine', query.cuisine);
	if (query.meal) search.set('meal', query.meal);
	if (query.diet) search.set('diet', query.diet);
	if (query.sort) search.set('sort', query.sort);
	if (query.noAllergen.length) search.set('noAllergen', query.noAllergen.join(','));
	if (query.must.length) search.set('must', query.must.join(','));
	if (query.offset) search.set('offset', String(query.offset));
	return search;
}

// ---- canonical URLs -----------------------------------------------------------------------

interface CanonicalRoute {
	parse(params: URLSearchParams): unknown;
	write(parsed: never): URLSearchParams;
	/** Whether the key carries `v=`: the APIs do (a deploy moves clients to
	 *  fresh keys), the sitemap is fetched by crawlers with no version. */
	versioned: boolean;
}

const route = <T>(
	parse: (params: URLSearchParams) => T | null,
	write: (parsed: T) => URLSearchParams,
	versioned = true
): CanonicalRoute => ({ parse, write: write as (parsed: never) => URLSearchParams, versioned });

const CANONICAL = new Map<string, CanonicalRoute>([
	['/api/ingredients', route(parseIngredientsQuery, ingredientsSearch)],
	['/api/search', route(parseSearchQuery, searchSearch)],
	['/api/recipes', route(parseRecipesQuery, recipesSearch)],
	['/api/match', route(parseMatchQuery, matchSearch)],
	['/sitemap.xml', route(() => ({}), () => new URLSearchParams(), false)]
]);

/**
 * The URL whose response is the response to `url`, for the public GET routes
 * above; null for any other path, and for a query the route answers 400.
 *
 * Only returned when the canonical URL provably parses to the same value as
 * `url` does: `normaliseQuery` can cut a surrogate pair in half, which
 * re-encodes as U+FFFD and would make the two different queries.
 */
export function canonicalUrl(url: URL, buildVersion: string): string | null {
	const entry = CANONICAL.get(url.pathname);
	if (!entry) return null;
	const parsed = entry.parse(url.searchParams);
	if (parsed === null) return null;
	const search = entry.write(parsed as never);
	if (JSON.stringify(entry.parse(search)) !== JSON.stringify(parsed)) return null;
	if (entry.versioned) search.set(VERSION_PARAM, buildVersion);
	const query = search.toString();
	return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
}
