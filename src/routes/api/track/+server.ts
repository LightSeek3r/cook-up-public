import {
	deviceFrom,
	isTrackablePath,
	normaliseLang,
	normalisePath,
	recipeIdFromPath,
	recordPageView,
	referrerHost
} from '$lib/analytics';
import type { RequestHandler } from './$types';

/**
 * Records a page view in our own D1.
 *
 * This used to forward the path to unit42.fr; nothing leaves the Worker now, so
 * the app makes no third-party request of any kind. The response is 204 in
 * every case — including when the payload is rejected or the write fails —
 * because the browser has nothing to do with the difference, and an error body
 * would only tell a prober what this endpoint accepts.
 *
 * `waitUntil` keeps the insert alive after the response is sent; without it
 * Cloudflare can cancel it the instant this handler returns.
 */
export const POST: RequestHandler = async ({ url, request, platform }) => {
	const noContent = new Response(null, { status: 204 });

	const path = normalisePath(url.searchParams.get('path'));
	if (!path || !isTrackablePath(path)) return noContent;

	const db = platform?.env?.DB;
	if (!db) return noContent;

	const write = recordPageView(db, {
		path,
		recipeId: recipeIdFromPath(path),
		lang: normaliseLang(url.searchParams.get('lang')),
		country: platform?.cf?.country ?? null,
		referrerHost: referrerHost(url.searchParams.get('ref'), url.hostname),
		device: deviceFrom(
			request.headers.get('sec-ch-ua-mobile'),
			request.headers.get('user-agent')
		),
		isNewVisit: url.searchParams.get('new') === '1'
	}).catch(() => {});

	platform?.ctx?.waitUntil(write);
	return noContent;
};
