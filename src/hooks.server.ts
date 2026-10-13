import type { Handle, HandleServerError, RequestEvent, ServerInit } from '@sveltejs/kit';
import { version } from '$app/environment';
import { resolveLang, dirFor } from '$lib/i18n';
import { canonicalUrl } from '$lib/apiParams';
import { apiError, d1Outage, retryAfterSeconds, type D1Outage } from '$lib/apiError';
import { HSTS, SECURITY_HEADERS } from '$lib/securityHeaders';
import { warmUp } from '$lib/server/warmup';

/** At isolate startup on Cloudflare, outside any request's CPU budget (see warmUp). */
export const init: ServerInit = warmUp;

/** Outages seen by `handleError`, read back by `handle` once `resolve` returns.
 *  `handleError` cannot set a status, and an unexpected error is always 500. */
const outages = new WeakMap<Request, D1Outage>();

/**
 * One JSON line per server error, to the console only: Workers Logs (or
 * `wrangler tail`) collects it, and nothing leaves the Worker. Paths without
 * the query string, which holds the visitor's selection.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const outage = d1Outage(error);
	if (outage) outages.set(event.request, outage);
	if (status >= 500) {
		console.error(
			JSON.stringify({
				level: 'error',
				status,
				outage,
				method: event.request.method,
				route: event.route.id,
				path: event.url.pathname,
				error: (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(
					0,
					500
				)
			})
		);
	}
	if (outage) return { message: 'Service Unavailable', code: 'unavailable' };
	return { message, code: status === 404 ? 'not_found' : 'internal' };
};

/**
 * A server error as the response clients should see. A D1 outage becomes 503
 * + Retry-After instead of the generic 500, so a client or crawler backs off
 * instead of treating the page as broken (a sustained 5xx can get pages
 * dropped from an index). APIs always answer the shared JSON shape (apiError);
 * SvelteKit's own would be HTML for a request that doesn't ask for JSON. Pages
 * keep the rendered error page, whose `page.error.code` is 'unavailable'.
 */
function serverError(event: RequestEvent, response: Response): Response {
	const outage = outages.get(event.request);
	const isApi = event.url.pathname.startsWith('/api/');
	if (!outage) return isApi ? apiError('internal', response.status) : response;
	const retryAfter = String(retryAfterSeconds(outage));
	if (isApi) return apiError('unavailable', 503, { 'retry-after': retryAfter });
	const headers = new Headers(response.headers);
	headers.set('retry-after', retryAfter);
	headers.set('cache-control', 'no-store');
	return new Response(response.body, { status: 503, headers });
}

function secure(response: Response, url: URL): Response {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
	// Browsers ignore it over plain http; skipping it there keeps it off
	// localhost during development.
	if (url.protocol === 'https:') response.headers.set('strict-transport-security', HSTS);
	return response;
}

/** The adapter's own rule for what `caches.default` may store, narrowed to 200. */
function edgeCacheable(response: Response): boolean {
	const cacheControl = response.headers.get('cache-control') ?? '';
	return (
		response.status === 200 &&
		/\bpublic\b/i.test(cacheControl) &&
		!/(private|no-cache|no-store)/i.test(cacheControl) &&
		!response.headers.has('set-cookie')
	);
}

interface EdgeCache {
	match(key: string): Promise<Response | undefined>;
	put(key: string, response: Response): Promise<void>;
}

/**
 * Edge-cache key normalisation for the public D1-backed GETs.
 *
 * The adapter's worker looks a request up in `caches.default` by its raw URL
 * before routing, and skips the lookup entirely when the request says
 * `Cache-Control: no-cache`. Either way a junk parameter, a reordered list, a
 * made-up `v=` or one request header is enough to make every request a D1
 * query. So when the raw URL is not canonical (see apiParams), or the adapter
 * skipped its lookup, this looks up the canonical URL itself, and stores a
 * fresh response under the canonical URL as well as the raw one the adapter
 * stores. A real client already fetches canonical URLs and pays nothing.
 *
 * A lookup instead of a redirect: a redirect costs every non-canonical
 * client a round trip, and a cacheable redirect that rewrote `v=` could pin an
 * old version's URL for a day during a deploy. Only the routes apiParams
 * lists ever get here; /admin, /api/track and every page are untouched.
 */
async function cachedOrResolve(
	event: RequestEvent,
	respond: () => Promise<Response>
): Promise<Response> {
	const key = event.request.method === 'GET' ? canonicalUrl(event.url, version) : null;
	// workers-types' Response and the global one SvelteKit hands around are the
	// same object at runtime but different types.
	const cache = key ? (event.platform?.caches?.default as unknown as EdgeCache) : undefined;
	if (!key || !cache) return respond();

	const raw = event.request.url;
	const adapterSkipped = (event.request.headers.get('cache-control') ?? '').includes('no-cache');
	if (key !== raw || adapterSkipped) {
		const hit = await cache.match(key).catch(() => undefined);
		if (hit) return new Response(hit.body, hit);
	}

	const response = await respond();
	if (key !== raw && edgeCacheable(response)) {
		const put = cache.put(key, response.clone()).catch(() => {});
		event.platform?.ctx?.waitUntil(put);
	}
	return response;
}

/**
 * Injects the active language + text direction into `app.html`.
 *
 * `resolveLang` whitelists against SUPPORTED_LANGS, so the value interpolated
 * into the `<html>` attributes can never be attacker-controlled.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const lang = resolveLang(event.url.searchParams.get('lang'));
	const dir = dirFor(lang);

	const response = await cachedOrResolve(event, async () => {
		const resolved = await resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%cookup.lang%', lang).replace('%cookup.dir%', dir)
		});
		// The headers are set before the response is stored, so a cached copy
		// carries them too.
		return secure(resolved.status >= 500 ? serverError(event, resolved) : resolved, event.url);
	});

	return secure(response, event.url);
};
