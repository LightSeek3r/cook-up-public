/**
 * Balance Grade — our own transparent nutrition score.
 *
 * Deliberately NOT Nutri-Score: that name is a registered mark with official
 * usage conditions, and its algorithm is defined for packaged products, not for
 * parsed multi-ingredient dishes. The point tables below follow the same public
 * methodology (energy / saturates / sugar / sodium against fibre / protein /
 * beneficial ingredients) but the branding, the 0-100 mapping and the grade
 * boundaries are ours.
 *
 * Input is per 100 g of the prepared dish.
 */

const bucket = (value, thresholds) => {
	let points = 0;
	for (const threshold of thresholds) if (value > threshold) points += 1;
	return points;
};

// 0..10 each
const ENERGY_KJ = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const SUGAR_G = [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45];
const SAT_FAT_G = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SODIUM_MG = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900];
// 0..5 each
const FIBER_G = [0.9, 1.9, 2.8, 3.7, 4.7];
const PROTEIN_G = [1.6, 3.2, 4.8, 6.4, 8];

const RAW_MIN = -15; // all positives, no negatives
const RAW_MAX = 40; // all negatives, no positives

/** Beneficial mass share (fruit, vegetables, legumes, nuts, seeds) -> 0..5. */
function beneficialPoints(pct) {
	if (pct > 80) return 5;
	if (pct > 60) return 2;
	if (pct > 40) return 1;
	return 0;
}

/**
 * @param {{kcal:number, sugar_g:number, sat_fat_g:number, sodium_mg:number,
 *          fiber_g:number, protein_g:number, beneficial_pct:number}} per100g
 * @returns {{grade:'A'|'B'|'C'|'D'|'E', score:number, negatives:number, positives:number}}
 */
export function balanceFor(per100g) {
	const negatives =
		bucket(per100g.kcal * 4.184, ENERGY_KJ) +
		bucket(per100g.sugar_g, SUGAR_G) +
		bucket(per100g.sat_fat_g, SAT_FAT_G) +
		bucket(per100g.sodium_mg, SODIUM_MG);

	const positives =
		bucket(per100g.fiber_g, FIBER_G) +
		bucket(per100g.protein_g, PROTEIN_G) +
		beneficialPoints(per100g.beneficial_pct);

	const raw = negatives - positives; // lower is better
	const score = Math.max(
		0,
		Math.min(100, Math.round(((RAW_MAX - raw) * 100) / (RAW_MAX - RAW_MIN)))
	);

	const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'E';

	return { grade, score, negatives, positives };
}
