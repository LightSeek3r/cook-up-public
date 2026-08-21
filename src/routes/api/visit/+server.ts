import type { RequestHandler } from './$types';

const TRACK_ENDPOINT = 'https://unit42.fr/api/v1/track';

/**
 * Relays a visit ping to the app author's backend. Called at most once per
 * browser session by the client (see +layout.svelte), never directly by it —
 * the request to unit42.fr is made from here, server-side, so the third
 * party never sees the visitor's IP or browser fingerprint, only this
 * Worker's egress IP and the path. `waitUntil` keeps the fetch alive after
 * the response is sent; without it Cloudflare can cancel it the instant this
 * handler returns.
 */
export const POST: RequestHandler = async ({ url, platform }) => {
	const path = url.searchParams.get('path') ?? '/';
	const ping = fetch(`${TRACK_ENDPOINT}?url=${encodeURIComponent(path)}`).catch(() => {});
	platform?.ctx.waitUntil(ping);

	return new Response(null, { status: 204 });
};
