/** Longest query we will look at. Anything beyond this is noise or an attempt to
 *  make the tokenizer work hard. */
export const MAX_QUERY = 64;

/** Below this, the trigram tokenizer has nothing to index and we fall back to a
 *  LIKE scan — which is what makes CJK queries work at all. */
export const MIN_FTS_LENGTH = 3;

/** Default cap on recipe title hits. Deliberately smaller than the ingredient
 *  mosaic's 60: recipe hits are a secondary affordance above the mosaic, not the
 *  main surface, and a long list would push the ingredients off-screen. */
export const RECIPE_HIT_LIMIT = 12;

/** Trim and clamp a raw `?q=` value once, at the boundary. */
export const normaliseQuery = (raw: string | null): string =>
	(raw ?? '').trim().slice(0, MAX_QUERY);
