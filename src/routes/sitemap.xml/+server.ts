import { getTermIds } from '$lib/glossary/load';
import { PUBLIC_DATA } from '$lib/httpCache';
import { sitemapIds } from '$lib/server/data';
import type { RequestHandler } from './$types';

const escapeXml = (value: string) => value.replace(/&/g, '&amp;');

/**
 * Bare URLs only: every page already declares its ?lang= variants as hreflang
 * alternates in its <head> (SeoHead). Repeating them here would mean ~58k
 * <url> entries (over the 50k-per-sitemap limit) or ~62k xhtml:link lines.
 *
 * Recipe ids from the data artefacts' sitemap.json, deployed with this
 * Worker version, so the list always names exactly the recipes it serves.
 * Cached like the API data (edge and browser).
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const ids = await sitemapIds(platform);

	const urls = [
		`${url.origin}/`,
		`${url.origin}/glossary`,
		...getTermIds().map((id) => `${url.origin}/glossary/${id}`),
		...ids.map((id) => `${url.origin}/recipe/${id}`)
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
