import { json } from '@sveltejs/kit';
import { matchResponse } from '$lib/data';
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

	// `have` is a list of canonical_keys, not ids — see parseKeys for why.
	if (query.have.length === 0) return json({ results: [], total: 0, haveCount: 0 }, { headers });

	// The home page computes this same body in the browser once it has the
	// artefacts (src/lib/client/localMatch.ts); matchResponse is shared so the
	// two cannot drift.
	const corpus = await corpusFor(platform, query.lang);
	return json(matchResponse(corpus, query), { headers });
};
