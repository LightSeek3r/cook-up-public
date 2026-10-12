/** Everything `/api/match` reads, as the home page has already parsed it from the URL. */
export interface MatchRequestInput {
	selected: readonly string[];
	lang: string;
	cuisine: string;
	meal: string;
	diet: string;
	sort: string;
	noAllergen: readonly string[];
	must: readonly string[];
	slack: number;
}

// The route treats these lists as sets: it dedupes them, and any permutation
// gets a byte-identical response. Sorting gives one request, and one cache
// entry, per selection, so toggling an ingredient off and on again is a hit.
const asSet = (values: readonly string[]) => [...new Set(values)].sort().join(',');

/**
 * Query string for one page of `/api/match`, or '' when nothing is selected.
 *
 * A string, so a `$derived` of it compares by value: URL writes that change
 * nothing the route reads (the debounced `?q=`, a reordered `have`) leave it
 * equal and do not re-run the effect that fetches it.
 */
export function matchRequest(input: MatchRequestInput, offset = 0): string {
	if (input.selected.length === 0) return '';
	const search = new URLSearchParams({ have: asSet(input.selected), lang: input.lang });
	if (input.cuisine) search.set('cuisine', input.cuisine);
	if (input.meal) search.set('meal', input.meal);
	if (input.diet) search.set('diet', input.diet);
	if (input.sort) search.set('sort', input.sort);
	if (input.noAllergen.length) search.set('noAllergen', asSet(input.noAllergen));
	// Only meaningful once `slack` lets a recipe skip part of the selection
	// (see MatchParams.mustUse), matching the API route's own guard.
	if (input.must.length && input.slack > 0) search.set('must', asSet(input.must));
	if (offset) search.set('offset', String(offset));
	return search.toString();
}
