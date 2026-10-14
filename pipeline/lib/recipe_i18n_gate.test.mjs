import { describe, it, expect } from 'vitest';
import { commonEnglishWords, englishLeftovers, LEGACY_INSTRUCTION_RULES, validateInstructions, validateTitle } from './recipe_i18n_gate.mjs';

const rules = (issues) => issues.map((i) => i.rule);

// Document frequencies as vocabFor builds them: English recipes, and the
// target language's translated instructions.
const EN = new Map(
	Object.entries({ chicken: 300, soup: 120, with: 900, and: 1200, pie: 60, mushroom: 45, sauce: 600, garlic: 500, rhubarb: 8, tiramisu: 2, goulash: 1, lassi: 6, test: 25, recipe: 30, in: 3000 })
);
const TARGET = {
	fr: new Map(Object.entries({ poulet: 280, soupe: 110, sauce: 590, ail: 480, avec: 800 })),
	de: new Map(Object.entries({ hähnchen: 250, suppe: 100, sauce: 300, knoblauch: 470, in: 3100, mit: 900 })),
	vi: new Map(Object.entries({ gà: 280, chicken: 90, súp: 90 }))
};
const vocab = (lang) => ({ en: EN, target: TARGET[lang] ?? new Map() });
const title = (lang, source, t, extra = {}) => validateTitle({ lang, source, title: t, vocab: vocab(lang), ...extra });

describe('validateTitle: shape', () => {
	it('accepts natural translations', () => {
		expect(title('fr', 'Chicken Soup', 'Soupe au poulet')).toEqual([]);
		expect(title('de', 'Chicken Soup with Garlic', 'Hähnchensuppe mit Knoblauch')).toEqual([]);
		expect(title('zh', 'Chicken Soup', '鸡汤')).toEqual([]);
		expect(title('ja', 'Chicken Soup', '鶏肉スープ')).toEqual([]);
		expect(title('ja', 'Smoked Fish', '燻製魚')).toEqual([]);
		expect(title('ko', 'Chicken Soup', '닭고기 수프')).toEqual([]);
		expect(title('ru', 'Chicken Soup', 'Куриный суп')).toEqual([]);
		expect(title('hi', 'Chicken Soup', 'चिकन सूप')).toEqual([]);
		expect(title('bn', 'Chicken Soup', 'মুরগির স্যুপ')).toEqual([]);
		expect(title('ar', 'Chicken Soup', 'حساء الدجاج')).toEqual([]);
		expect(title('pnb', 'Chicken Soup', 'مرغی دا سوپ')).toEqual([]);
		expect(title('vi', 'Chicken Soup', 'Súp gà')).toEqual([]);
		expect(title('jv', 'Chicken Soup', 'Sop pitik')).toEqual([]);
	});

	it('rejects empty, markup, line breaks, backslashes and stray spaces', () => {
		expect(rules(title('fr', 'Chicken Soup', ''))).toEqual(['empty']);
		expect(rules(title('fr', 'Chicken Soup', 42))).toEqual(['empty']);
		for (const bad of ['Soupe <b>au</b> poulet', 'Soupe\nau poulet', 'Soupe au **poulet**', '\\"Soupe\\" au poulet', ' Soupe au poulet', 'Soupe  au poulet']) {
			expect(rules(title('fr', 'Chicken Soup', bad)), bad).toContain('markup');
		}
		expect(rules(title('fr', 'Chicken Soup', 'Soupe\\nau poulet'))).toContain('literal-backslash-n');
	});

	it('bounds the length against the English title, looser for CJK', () => {
		expect(rules(title('fr', 'Baked Chicken with Onions, Sumac and Allspice (Musakhan)', 'Poulet'))).toContain('length');
		expect(rules(title('fr', 'Pho', 'Soupe vietnamienne de nouilles au bœuf'))).toEqual([]);
		expect(rules(title('fr', 'Soup', 'S'.repeat(80)))).toContain('length');
		expect(title('zh', 'Baked Chicken with Onions and Allspice', '洋葱多香果烤鸡')).toEqual([]);
		expect(rules(title('zh', 'Baked Chicken with Onions and Allspice', '鸡'))).toContain('length');
		expect(rules(title('fr', 'Soup', 'Soupe '.repeat(30).trim()))).toContain('length');
	});

	it('keeps digits and variant numerals exactly', () => {
		expect(title('fr', '5-Minute Chicken Soup', 'Soupe au poulet en 5 minutes')).toEqual([]);
		expect(rules(title('fr', '5-Minute Chicken Soup', 'Soupe au poulet en cinq minutes'))).toContain('digit-mismatch');
		expect(rules(title('fr', 'Chicken Soup', 'Soupe au poulet 2'))).toContain('digit-mismatch');
		expect(rules(title('ar', '5-Minute Chicken Soup', 'حساء الدجاج في ٥ دقائق'))).toEqual(expect.arrayContaining(['digits', 'digit-mismatch']));
		expect(title('fr', 'Chicken Soup II', 'Soupe au poulet II')).toEqual([]);
		expect(rules(title('fr', 'Chicken Soup II', 'Soupe au poulet'))).toContain('variant-numeral');
		expect(title('zh', 'Pesto I', '青酱 I')).toEqual([]);
		expect(rules(title('zh', 'Pesto I', '青酱'))).toContain('variant-numeral');
		// "I" counts only as the last word: the English pronoun is not a variant.
		expect(title('fr', 'I Love Chicken Soup', "La soupe au poulet que j'adore")).toEqual([]);
	});
});

