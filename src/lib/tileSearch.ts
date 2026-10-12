import { normaliseQuery } from '$lib/search';
import type { IngredientTile } from '$lib/types';

/** Same cap as `/api/ingredients`' query branches. */
export const TILE_SEARCH_LIMIT = 60;

// SQLite's built-in LIKE folds case for ASCII letters only, so `É` and `é`
// stay distinct there; folding more here would change which tiles match.
const foldAsciiCase = (value: string) => value.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * Client-side copy of `/api/ingredients`' short-query (LIKE) branch, run over
 * the full mosaic the page already holds instead of a ~3k-row table scan:
 * substring of the displayed name, case-folded like SQLite LIKE, best-used
 * first, at most 60. An empty query returns the mosaic unchanged, like the
 * route's no-`q` branch.
 *
 * Ties on recipe_count are broken by id: the route's ORDER BY has no
 * tiebreak, and SQLite's rowid scan yields id order there (checked on every
 * tie in 1-2 character queries across 8 languages). It decides which tied
 * tiles make the cut at 60, and the mosaic itself breaks ties by name.
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
