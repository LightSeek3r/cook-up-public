/**
 * Imperial -> metric inside recipe prose, for display only.
 *
 * The recipes come from US and UK sources, and the translators were told never to
 * convert a unit (a number must survive a translation digit for digit), so a French
 * reader gets "1 1/2 gallon américain d'eau" and "350 °F". The structured ingredient
 * rows are converted by `measure.ts`; this is the same job for the free text of the
 * method, in every language the site ships.
 *
 * What it converts: gallon, quart, pint, fl oz, cup, ounce, pound, inch, °F.
 * What it leaves alone, on purpose:
 *  - tablespoons and teaspoons — a measuring spoon is a spoon in every country, and
 *    "1 cuillère à soupe" is what a French cook expects, not "15 ml";
 *  - anything that already carries a metric figure beside it ("350 °F (175 °C)",
 *    "20 cm (9-inch)"): the source gave both, rewriting would only add noise;
 *  - a number the pattern cannot account for (the second half of a range it did not
 *    parse): half a converted range is worse than none.
 */

import type { Lang } from '$lib/config';

type Canon = 'impgallon' | 'gallon' | 'quart' | 'pint' | 'cup' | 'floz' | 'oz' | 'lb' | 'inch';

type LangSpec = {
	/** Regex fragments (case-insensitive, unicode) for each unit's wording. */
	words: Partial<Record<Canon, string>>;
	/** Output unit words. */
	out: { ml: string; l: string; cm: string; mm: string; g: string; kg: string };
	/** Decimal comma (es fr de pt it ru vi jv), as the translation rules require. */
	comma?: boolean;
	/** Chinese, Japanese and Korean glue particles straight onto the unit: no word boundary after it. */
	cjk?: boolean;
	/** A figure can follow a prefixed conjunction without a space (Arabic "و1 كوب"). */
	looseLead?: boolean;
	/** "9-дюймовой форме": the unit as an adjective agreeing with its noun; null when the word is not one. */
	adjectival?: (word: string, mm: boolean) => string | null;
	/** No space between figure and unit ("570毫升"). */
	tight?: boolean;
	/** Case endings glued onto a unit word, carried over to the replacement (Bengali). */
	suffix?: string;
	/** "a gallon" / "un gallon": annotated rather than replaced, to keep the grammar. */
	articles?: string;
	/** Also annotate "a quart" (safe only where the word cannot mean a quarter). */
	articleQuart?: boolean;
};

const LATIN_OUT = { ml: 'ml', l: 'l', cm: 'cm', mm: 'mm', g: 'g', kg: 'kg' };

