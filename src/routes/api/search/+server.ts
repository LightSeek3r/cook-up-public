import { json } from '@sveltejs/kit';
import { searchTitles, titleQueryReady } from '$lib/data';
import { corpusFor } from '$lib/server/data';
import { PUBLIC_DATA } from '$lib/httpCache';
import { parseSearchQuery } from '$lib/apiParams';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	const { q, lang } = parseSearchQuery(url.searchParams);

	// Two Latin characters of a dish name is not a search, and the page never
	// sends one: it is answered empty, without loading any data. One or two CJK
	// characters are a word, and are searched.
	if (!titleQueryReady(q)) return json({ recipes: [] }, { headers });

	return json(searchTitles(await corpusFor(platform, lang), { q, lang }), { headers });
};
