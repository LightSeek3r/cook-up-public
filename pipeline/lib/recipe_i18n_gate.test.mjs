import { describe, it, expect } from 'vitest';
import { commonEnglishWords, englishLeftovers, LEGACY_INSTRUCTION_RULES, mixedScriptWord, validateInstructions, validateTitle } from './recipe_i18n_gate.mjs';

const rules = (issues) => issues.map((i) => i.rule);

// Document frequencies as vocabFor builds them: English recipes, and the
// target language's translated instructions.
const EN = new Map(
	Object.entries({ chicken: 300, soup: 120, with: 900, and: 1200, pie: 60, mushroom: 45, sauce: 600, garlic: 500, rhubarb: 8, tiramisu: 2, goulash: 1, lassi: 6, test: 25, recipe: 30, in: 3000, olive: 390, cake: 200, sauté: 150, de: 49, pan: 1172, cola: 30, barbecue: 45, marshmallow: 25, pot: 200, fit: 30, kibbeh: 6, dosa: 5, kunun: 5, pad: 25, thai: 30, muerto: 2, lemon: 390, bread: 300, rice: 400, marinate: 300 })
);
const TARGET = {
	fr: new Map(Object.entries({ poulet: 280, soupe: 110, sauce: 590, ail: 480, avec: 800 })),
	es: new Map(Object.entries({ de: 3250, con: 900, arroz: 380, pollo: 290 })),
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
		// Shahmukhi against Arabic and Urdu: Arabic letters, Urdu function words; short Punjabi titles pass.
		expect(rules(title('pnb', 'Chicken Soup with Garlic', 'شوربة الدجاج بالثوم'))).toEqual(['target-script']);
		expect(rules(title('pnb', 'Chicken Curry', 'مرغی کا سالن'))).toEqual(['target-script']);
		expect(title('pnb', 'Breaded Fried Oysters', 'چورا لا کے تلے ہوئے اویسٹر')).toEqual([]);
		expect(title('pnb', 'Key Lime Meringue Pie', 'کی لائم (ہرے نمبو) دی میرنگ پائی')).toEqual([]);
		expect(title('pnb', 'Barbecue Sauce I', 'باربی کیو ساس I')).toEqual([]);
		expect(title('pnb', 'Paella Valenciana', 'ویلنسیا دا پائیا')).toEqual([]);
		expect(title('ja', 'Zhoug III', 'ズーグ III')).toEqual([]);
		expect(title('ko', 'Cola III', '콜라 III')).toEqual([]);
		expect(rules(title('ja', 'Zhoug III', 'Zhoug III ズ'))).toEqual(['target-script']);
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

describe('mixed-script-word', () => {
	// Escapes, not typed glyphs: a look-alike letter is invisible in a test string too.
	const BANANA = 'Бананов\u006F-грушевый кекс';

	it('rejects a word whose letters come from two scripts, naming the word and the stray letter', () => {
		expect(mixedScriptWord('title', BANANA)).toBe('title word "Банановo" mixes Latin and Cyrillic letters ("o" U+006F)');
		expect(title('ru', 'Banana Pear Cake', BANANA).find((i) => i.rule === 'mixed-script-word')?.message).toMatch(/"o" U\+006F/);
		expect(rules(title('pt', 'Chicken Soup', 'Sop\u0430 de frango'))).toContain('mixed-script-word');
		expect(mixedScriptWord('title', 'ডিমDNA')).toMatch(/mixes Bengali and Latin letters/);
		expect(mixedScriptWord('title', 'حساءchicken')).toMatch(/mixes Arabic and Latin letters/);
		expect(mixedScriptWord('title', 'ΣalatΑ')).toMatch(/Greek and Latin|Latin and Greek/);
	});

	it('lets brands, units and acronyms stand as their own words, and Latin next to Han or kana', () => {
		for (const ok of ['Coca-Cola Cake', 'iPhone pH PSI 180 °C', 'Pâté en croûte', 'DNA পরীক্ষা', 'BBQ সস', 'pH मान', '닭고기 수프 BBQ', '2cmの角切り', 'BBQソース', 'pHを測る', 'BBQ酱', 'कॉफ़ी', 'پنجابی دا ساگ']) {
			expect(mixedScriptWord('title', ok), ok).toBeNull();
		}
		// Korean particles attach to units and abbreviations, not to English words.
		for (const ok of ['350°F로 예열', '5cm의 두께', '200g을 넣는다', 'PSI에서', 'X자로 자른다']) expect(mixedScriptWord('instructions', ok), ok).toBeNull();
		for (const bad of ['juicer에서 짠다', '번dt']) expect(mixedScriptWord('instructions', bad), bad).toMatch(/Latin and Hangul|Hangul and Latin/);
		expect(title('ja', 'BBQ Sauce', 'BBQソース')).toEqual([]);
		expect(title('bn', 'BBQ Chicken', 'BBQ মুরগি')).toEqual([]);
	});

	it('applies to instructions, and makes an imported row pending', () => {
		const en = '1. Mix the flour and the sugar.';
		expect(rules(validateInstructions({ lang: 'ru', source: en, text: '1. Смешайте муку и сахар.' }))).toEqual([]);
		expect(rules(validateInstructions({ lang: 'ru', source: en, text: '1. Смешайте муку и с\u0061хар.' }))).toContain('mixed-script-word');
		expect(LEGACY_INSTRUCTION_RULES.has('mixed-script-word')).toBe(true);
	});
});

describe('loanwords (recipe_i18n_loanwords.json) and short sources', () => {
	it('lets the words a language writes like English through, alone or as a listed phrase', () => {
		expect(title('it', 'Olive Bread', 'Pane alle olive')).toEqual([]);
		expect(title('it', 'Marinated Green Olives', 'Olive verdi marinate')).toEqual([]);
		expect(title('fr', 'Sautéed Mushrooms', 'Champignons sautés')).toEqual([]);
		expect(title('fr', 'Lemon Cake', 'Cake au citron')).toEqual([]);
		expect(title('fr', 'Pot-au-feu', 'Pot-au-feu')).toEqual([]);
		expect(title('pt', 'Barbecue Chicken Wings', 'Asas de frango barbecue')).toEqual([]);
		expect(title('pt', 'Marshmallow Squares', 'Quadradinhos de marshmallow')).toEqual([]);
		expect(title('pt', 'Coq au Vin', 'Coq au Vin')).toEqual([]);
		expect(title('pt', 'Pico de Gallo', 'Pico de gallo')).toEqual([]);
		expect(title('pt', 'Pad Thai', 'Pad Thai')).toEqual([]);
		expect(title('es', 'Pan de Muerto', 'Pan de Muerto')).toEqual([]);
		expect(title('es', 'Kibbeh', 'Kibbeh')).toEqual([]);
		expect(title('es', 'Masala Dosa', 'Masala dosa')).toEqual([]);
		expect(title('es', 'Kunun', 'Kunun')).toEqual([]);
		expect(title('es', 'Cola Cake', 'Pastel de cola')).toEqual([]);
	});

	it('a word the language uses about as often as English does never counts as English', () => {
		expect(title('fr', 'Sauce Béarnaise', 'Sauce Béarnaise')).toEqual([]);
		expect(title('es', 'Chicken with Rice', 'Pollo con arroz')).toEqual([]);
	});

	it('stays strict for untranslated English, and a phrase exempts its words only together', () => {
		expect(rules(title('es', 'Chicken with Rice', 'Chicken con arroz'))).toEqual(['english-leftover']);
		expect(rules(title('it', 'Lemon Cake', 'Cake al limone'))).toEqual(['english-leftover']);
		expect(rules(title('it', 'Lemon Cake', 'Lemon Cake'))).toEqual(['identical-to-source']);
		expect(rules(title('pt', 'Pot Roast', 'Pot assado'))).toEqual(['english-leftover']);
		expect(rules(title('fr', 'Chicken and Rice', 'Chicken and Rice'))).toEqual(['identical-to-source']);
	});

	it('allows a bracketed gloss after a very short English title', () => {
		expect(title('ja', 'Pho', 'フォー（ベトナムの牛肉麺スープ）')).toEqual([]);
		expect(title('fr', 'Dosa', 'Dosa (crêpe indienne au riz et lentilles)')).toEqual([]);
		expect(rules(title('fr', 'Dosa', `Dosa (${'crêpe '.repeat(8).trim()})`))).toContain('length');
		expect(rules(title('ja', 'Chicken Soup with Rice', `チキンスープ（${'とても美味しい'.repeat(6)}）`))).toContain('length');
	});
});

describe('reviewers\' reports (2026-10-14): genuine words and kept names pass, even when every word is common English', () => {
	// The worst case: every word common in English recipes, none in the language's own.
	const COMMON = new Map(
		`do in alla all pan double fit pad thai chipotle chiles has bit purée yoghurt long island sticky toffee pudding dip vegan non than
		soda cream wrap steak tartar tartare fairy cakes bubble and squeak space cake south side white russian cocktail iced tea fizz
		chicken with the olive pasta cola`
			.split(/\s+/)
			.map((w) => [w, 100])
	);
	const strict = (lang, source, t, extra = {}) => validateTitle({ lang, source, title: t, vocab: { en: COMMON, target: new Map() }, ...extra });

	it('words of a foreign name the source quotes', () => {
		expect(strict('pt', 'Salt Cod and Potato Casserole (Bacalhau à Zé do Pipo)', 'Bacalhau à Zé do Pipo')).toEqual([]);
		expect(strict('it', 'Agnolotti Pasta Soup (Agnolotti in Brodo)', 'Agnolotti in brodo')).toEqual([]);
		expect(strict('es', 'Tomato Paste and Ham Sandwiches (Pan Tomaca)', 'Bocadillos de tomate y jamón (Pan Tomaca)')).toEqual([]);
		expect(strict('fr', 'Hyderabadi Fried Bread with Syrup and Nuts (Double ka meetha)', 'Pain frit d’Hyderabad au sirop (Double ka meetha)')).toEqual([]);
		expect(strict('it', "Fresh Egg Pasta (Pasta Fresca All'uovo)", "Pasta fresca all'uovo")).toEqual([]);
	});

	it('listed words and phrases, per language or shared', () => {
		expect(strict('es', 'Pad Thai', 'Pad Thai')).toEqual([]);
		expect(strict('fr', 'Fit-fit (Ethiopian Bread Salad)', 'Fit-fit (salade de pain éthiopienne)')).toEqual([]);
		expect(strict('de', 'Guacamole Dip', 'Guacamole-Dip')).toEqual([]);
		expect(strict('de', 'Macaroni and Cheese (Vegan)', 'Makkaroni mit Käse (vegan)')).toEqual([]);
		expect(strict('jv', 'Pork Tenderloin with Asparagus and Prosciutto', 'Daging Has Babi karo Asparagus lan Prosciutto')).toEqual([]);
		expect(strict('vi', 'Placenta Stew', 'Nhau thai hầm')).toEqual([]);
		expect(strict('vi', 'Charcoal Steak', 'Bít tết nướng than')).toEqual([]);
		expect(strict('pt', 'Egg Soda', 'Soda de ovo')).toEqual([]);
		expect(strict('es', 'Turkey Wrap', 'Wrap de pavo')).toEqual([]);
		expect(strict('es', 'Steak Tartare', 'Steak tartar')).toEqual([]);
		expect(strict('de', 'Bubble and Squeak', 'Bubble and Squeak')).toEqual([]);
		expect(strict('fr', 'Space Cake', 'Space Cake')).toEqual([]);
		expect(strict('es', 'White Russian Cocktail', 'White Russian Cocktail')).toEqual([]);
		expect(strict('es', 'Sticky Toffee Pudding (with dates)', 'Sticky toffee pudding (con dátiles)')).toEqual([]);
	});

	it('a reviewer\'s keep_source covers an exact English copy in Vietnamese too', () => {
		expect(rules(strict('vi', 'Long Island Iced Tea Cocktail', 'Long Island Iced Tea Cocktail'))).toEqual([]);
		expect(rules(strict('vi', 'White Russian Cream Cocktail', 'White Russian Cream Cocktail'))).toEqual(['identical-to-source']);
		expect(strict('vi', 'White Russian Cream Cocktail', 'White Russian Cream Cocktail', { keep: 'cocktail name, written so in Vietnam' })).toEqual([]);
	});

	it('still refuses plain untranslated English', () => {
		expect(rules(strict('es', 'Chicken with Olive', 'Chicken with olive'))).toEqual(['english-leftover']);
		expect(rules(strict('it', 'Cream Cake', 'Cream cake'))).toEqual(['english-leftover']);
		expect(rules(strict('fr', 'Chicken Tikka', 'Chicken tikka'))).toEqual(['english-leftover']);
		expect(rules(strict('de', 'Long Cake', 'Long Cake'))).toEqual(['identical-to-source']);
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
			['copied-from-english', 'empty', 'foreign-script', 'length-ratio', 'line-count', 'literal-backslash-n', 'mixed-script-word', 'target-script'].sort()
		);
	});
});
