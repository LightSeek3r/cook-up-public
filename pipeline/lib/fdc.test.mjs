import { describe, it, expect } from 'vitest';
import { parseCsv, matchFdc, matchFdcCandidates } from './fdc.mjs';

/** Builds the minimal `{ foods }` shape matchFdc reads — a real `loadFdc()`
 *  call needs the full FDC bulk CSVs on disk, which unit tests shouldn't
 *  depend on. */
function foods(entries) {
	return { foods: new Map(entries.map((f) => [f.fdc_id, f])) };
}

describe('matchFdc', () => {
	it('fixes the "-oes" plural bug: "potato" matches "Potatoes, raw, skin", not "Potato flour"', () => {
		const fdc = foods([
			{ fdc_id: '1', description: 'Potato flour', data_type: 'sr_legacy_food' },
			{ fdc_id: '2', description: 'Potatoes, raw, skin', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdc('potato', fdc).fdc_id).toBe('2');
	});

	it('prefers the raw form over a more-processed match at equal foundation status', () => {
		const fdc = foods([
			{ fdc_id: 'cooked', description: 'Potatoes, boiled, without skin', data_type: 'sr_legacy_food' },
			{ fdc_id: 'raw', description: 'Potatoes, raw, skin', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdc('potato', fdc).fdc_id).toBe('raw');
	});

	it('prefers Foundation Foods over SR Legacy even when SR Legacy has a shorter description', () => {
		const fdc = foods([
			{ fdc_id: 'legacy', description: 'Milk', data_type: 'sr_legacy_food' },
			{ fdc_id: 'foundation', description: 'Milk, whole, 3.25% milkfat', data_type: 'foundation_food' }
		]);
		expect(matchFdc('milk', fdc).fdc_id).toBe('foundation');
	});

	it('prefers the shortest matching description as a tie-break within the same foundation/raw status', () => {
		const fdc = foods([
			{ fdc_id: 'long', description: 'Milk, whole, 3.25% milkfat, with vitamin D', data_type: 'sr_legacy_food' },
			{ fdc_id: 'short', description: 'Milk, whole, 3.25% milkfat', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdc('milk', fdc).fdc_id).toBe('short');
	});

	it('matches a leading-token prefix over a description that only contains the word elsewhere', () => {
		// Regression: "milk" used to match "Cheese, ricotta, whole milk" because the query
		// token merely appeared somewhere in the description. Once any food's description
		// actually starts with "milk", real milk must win outright.
		const fdc = foods([
			{ fdc_id: 'ricotta', description: 'Cheese, ricotta, whole milk', data_type: 'sr_legacy_food' },
			{ fdc_id: 'milk', description: 'Milk, whole, 3.25% milkfat', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdc('milk', fdc).fdc_id).toBe('milk');
	});

	it('falls back to an anywhere match only when no description has the query as a leading prefix', () => {
		const fdc = foods([
			{ fdc_id: 'ricotta', description: 'Cheese, ricotta, whole milk', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdc('milk', fdc).fdc_id).toBe('ricotta');
	});

	it('returns null when nothing matches', () => {
		const fdc = foods([{ fdc_id: '1', description: 'Potato flour', data_type: 'sr_legacy_food' }]);
		expect(matchFdc('durian', fdc)).toBeNull();
	});

	it('returns null when the query is entirely stopwords', () => {
		const fdc = foods([{ fdc_id: '1', description: 'Potato flour', data_type: 'sr_legacy_food' }]);
		expect(matchFdc('raw', fdc)).toBeNull();
	});

	it('ignores stopwords in the query itself — "whole milk" behaves like "milk"', () => {
		const fdc = foods([{ fdc_id: '1', description: 'Milk, whole, 3.25% milkfat', data_type: 'sr_legacy_food' }]);
		expect(matchFdc('whole milk', fdc).fdc_id).toBe('1');
	});
});

describe('matchFdcCandidates', () => {
	it('returns every match, best-scoring first, not just the winner', () => {
		// The whole point: the winner is chosen for nutrition quality (Foundation
		// preferred) but is often the one FDC food with no portion data, so callers
		// need the siblings to find out what "1 medium onion" weighs.
		const fdc = foods([
			{ fdc_id: 'sr', description: 'Onions, raw', data_type: 'sr_legacy_food' },
			{ fdc_id: 'fnd', description: 'Onions, raw', data_type: 'foundation_food' }
		]);
		const got = matchFdcCandidates('onion', fdc);
		expect(got.map((c) => c.fdc_id)).toEqual(['fnd', 'sr']);
		expect(matchFdc('onion', fdc).fdc_id).toBe('fnd');
	});

	it('bounds how much more specific a sibling may be', () => {
		// A sibling three tokens beyond the query is a different food, not a
		// variant of it, and its portion weights must not be borrowed.
		const fdc = foods([
			{ fdc_id: 'onion', description: 'Onions, raw', data_type: 'sr_legacy_food' },
			{
				fdc_id: 'decoy',
				description: 'Onion rings, breaded, par fried, frozen, prepared',
				data_type: 'sr_legacy_food'
			}
		]);
		const ids = matchFdcCandidates('onion', fdc).map((c) => c.fdc_id);
		expect(ids).toContain('onion');
		expect(ids).not.toContain('decoy');
	});

	it('does NOT catch the sugar-apple case — that one is the category gate, not this bound', () => {
		// Worth pinning explicitly so the two guards do not get confused later.
		// "Sugar-apples (sweetsop), raw" is only three tokens once `raw` is dropped
		// as a stopword, so it passes maxExtraTokens=2 and would lend `sugar` a
		// 155 g "one fruit" weight. What actually stops it is stage 04's
		// COUNTABLE_CATEGORIES gate: sugar's category is `other`, so a bare count
		// is never resolved for it at all. Verified against the real corpus —
		// `sugar` resolves no unitless rows.
		const fdc = foods([
			{ fdc_id: 'sugar', description: 'Sugars, granulated', data_type: 'sr_legacy_food' },
			{ fdc_id: 'decoy', description: 'Sugar-apples (sweetsop), raw', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdcCandidates('sugar', fdc).map((c) => c.fdc_id)).toContain('decoy');
	});

	it('honours an explicit maxExtraTokens of 0 (exact token count only)', () => {
		const fdc = foods([
			{ fdc_id: 'plain', description: 'Beef', data_type: 'sr_legacy_food' },
			{ fdc_id: 'bologna', description: 'Beef, bologna', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdcCandidates('beef', fdc, { maxExtraTokens: 0 }).map((c) => c.fdc_id)).toEqual([
			'plain'
		]);
	});

	it('never returns the same food twice across the prefix and anywhere passes', () => {
		const fdc = foods([
			{ fdc_id: 'a', description: 'Onions, raw', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdcCandidates('onion', fdc)).toHaveLength(1);
	});

	it('returns [] for an unmatched or empty query rather than guessing', () => {
		const fdc = foods([{ fdc_id: 'a', description: 'Onions, raw', data_type: 'sr_legacy_food' }]);
		expect(matchFdcCandidates('nothing_like_this', fdc)).toEqual([]);
		expect(matchFdcCandidates('', fdc)).toEqual([]);
	});

	it('agrees with matchFdc on the winner', () => {
		const fdc = foods([
			{ fdc_id: 'flour', description: 'Potato flour', data_type: 'sr_legacy_food' },
			{ fdc_id: 'raw', description: 'Potatoes, raw, skin', data_type: 'sr_legacy_food' }
		]);
		expect(matchFdcCandidates('potato', fdc)[0].fdc_id).toBe(matchFdc('potato', fdc).fdc_id);
	});
});

describe('parseCsv', () => {
	it('parses simple comma-separated rows', () => {
		expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
			['a', 'b', 'c'],
			['1', '2', '3']
		]);
	});

	it('keeps a comma inside a quoted field intact', () => {
		expect(parseCsv('a,"b,c",d\n')).toEqual([['a', 'b,c', 'd']]);
	});

	it('unescapes doubled quotes inside a quoted field', () => {
		expect(parseCsv('a,"say ""hi""",c\n')).toEqual([['a', 'say "hi"', 'c']]);
	});

	it('handles CRLF line endings without leaving a stray \\r in the last field', () => {
		expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('flushes the final row when the file has no trailing newline', () => {
		expect(parseCsv('a,b,c')).toEqual([['a', 'b', 'c']]);
	});

	it('drops blank lines instead of emitting a bogus single-empty-field row', () => {
		expect(parseCsv('a,b\n\n1,2\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});
});
