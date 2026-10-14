/**
 * Pure validation for translated recipe titles and instructions (the store in
 * pipeline/lib/recipe_i18n_store.mjs, written only by recipe_i18n_apply.mjs).
 *
 * Same philosophy as glossary_gate.mjs: the shortcuts that corrupted earlier
 * translation runs (English copied through, a sibling language's text pasted
 * in, numbers altered, the wrong script, a row of another recipe) are caught
 * by code, not by an agent's self-report. Reuses translate_gate.mjs and the
 * glossary's number and leftover rules read-only.
 *
 * Every function returns an array of issues `{ rule, message }`; empty means
 * valid. Nothing here touches the filesystem: what a rule needs from the
 * corpus (word frequencies, the other languages' text) is passed in.
 */

import { COMMA_DECIMAL_LANGS, ENGLISH_LEFTOVER, digitRuns } from './glossary_gate.mjs';
import { hasLiteralBackslashN, hasTargetScript, lengthRatioOk, looksUntranslated, nonEmptyLineCount } from './translate_gate.mjs';

/** Targets written in Latin script, where a script check cannot catch copied English. */
export const LATIN_LANGS = new Set(['es', 'fr', 'de', 'vi', 'pt', 'it', 'jv']);
const CJK_LANGS = new Set(['zh', 'ja', 'ko']);

export const MAX_TITLE = 120;

/**
 * The rules that make an instructions row imported from the 2026-10-12
 * backup pending: the ones it was accepted under (apply_manual_translations.mjs)
 * plus foreign-script, which is corruption rather than style (Cyrillic
 * look-alike letters inside Portuguese words, Chinese characters inside
 * Vietnamese sentences). A row applied through recipe_i18n_apply.mjs is held
 * to every rule; an imported row's other issues are reported, not handed out.
 */
export const LEGACY_INSTRUCTION_RULES = new Set([
	'empty',
	'literal-backslash-n',
	'line-count',
	'target-script',
	'copied-from-english',
	'length-ratio',
	'foreign-script'
]);

export const formatIssue = (i) => `${i.lang ? `${i.lang} ` : ''}${i.id !== undefined ? `${i.id}: ` : ''}[${i.rule}] ${i.message}`;

const codePoints = (s) => [...s].length;

/** Lower-cased letter runs: the unit the English-leftover rules count. */
export const words = (s) => s.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];

const NON_ASCII_DIGIT = /(?![0-9])\p{Nd}/u;
const NOT_LATIN_LETTER = /(?=\p{L})\P{Script=Latin}/u;
// Vietnamese is unreadable without its diacritics, so three or more words with
// none of them is English (or another language), not Vietnamese.
const VI_MARKS = /[àáâãèéêìíòóôõùúýăđĩũơưạ-ỹ]/iu;
// Letters Shahmukhi uses and Modern Standard Arabic does not (translate_gate's
// PNB_ONLY_LETTERS minus U+06BE, which some Arabic typesetting uses for heh).
const PNB_LETTERS = /[ٹڈڑںہے]/u;
const ARABIC_LETTER = /[ؠ-يٱ-ۓ]/gu;

