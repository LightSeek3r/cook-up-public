import { describe, it, expect } from 'vitest';
import { resolveLang, dirFor, t } from './index';
import { SUPPORTED_LANGS, DEFAULT_LANG } from '$lib/config';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import de from './de.json';
import ar from './ar.json';
import hi from './hi.json';
import zh from './zh.json';
import ja from './ja.json';
import ko from './ko.json';
import vi from './vi.json';

const BUNDLES: Record<string, Record<string, string>> = { en, es, fr, de, ar, hi, zh, ja, ko, vi };

// One test guarding all 10 locale files: every key added to en.json (or any
// other bundle) must exist in every bundle. Nothing else in the project
// enforces this — it's exactly how the app shipped with 8 macro labels,
// 19 cuisine names, and the language switcher itself hardcoded in English
// across all 10 locales for a full release, undetected.
describe('i18n bundle key parity', () => {
	const enKeys = new Set(Object.keys(en));

	it.each(Object.keys(BUNDLES).filter((l) => l !== 'en'))('%s has every key en.json has', (lang) => {
		const missing = [...enKeys].filter((k) => !(k in BUNDLES[lang]));
		expect(missing).toEqual([]);
	});

	it.each(Object.keys(BUNDLES).filter((l) => l !== 'en'))('%s has no extra keys en.json lacks', (lang) => {
		const extra = Object.keys(BUNDLES[lang]).filter((k) => !enKeys.has(k));
		expect(extra).toEqual([]);
	});

	it('every bundle has a non-empty string for every key (no accidental blanks)', () => {
		for (const [lang, bundle] of Object.entries(BUNDLES)) {
			for (const [key, value] of Object.entries(bundle)) {
				expect(typeof value, `${lang}.${key}`).toBe('string');
				expect(value.length, `${lang}.${key} is empty`).toBeGreaterThan(0);
			}
		}
	});

	it('SUPPORTED_LANGS and the bundle set agree exactly', () => {
		expect(new Set(Object.keys(BUNDLES))).toEqual(new Set(SUPPORTED_LANGS));
	});
});

describe('resolveLang', () => {
	it('passes through any value in SUPPORTED_LANGS', () => {
		for (const lang of SUPPORTED_LANGS) expect(resolveLang(lang)).toBe(lang);
	});

	it('falls back to DEFAULT_LANG for anything not in SUPPORTED_LANGS', () => {
		expect(resolveLang('xx')).toBe(DEFAULT_LANG);
		expect(resolveLang(null)).toBe(DEFAULT_LANG);
		expect(resolveLang(undefined)).toBe(DEFAULT_LANG);
		expect(resolveLang('')).toBe(DEFAULT_LANG);
	});
});

describe('dirFor', () => {
	it('is rtl only for Arabic', () => {
		expect(dirFor('ar')).toBe('rtl');
		for (const lang of SUPPORTED_LANGS.filter((l) => l !== 'ar')) {
			expect(dirFor(lang)).toBe('ltr');
		}
	});
});

describe('t()', () => {
	it('returns the bundle value for the requested language', () => {
		expect(t('fr')('app.title')).toBe(fr['app.title']);
	});

	it('falls back to English, then to the key itself, for an unknown key', () => {
		expect(t('en')('this.key.does.not.exist')).toBe('this.key.does.not.exist');
	});
});
