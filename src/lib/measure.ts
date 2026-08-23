/**
 * Metric/imperial equivalents for a recipe quantity, for display only.
 *
 * The pipeline already stores `quantity` + `unit` per ingredient row and resolves
 * a `grams` weight where FDC could supply one, but the recipe page only ever
 * showed the source's own wording — so "6 imperial tbsp" or "½ cup" told a metric
 * reader nothing, and "125 g" told a US reader nothing.
 *
 * Two rules keep this honest:
 *
 *  1. **Never convert within the same system.** Showing "1 cup (16 tbsp)" is
 *     noise; showing "1 cup (240 ml)" is information. Each unit declares which
 *     system it belongs to, and the equivalent is only rendered in the other one.
 *  2. **Never invent a mass for a volume.** A cup of flour and a cup of honey
 *     differ by more than a factor of two, so volume→grams is only shown when the
 *     pipeline actually resolved a gram weight for that specific row from FDC's
 *     own portion data. It is never computed from a density guess here.
 */

/** Mass and volume conversions. Exact by definition, not measured. */
const MASS_TO_G = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 } as const;
const VOLUME_TO_ML = {
	ml: 1,
	l: 1000,
	dl: 100,
	cl: 10,
	tsp: 4.92892,
	tbsp: 14.7868,
	cup: 236.588,
	pint: 473.176,
	quart: 946.353
} as const;

type MassUnit = keyof typeof MASS_TO_G;
type VolumeUnit = keyof typeof VOLUME_TO_ML;

const isMass = (unit: string): unit is MassUnit => unit in MASS_TO_G;
const isVolume = (unit: string): unit is VolumeUnit => unit in VOLUME_TO_ML;

/** Metric units, so a value already in metric is not "converted" to metric. */
const METRIC = new Set(['g', 'kg', 'ml', 'l', 'dl', 'cl']);

/**
 * Rounds to a precision a cook can act on. 2 significant-ish figures near 1, whole
 * numbers once the value is large — "237 ml" not "236.588 ml", "1.5 kg" not
 * "1.5000000000000002 kg".
 */
function tidy(value: number): number {
	if (!Number.isFinite(value)) return value;
	if (value >= 100) return Math.round(value);
	if (value >= 10) return Math.round(value * 10) / 10;
	return Math.round(value * 100) / 100;
}

/** Drops a trailing ".0" so "240 ml" doesn't render as "240.0 ml". */
const format = (value: number) => String(tidy(value));

/**
 * The equivalent to show in parentheses after the source's own wording, or null
 * when there is nothing useful to add.
 *
 * @param quantity parsed amount, or null when the source stated none
 * @param unit our canonical unit, or null for a bare count ("4 eggs")
 * @param grams the pipeline's resolved weight for this row, if any
 */
export function equivalentOf(
	quantity: number | null,
	unit: string | null,
	grams: number | null
): string | null {
	// A bare count has no equivalent in another system — "4 eggs (4 eggs)". If the
	// pipeline weighed it, the weight is the useful addition.
	if (!unit) return quantity != null && grams != null ? `${format(grams)} g` : null;
	if (quantity == null) return null;

	if (isMass(unit)) {
		const g = quantity * MASS_TO_G[unit];
		// Imperial mass -> metric, and metric mass -> imperial. Both directions are
		// exact, so both are worth showing.
		return METRIC.has(unit)
			? g >= 453.592
				? `${format(g / 453.592)} lb`
				: `${format(g / 28.3495)} oz`
			: `${format(g)} g`;
	}

	if (isVolume(unit)) {
		const ml = quantity * VOLUME_TO_ML[unit];
		const parts: string[] = [];
		// Volume -> the other system's volume.
		if (!METRIC.has(unit)) parts.push(`${format(ml)} ml`);
		else if (ml >= VOLUME_TO_ML.cup) parts.push(`${format(ml / VOLUME_TO_ML.cup)} cup`);
		else parts.push(`${format(ml / VOLUME_TO_ML.tbsp)} tbsp`);
		// Volume -> mass, but only when the weight says something the volume didn't.
		//
		// Stage 04 falls back to a water-density approximation (1 ml = 1 g) when FDC
		// has no portion for the food, so `grams` is frequently just `ml` restated.
		// Printing "3 tbsp (44.4 ml · 44.4 g)" would dress that assumption up as a
		// measurement — the one thing this must not do. When the two agree to within
		// 2% the gram figure carries no information and is dropped; when they differ
		// it came from FDC's own portion table and is worth showing (a cup of flour
		// is ~125 g, not 237 g).
		if (grams != null && Math.abs(grams - ml) / ml > 0.02) parts.push(`${format(grams)} g`);
		return parts.join(' · ');
	}

	// Everything else — clove, pinch, sprig, can, packet, large/medium/small. These
	// are not convertible to anything, but the pipeline may still have weighed them
	// from FDC's portion table, and a weight is the whole point for a cook.
	return grams != null ? `${format(grams)} g` : null;
}