// Variant numbers that tell same-named recipes apart ("Pesto I", "Chili II").
const ROMAN = new Set(['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);
function romanTokens(source) {
	const tokens = source.match(/[\p{L}\p{N}]+/gu) ?? [];
	const out = tokens.filter((t) => ROMAN.has(t.toLowerCase()) && t === t.toUpperCase());
	if (tokens.at(-1) === 'I') out.push('I');
	return out;
}

/**
 * Dish names that cooks in the Latin-script target languages use as they are.
 * Any other word of a translated title has to be either rare in the English
 * recipes (a proper noun or a foreign dish name: the source decides) or
 * common in the target language's own recipes. The second test is what makes
 * this work without a dictionary: the target vocabulary comes from the same
 * recipes' translated instructions, so a word the language really uses for an
 * ingredient shows up there as often as it does in English.
 */
export const LOANWORDS = new Set(
	`pizza pasta risotto pesto tiramisu lasagna lasagne spaghetti gnocchi focaccia bruschetta minestrone carbonara
	tortilla tortillas taco tacos burrito burritos enchilada enchiladas quesadilla quesadillas salsa guacamole nachos
	chili chilli curry masala tikka korma biryani dal dhal naan chapati chapatis chutney samosa samosas pakora pakoras
	raita hummus falafel tahini tabbouleh kebab kebabs couscous tagine shakshuka sushi tofu miso ramen teriyaki tempura
	wasabi kimchi bulgogi bibimbap pho wok goulash strudel schnitzel muesli quiche croissant croissants brioche baguette
	crêpe crêpes crepe crepes soufflé souffle mousse ratatouille gratin praline meringue meringues fondue omelette omelet
	cocktail smoothie muffin muffins brownie brownies cookie cookies cupcake cupcakes cheesecake crumble toast sandwich
	burger burgers hamburger ketchup mayonnaise vinaigrette paella gazpacho sangria churros empanada empanadas ceviche
	mojito margarita chai matcha kombucha latte espresso cappuccino granola popcorn pancake pancakes bagel bagels donut
	donuts scone scones pudding punch chips ganache fudge caramel panna cotta sorbet tapenade aioli pita pitta rum ghee
	injera mozzarella parmesan ricotta`.split(/\s+/)
);
const LANG_LOANWORDS = { vi: new Set(['salad', 'bbq']), de: new Set(['thai']) };

// English words no Latin-script target language writes in a dish name.
const TELL_WORDS = new Set(['and', 'with', 'the', 'of', 'style']);

/** A word is common English from this many English recipes on (dish names and proper nouns stay below). */
export const COMMON_EN_DOCS = 20;
/** A title kept as in English may only hold words rarer than this: proper nouns and foreign dish names. */
export const IDENTICAL_EN_DOCS = 5;
// The share of those recipes whose translated instructions must use the word
// too before a title may. The Vietnamese and Javanese instructions kept many
// English words (ginger, vanilla, parsley...), so theirs is stricter.
const TARGET_SHARE = { vi: 0.6, jv: 0.6 };
const DEFAULT_TARGET_SHARE = 0.25;

const loanword = (lang, w) => LOANWORDS.has(w) || (LANG_LOANWORDS[lang]?.has(w) ?? false);

/**
 * Words of a Latin-script translation that are English: common in English
 * recipes, not common in the target language's recipes, not a loanword. Not
 * only words kept from the source title: an English title of another dish
 * (a real incident) shares no word with the source.
 * @param {string} lang
 * @param {string} source
 * @param {string} title
 * @param {{ en: Map<string, number>, target: Map<string, number> }} vocab document frequencies
 */
export function englishLeftovers(lang, source, title, vocab) {
	const roman = new Set(romanTokens(source).map((t) => t.toLowerCase()));
	const share = TARGET_SHARE[lang] ?? DEFAULT_TARGET_SHARE;
	const out = [];
	for (const w of new Set(words(title))) {
		if (TELL_WORDS.has(w)) {
			out.push(w);
			continue;
		}
		if (w.length < 2 || roman.has(w) || loanword(lang, w)) continue;
		const en = vocab.en.get(w) ?? 0;
		if (en >= COMMON_EN_DOCS && (vocab.target.get(w) ?? 0) < share * en) out.push(w);
	}
	return out;
}

/** Common English words of a title kept exactly as in English: none for a pure proper noun or foreign dish name. */
export function commonEnglishWords(lang, title, vocab) {
	const roman = new Set(romanTokens(title).map((t) => t.toLowerCase()));
	return [...new Set(words(title))].filter(
		(w) => TELL_WORDS.has(w) || (w.length >= 2 && !roman.has(w) && !loanword(lang, w) && (vocab.en.get(w) ?? 0) >= IDENTICAL_EN_DOCS)
	);
}

function markupProblem(s) {
	if (/[\r\n\t]/.test(s)) return 'contains a line break or tab';
	if (s.includes('\\')) return 'contains a backslash';
	if (/[<>]/.test(s)) return "contains '<' or '>'";
	if (s.includes('**') || s.includes('__') || s.includes('`')) return 'contains markdown';
	if (s !== s.trim() || /\s{2}/.test(s)) return 'has leading, trailing or doubled spaces';
	return null;
}

/** Short texts may be kanji only (ja) or lack the pnb-only letters a sentence has. */
function titleScriptOk(lang, title) {
	if (lang === 'ja') return hasTargetScript('zh', title) || hasTargetScript('ja', title);
	if (lang === 'pnb') {
		const arabic = (title.match(ARABIC_LETTER) ?? []).length;
		return hasTargetScript('ar', title) === true && (arabic < 10 || PNB_LETTERS.test(title));
	}
	if (lang === 'ar') return hasTargetScript('ar', title) === true && !PNB_LETTERS.test(title);
	return hasTargetScript(lang, title) === true;
}

function titleLengthOk(lang, source, title) {
	const s = codePoints(source);
	const t = codePoints(title);
	if (t > MAX_TITLE) return false;
	if (CJK_LANGS.has(lang)) return t >= Math.max(1, Math.floor(0.12 * s) - 1) && t <= 1.5 * s + 8;
	return t >= Math.floor(0.35 * s) - 2 && t <= 3 * s + 30;
}

/**
 * Rules for one translated title.
 * @param {object} p
 * @param {string} p.lang target language
 * @param {string} p.source English title
 * @param {unknown} p.title the translation
 * @param {string | null} [p.keep] a reviewer's reason for keeping the English title as it is
 * @param {{ en: Map<string, number>, target: Map<string, number> }} p.vocab see englishLeftovers
 * @param {Record<string, string>} [p.others] the same recipe's title in the other languages that have one
 */
export function validateTitle({ lang, source, title, keep = null, vocab, others = {} }) {
	const issues = [];
	const add = (rule, message) => issues.push({ rule, message });
	if (typeof title !== 'string' || title.trim() === '') {
		add('empty', 'title must be a non-empty string');
		return issues;
	}
	const markup = markupProblem(title);
	if (markup) add('markup', `title ${markup}`);
	if (hasLiteralBackslashN(title)) add('literal-backslash-n', 'title contains a literal backslash-n');
	if (!titleLengthOk(lang, source, title)) add('length', `title is ${codePoints(title)} characters against ${codePoints(source)} in English`);

	const digit = title.match(NON_ASCII_DIGIT);
	if (digit) add('digits', `title contains non-Western digit "${digit[0]}"; use 0-9`);
	const got = digitRuns(title).join(',');
	const want = digitRuns(source).join(',');
	if (got !== want) add('digit-mismatch', `numbers are [${got}], English has [${want}]`);
	const tokens = new Set(title.match(/[\p{L}\p{N}]+/gu) ?? []);
	for (const r of romanTokens(source)) {
		if (!tokens.has(r)) add('variant-numeral', `English has the variant number "${r}"; keep it as written`);
	}

	const identical = title === source;
	if (LATIN_LANGS.has(lang)) {
		const foreign = title.match(NOT_LATIN_LETTER);
		if (foreign) add('target-script', `title contains "${foreign[0]}", not a Latin letter`);
		if (lang === 'vi' && words(title).length >= 3 && !VI_MARKS.test(title)) {
			add('target-script', 'title has no Vietnamese diacritics; it is not Vietnamese');
		}
		if (!keep) {
			const common = identical ? commonEnglishWords(lang, title, vocab) : [];
			const left = englishLeftovers(lang, source, title, vocab);
			const quote = (list) => list.map((w) => `"${w}"`).join(', ');
			if (common.length) add('identical-to-source', `title is the English title, with the English word(s) ${quote(common)}`);
			else if (left.length) add('english-leftover', `title keeps the English word(s) ${quote(left)}`);
		}
	} else if (!keep) {
		if (identical) add('identical-to-source', 'title is the English title');
		else if (!titleScriptOk(lang, title)) add('target-script', `title is not in the ${lang} script`);
	}

	if (!LATIN_LANGS.has(lang) && !identical) {
		const same = Object.entries(others).filter(([l, t]) => l !== lang && l !== 'en' && t === title).map(([l]) => l);
		if (same.length >= 2) add('copied-from-language', `title is identical to the ${same.join(', ')} titles`);
		else if (lang === 'pnb' && others.ar === title && words(title).length >= 2) add('copied-from-language', 'title is identical to the ar title');
	}
	return issues;
}

/** The glossary's CJK floor: Chinese prose runs a quarter of the English length. */
function textRatioOk(lang, source, text) {
	if (!CJK_LANGS.has(lang)) return lengthRatioOk(source, text);
	const ratio = text.length / Math.max(source.length, 1);
	return ratio >= 0.1 && ratio <= 3;
}

/**
 * Rules for one translated instructions text (steps one per line).
 * @param {object} p
 * @param {string} p.lang
 * @param {string} p.source English instructions
 * @param {unknown} p.text the translation
 * @param {Record<string, string>} [p.others] the same recipe's instructions in other languages
 */
export function validateInstructions({ lang, source, text, others = {} }) {
	const issues = [];
	const add = (rule, message) => issues.push({ rule, message });
	if (typeof text !== 'string' || text.trim() === '') {
		add('empty', 'instructions must be a non-empty string');
		return issues;
	}
	if (hasLiteralBackslashN(text)) add('literal-backslash-n', 'instructions contain a literal backslash-n; use real line breaks (\\n in the JSON)');
	const lines = nonEmptyLineCount(text);
	const want = nonEmptyLineCount(source);
	if (lines !== want) add('line-count', `${lines} non-empty lines, English has ${want}`);
	if (looksUntranslated(source, text)) add('copied-from-english', 'instructions are identical to the English text');
	else if (!LATIN_LANGS.has(lang) && hasTargetScript(lang, text) === false) add('target-script', `instructions are not in the ${lang} script`);
	if (!textRatioOk(lang, source, text)) add('length-ratio', `${text.length} characters against ${source.length} in English`);

	if (LATIN_LANGS.has(lang)) {
		const foreign = text.match(NOT_LATIN_LETTER);
		if (foreign) add('foreign-script', `instructions contain "${foreign[0]}", not a Latin letter`);
		if (lang === 'vi' && !VI_MARKS.test(text)) add('foreign-script', 'instructions have no Vietnamese diacritics');
	}
	if (/<\/?[a-z][^>]*>/i.test(text) || text.includes('**') || text.includes('`')) add('markup', 'instructions contain HTML or markdown');
	const digit = text.match(NON_ASCII_DIGIT);
	if (digit) add('digits', `instructions contain non-Western digit "${digit[0]}"; use 0-9`);
	const got = digitRuns(text).join(',');
	const expected = digitRuns(source).join(',');
	if (got !== expected) add('digit-mismatch', `numbers are [${got}], English has [${expected}]`);
	const comma = COMMA_DECIMAL_LANGS.has(lang);
	for (const [, a, b] of source.matchAll(/(?<![0-9.,])([0-9]+)\.([0-9]+)(?![0-9])/g)) {
		const wrong = comma ? `${a}.${b}` : `${a},${b}`;
		if (text.includes(wrong)) {
			add('decimal-separator', `"${wrong}": ${lang} writes decimals with ${comma ? 'a comma' : 'a point'}`);
			break;
		}
	}
	const leftover = text.match(ENGLISH_LEFTOVER);
	if (leftover) add('english-leftover', `instructions still contain the English word "${leftover[0]}"`);
	for (const [other, t] of Object.entries(others)) {
		if (other !== lang && other !== 'en' && typeof t === 'string' && t.trim() === text.trim()) {
			add('copied-from-language', `instructions are identical to the ${other} text`);
			break;
		}
	}
	return issues;
}
