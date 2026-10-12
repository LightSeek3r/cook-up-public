import { json } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { PUBLIC_DATA } from '$lib/httpCache';
import { searchRecipeTitles, MIN_FTS_LENGTH } from '$lib/search';
import { parseSearchQuery } from '$lib/apiParams';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	const { q, lang } = parseSearchQuery(url.searchParams);

	// A one- or two-character query would be a LIKE scan over every recipe
	// title, and two characters of a dish name is not a search: the page never
	// sends one, so it is answered empty here without touching D1.
	if (q.length < MIN_FTS_LENGTH) return json({ recipes: [] }, { headers });

	const data = await searchRecipeTitles(requireDb(platform), { q, lang });
	return json(data, { headers });
};
