/**
 * Pure "my fridge" persistence, plus the localStorage I/O around it — unlike
 * favorites.ts/favorites.svelte.ts there's no reactive `$state` to hold (the
 * selection itself already lives reactively in the URL; this module only
 * mirrors it into storage), so both halves fit in one plain .ts file. Reuses
 * parseKeys from $lib/db: the storage format is a comma-separated
 * canonical_key list, the same shape the `have` URL param uses and for the
 * same reason (see parseKeys — keys survive a corpus reseed, ids don't).
 */
import { parseKeys } from '$lib/db';

export const FRIDGE_KEY = 'cookup-fridge';

export function parseFridge(raw: string | null): string[] {
	return parseKeys(raw);
}

export function loadFridge(): string[] {
	try {
		return parseFridge(localStorage.getItem(FRIDGE_KEY));
	} catch {
		// Private-mode Safari and cookie-blocking extensions can throw on
		// access. A fridge that fails to restore is a much smaller problem
		// than a crash.
		return [];
	}
}

export function saveFridge(keys: string[]): void {
	try {
		localStorage.setItem(FRIDGE_KEY, keys.join(','));
	} catch {
		/* ignore, same rationale as loadFridge */
	}
}
