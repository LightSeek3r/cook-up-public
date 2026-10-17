import { describe, it, expect } from 'vitest';
import { numberFormatter, unitLabeler } from './ingredientAmount';
import { BUNDLES } from './i18n/messages.server';
import type { Lang } from './config';

const translator = (lang: Lang) => (key: string) => (BUNDLES as Record<string, Record<string, string>>)[lang][key] ?? key;

describe('numberFormatter', () => {
	it('uses the decimal comma exactly where the translation rules do', () => {
		expect(numberFormatter('fr')(1.5)).toBe('1,5');
		expect(numberFormatter('jv')(0.25)).toBe('0,25');
		expect(numberFormatter('en')(1.5)).toBe('1.5');
		expect(numberFormatter('ar')(1.5)).toBe('1.5');
		expect(numberFormatter('zh')(1.5)).toBe('1.5');
	});

	it('keeps Western digits', () => {
		expect(numberFormatter('ar')(12)).toBe('12');
		expect(numberFormatter('hi')(12)).toBe('12');
	});
});

describe('unitLabeler', () => {
	it('picks the singular or plural form of the language', () => {
		const en = unitLabeler('en', translator('en'));
		expect(en('clove', 1, '1')).toBe('1 clove');
		expect(en('clove', 2, '2')).toBe('2 cloves');
		const fr = unitLabeler('fr', translator('fr'));
		expect(fr('clove', 1, '1')).toBe('1 gousse');
		expect(fr('clove', 1.5, '1,5')).toBe('1,5 gousse');
		expect(fr('clove', 3, '3')).toBe('3 gousses');
	});

	it('follows the three-way Russian agreement', () => {
		const ru = unitLabeler('ru', translator('ru'));
		expect(ru('clove', 1, '1')).toBe('1 зубчик');
		expect(ru('clove', 3, '3')).toBe('3 зубчика');
		expect(ru('clove', 5, '5')).toBe('5 зубчиков');
	});

	it('serves a language with no plural forms from one string', () => {
		const zh = unitLabeler('zh', translator('zh'));
		expect(zh('clove', 1, '1')).toBe('1瓣');
		expect(zh('clove', 4, '4')).toBe('4瓣');
	});

	it('returns null for a unit with no label, so the caller falls back to a count', () => {
		expect(unitLabeler('fr', translator('fr'))('strand', 2, '2')).toBeNull();
	});

	it('has a label for every unit in every language', () => {
		const units = ['pinch', 'dash', 'clove', 'slice', 'sprig', 'can', 'packet', 'jar', 'bottle', 'bag', 'box', 'bunch', 'stick', 'handful'];
		for (const lang of Object.keys(BUNDLES) as Lang[]) {
			const label = unitLabeler(lang, translator(lang));
			for (const unit of units) {
				const text = label(unit, 2, '2');
				expect(text, `${lang} ${unit}`).toMatch(/2/);
				expect(text, `${lang} ${unit}`).not.toContain('{n}');
			}
		}
	});
});
