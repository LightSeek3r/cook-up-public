/**
 * How many of the user's selections a recipe may ignore and still be worth
 * showing as a near-miss.
 *
 * Scaled rather than fixed, because slack is only meaningful relative to how
 * much the user picked: allowing 2 unused out of 3 selections would surface
 * every recipe containing any one of them, which is not "almost there", it's
 * "unrelated". A third of the selection, capped at 2, keeps the relaxed group
 * recognisably close to what the user actually has. Below 3 selections there is
 * no slack at all — with one or two ingredients the strict list is already
 * broad, and the feature exists for the case the user described: several
 * ingredients picked, and a recipe that uses most but not all of them.
 */
export function slackFor(haveCount: number): number {
	return Math.min(2, Math.floor(haveCount / 3));
}