const SPECS: Record<Lang, LangSpec> = {
	en: {
		words: {
			impgallon: String.raw`imperial\s+gallons?`,
			gallon: String.raw`(?:u\.?s\.?\s+)?gallons?`,
			quart: String.raw`quarts?|qts?\.?`,
			pint: String.raw`pints?|pts?\.?`,
			cup: String.raw`cups?`,
			floz: String.raw`fl\.?\s*oz\.?|fluid\s+ounces?`,
			oz: String.raw`ounces?|oz\.?`,
			lb: String.raw`pounds?|lbs?\.?`,
			inch: String.raw`inch(?:es)?`
		},
		out: LATIN_OUT,
		articles: 'a|an|one',
		articleQuart: true
	},
	fr: {
		words: {
			impgallon: String.raw`gallons?\s+imp[ée]ri\w+`,
			gallon: String.raw`gallons?(?:\s+(?:am[ée]ricains?|us))?`,
			quart: String.raw`quarts?(?:\s+am[ée]ricains?)?(?!\s+d(?:e\s+|['’])\s*(?:litre|heure|tasse|cuill|gallon|pouce|tour|kilo|livre))`,
			pint: String.raw`pintes?`,
			cup: String.raw`tasses?`,
			floz: String.raw`onces?\s+liquides?`,
			oz: String.raw`onces?|oz`,
			lb: String.raw`livres?|lbs?`,
			inch: String.raw`pouces?`
		},
		out: LATIN_OUT,
		comma: true,
		articles: 'une?'
	},
	de: {
		words: {
			gallon: String.raw`(?:us-)?gallonen?`,
			quart: String.raw`quarts?`,
			pint: String.raw`pints?`,
			cup: String.raw`tassen?`,
			floz: String.raw`fl\.?\s*oz\.?|fl[üu]ssigunzen?`,
			oz: String.raw`unzen?|oz\.?`,
			lb: String.raw`pfund|lbs?\.?`,
			inch: String.raw`zoll`
		},
		out: LATIN_OUT,
		comma: true,
		articles: 'ein(?:e|en|em|er)?'
	},
	es: {
		words: {
			gallon: String.raw`gal[oó]n(?:es)?`,
			quart: String.raw`cuartos?(?:\s+de\s+gal[oó]n)?(?!\s+de\s+(?:hora|litro|taza|kilo|libra|pulgada))`,
			pint: String.raw`pintas?`,
			cup: String.raw`tazas?`,
			floz: String.raw`onzas?\s+l[ií]quidas?`,
			oz: String.raw`onzas?|oz`,
			lb: String.raw`libras?|lbs?`,
			inch: String.raw`pulgadas?`
		},
		out: LATIN_OUT,
		comma: true,
		articles: 'una?'
	},
	it: {
		words: {
			gallon: String.raw`gallon[ei]|galloni`,
			quart: String.raw`quart[oi]?(?:\s+di\s+gallone)?(?!\s+d(?:i\s+|['’])\s*(?:ora|litro|tazza|chilo|libbra|pollice))`,
			pint: String.raw`pinte?`,
			cup: String.raw`tazz[ae]`,
			floz: String.raw`once\s+liquide|oncia\s+liquida`,
			oz: String.raw`once|oncia|oz`,
			lb: String.raw`libbre|libbra|lbs?`,
			inch: String.raw`pollici|pollice`
		},
		out: LATIN_OUT,
		comma: true,
		articles: 'un|una|uno'
	},
	pt: {
		words: {
			gallon: String.raw`gal[ãõ](?:es|o)?`,
			quart: String.raw`quartos?(?!\s+de\s+(?:hora|litro|x[ií]cara|quilo|libra|polegada))`,
			pint: String.raw`pintas?`,
			cup: String.raw`x[ií]caras?`,
			floz: String.raw`on[çc]as?\s+l[ií]quidas?`,
			oz: String.raw`on[çc]as?|oz`,
			lb: String.raw`libras?|lbs?`,
			inch: String.raw`polegadas?`
		},
		out: LATIN_OUT,
		comma: true,
		articles: 'uma?'
	},
	ru: {
		words: {
			gallon: String.raw`галлон(?:а|ов|у|е)?`,
			quart: String.raw`кварт(?:а|ы|у|е|ами|ах)?`,
			pint: String.raw`пинт(?:а|ы|у|е|ами|ах)?`,
			cup: String.raw`стакан(?:а|ов|ами|ом|ах|ам|у|е)?`,
			floz: String.raw`жидк\p{L}*\s+унци\p{L}*`,
			oz: String.raw`унци(?:я|и|й|ю|ей)`,
			lb: String.raw`фунт(?:а|ов|у|е)?`,
			inch: String.raw`дюйм(?:а|ов|у|е|ами|ах)?|дюймов(?:ой|ую|ый|ая|ое|ого|ом|ые|ых|ыми)`
		},
		adjectival: (word, mm) => {
			const ending = word.match(/^дюймов(\p{L}+)$/iu)?.[1];
			return ending ? `${mm ? 'миллиметров' : 'сантиметров'}${ending}` : null;
		},
		out: { ml: 'мл', l: 'л', cm: 'см', mm: 'мм', g: 'г', kg: 'кг' },
		comma: true
	},
	vi: {
		words: {
			gallon: String.raw`gallon|ga-lông|galông`,
			quart: String.raw`quart|qt\.?`,
			pint: String.raw`pint|pt\.?`,
			cup: String.raw`cốc`,
			floz: String.raw`fl\.?\s*oz\.?`,
			oz: String.raw`ounce|oz\.?|ao-?xơ`,
			lb: String.raw`pound|lb\.?|cân\s+anh`,
			inch: String.raw`inch(?:es)?|in\.?`
		},
		out: { ...LATIN_OUT, l: 'lít' },
		comma: true
	},
	jv: {
		words: {
			gallon: String.raw`galon`,
			quart: String.raw`qt\.?|kuart`,
			pint: String.raw`pint`,
			cup: String.raw`cangkir|gelas`,
			oz: String.raw`oz\.?|ons`,
			lb: String.raw`pon|lb\.?`,
			inch: String.raw`inci|inchi`
		},
		out: { ...LATIN_OUT, l: 'liter' },
		comma: true
	},
	zh: {
		words: {
			gallon: '加仑',
			quart: '夸脱',
			pint: '品脱',
			cup: '杯',
			floz: '液量盎司',
			oz: '盎司',
			lb: '磅',
			inch: '英寸'
		},
		out: { ml: '毫升', l: '升', cm: '厘米', mm: '毫米', g: '克', kg: '千克' },
		cjk: true,
		tight: true
	},
	ja: {
		words: {
			gallon: 'ガロン',
			quart: 'クォート',
			pint: 'パイント',
			cup: 'カップ',
			floz: '液量オンス',
			oz: 'オンス',
			lb: 'ポンド',
			inch: 'インチ'
		},
		out: { ml: 'ml', l: 'L', cm: 'cm', mm: 'mm', g: 'g', kg: 'kg' },
		cjk: true,
		tight: true
	},
	ko: {
		words: {
			gallon: '갤런',
			quart: '쿼트',
			pint: '파인트',
			cup: '컵',
			floz: '액량\\s*온스',
			oz: '온스',
			lb: '파운드',
			inch: '인치'
		},
		out: LATIN_OUT,
		cjk: true
	},
	ar: {
		looseLead: true,
		words: {
			gallon: 'غالون(?:ات)?',
			quart: 'كوارت',
			pint: 'باينت|بينت',
			cup: 'كوب(?:اً|ا)?|أكواب',
			oz: 'أونصة|أونصات|أونس',
			lb: 'رطل(?:اً|ا)?|أرطال|باوند',
			inch: 'بوصة|بوصات|إنش(?:ات)?'
		},
		out: { ml: 'مل', l: 'لتر', cm: 'سم', mm: 'مم', g: 'غرام', kg: 'كغ' }
	},
	hi: {
		words: {
			gallon: 'गैलन',
			quart: 'क्वार्ट',
			pint: 'पिंट',
			cup: 'कप',
			oz: 'औंस',
			lb: 'पाउंड',
			inch: 'इंच'
		},
		out: { ml: 'मिली', l: 'लीटर', cm: 'सेमी', mm: 'मिमी', g: 'ग्राम', kg: 'किग्रा' }
	},
	bn: {
		words: {
			gallon: 'গ্যালন',
			quart: 'কোয়ার্ট',
			pint: 'পাইন্ট',
			cup: 'কাপ',
			oz: 'আউন্স',
			lb: 'পাউন্ড',
			inch: 'ইঞ্চি'
		},
		out: { ml: 'মিলি', l: 'লিটার', cm: 'সেমি', mm: 'মিমি', g: 'গ্রাম', kg: 'কেজি' },
		suffix: 'ের|র|কে|য়'
	},
	pnb: {
		words: {
			gallon: 'گیلن',
			quart: 'کوارٹ',
			pint: 'پائنٹ',
			cup: 'کپ',
			oz: 'اونس',
			lb: 'پاؤنڈ',
			inch: 'انچ'
		},
		out: { ml: 'ملی لیٹر', l: 'لیٹر', cm: 'سینٹی میٹر', mm: 'ملی میٹر', g: 'گرام', kg: 'کلو' }
	}
};

