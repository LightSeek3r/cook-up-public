import type { RequestHandler } from './$types';

const TRACK_ENDPOINT = 'https://unit42.fr/api/v1/track';

/**
 * Forwards a visit ping to the app author's backend server-side, so unit42.fr
 * is never a network target the browser talks to directly — only the path is
 * sent, never query strings (selected ingredients, filters). `waitUntil`
 * keeps the fetch alive after the response is sent; without it Cloudflare can
 * cancel it the instant this handler returns.
 */
export const POST: RequestHandler = async ({ url, platform }) => {
	const path = url.searchParams.get('path');
	if (!path || !path.startsWith('/')) {
		return new Response(null, { status: 204 });
	}

	const ping = fetch(`${TRACK_ENDPOINT}?url=${encodeURIComponent(path)}`).catch(() => {});
	platform?.ctx.waitUntil(ping);

	return new Response(null, { status: 204 });
};
