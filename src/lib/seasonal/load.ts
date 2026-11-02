import { browser } from '$app/environment';
import type { Fetch } from '$lib/client/matchData';
import { version as DATA_VERSION } from '$lib/data/lock.json';
import { parseSeasons, type Seasons, type SeasonsFile } from '$lib/data/seasons.js';

/**
 * seasons.json in the browser, fetched on first use and checked against the
 * data version this build was made with, like matchData's names/<lang>.json.
 */

/** A seasons.json of a data version other than this build's. */
export class StaleSeasonsError extends Error {}

// matchData's dataUrl scheme, written out rather than imported so this small
// loader's chunk does not pull in the decoder and match code with it.
const seasonsUrl = (version: string) => `/data/seasons.json?v=${version}`;

export interface FetchSeasonsOptions {
	version: string;
	fetch: Fetch;
	/** core.bin's ingredient count, when the caller has it. */
	ingredients?: number;
	priority?: RequestPriority;
}

export async function fetchSeasons({ version, fetch, ingredients, priority }: FetchSeasonsOptions): Promise<Seasons> {
	// A stale copy can sit in the HTTP cache under this URL when a request raced
	// a deploy (the assets ignore `?v=`): one more fetch past the cache, and only
	// a second mismatch (this tab predates the deployed data) gives up.
	for (const cache of ['default', 'reload'] as const) {
		const response = await fetch(seasonsUrl(version), { cache, priority });
		if (!response.ok) throw new Error(`data/seasons.json: HTTP ${response.status}`);
		const file = (await response.json()) as SeasonsFile;
		if (file?.version === version) return parseSeasons(file, { version, ingredients });
	}
	throw new StaleSeasonsError(`data/seasons.json is not data version ${version}`);
}

export interface SeasonsLoader {
	/** The parsed file, fetched once; `priority` applies to the request this call starts, if any. */
	load(priority?: RequestPriority): Promise<Seasons>;
	/** Forgets the loaded file. */
	reset(): void;
}

/** One shared download; a failure is forgotten so the next load tries again. */
export function createSeasonsLoader(options: () => Omit<FetchSeasonsOptions, 'priority'>): SeasonsLoader {
	let pending: Promise<Seasons> | null = null;
	return {
		load(priority) {
			if (!pending) {
				const attempt: Promise<Seasons> = fetchSeasons({
					...options(),
					priority
				}).catch((error: unknown) => {
					if (pending === attempt) pending = null;
					throw error;
				});
				pending = attempt;
			}
			return pending;
		},
		reset() {
			pending = null;
		}
	};
}

const shared = browser
	? createSeasonsLoader(() => ({
			version: DATA_VERSION,
			fetch: (url, init) => fetch(url, init)
		}))
	: null;

/** This build's seasons.json. Browser only: the server reads its artefacts another way. */
export function loadSeasons(priority?: RequestPriority): Promise<Seasons> {
	return shared ? shared.load(priority) : Promise.reject(new Error('seasons.json is loaded in the browser only'));
}