const FRACTION: Record<string, number> = {
	'¼': 0.25,
	'½': 0.5,
	'¾': 0.75,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'⅛': 0.125,
	'⅜': 0.375,
	'⅝': 0.625,
	'⅞': 0.875
};

const NUM = String.raw`(?:\d+\s+\d+\s*[/⁄]\s*\d+|\d+\s*[/⁄]\s*\d+|\d+[.,]\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+|[¼½¾⅓⅔⅛⅜⅝⅞])`;
// "2 to 3 cups", "6 or 8 quarts": every number in the chain is in the unit that closes it.
const RANGE_WORDS = String.raw`(?<!\p{L})(?:to|or|bis|oder|à|ou|a|al|o|до|или)(?!\p{L})`;
const RANGE_SEP = String.raw`\s*(?:[-–—~〜～]|${RANGE_WORDS}|至|到|から|إلى|से|থেকে|توں)\s*`;
const NOT_INSIDE_NUMBER = String.raw`(?<![\d.,/⁄\p{L}])`;
// CJK text has no spaces, so the character before a figure is ordinarily a letter.
const NOT_INSIDE_NUMBER_CJK = String.raw`(?<![\d.,/⁄])`;
const RANGE_END_FRAGMENT = String.raw`[-–—~〜～]|${RANGE_WORDS}|至|到|から|إلى|से|থেকে|توں`;

