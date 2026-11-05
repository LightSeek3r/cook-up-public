/**
 * How the service worker answers a request (src/service-worker.ts). Pure, so
 * the routing table can be tested without a worker.
 *
 * - `precache`: a build or static file listed in `$service-worker`.
 * - `immutable`: cache-first, the URL names the content.
 * - `navigation`: network first, the last good copy offline.
 * - `network`: not intercepted, so the browser and the Worker answer as if
 *   there were no service worker (APIs, /admin, the manifest, other origins).
 */
export type Strategy = 'precache' | 'immutable' | 'navigation' | 'network';

export interface RouteInput {
	method: string;
	url: URL;
	origin: string;
	mode: string;
	precached: ReadonlySet<string>;
}

export function strategyFor({ method, url, origin, mode, precached }: RouteInput): Strategy {
	if (method !== 'GET' || url.origin !== origin) return 'network';
	const path = url.pathname;
	if (path.startsWith('/api/') || path === '/admin' || path.startsWith('/admin/')) return 'network';
	if (path === '/manifest.webmanifest') return 'network';
	if (precached.has(path)) return 'precache';
	// /data/ files are fetched as ?v=<hash of their content> (matchData.dataUrl).
	if (path.startsWith('/data/') || path.startsWith('/_app/immutable/')) return 'immutable';
	return mode === 'navigate' ? 'navigation' : 'network';
}
