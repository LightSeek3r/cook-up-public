import type { RequestHandler } from './$types';

/**
 * A route, not a static file: the sitemap URL must be absolute, and the
 * deployed origin isn't known until request time (no fixed custom domain is
 * configured in wrangler.toml).
 */
export const GET: RequestHandler = ({ url }) => {
	const body = `User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`;
	return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
