import { deviceFrom, isSameOriginRequest, parseTrackQuery, recordPageView } from '$lib/analytics';
import { NEVER_CACHE } from '$lib/httpCache';
import { trackLimiter } from './limiter';
import type { RequestHandler } from './$types';

/**
 * Records a page view in our own D1.
 *
 * This used to forward the path to unit42.fr; nothing leaves the Worker now, so
 * the app makes no third-party request of any kind. The response is 204 in
 * every case — including when the payload is rejected, the request is not
 * same-origin, the limiter drops it, or the write fails — because the browser
 * has nothing to do with the difference, and an error body would only tell a
 * prober what this endpoint accepts.
 *
 * The endpoint is an unauthenticated D1 write, so the checks run cheapest
 * first and the limiter (in memory, see ./limiter.ts) only spends budget on a
 * request that would otherwise be recorded.
 *
 * `waitUntil` keeps the insert alive after the response is sent; without it
 * Cloudflare can cancel it the instant this handler returns.
 */
export const POST: RequestHandler = async ({ url, request, platform, getClientAddress }) => {
	const noContent = new Response(null, { status: 204, headers: { 'cache-control': NEVER_CACHE } });

	if (!isSameOriginRequest(request.headers, url.origin)) return noContent;

	const view = parseTrackQuery(url.searchParams, url.hostname);
	if (!view) return noContent;

	const db = platform?.env?.DB;
	if (!db) return noContent;

	let ip = 'unknown';
	try {
		ip = getClientAddress() || ip;
	} catch {
		// No address to key on: the shared 'unknown' bucket still bounds it.
	}
	if (trackLimiter.take(ip) === 'drop') return noContent;

	const write = recordPageView(db, {
		...view,
		country: platform?.cf?.country ?? null,
		device: deviceFrom(request.headers.get('sec-ch-ua-mobile'), request.headers.get('user-agent'))
	}).catch(() => {});

	platform?.ctx?.waitUntil(write);
	return noContent;
};
