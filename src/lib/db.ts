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
