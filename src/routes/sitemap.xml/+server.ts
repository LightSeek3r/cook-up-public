import { requireDb } from '$lib/db';
import { getTermIds } from '$lib/glossary/load';
import { PUBLIC_DATA } from '$lib/httpCache';
import type { RequestHandler } from './$types';

const escapeXml = (value: string) => value.replace(/&/g, '&amp;');

/**
 * Bare recipe URLs only, no ?lang= variants: a sitemap entry per language
 * would tell crawlers ten pages exist where hreflang alternates (not
 * attempted here) or a single canonical URL is the correct signal instead.
 *
 * Reads every recipe id (3,478 rows) per uncached fetch. Only crawlers ask for
 * it, a few times a day, so it is cached like the API data (edge and browser)
 * rather than built from a deploy-time artefact that a reseed would have to
 * regenerate.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);
	const { results } = await db.prepare(`SELECT id FROM recipes ORDER BY id`).all<{ id: number }>();

	const urls = [
		`${url.origin}/`,
		`${url.origin}/glossary`,
		...getTermIds().map((id) => `${url.origin}/glossary/${id}`),
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
			'cache-control': PUBLIC_DATA
		}
	});
};
