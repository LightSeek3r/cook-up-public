import { describe, it, expect } from 'vitest';
import { splitSteps } from './steps';

describe('splitSteps', () => {
	it('splits on numbered markers and renumbers implicitly (returns text only, no numbers)', () => {
		expect(splitSteps('1. Chop the onion. 2. Fry it. 3. Serve.')).toEqual([
			'Chop the onion.',
			'Fry it.',
			'Serve.'
		]);
	});

	it('handles sources that start at "0." (TheMealDB-style)', () => {
		expect(splitSteps('0. Preheat oven. 1. Bake. 2. Cool.')).toEqual([
			'Preheat oven.',
			'Bake.',
			'Cool.'
		]);
	});

	it('does NOT split on "Step N:" — the terminator class is [.):], no colon', () => {
		// Non-obvious from reading the regex casually, so pinned explicitly:
		// a source using "Step 1: ..." falls through to the line/whole-blob
		// fallback instead of splitting into steps.
		const result = splitSteps('Step 1: Chop. Step 2: Fry.');
		expect(result).not.toEqual(['Chop.', 'Fry.']);
	});

	it('splits on "Step N." / "Step N)" with the step prefix', () => {
		expect(splitSteps('Step 1. Chop. Step 2. Fry. Step 3. Serve.')).toEqual([
			'Chop.',
			'Fry.',
			'Serve.'
		]);
	});

	it('falls back to line-splitting when fewer than 3 numbered segments are found (a stray "2." mid-sentence is not a list)', () => {
		expect(splitSteps('Cook for 2. Then rest for 3 minutes.')).toEqual([
			'Cook for 2. Then rest for 3 minutes.'
		]);
	});

	it('falls back to splitting on newlines when there is no numbering at all', () => {
		expect(splitSteps('Chop the onion.\nFry it.\nServe.')).toEqual([
			'Chop the onion.',
			'Fry it.',
			'Serve.'
		]);
	});

	it('returns the whole trimmed blob as a single step when there is neither numbering nor newlines', () => {
		expect(splitSteps('Just cook it until done.')).toEqual(['Just cook it until done.']);
	});

	it('returns [] for empty or whitespace-only input', () => {
		expect(splitSteps('')).toEqual([]);
		expect(splitSteps('   ')).toEqual([]);
	});

	it('normalizes CRLF line endings before splitting', () => {
		expect(splitSteps('Chop.\r\nFry.\r\nServe.')).toEqual(['Chop.', 'Fry.', 'Serve.']);
	});
});
