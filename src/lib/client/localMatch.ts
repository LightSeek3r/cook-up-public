import { browser } from '$app/environment';
import { version as DATA_VERSION } from '$lib/data/lock.json';
import type { MatchResult } from '$lib/types';
import type { MatchData } from './matchData';

/**
 * Home-page matching in the browser. The artefacts are fetched once the page
 * is idle after hydration, or at the first ingredient tap if that comes
 * first; on a Save-Data or 2G connection only at that tap. Until they are in,
 * or for good once anything about them fails, `localMatch` returns null and
 * the page asks /api/match as before. Both answer with matchResponse over the
 * same files, so a selection gets the same JSON either way.
 */

/** The /api/match JSON, typed as the page reads it. */
export interface LocalMatchBody {
	results: MatchResult[];
	total: number;
	haveCount: number;
}

export interface LocalMatchDeps {
	open(lang: string, priority: RequestPriority): Promise<MatchData>;
	whenIdle(run: () => void): void;
	/** Whether to wait for a tap rather than prefetch. */
	constrained(): boolean;
	warn(message: string): void;
}

export interface LocalMatch {
	/** Schedules the download for an idle moment; also loads `lang` once the data is in. */
	prefetch(lang: string): void;
	/** The user is choosing ingredients: download now. */
	want(lang: string): void;
	/** Whether `match` can answer queries in `lang` now. */
	ready(lang: string): boolean;
	/** The /api/match body for this query string, or null to ask the server. */
	match(search: string): LocalMatchBody | null;
}

export function createLocalMatch(deps: LocalMatchDeps): LocalMatch {
	let data: MatchData | null = null;
	let opening = false;
	let failed = false;
	let idleQueued = false;
	/** The page's language at the latest call, which the data loads once it is in. */
	let lang = '';

	function fail(error: unknown) {
		failed = true;
		data = null;
		deps.warn(`matching in the browser is off, /api/match answers instead: ${error instanceof Error ? error.message : String(error)}`);
	}

	function loadLang() {
		// A language that fails is the server's to answer; the rest stay local.
		data?.load(lang).catch(() => {});
	}

	function start(priority: RequestPriority) {
		if (failed || opening || data) return;
		opening = true;
		deps.open(lang, priority).then(
			(opened) => {
				data = opened;
				loadLang();
			},
			// Not retried: a network that failed this once would make every later
			// tap pay for a second download attempt as well as the server request.
			fail
		);
	}

	return {
		prefetch(next) {
			lang = next;
			if (data) loadLang();
			else if (!idleQueued && !deps.constrained()) {
				idleQueued = true;
				deps.whenIdle(() => start('low'));
			}
		},
		want(next) {
			lang = next;
			if (data) loadLang();
			else start('auto');
		},
		ready: (next) => !!data && data.ready(next),
		match(search) {
			if (!data) return null;
			try {
				return data.match(search) as LocalMatchBody | null;
			} catch (error) {
				fail(error);
				return null;
			}
		}
	};
}

type Connection = { saveData?: boolean; effectiveType?: string };

const browserDeps: LocalMatchDeps = {
	open: (lang, priority) =>
		import('./matchData').then(({ openMatchData }) =>
			openMatchData({ version: DATA_VERSION, lang, priority, fetch: (url, init) => fetch(url, init) })
		),
	whenIdle(run) {
		// Safari has no requestIdleCallback.
		if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
		else setTimeout(run, 2000);
	},
	constrained() {
		const connection = (navigator as Navigator & { connection?: Connection }).connection;
		return !!connection && (connection.saveData === true || /2g$/.test(connection.effectiveType ?? ''));
	},
	warn: (message) => console.warn(message)
};

// Module scope, like responseCache: the data outlives the home page's
// remount when coming back from a recipe.
const shared = browser ? createLocalMatch(browserDeps) : null;

export const prefetchMatchData = (lang: string) => shared?.prefetch(lang);
export const wantMatchData = (lang: string) => shared?.want(lang);
export const localMatchReady = (lang: string) => shared?.ready(lang) ?? false;
export const localMatch = (search: string) => shared?.match(search) ?? null;

/**
 * Runs `run` once the browser has painted, so what a tap changes at once (the
 * pressed tile) shows before the work it triggers: rendering 50 result cards
 * is a 100-300 ms task on a 4x-throttled phone. Returns a cancel function.
 */
export function afterPaint(run: () => void): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	// A hidden tab runs no animation frames.
	if (document.hidden) {
		timer = setTimeout(run, 0);
		return () => clearTimeout(timer);
	}
	const frame = requestAnimationFrame(() => (timer = setTimeout(run, 0)));
	return () => {
		cancelAnimationFrame(frame);
		clearTimeout(timer);
	};
}