/** A metric figure's unit, in any of the site's languages, to recognise "already has metric". */
const METRIC_UNIT = String.raw`(?:°\s?C|º\s?C|˚\s?C|℃|c\.?m\.?\b|mm\b|ml\b|cl\b|dl\b|kg\b|g\b|l\b|(?:milli|centi|deci|kilo)?(?:l[ií]t|gram|m[eè]tr)\p{L}*|мл|см|мм|(?<!\p{L})[гл](?!\p{L})|кг|литр\p{L}*|厘米|毫米|毫升|克|公斤|公升|مل|سم|مم|غرام|غ(?!\p{L})|كغ|كجم|لتر|मिली|सेमी|मिमी|ग्राम|लीटर|মিলি|সেমি|মিমি|গ্রাম|লিটার|ملی|سینٹی|گرام|لیٹر|キロ|ミリ|センチ|グラム|リットル)`;
const APPROX = String.raw`(?:about|approx\.?|approximately|~|≈|ca\.?|circa|environ|etwa|ungefähr|aprox\.?|aproximadamente|circa|около|约|約|大约|حوالي|लगभग|প্রায়|تقریباً|تقریبا)`;
const NUM_RANGE_X = String.raw`${NUM}(?:\s*[-–—~〜～]\s*${NUM})?(?:\s*[x×х]\s*${NUM})*`;

const METRIC_AFTER = new RegExp(
	String.raw`^\s*(?:[(（/]|${RANGE_WORDS}|或|あるいは|أو)\s*(?:${APPROX}\s*)?${NUM_RANGE_X}\s*${METRIC_UNIT}`,
	'iu'
);
const METRIC_BEFORE = new RegExp(
	String.raw`(?:${NUM}\s*${METRIC_UNIT})\s*(?:[(（/]|${RANGE_WORDS}|或|あるいは|أو)?\s*(?:${APPROX}\s*)?$`,
	'iu'
);
const RANGE_BEFORE = new RegExp(String.raw`(?:${NUM}|\d)\s*(?:${RANGE_END_FRAGMENT})\s*$`, 'iu');
const DIM_BEFORE = new RegExp(String.raw`${NUM}\s*[x×х]\s*$`, 'iu');
// "cook at a pressure of 5-6 pounds": a pressure, not a weight.
const PRESSURE_BEFORE = /(?:pressure|presión|pression|druck|pressione|pressão|давлени|压力|圧力|압력|ضغط|दबाव|চাপ|دباؤ|áp suất|tekanan)[^.]{0,6}$/iu;
// "15 pounds per square inch": the same.
const PRESSURE_AFTER = /^\s*(?:\p{L}+\s+)?(?:per\s+square|par\s+pouce|pro\s+quadrat|por\s+pulgada|per\s+pollice|لكل\s+بوصة|psi\b|de\s+pression|of\s+pressure)/iu;

type Compiled = {
	spec: LangSpec;
	canon: [Canon, RegExp][];
	general: RegExp;
	dims: RegExp;
	temp: RegExp;
	article: RegExp | null;
};

const cache = new Map<Lang, Compiled>();

function compile(lang: Lang): Compiled {
	const hit = cache.get(lang);
	if (hit) return hit;
	const spec = SPECS[lang];
	const order: Canon[] = ['impgallon', 'gallon', 'quart', 'pint', 'floz', 'cup', 'oz', 'lb', 'inch'];
	const present = order.filter((c) => spec.words[c]);
	const alternation = present.map((c) => `(?:${spec.words[c]})`).join('|');
	const lead = spec.cjk || spec.looseLead ? NOT_INSIDE_NUMBER_CJK : NOT_INSIDE_NUMBER;
	const tail = spec.cjk ? '' : String.raw`(?![\p{L}\p{M}])`;
	const suffix = spec.suffix ? `(?:${spec.suffix})?` : '';
	const inchWords = spec.words.inch ?? '(?!)';
	const compiled: Compiled = {
		spec,
		canon: present.map((c) => [c, new RegExp(`^(?:${spec.words[c]})$`, 'iu')]),
		general: new RegExp(
			`${lead}(${NUM})(?:${RANGE_SEP}(${NUM}))?\\s*-?\\s*(${alternation})(${suffix})${tail}`,
			'giu'
		),
		dims: new RegExp(
			`${lead}(${NUM})\\s*[x×х]\\s*(${NUM})(?:\\s*[x×х]\\s*(${NUM}))?\\s*-?\\s*(${inchWords})(${suffix})${tail}`,
			'giu'
		),
		temp: new RegExp(
			`${lead}(${NUM})(?:${RANGE_SEP}(${NUM}))?\\s*(?:[°º˚]\\s*F(?![A-Za-z])|℉|\\s+degrees?\\s+(?:F\\b|Fahrenheit))`,
			'giu'
		),
		article: spec.articles
			? new RegExp(
					`(?<![\\p{L}\\p{M}])(?:${spec.articles})\\s+(${[spec.words.gallon, spec.articleQuart ? spec.words.quart : null]
						.filter(Boolean)
						.map((w) => `(?:${w})`)
						.join('|')})${tail}`,
					'giu'
				)
			: null
	};
	cache.set(lang, compiled);
	return compiled;
}

