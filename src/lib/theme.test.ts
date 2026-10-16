import { describe, it, expect } from 'vitest';
import { resolveTheme, THEMES, THEME_KEY } from './theme';

describe('resolveTheme', () => {
	it.each([...THEMES])('passes through the real palette %s', (theme) => {
		expect(resolveTheme(theme)).toBe(theme);
	});

	it('is null for anything not a real palette', () => {
		for (const junk of ['xx', 'Dark', 'DARK', 'system', 'light ', '0', '{}']) {
			expect(resolveTheme(junk), junk).toBeNull();
		}
	});

	it('is null for absent values, so the OS preference decides', () => {
		expect(resolveTheme(null)).toBeNull();
		expect(resolveTheme(undefined)).toBeNull();
		expect(resolveTheme('')).toBeNull();
	});

	// Earlier versions offered an 'auto' setting. A browser that somehow still has
	// it stored must fall back to the OS, not be read as a palette.
	it('treats a legacy "auto" as no choice', () => {
		expect(THEMES).not.toContain('auto');
		expect(resolveTheme('auto')).toBeNull();
	});
});

describe('theme constants', () => {
	it('has exactly two palettes — the CSS defines light and dark and nothing else', () => {
		expect([...THEMES]).toEqual(['light', 'dark']);
	});

	it('has a storage key', () => {
		expect(THEME_KEY.length).toBeGreaterThan(0);
	});
});
