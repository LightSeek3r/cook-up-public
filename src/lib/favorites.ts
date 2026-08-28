/**
 * Pure favorite-id logic — the localStorage I/O and reactive state live in
 * favorites.svelte.ts (runes require that extension); this file stays plain
 * .ts so it's unit-testable the same way theme.ts's resolveTheme is, without
 * a DOM. Reuses parseIds from $lib/db.ts: the storage format is a
 * comma-separated id list, same shape as the `have` URL param, and parseIds
 * already dedupes while preserving first-seen order.
 */
import { parseIds } from '$lib/db';

export const FAVORITES_KEY = 'cookup-favorites';

export function parseFavorites(raw: string | null): number[] {
	return parseIds(raw);
}

/** Moves id to the front if absent; no-op if already favorited. */
export function withFavorite(ids: number[], id: number): number[] {
	return ids.includes(id) ? ids : [id, ...ids];
}

export function withoutFavorite(ids: number[], id: number): number[] {
	return ids.filter((existing) => existing !== id);
}