function parseNumber(raw: string): number {
	const s = raw.trim();
	let m = s.match(/^(\d+)\s+(\d+)\s*[/⁄]\s*(\d+)$/);
	if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
	m = s.match(/^(\d+)\s*[/⁄]\s*(\d+)$/);
	if (m) return Number(m[1]) / Number(m[2]);
	m = s.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
	if (m) return Number(m[1]) + FRACTION[m[2]];
	if (s in FRACTION) return FRACTION[s];
	return Number(s.replace(',', '.'));
}

const nearest = (value: number, step: number) => Math.round(value / step) * step;

function volumeMl(canon: Canon): number {
	switch (canon) {
		case 'impgallon':
			return 4546.09;
		case 'gallon':
			return 3785.41;
		case 'quart':
			return 946.353;
		case 'pint':
			return 473.176;
		case 'cup':
			return 236.588;
		default:
			return 29.5735;
	}
}

/** What a cook measures with: 5 ml steps for a small amount, 10 ml up to a litre, then tenths of a litre. */
function tidyMl(ml: number): { value: number; litres: boolean } {
	if (ml < 250) return { value: Math.max(5, nearest(ml, 5)), litres: false };
	if (ml < 1000) return { value: nearest(ml, 10), litres: false };
	const l = ml / 1000;
	return { value: l < 10 ? Math.round(l * 10) / 10 : Math.round(l), litres: true };
}

function tidyGrams(g: number): { value: number; kg: boolean } {
	if (g < 250) return { value: Math.max(5, nearest(g, 5)), kg: false };
	if (g < 1000) return { value: nearest(g, 10), kg: false };
	const kg = g / 1000;
	return { value: kg < 10 ? Math.round(kg * 10) / 10 : Math.round(kg), kg: true };
}

/** Inches to a length a cook can use: mm below 1.5 cm, half centimetres to 10 cm, whole centimetres after. */
function tidyInches(inches: number): { value: number; mm: boolean } {
	const cm = inches * 2.54;
	if (cm < 1.5) return { value: Math.max(1, Math.round(cm * 10)), mm: true };
	if (cm < 10) return { value: nearest(cm, 0.5), mm: false };
	return { value: Math.round(cm), mm: false };
}

/** 5 °C steps for oven temperatures, single degrees below 300 °F where a sugar stage or a probe reading matters. */
const toCelsius = (f: number) => {
	const c = ((f - 32) * 5) / 9;
	return f >= 300 ? nearest(c, 5) : Math.round(c);
};

function convert(c: Compiled, canon: Canon, quantity: number, suffixText: string) {
	const { out } = c.spec;
	const sep = c.spec.tight ? '' : ' ';
	if (canon === 'inch') {
		const { value, mm } = tidyInches(quantity);
		return { value, unit: (mm ? out.mm : out.cm) + suffixText, sep };
	}
	if (canon === 'oz' || canon === 'lb') {
		const { value, kg } = tidyGrams(quantity * (canon === 'oz' ? 28.3495 : 453.592));
		return { value, unit: (kg ? out.kg : out.g) + suffixText, sep };
	}
	const { value, litres } = tidyMl(quantity * volumeMl(canon));
	return { value, unit: (litres ? out.l : out.ml) + suffixText, sep };
}

function fmt(value: number, comma: boolean | undefined): string {
	const s = String(Math.round(value * 100) / 100);
	return comma ? s.replace('.', ',') : s;
}

/** True when the text around a match already gives the measure in metric, or the match is half of something larger. */
function alreadyMetric(text: string, start: number, end: number): boolean {
	const before = text.slice(Math.max(0, start - 40), start);
	const after = text.slice(end, end + 45);
	return METRIC_AFTER.test(after) || METRIC_BEFORE.test(before);
}

