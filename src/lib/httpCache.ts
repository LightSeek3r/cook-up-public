import { version } from '$app/environment';

/**
 * HTTP caching for the public, user-independent GET endpoints.
 *
 * Every D1-backed public response is a pure function of its URL (whitelisted,
 * normalised parameters) and of data that only changes on reseed, so it can be
 * cached by the browser and by the edge. The installed adapter-cloudflare
 * worker does the edge part on its own: it answers from `caches.default` before
 * routing and `cache.put`s any GET response with status < 400 whose
 * Cache-Control has no private/no-cache/no-store, keyed by the full URL, TTL
 * from the header. It works on workers.dev too (verified 2026-10-12: a repeat
 * request comes back `CF-Cache-Status: HIT`), and browser caching works either
 * way. hooks.server.ts adds a lookup under the canonical URL, so junk
 * parameters cannot bypass it (see apiParams.ts).
 *
 * Invalidation is by key, not by purge: the client adds `v=<build version>`
 * (`apiUrl`), and SvelteKit's `version` is the git commit (svelte.config.js), so
 * deploying a new commit moves every client to fresh keys at once; redeploying
 * the same commit after a reseed needs `npm run deploy -- --fresh-cache`.
 * The routes ignore the parameter.
 * Data changed without a deploy (a reseed or a translation batch applied
 * straight to D1) shows after at most the TTLs below, or at once after
 * redeploying.
 */

/**
 * D1-backed data: an hour in the browser, a day at the edge. After the hour
 * the browser may answer from its stale copy for another day while it
 * refetches in the background; the edge Cache API ignores the directive. Safe
 * for the same reason as the TTLs: a deploy changes `v=` and with it the URL.
 */
export const PUBLIC_DATA = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';

/** Responses with no data behind them at all (robots.txt, the manifest). */
export const PUBLIC_STATIC = 'public, max-age=86400';

/** Anything per-user or with side effects; the adapter never stores these. */
export const NEVER_CACHE = 'private, no-store';

/** Query parameter carrying the build version on cached API fetches. */
export const VERSION_PARAM = 'v';

/** `path?params&v=<version>`, the URL the client fetches a cached API with. */
export function apiUrl(path: string, params: URLSearchParams | Record<string, string> | string): string {
	const search = new URLSearchParams(params);
	search.set(VERSION_PARAM, version);
	return `${path}?${search}`;
}
