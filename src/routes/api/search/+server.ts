import { json } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { resolveLang } from '$lib/i18n';
import { PUBLIC_DATA } from '$lib/httpCache';
import { searchRecipeTitles, normaliseQuery, MIN_FTS_LENGTH } from '$lib/search';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': PUBLIC_DATA };

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);
	const q = normaliseQuery(url.searchParams.get('q'));

	// A one- or two-character query is a LIKE scan over every recipe title. That
	// is affordable for ingredients (711 rows, and CJK genuinely needs it) but
	// not worth it here: two characters of a dish name is not a search, and the
	// client only shows this block as a secondary hint anyway.
	if (q.length < MIN_FTS_LENGTH) return json({ recipes: [] }, { headers });

	const data = await searchRecipeTitles(db, {
		q,
		lang: resolveLang(url.searchParams.get('lang'))
	});

	return json(data, { headers });
};