describe('validateTitle: script and English', () => {
	it('demands the target script for non-Latin languages', () => {
		expect(rules(title('zh', 'Atkins-Friendly Mock Tiramisu', 'Creamed Potatoes'))).toEqual(['target-script']);
		expect(rules(title('zh', 'Chicken Soup', 'チキンスープ'))).toEqual(['target-script']);
		expect(rules(title('hi', 'Chicken Soup', 'মুরগির স্যুপ'))).toEqual(['target-script']);
		expect(rules(title('bn', 'Chicken Soup', 'चिकन सूप'))).toEqual(['target-script']);
		expect(rules(title('ar', 'Chicken Karahi', 'چکن کڑاہی'))).toEqual(['target-script']);
		expect(rules(title('pnb', 'Chicken Soup with Garlic and Onions', 'حساء الدجاج مع الثوم والبصل'))).toEqual(['target-script']);
		expect(title('zh', 'BLT Sandwich', 'BLT三明治')).toEqual([]);
	});

	it('refuses a non-Latin title identical to English unless a reviewer kept it', () => {
		expect(rules(title('ja', 'Chicken Soup', 'Chicken Soup'))).toEqual(['identical-to-source']);
		expect(title('ja', 'M&M Cookies', 'M&M Cookies', { keep: 'brand name, written so on Japanese packs' })).toEqual([]);
	});

	it('refuses English left in a Latin-script title, wherever it comes from', () => {
		expect(rules(title('fr', 'Chicken Soup', 'Chicken soupe'))).toEqual(['english-leftover']);
		expect(rules(title('fr', 'Chicken Soup', 'Soupe with poulet'))).toEqual(['english-leftover']);
		// An English title of another dish shares no word with the source.
		expect(rules(title('vi', 'Nutty Brownie Bars', 'Test Recipe'))).toEqual(['english-leftover']);
		expect(rules(title('de', 'Mushroom Risotto', 'Mushroom-Risotto'))).toEqual(['english-leftover']);
		// The target language uses the word itself (its instructions do, as often as English).
		expect(title('fr', 'Garlic Sauce', 'Sauce à l’ail')).toEqual([]);
		expect(title('de', 'Chicken in Sauce', 'Hähnchen in Sauce')).toEqual([]);
		// Rare in English (a dish name or proper noun) or a loanword: kept as it is.
		expect(title('de', 'Mango Lassi', 'Mango-Lassi')).toEqual([]);
		expect(title('fr', 'Chicken Curry', 'Curry de poulet')).toEqual([]);
	});

	it('lets a Latin-script title equal English only when it is a proper noun or loanword', () => {
		expect(title('fr', 'Tiramisu', 'Tiramisu')).toEqual([]);
		expect(title('it', 'Goulash', 'Goulash')).toEqual([]);
		expect(rules(title('fr', 'Rhubarb Pie', 'Rhubarb Pie'))).toEqual(['identical-to-source']);
		expect(rules(title('fr', 'Chicken Soup', 'Chicken Soup'))).toEqual(['identical-to-source']);
		expect(title('fr', 'Rhubarb Pie', 'Rhubarb Pie', { keep: 'named dish' })).toEqual([]);
	});

	it('knows Vietnamese by its diacritics and Latin letters only for Latin languages', () => {
		expect(rules(title('vi', 'Out of Salad Dressing', 'Out of Salad Dressing'))).toContain('target-script');
		expect(rules(title('fr', 'Chicken Soup', 'Soupe au poulet с чесноком'))).toContain('target-script');
		expect(rules(title('pt', 'Chicken Soup', 'Sop\u0430 de frango'))).toContain('target-script');
	});

	it('flags a non-Latin title copied from two other languages, or a Shahmukhi title copied from Arabic', () => {
		expect(rules(title('ko', 'Chicken Soup', '鸡汤', { others: { zh: '鸡汤', ja: '鸡汤' } }))).toContain('copied-from-language');
		expect(title('ja', 'Mapo Tofu', '麻婆豆腐', { others: { zh: '麻婆豆腐' } })).toEqual([]);
		expect(rules(title('pnb', 'Chicken Soup', 'حساء الدجاج', { others: { ar: 'حساء الدجاج' } }))).toEqual(
			expect.arrayContaining(['copied-from-language'])
		);
	});
});

