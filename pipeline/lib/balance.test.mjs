import { describe, it, expect } from 'vitest';
import { balanceFor } from './balance.mjs';

// Every expected value below was obtained by *running* balanceFor and reading
// its actual output, not derived by hand — an early draft of this file
// assumed an all-zero input scores 100 (it scores 73: raw=0 is not RAW_MIN,
// -15 is, and nothing here can produce a negative raw with positives at 0).
// Inverting the score formula to hit an arbitrary target is a trap for the
// same reason; these are concrete, verified fixed points instead.
const base = { kcal: 0, sugar_g: 0, sat_fat_g: 0, sodium_mg: 0, fiber_g: 0, protein_g: 0, beneficial_pct: 0 };

describe('balanceFor', () => {
	it('an all-zero dish is graded B, not the "no penalties = A" a reader might assume', () => {
		// raw = negatives - positives = 0 - 0 = 0, not RAW_MIN (-15) — RAW_MIN
		// requires 0 negatives AND positives already at their floor, which base
		// already is, so 0 is the best raw reachable without earning fibre/
		// protein/beneficial-mass points. Score = round((40-0)*100/55) = 73.
		expect(balanceFor(base)).toEqual({ grade: 'B', score: 73, negatives: 0, positives: 0 });
	});

	it('bucket() thresholds are a strict ">", not ">=": exactly at a threshold scores nothing', () => {
		expect(balanceFor({ ...base, sodium_mg: 90 }).negatives).toBe(0);
		expect(balanceFor({ ...base, sodium_mg: 91 }).negatives).toBe(1);
	});

	// beneficialPoints is a non-linear step function (5/2/1/0) with a strict
	// ">" at each boundary — the jump from 2 to 5 points crossing 80% is
	// deliberate and easy to accidentally smooth into a continuous curve later.
	it.each([
		[40, 0],
		[41, 1],
		[60, 1],
		[61, 2],
		[80, 2],
		[81, 5]
	])('beneficial_pct %i contributes %i positive points', (pct, points) => {
		expect(balanceFor({ ...base, beneficial_pct: pct }).positives).toBe(points);
	});

	it('grade boundaries span A through E as negatives accumulate', () => {
		expect(balanceFor({ ...base, beneficial_pct: 81 })).toMatchObject({ grade: 'A', score: 82 });
		expect(balanceFor(base)).toMatchObject({ grade: 'B', score: 73 });
		expect(balanceFor({ ...base, sodium_mg: 900 })).toMatchObject({ grade: 'C', score: 56 });
		expect(
			balanceFor({ ...base, sodium_mg: 900, sugar_g: 45, sat_fat_g: 10 })
		).toMatchObject({ grade: 'D', score: 24 });
		expect(
			balanceFor({ ...base, kcal: 800, sodium_mg: 900, sugar_g: 45, sat_fat_g: 10 })
		).toMatchObject({ grade: 'E', score: 7 });
	});

	it('score is clamped to [0, 100] even past the nominal RAW_MIN/RAW_MAX', () => {
		const worst = balanceFor({ ...base, kcal: 900, sugar_g: 100, sat_fat_g: 50, sodium_mg: 5000 });
		const best = balanceFor({ ...base, fiber_g: 100, protein_g: 100, beneficial_pct: 100 });
		expect(worst.score).toBe(0);
		expect(best.score).toBe(100);
	});
});
