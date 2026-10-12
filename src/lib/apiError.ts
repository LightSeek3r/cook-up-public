import { json } from '@sveltejs/kit';
import { NEVER_CACHE } from '$lib/httpCache';

/**
 * The one error body every `/api/*` route answers with: `{ "error": code }`.
 * Also `App.Error.code` on pages, so the error page can tell "come back later"
 * from "something broke" without parsing a message.
 *
 *   bad_request  400  a parameter is malformed or over its cap; do not retry as is
 *   not_found    404  pages only
 *   unavailable  503  D1 is out of daily quota or briefly down; Retry-After says when
 *   internal     500  a bug
 */
export type ApiErrorCode = 'bad_request' | 'not_found' | 'unavailable' | 'internal';

export interface ApiErrorBody {
	error: ApiErrorCode;
}

export function apiError(code: ApiErrorCode, status: number, headers: Record<string, string> = {}) {
	const body: ApiErrorBody = { error: code };
	return json(body, { status, headers: { 'cache-control': NEVER_CACHE, ...headers } });
}

export const badRequest = () => apiError('bad_request', 400);

/**
 * Why D1 refused, when it is something to wait out rather than a bug: `quota`
 * lasts until the daily reset at 00:00 UTC, `transient` is D1's own list of
 * errors worth retrying (overload, network, storage reset). Anything else,
 * "too many SQL variables" included, is ours to fix and stays a 500.
 *
 * Matched on message text because that is all D1 gives: the strings are from
 * https://developers.cloudflare.com/d1/observability/debug-d1/ (2026-10-12).
 */
export type D1Outage = 'quota' | 'transient';

const QUOTA = /free tier daily row (read|write) limit|exceeded .*daily .*limit/i;
const TRANSIENT =
	/D1 DB is overloaded|Network connection lost|Replica disconnected|object to be reset|D1 DB reset because|transient issue on remote node|exceeded its (CPU time|memory) limit and was reset/i;

export function d1Outage(error: unknown): D1Outage | null {
	const message = error instanceof Error ? error.message : String(error);
	if (QUOTA.test(message)) return 'quota';
	if (TRANSIENT.test(message)) return 'transient';
	return null;
}

const TRANSIENT_RETRY_SECONDS = 30;

/** Seconds to put in Retry-After: until the next 00:00 UTC for a spent quota. */
export function retryAfterSeconds(outage: D1Outage, now = Date.now()): number {
	if (outage === 'transient') return TRANSIENT_RETRY_SECONDS;
	const day = 86_400_000;
	const nextReset = Math.floor(now / day) * day + day;
	return Math.max(60, Math.ceil((nextReset - now) / 1000));
}