describe('englishLeftovers and commonEnglishWords', () => {
	it('uses a stricter share for the languages whose instructions kept English words', () => {
		// vi instructions hold "chicken" 90 times against 300 in English: under the 0.6 share.
		expect(englishLeftovers('vi', 'Chicken Soup', 'Súp chicken', vocab('vi'))).toEqual(['chicken']);
		expect(englishLeftovers('fr', 'Chicken Soup', 'Soupe au poulet', vocab('fr'))).toEqual([]);
	});

	it('lists the common English words of a title kept as in English', () => {
		expect(commonEnglishWords('fr', 'Rhubarb and Mushroom Pie II', vocab('fr'))).toEqual(['rhubarb', 'and', 'mushroom', 'pie']);
		expect(commonEnglishWords('fr', 'Pizza Margherita', vocab('fr'))).toEqual([]);
	});
});

describe('validateInstructions', () => {
	const EN_TEXT = '1. Preheat the oven to 180 °C (350 °F).\n2. Mix 1.5 cups of flour with 2 eggs.\n3. Bake for 25 minutes.';
	const FR_TEXT = '1. Préchauffez le four à 180 °C (350 °F).\n2. Mélangez 1,5 tasse de farine avec 2 œufs.\n3. Faites cuire 25 minutes.';
	const check = (lang, text, others) => rules(validateInstructions({ lang, source: EN_TEXT, text, others }));

	it('accepts a faithful translation', () => {
		expect(check('fr', FR_TEXT)).toEqual([]);
		expect(check('zh', '1. 将烤箱预热至 180 °C (350 °F)。\n2. 将 1.5 杯面粉与 2 个鸡蛋混合。\n3. 烘烤 25 分钟。')).toEqual([]);
	});

	it('enforces lines, script, copies and length', () => {
		expect(check('fr', '1. Préchauffez le four à 180 °C (350 °F). Mélangez 1,5 tasse de farine avec 2 œufs.\n3. Faites cuire 25 minutes.')).toContain('line-count');
		expect(check('fr', EN_TEXT)).toContain('copied-from-english');
		expect(check('zh', EN_TEXT)).toContain('copied-from-english');
		expect(check('hi', FR_TEXT)).toContain('target-script');
		expect(check('fr', '1. a\n2. b\n3. c')).toContain('length-ratio');
		expect(check('fr', FR_TEXT.replace('\n', '\\n'))).toContain('literal-backslash-n');
		expect(check('fr', FR_TEXT, { de: FR_TEXT })).toContain('copied-from-language');
	});

	it('enforces numbers, decimal separators, English units and foreign letters', () => {
		expect(check('fr', FR_TEXT.replace('25', '20'))).toContain('digit-mismatch');
		expect(check('fr', FR_TEXT.replace('1,5', '1.5'))).toContain('decimal-separator');
		expect(check('hi', '1. ओवन को 180 °C (350 °F) पर गरम करें।\n2. 1,5 कप आटा 2 अंडों के साथ मिलाएँ।\n3. 25 मिनट तक बेक करें।')).toContain('decimal-separator');
		expect(check('ar', '1. سخّن الفرن إلى ١٨٠ °C (350 °F).\n2. اخلط 1.5 كوب دقيق مع 2 بيض.\n3. اخبز 25 دقيقة.')).toContain('digits');
		expect(check('fr', FR_TEXT.replace('tasse', 'cups'))).toContain('english-leftover');
		expect(check('pt', '1. Pré-aqueça o forno \u0430 180 °C (350 °F).\n2. Misture 1,5 xícara de farinha com 2 ovos.\n3. Asse por 25 minutos.')).toContain('foreign-script');
		expect(check('fr', FR_TEXT.replace('Faites', '<b>Faites</b>'))).toContain('markup');
	});

	it('holds imported rows to the rules they were accepted under, plus foreign letters', () => {
		expect([...LEGACY_INSTRUCTION_RULES].sort()).toEqual(
			['copied-from-english', 'empty', 'foreign-script', 'length-ratio', 'line-count', 'literal-backslash-n', 'target-script'].sort()
		);
	});
});
