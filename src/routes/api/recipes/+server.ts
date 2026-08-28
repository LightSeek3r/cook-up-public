import { json } from '@sveltejs/kit';
import { requireDb, parseIds } from '$lib/db';
import { resolveLang } from '$lib/i18n';
import { getRecipesByIds } from '$lib/search';
import type { RequestHandler } from './$types';

/** SQLite's bound-parameter ceiling makes an unbounded IN-list a real risk for
 *  a hand-crafted ?ids= query string; a real favorites list is nowhere near
 *  this. */
const MAX_IDS = 200;

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);
	const ids = parseIds(url.searchParams.get('ids')).slice(0, MAX_IDS);
	if (ids.length === 0) return json({ recipes: [] });

	const data = await getRecipesByIds(db, {
		ids,
		lang: resolveLang(url.searchParams.get('lang'))
	});
	return json(data);
};
