import { error } from '@sveltejs/kit';
import type { D1Database, KVNamespace, Ai } from '@cloudflare/workers-types';

/** Narrows the optional platform binding once, at the request boundary. */
export function requireDb(platform: App.Platform | undefined): D1Database {
	if (!platform?.env?.DB) throw error(500, 'D1 binding "DB" is not configured');
	return platform.env.DB;
}

export function requireKv(platform: App.Platform | undefined): KVNamespace {
	if (!platform?.env?.TRANSLATIONS) throw error(500, 'KV binding "TRANSLATIONS" is not configured');
	return platform.env.TRANSLATIONS;
}

export function requireAi(platform: App.Platform | undefined): Ai {
	if (!platform?.env?.AI) throw error(500, 'Workers AI binding "AI" is not configured');
	return platform.env.AI;
}

/** Parses a comma-separated list of positive integer ids from a query string. */
export function parseIds(value: string | null): number[] {
	if (!value) return [];
	const ids = value
		.split(',')
		.map((part) => Number(part.trim()))
		.filter((n) => Number.isInteger(n) && n > 0);
	return [...new Set(ids)];
}

/**
 * Parses a comma-separated list of `canonical_key`s from a query string.
 *
 * The selection travels as keys rather than as `ingredients.id` because those
 * ids are POSITIONAL — `06_seed_d1.mjs` assigns them by index in
 * `ingredients.jsonl` — so every corpus rebuild renumbers them and silently
 * repoints every shared link at different food. That already happened twice:
 * garlic moved 25 -> 27 and tomato 51 -> 54 in one reseed. Keys are stable,
 * and `?have=onion,garlic,tomato` is legible into the bargain.
 *
 * Consequence, accepted deliberately: a link using the old numeric form now
 * selects nothing. Those links were already broken — they pointed at whichever
 * ingredients happened to inherit those ids — so resolving them to the wrong
 * food would be worse than resolving them to none.
 */
export function parseKeys(value: string | null): string[] {
	if (!value) return [];
	const keys = value
		.split(',')
		.map((part) => part.trim().toLowerCase())
		// Same shape `slugify` produces in pipeline/lib/taxonomy.mjs. Anything else
		// cannot be a canonical_key, so it is dropped rather than sent to the DB.
		.filter((key) => /^[a-z][a-z0-9_]*$/.test(key));
	return [...new Set(keys)];
}