/** An abbreviation such as "in." or "qt." swallows the full stop that ends the sentence; give it back. */
function sentenceDot(word: string, text: string, end: number): string {
	return word.endsWith('.') && !/^\s*\p{Ll}/u.test(text.slice(end)) ? '.' : '';
}

function insideLargerFigure(text: string, start: number): boolean {
	const before = text.slice(Math.max(0, start - 20), start);
	return RANGE_BEFORE.test(before) || DIM_BEFORE.test(before);
}

/**
 * The text with its US/imperial quantities in metric. Unsupported languages and text
 * with nothing to convert come back unchanged.
 */
export function toMetricText(text: string, lang: Lang): string {
	if (!text || !SPECS[lang]) return text;
	const c = compile(lang);
	const comma = c.spec.comma;

	// 9 x 13-inch pans: both sides of the x are inches.
	let result = text.replace(c.dims, (match, a, b, d, word: string, suffixText: string, offset: number) => {
		if (alreadyMetric(text, offset, offset + match.length) || insideLargerFigure(text, offset)) return match;
		const parts = [a, b, d].filter(Boolean).map((n) => tidyInches(parseNumber(n)));
		const unit = parts.every((p) => p.mm) ? c.spec.out.mm : c.spec.out.cm;
		const figures = parts.map((p) => fmt(p.mm === (unit === c.spec.out.mm) ? p.value : p.value / 10, comma));
		const adj = c.spec.adjectival?.(word, unit === c.spec.out.mm);
		const dot = sentenceDot(word, text, offset + match.length);
		if (adj) return `${figures.join(' x ')}-${adj}${dot}`;
		return `${figures.join(' x ')}${c.spec.tight ? '' : ' '}${unit}${suffixText}${dot}`;
	});

	result = result.replace(c.temp, (match, a, b, offset: number, whole: string) => {
		if (alreadyMetric(whole, offset, offset + match.length) || insideLargerFigure(whole, offset)) return match;
		const from = toCelsius(parseNumber(a));
		const figures = b ? `${fmt(from, comma)}–${fmt(toCelsius(parseNumber(b)), comma)}` : fmt(from, comma);
		return `${figures} °C`;
	});

	result = result.replace(
		c.general,
		(match, a, b, word: string, suffixText: string, offset: number, whole: string) => {
			const canon = c.canon.find(([, re]) => re.test(word))?.[0];
			if (!canon) return match;
			const end = offset + match.length;
			if (alreadyMetric(whole, offset, end) || insideLargerFigure(whole, offset)) return match;
			if (canon === 'lb' && (PRESSURE_AFTER.test(whole.slice(end, end + 40)) || PRESSURE_BEFORE.test(whole.slice(Math.max(0, offset - 40), offset)))) return match;
			const first = convert(c, canon, parseNumber(a), suffixText);
			const dot = sentenceDot(word, whole, end);
			if (!b) {
				const adj = canon === 'inch' ? c.spec.adjectival?.(word, first.unit === c.spec.out.mm) : null;
				return adj
						? `${fmt(first.value, comma)}-${adj}${dot}`
						: `${fmt(first.value, comma)}${first.sep}${first.unit}${dot}`;
			}
			const second = convert(c, canon, parseNumber(b), suffixText);
			// Two ends of a range can land on different units (950 ml - 1.9 l).
			if (second.unit !== first.unit) {
				return `${fmt(first.value, comma)}${first.sep}${first.unit}–${fmt(second.value, comma)}${second.sep}${second.unit}${dot}`;
			}
			return `${fmt(first.value, comma)}–${fmt(second.value, comma)}${first.sep}${first.unit}${dot}`;
		}
	);

	if (c.article) {
		// "a gallon" has no figure to replace, and swapping the noun would break the
		// grammar around it ("d'un gallon" -> "d'un 3,8 l"), so the metric follows it.
		const article = c.article;
		result = result.replace(article, (match, word: string, offset: number, whole: string) => {
			const canon = c.canon.find(([, re]) => re.test(word))?.[0];
			if (!canon) return match;
			const end = offset + match.length;
			if (alreadyMetric(whole, offset, end)) return match;
			const { value, unit, sep } = convert(c, canon, 1, '');
			return `${match} (${fmt(value, comma)}${sep}${unit})`;
		});
	}
	return result;
}
