import { requireDb } from '$lib/db';
import type { RequestHandler } from './$types';

const escapeXml = (value: string) => value.replace(/&/g, '&amp;');

/**
 * Bare recipe URLs only, no ?lang= variants: a sitemap entry per language
 * would tell crawlers ten pages exist where hreflang alternates (not
 * attempted here) or a single canonical URL is the correct signal instead.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);
	const { results } = await db.prepare(`SELECT id FROM recipes ORDER BY id`).all<{ id: number }>();

	const urls = [
		`${url.origin}/`,
		...(results ?? []).map((row) => `${url.origin}/recipe/${row.id}`)
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`).join('\n')}
</urlset>
`;

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
