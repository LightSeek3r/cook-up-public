import { json } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { PUBLIC_DATA } from '$lib/httpCache';
import { getRecipesByIds } from '$lib/search';
import { parseRecipesQuery } from '$lib/apiParams';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	const { ids, lang } = parseRecipesQuery(url.searchParams);
	if (ids.length === 0) return json({ recipes: [] }, { headers });

	const data = await getRecipesByIds(requireDb(platform), { ids, lang });
	return json(data, { headers });
};
