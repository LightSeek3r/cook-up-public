/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { strategyFor } from '$lib/sw/route';

const sw = self as unknown as ServiceWorkerGlobalScope;

// One cache per build, deleted wholesale on activate: a cached page names the
// chunks of the build that rendered it, and those files can be gone from the
// server once a newer build is deployed.
const CACHE = `cookup-${version}`;
// static/offline.html as the Workers asset layer serves it: /offline.html
// answers 307 → /offline, and a redirected response cannot be handed to a navigation.
const OFFLINE = '/offline';

// `files` is all of static/, including the ~3,500 data artefacts under /data/
// (74 MB), which are cached on first use instead (strategyFor). og-image.png is
// for link previews, never needed by the app itself.
const PRECACHE = [
	...build,
	OFFLINE,
	...files.filter((path) => !path.startsWith('/data/') && path !== '/og-image.png' && path !== '/offline.html')
];
const precached: ReadonlySet<string> = new Set(PRECACHE);

sw.addEventListener('install', (event) => {
	// No skipWaiting: the new worker takes over once every tab of the old build
	// is closed, so one page never mixes two builds' chunks.
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Only this worker's own caches: the origin's CacheStorage is shared.
			for (const key of await caches.keys()) if (key.startsWith('cookup-') && key !== CACHE) await caches.delete(key);
			await sw.clients.claim();
		})()
	);
});

/** A copy worth keeping: a plain 200 (no redirect, which a navigation may not be answered with). */
const storable = (response: Response) => response.status === 200 && !response.redirected;

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	if (storable(response)) await cache.put(request, response.clone());
	return response;
}

async function navigation(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (storable(response)) await cache.put(request, response.clone());
		return response;
	} catch (error) {
		// Offline (or the Worker is unreachable): the last good copy of this exact
		// URL, else the static page. An HTTP error status is a real answer and is
		// returned above, not replaced.
		const hit = (await cache.match(request)) ?? (await cache.match(OFFLINE));
		if (hit) return hit;
		throw error;
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const strategy = strategyFor({
		method: request.method,
		url: new URL(request.url),
		origin: sw.location.origin,
		mode: request.mode,
		precached
	});
	if (strategy === 'network') return;
	event.respondWith(strategy === 'navigation' ? navigation(request) : cacheFirst(request));
});
