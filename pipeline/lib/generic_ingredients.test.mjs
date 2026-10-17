import { describe, it, expect } from 'vitest';
import { GENERIC_PAIRS, GENERIC_PAIRS_CLOSED } from './generic_ingredients.mjs';

// Structural invariants only — the actual generic/specific *content* is a
// curated product decision (see the file's own header and the unpublished project notes for
// the full case-by-case reasoning), not something a unit test should assert
// on line-by-line.
describe('GENERIC_PAIRS', () => {
	it('has no self-pairs (a key can never be its own generic)', () => {
		expect(GENERIC_PAIRS.filter(([g, s]) => g === s)).toEqual([]);
	});

	it('has no duplicate pairs', () => {
		const seen = new Set();
		const dupes = GENERIC_PAIRS.filter(([g, s]) => {
			const key = `${g}:${s}`;
			if (seen.has(key)) return true;
			seen.add(key);
			return false;
		});
		expect(dupes).toEqual([]);
	});

	it('excludes every confirmed whole-category anchor as a generic', () => {
		// spice/herb/fruit/cheese/sauce/... are food GROUPS, not one food with
		// named variants — the whole point of this table is a curated subset
		// of the taxonomy's DAG that excludes exactly this class.
		const CATEGORY_ANCHORS = [
			'alcohol', 'berries', 'cereal', 'cheese', 'coating', 'dough', 'fish',
			'fruit', 'herb', 'legume', 'meat', 'mixed_spices', 'nut', 'oil_and_fat',
			'poultry', 'salad', 'sauce', 'spice', 'vegetable'
		];
		const generics = new Set(GENERIC_PAIRS.map(([g]) => g));
		for (const anchor of CATEGORY_ANCHORS) expect(generics.has(anchor)).toBe(false);
	});

	it('excludes the confirmed taxonomy data error (allspice is not a chili pepper)', () => {
		expect(GENERIC_PAIRS).not.toContainEqual(['chili_pepper', 'allspice']);
	});

	it('includes the archetype cases the product decision was based on', () => {
		expect(GENERIC_PAIRS).toContainEqual(['egg', 'egg_yolk']);
		expect(GENERIC_PAIRS).toContainEqual(['egg', 'egg_white']);
		expect(GENERIC_PAIRS).toContainEqual(['onion', 'red_onion']);
		expect(GENERIC_PAIRS).toContainEqual(['sugar', 'molasses']);
		expect(GENERIC_PAIRS).toContainEqual(['vegetable_oil', 'olive_oil']);
	});
});

describe('GENERIC_PAIRS_CLOSED', () => {
	it('is transitively closed — the property match.ts depends on', () => {
		// match.ts joins ingredient_generic_of once, so a two-hop chain only works
		// if the flattened row is present. Any (a,b),(b,c) without (a,c) is a
		// selection that silently stops satisfying a recipe.
		const specificsOf = new Map();
		for (const [g, s] of GENERIC_PAIRS_CLOSED) {
			if (!specificsOf.has(g)) specificsOf.set(g, new Set());
			specificsOf.get(g).add(s);
		}
		const gaps = [];
		for (const [g, specifics] of specificsOf) {
			for (const s of specifics) {
				for (const deeper of specificsOf.get(s) ?? []) {
					if (deeper !== g && !specifics.has(deeper)) gaps.push([g, s, deeper]);
				}
			}
		}
		expect(gaps).toEqual([]);
	});

	it('flattens the chains the curated list leaves broken', () => {
		// Each of these was a real miss: the curated list has both halves, and
		// before closure neither `sugar` nor `egg` satisfied the far end.
		expect(GENERIC_PAIRS).toContainEqual(['sugar', 'brown_sugar']);
		expect(GENERIC_PAIRS).toContainEqual(['brown_sugar', 'dark_brown_sugar']);
		expect(GENERIC_PAIRS).not.toContainEqual(['sugar', 'dark_brown_sugar']);
		expect(GENERIC_PAIRS_CLOSED).toContainEqual(['sugar', 'dark_brown_sugar']);
		expect(GENERIC_PAIRS_CLOSED).toContainEqual(['egg', 'meringue']);
		expect(GENERIC_PAIRS_CLOSED).toContainEqual(['broth', 'stock_cube']);
	});

	it('is a superset of the curated list and adds nothing self-referential', () => {
		const closed = new Set(GENERIC_PAIRS_CLOSED.map(([g, s]) => `${g} ${s}`));
		for (const [g, s] of GENERIC_PAIRS) expect(closed.has(`${g} ${s}`)).toBe(true);
		expect(GENERIC_PAIRS_CLOSED.filter(([g, s]) => g === s)).toEqual([]);
	});

	it('never promotes a category anchor to a generic, even transitively', () => {
		// Rule 1 has to survive closure: if some chain ended at `cheese` as a
		// generic, transitivity would quietly hand it specifics.
		const ANCHORS = new Set([
			'alcohol', 'berries', 'cereal', 'cheese', 'coating', 'dough', 'fish', 'fruit',
			'herb', 'legume', 'meat', 'mixed_spices', 'nut', 'oil_and_fat', 'poultry',
			'salad', 'sauce', 'spice', 'vegetable'
		]);
		const curated = new Set(GENERIC_PAIRS.map(([g]) => g));
		const introduced = GENERIC_PAIRS_CLOSED.map(([g]) => g).filter((g) => !curated.has(g));
		expect(introduced).toEqual([]);
		// And no anchor is a generic in the curated list to begin with.
		expect([...curated].filter((g) => ANCHORS.has(g))).toEqual([]);
	});
});
