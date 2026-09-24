import { COVERAGE_MIN, NRV_HIGH_PCT, NRV_SOURCE_PCT } from '$lib/config';
import type { MicroNutrient } from '$lib/types';

/**
 * Nutrition is computed offline from ingredient masses, so it is only as good as
 * the share of mass we managed to resolve. Below the threshold we show nothing
 * rather than a misleading number.
 */
export function nutritionVisible(coverage: number | null | undefined): boolean {
	return (coverage ?? 0) >= COVERAGE_MIN;
}

export type HighlightLevel = 'high' | 'source';

/** EU Reg. 1169/2011 labelling thresholds, per serving. */
export function highlightLevel(pctNrv: number | null | undefined): HighlightLevel | null {
	if (pctNrv == null) return null;
	if (pctNrv >= NRV_HIGH_PCT) return 'high';
	if (pctNrv >= NRV_SOURCE_PCT) return 'source';
	return null;
}

export function splitHighlights(micros: MicroNutrient[]) {
	const high: MicroNutrient[] = [];
	const source: MicroNutrient[] = [];
	for (const m of micros) {
		const level = highlightLevel(m.pct_nrv);
		if (level === 'high') high.push(m);
		else if (level === 'source') source.push(m);
	}
	const byNrv = (a: MicroNutrient, b: MicroNutrient) => (b.pct_nrv ?? 0) - (a.pct_nrv ?? 0);
	return { high: high.sort(byNrv), source: source.sort(byNrv) };
}
