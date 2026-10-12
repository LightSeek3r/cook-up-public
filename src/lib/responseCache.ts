import { browser } from '$app/environment';

/**
 * In-memory cache of GET responses for the home page.
 *
 * Lives at module scope, not in component state, so it survives the remount of
 * `/` that coming back from a recipe causes; a reload starts empty. Entries are
 * the in-flight promise, so two callers asking for the same URL share one
 * request. Failed requests are dropped rather than cached.
 */
export interface ResponseCache {
	get<T>(key: string, load: () => Promise<T>): Promise<T>;
	readonly size: number;
	clear(): void;
}

export const CACHE_MAX_ENTRIES = 30;
export const CACHE_TTL_MS = 5 * 60_000;

export function createResponseCache({
	maxEntries = CACHE_MAX_ENTRIES,
	ttlMs = CACHE_TTL_MS,
	now = Date.now
}: { maxEntries?: number; ttlMs?: number; now?: () => number } = {}): ResponseCache {
	// Map iteration is insertion order, so re-inserting on every hit makes the
	// first key the least recently used one.
	const entries = new Map<string, { at: number; value: Promise<unknown> }>();

	return {
		get<T>(key: string, load: () => Promise<T>): Promise<T> {
			const hit = entries.get(key);
			if (hit) {
				entries.delete(key);
				if (now() - hit.at < ttlMs) {
					entries.set(key, hit);
					return hit.value as Promise<T>;
				}
			}

			const value = load();
			const entry = { at: now(), value };
			entries.set(key, entry);
			value.catch(() => {
				if (entries.get(key) === entry) entries.delete(key);
			});
			while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
			return value;
		},
		get size() {
			return entries.size;
		},
		clear() {
			entries.clear();
		}
	};
}

const shared = createResponseCache();

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${response.status} ${url}`);
	return (await response.json()) as T;
}

/**
 * Cached `fetch(url).json()`. Callers must treat the result as read-only: the
 * same object is handed to every later caller of that URL.
 *
 * Bypassed outside the browser, where module state would be shared between
 * every request the Worker isolate serves.
 */
export function cachedJson<T>(url: string): Promise<T> {
	return browser ? shared.get(url, () => fetchJson<T>(url)) : fetchJson<T>(url);
}
