import { json, text } from '@sveltejs/kit';
import { MIN_FTS_LENGTH, searchIngredients } from '$lib/data';
import { corpusFor, mosaicBody } from '$lib/server/data';
import { PUBLIC_DATA } from '$lib/httpCache';
import { parseIngredientsQuery } from '$lib/apiParams';
import type { RequestHandler } from './$types';

// Ingredient names fall back to English, then to the canonical key (the data
// artefacts resolve it like the SQL's COALESCE did): a newly ingested
// ingredient still appears in the mosaic before its translations land.

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	const { lang, q } = parseIngredientsQuery(url.searchParams);

	// The trigram index cannot hold terms shorter than 3 characters. The page
	// filters those (common in CJK) over the mosaic it already holds
	// (tileSearch.ts) and never sends them, so they are answered empty.
	if (q.length > 0 && q.length < MIN_FTS_LENGTH) return json({ results: [] }, { headers });

	if (q) return json({ results: searchIngredients(await corpusFor(platform, lang), { q, lang }) }, { headers });

	// Full mosaic; the client groups by category and sizes tiles by recipe_count.
	// The same headers json() would set, on a body that is already JSON.
	return text(await mosaicBody(platform, lang), {
		headers: { 'content-type': 'application/json', ...headers }
	});
};
