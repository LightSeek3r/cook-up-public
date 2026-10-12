import type { D1Database } from '@cloudflare/workers-types';
import { SUPPORTED_LANGS, type Lang } from '$lib/config';

/**
 * First-party page-view recording.
 *
 * This replaces the beacon that used to forward every visit to unit42.fr. The
 * shape of what is kept is the point: enough to answer "which recipes are read,
 * in which language, roughly where from", and nothing that identifies a person.
 * No IP, no cookie, no session id, no user-agent string, and — deliberately —
 * no query string, because on this site the query string *is* the user's
 * ingredient selection.
 */

/** Longest path we will store. Anything longer cannot be one of our routes. */
export const MAX_PATH = 512;

export type Device = 'mobile' | 'desktop';

export interface PageView {
	path: string;
	recipeId: number | null;
	lang: Lang | null;
	country: string | null;
	referrerHost: string | null;
	device: Device;
	isNewVisit: boolean;
}

/**
 * Accepts only a same-origin absolute path, with the query string and fragment
 * discarded rather than trimmed away later. Returns null for anything else, so
 * a caller cannot write an arbitrary string into the table.
 */
export function normalisePath(raw: string | null): string | null {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
	const path = raw.split(/[?#]/)[0];
	return path.length > 0 && path.length <= MAX_PATH ? path : null;
}

/** `/recipe/123` -> 123, so views-per-recipe is an indexed group-by. */
export function recipeIdFromPath(path: string): number | null {
	const match = /^\/recipe\/(\d{1,9})$/.exec(path);
	return match ? Number(match[1]) : null;
}

/**
 * Only the app's own three page routes are recorded.
 *
 * This endpoint has to be unauthenticated, so it is a free write into D1 for
 * anyone who finds it. Bounding the accepted paths bounds the damage: 404
 * probes and crawler noise create no rows at all, and `path` can only ever hold
 * one of a known set of shapes. It is not a substitute for an edge rate-limit
 * rule, which is the actual defence against someone hammering it deliberately.
 */
export function isTrackablePath(path: string): boolean {
	return path === '/' || path === '/favorites' || /^\/recipe\/\d{1,9}$/.test(path);
}

/**
 * Whether a client navigation is a page view worth a `/api/track` POST.
 *
 * `afterNavigate` also fires for the home page's `goto(..., { replaceState })`
 * on every ingredient toggle, filter change and settled search, which would
 * record each of them as another view of `/` (4 rows written apiece). A view
 * is the first load, a new path, or the same path in another language. Paths
 * the endpoint would discard anyway are not sent at all.
 */
export function shouldTrack(from: URL | null, to: URL): boolean {
	const path = normalisePath(to.pathname);
	if (!path || !isTrackablePath(path)) return false;
	if (!from) return true;
	return (
		from.pathname !== to.pathname || from.searchParams.get('lang') !== to.searchParams.get('lang')
	);
}

export function normaliseLang(raw: string | null): Lang | null {
	return SUPPORTED_LANGS.includes(raw as Lang) ? (raw as Lang) : null;
}

/**
 * Host of an off-site referrer, or null. Same-origin referrers are dropped —
 * internal navigation is already a page view, and counting it as a referral
 * would make the top-referrers list a list of our own pages.
 */
export function referrerHost(raw: string | null, selfHost: string): string | null {
	if (!raw) return null;
	let host: string;
	try {
		host = new URL(raw).hostname.toLowerCase();
	} catch {
		return null;
	}
	if (!host || host === selfHost.toLowerCase()) return null;
	return host.slice(0, 128);
}

/**
 * Two buckets, derived and then thrown away. `sec-ch-ua-mobile` is the explicit
 * hint but only Chromium sends it, so the UA string is the fallback — read
 * once, never stored.
 */
export function deviceFrom(chMobile: string | null, userAgent: string | null): Device {
	if (chMobile === '?1') return 'mobile';
	if (chMobile === '?0') return 'desktop';
	return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent ?? '') ? 'mobile' : 'desktop';
}

export function recordPageView(db: D1Database, view: PageView) {
	return db
		.prepare(
			`INSERT INTO page_view
         (path, recipe_id, lang, country, referrer_host, device, is_new_visit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			view.path,
			view.recipeId,
			view.lang,
			view.country,
			view.referrerHost,
			view.device,
			view.isNewVisit ? 1 : 0
		)
		.run();
}
