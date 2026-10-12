import { normaliseQuery } from '$lib/search';
import type { IngredientTile } from '$lib/types';

/** Same cap as `/api/ingredients`' FTS branch. */
export const TILE_SEARCH_LIMIT = 60;

// ASCII-only case folding, kept from when this mirrored a SQLite LIKE branch
// (whose built-in LIKE folds only ASCII), so `É` and `é` still stay distinct;
// folding more would change which tiles a short query finds.
const foldAsciiCase = (value: string) => value.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * The only search for queries shorter than MIN_FTS_LENGTH: the trigram FTS
 * index cannot match them, and `/api/ingredients` answers them empty rather
 * than scanning every ingredient name, so the page filters the full mosaic it
 * already holds. Substring of the displayed name, ASCII case-folded, best-used
 * first, at most 60. An empty query returns the mosaic unchanged, like the
 * route's no-`q` branch.
 *
 * Ties on recipe_count are broken by id, which decides which tied tiles make
 * the cut at 60; the mosaic itself breaks ties by name.
 */
export function filterTiles(mosaic: readonly IngredientTile[], raw: string): IngredientTile[] {
	const q = normaliseQuery(raw);
	if (!q) return [...mosaic];
	const needle = foldAsciiCase(q);
	return mosaic
		.filter((tile) => foldAsciiCase(tile.name).includes(needle))
		.sort((a, b) => b.recipe_count - a.recipe_count || a.id - b.id)
		.slice(0, TILE_SEARCH_LIMIT);
}
