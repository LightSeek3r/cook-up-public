import { json } from '@sveltejs/kit';
import { parseKeys, requireDb } from '$lib/db';
import { matchRecipes, resolveIngredientIds, slackFor } from '$lib/match';
import { resolveLang } from '$lib/i18n';
import { ALLERGENS, CUISINES, DIETS, MEAL_TYPES } from '$lib/config';
import type { RequestHandler } from './$types';

/** Whitelists a filter value; unknown values are dropped rather than passed through. */
const oneOf = <T extends string>(allowed: readonly T[], value: string | null): T | undefined =>
	value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/** Comma-separated allergen keys, trimmed/lowercased/whitelisted against
 *  ALLERGENS and deduped — the same treatment `parseKeys` gives ingredient
 *  canonical_keys, and for the same reason: `allergens.id` is positional and
 *  renumbers on reseed, so a shared/bookmarked link has to carry the stable
 *  key instead. */
const parseAllergenKeys = (value: string | null): string[] => {
	if (!value) return [];
	const keys = value
		.split(',')
		.map((part) => part.trim().toLowerCase())
		.filter((key): key is (typeof ALLERGENS)[number] =>
			(ALLERGENS as readonly string[]).includes(key)
		);
	return [...new Set(keys)];
};

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);

	// `have` is a list of canonical_keys, not ids — see parseKeys for why. Keys
	// that don't exist are dropped by the lookup rather than erroring, so a stale
	// or hand-edited link degrades to a smaller selection instead of a 500.
	const keys = parseKeys(url.searchParams.get('have'));
	if (keys.length === 0) return json({ results: [], total: 0, haveCount: 0 });

	const have = await resolveIngredientIds(db, keys);
	if (have.length === 0) return json({ results: [], total: 0, haveCount: 0 });

	const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
	const slack = slackFor(have.length);

	// `must` (canonical keys, same shape as `have`) only matters once `slack`
	// lets a recipe skip some of the selection — with no slack every selection
	// is already required, so resolving it would spend a DB round trip on a
	// value the query couldn't use anyway. Resolved with the same lookup `have`
	// uses, then intersected with `have`: a `must` id outside the selection
	// could never be satisfied.
	const mustKeys = slack > 0 ? parseKeys(url.searchParams.get('must')) : [];
	const mustUse = mustKeys.length
		? (await resolveIngredientIds(db, mustKeys)).filter((id) => have.includes(id))
		: [];

	const data = await matchRecipes(db, {
		have,
		lang: resolveLang(url.searchParams.get('lang')),
		cuisine: oneOf(CUISINES, url.searchParams.get('cuisine')),
		mealType: oneOf(MEAL_TYPES, url.searchParams.get('meal')),
		diet: oneOf(DIETS, url.searchParams.get('diet')),
		excludeAllergens: parseAllergenKeys(url.searchParams.get('noAllergen')),
		sort: oneOf(['kcal', 'grade', 'time'] as const, url.searchParams.get('sort')),
		// Derived from the selection size, not accepted from the query string:
		// slack is a product rule, and a client-supplied value would let a URL
		// widen the match floor arbitrarily.
		slack,
		mustUse,
		offset
	});

	// `have.length` travels with the results so the client can tell a full match
	// (`matched === haveCount`) from a near-miss without re-deriving it from the
	// URL — this side of the boundary is where keys are validated, resolved and
	// deduped, so it is the only place that knows how many actually count.
	return json({ ...data, haveCount: have.length });
};
