import { describe, it, expect } from 'vitest';
import { resolveLang, dirFor, t, registerMessages } from './index';
import { BUNDLES as BY_LANG, messagesFor } from './messages.server';
import { SUPPORTED_LANGS, DEFAULT_LANG } from '$lib/config';
import { CATEGORY_IDS } from '$lib/glossary/types';

const BUNDLES: Record<string, Record<string, string>> = BY_LANG;
const en = BY_LANG.en;
const fr = BY_LANG.fr;

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

	// The layout/components split or replace on these tokens; a translated or dropped
	// placeholder breaks the UI (lost link, or a button/toggle label that never gets
	// the ingredient name substituted in).
	const PLACEHOLDER_KEYS: [string, string][] = [
		['footer.createdBy', '{link}'],
		['results.addIngredient', '{name}'],
		['mosaic.mustUse', '{name}'],
		['glossary.count', '{n}'],
		['mosaic.limit', '{n}']
	];

	for (const [key, placeholder] of PLACEHOLDER_KEYS) {
		it.each(Object.keys(BUNDLES))(`%s ${key} has exactly one ${placeholder}`, (lang) => {
			expect(BUNDLES[lang][key].split(placeholder)).toHaveLength(2);
		});
	}

	// The category chips and tags look their label up by id, so a new CATEGORY_IDS
	// entry without a string would render the raw key in every language.
	it.each(Object.keys(BUNDLES))('%s has a glossary.cat.<id> label for every category', (lang) => {
		const missing = CATEGORY_IDS.filter((id) => !BUNDLES[lang][`glossary.cat.${id}`]);
		expect(missing).toEqual([]);
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
	it('is rtl only for Arabic and Western Punjabi (Shahmukhi)', () => {
		expect(dirFor('ar')).toBe('rtl');
		expect(dirFor('pnb')).toBe('rtl');
		for (const lang of SUPPORTED_LANGS.filter((l) => l !== 'ar' && l !== 'pnb')) {
			expect(dirFor(lang)).toBe('ltr');
		}
	});
});

describe('t()', () => {
	it('returns the registered value for the requested language', () => {
		registerMessages('fr', messagesFor('fr'));
		expect(t('fr')('app.title')).toBe(fr['app.title']);
	});

	it('resolves a translator created before its language was registered', () => {
		const translate = t('ja');
		expect(translate('app.title')).toBe('app.title');
		registerMessages('ja', messagesFor('ja'));
		expect(translate('app.title')).toBe(BY_LANG.ja['app.title']);
	});

	it('falls back to English, then to the key itself, for an unknown key', () => {
		registerMessages('en', messagesFor('en'));
		expect(t('ko')('app.title')).toBe(en['app.title']);
		expect(t('en')('this.key.does.not.exist')).toBe('this.key.does.not.exist');
	});
});

describe('messagesFor', () => {
	it('is the English bundle itself for en', () => {
		expect(messagesFor('en')).toBe(en);
	});

	it('carries every English key in every language, local value winning', () => {
		for (const lang of SUPPORTED_LANGS) {
			const merged = messagesFor(lang);
			expect(Object.keys(merged).sort(), lang).toEqual(Object.keys(en).sort());
			for (const [key, value] of Object.entries(BY_LANG[lang])) expect(merged[key]).toBe(value);
		}
	});

	it('is cached per language', () => {
		expect(messagesFor('fr')).toBe(messagesFor('fr'));
	});
});
