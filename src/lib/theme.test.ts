import { describe, it, expect } from 'vitest';
import { resolveTheme, THEMES, THEME_SETTINGS, DEFAULT_THEME, THEME_KEY } from './theme';

describe('resolveTheme', () => {
	it.each([...THEMES])('passes through the real palette %s', (theme) => {
		expect(resolveTheme(theme)).toBe(theme);
	});

	it('falls back to the default for anything not a real palette', () => {
		for (const junk of ['xx', 'Dark', 'DARK', 'system', 'light ', '0', '{}']) {
			expect(resolveTheme(junk), junk).toBe(DEFAULT_THEME);
		}
	});

	it('falls back to the default for absent values', () => {
		expect(resolveTheme(null)).toBe(DEFAULT_THEME);
		expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
		expect(resolveTheme('')).toBe(DEFAULT_THEME);
	});

	// 'auto' is the absence of an override, never a stored value. If it ever round
	// -tripped through storage, "follow the OS" would start persisting as an explicit
	// choice and the two would be impossible to tell apart.
	it('treats a literal "auto" in storage as invalid, not as the auto setting', () => {
		expect(THEMES).not.toContain('auto');
		expect(resolveTheme('auto')).toBe(DEFAULT_THEME);
	});

	it('always returns something in THEME_SETTINGS', () => {
		for (const v of ['light', 'dark', 'auto', 'nonsense', '', null, undefined]) {
			expect(THEME_SETTINGS).toContain(resolveTheme(v));
		}
	});
});

describe('theme constants', () => {
	it('has exactly two palettes — the CSS defines light and dark and nothing else', () => {
		expect([...THEMES]).toEqual(['light', 'dark']);
	});

	it('THEME_SETTINGS is the palettes plus auto', () => {
		expect([...THEME_SETTINGS].sort()).toEqual([...THEMES, 'auto'].sort());
	});

	it('defaults to auto, so an untouched install follows the OS', () => {
		expect(DEFAULT_THEME).toBe('auto');
	});

	it('has a storage key', () => {
		expect(THEME_KEY.length).toBeGreaterThan(0);
	});
});
