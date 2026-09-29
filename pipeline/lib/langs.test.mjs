import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGS, TARGET_LANGS } from './langs.mjs';
import { SUPPORTED_LANGS as APP_SUPPORTED_LANGS } from '../../src/lib/config';

// pipeline/lib/langs.mjs is a hand-kept copy of src/lib/config.ts's
// SUPPORTED_LANGS (plain Node ESM can't import the TS module at runtime — see
// langs.mjs's header). This test is the drift guard: only vitest, running
// under vite, can import both sides and diff them directly.
describe('pipeline SUPPORTED_LANGS mirrors src/lib/config.ts', () => {
	it('is byte-for-byte identical, in the same order', () => {
		expect(SUPPORTED_LANGS).toEqual([...APP_SUPPORTED_LANGS]);
	});
});

describe('TARGET_LANGS', () => {
	it('is every supported lang except the source language, en', () => {
		expect(TARGET_LANGS).not.toContain('en');
		expect(TARGET_LANGS.length).toBe(SUPPORTED_LANGS.length - 1);
		expect(new Set([...TARGET_LANGS, 'en'])).toEqual(new Set(SUPPORTED_LANGS));
	});
});
