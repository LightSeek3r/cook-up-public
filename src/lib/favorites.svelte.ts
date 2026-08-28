import { FAVORITES_KEY, parseFavorites, withFavorite, withoutFavorite } from '$lib/favorites';

/** Shared across every component that imports it — the heart button on the
 *  recipe page, the header's count badge, and /favorites all read the same
 *  array. Only ever mutated in place (.push/.splice/.length = 0), never
 *  reassigned: reassigning this binding would orphan every existing
 *  importer's subscription to it. */
export const favoriteIds = $state<number[]>([]);

let hydrated = false;

/** Populates favoriteIds from localStorage. Idempotent, so every consumer can
 *  call it defensively from its own $effect/onMount without depending on
 *  component mount order. SSR never runs $effect/onMount, so this never runs
 *  server-side — same guarantee ThemeToggle.svelte relies on for THEME_KEY. */
export function hydrateFavorites() {
	if (hydrated) return;
	hydrated = true;
	try {
		favoriteIds.push(...parseFavorites(localStorage.getItem(FAVORITES_KEY)));
	} catch {
		/* Private-mode Safari and cookie-blocking extensions can throw on
		   access. A favorites list that fails to persist is a much smaller
		   problem than a crash. */
	}
}

function persist() {
	try {
		localStorage.setItem(FAVORITES_KEY, favoriteIds.join(','));
	} catch {
		/* ignore, same rationale as hydrateFavorites */
	}
}

export function isFavorite(id: number): boolean {
	return favoriteIds.includes(id);
}

export function toggleFavorite(id: number) {
	hydrateFavorites();
	const next = isFavorite(id) ? withoutFavorite(favoriteIds, id) : withFavorite(favoriteIds, id);
	favoriteIds.length = 0;
	favoriteIds.push(...next);
	persist();
}
