import { json } from '@sveltejs/kit';
import { matchCore, resolveKeys, slackFor } from '$lib/data';
import { corpusFor } from '$lib/server/data';
import { PUBLIC_DATA } from '$lib/httpCache';
import { parseMatchQuery } from '$lib/apiParams';
import { badRequest } from '$lib/apiError';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	// Validated before any data is loaded: an over-cap selection or a malformed
	// offset is a 400 (see apiParams).
	const query = parseMatchQuery(url.searchParams);
	if (!query) return badRequest();

	// `have` is a list of canonical_keys, not ids — see parseKeys for why. Keys
	// that don't exist are dropped by the lookup rather than erroring, so a stale
	// or hand-edited link degrades to a smaller selection instead of a 500.
	if (query.have.length === 0) return json({ results: [], total: 0, haveCount: 0 }, { headers });

	const corpus = await corpusFor(platform, query.lang);
	const have = resolveKeys(corpus, query.have);
	if (have.length === 0) return json({ results: [], total: 0, haveCount: 0 }, { headers });

	const slack = slackFor(have.length);

	// `must` (canonical keys, same shape as `have`) only matters once `slack`
	// lets a recipe skip some of the selection — with no slack every selection
	// is already required. Resolved with the same lookup `have` uses, then
	// intersected with `have`: a `must` id outside the selection could never be
	// satisfied.
	const mustUse =
		slack > 0 && query.must.length
			? resolveKeys(corpus, query.must).filter((id) => have.includes(id))
			: [];

	const data = matchCore(corpus, {
		have,
		lang: query.lang,
		cuisine: query.cuisine,
		mealType: query.meal,
		diet: query.diet,
		excludeAllergens: query.noAllergen,
		sort: query.sort,
		// Derived from the selection size, not accepted from the query string:
		// slack is a product rule, and a client-supplied value would let a URL
		// widen the match floor arbitrarily.
		slack,
		mustUse,
		offset: query.offset
	});

	// `have.length` travels with the results so the client can tell a full match
	// (`matched === haveCount`) from a near-miss without re-deriving it from the
	// URL — this side of the boundary is where keys are validated, resolved and
	// deduped, so it is the only place that knows how many actually count.
	return json({ ...data, haveCount: have.length }, { headers });
};
