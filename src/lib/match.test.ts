import { describe, it, expect } from 'vitest';
import { slackFor } from './match';

describe('slackFor', () => {
	it('gives no slack below three selections', () => {
		// The strict list is already broad with one or two ingredients, and the
		// feature exists for "I picked several and a recipe uses most of them".
		expect(slackFor(0)).toBe(0);
		expect(slackFor(1)).toBe(0);
		expect(slackFor(2)).toBe(0);
	});

	it('scales with the selection rather than being fixed', () => {
		// A fixed slack of 2 would let a 3-ingredient selection match on any
		// single one of them — "unrelated", not "almost there".
		expect(slackFor(3)).toBe(1);
		expect(slackFor(5)).toBe(1);
		expect(slackFor(6)).toBe(2);
	});

	it('caps at 2 however much is selected', () => {
		expect(slackFor(20)).toBe(2);
		expect(slackFor(100)).toBe(2);
	});
});
