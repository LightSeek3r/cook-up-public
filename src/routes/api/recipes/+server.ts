import { json } from '@sveltejs/kit';
import { recipesByIds } from '$lib/data';
import { corpusFor } from '$lib/server/data';
import { PUBLIC_DATA } from '$lib/httpCache';
import { parseRecipesQuery } from '$lib/apiParams';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	const { ids, lang } = parseRecipesQuery(url.searchParams);
	if (ids.length === 0) return json({ recipes: [] }, { headers });

	return json(recipesByIds(await corpusFor(platform, lang), { ids, lang }), { headers });
};
