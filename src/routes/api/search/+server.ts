import { json } from '@sveltejs/kit';
import { MIN_FTS_LENGTH, searchTitles } from '$lib/data';
import { corpusFor } from '$lib/server/data';
import { PUBLIC_DATA } from '$lib/httpCache';
import { parseSearchQuery } from '$lib/apiParams';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	const { q, lang } = parseSearchQuery(url.searchParams);

	// Two characters of a dish name is not a search, and the page never sends
	// one: it is answered empty, without loading any data.
	if (q.length < MIN_FTS_LENGTH) return json({ recipes: [] }, { headers });

	return json(searchTitles(await corpusFor(platform, lang), { q, lang }), { headers });
};
