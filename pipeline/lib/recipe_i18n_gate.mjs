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
import LOANWORD_LISTS from './recipe_i18n_loanwords.json' with { type: 'json' };

/** Targets written in Latin script, where a script check cannot catch copied English. */
export const LATIN_LANGS = new Set(['es', 'fr', 'de', 'vi', 'pt', 'it', 'jv']);
const CJK_LANGS = new Set(['zh', 'ja', 'ko']);

export const MAX_TITLE = 120;
const SHORT_SOURCE = 12;
const SHORT_SOURCE_CAP = 40;

/**
 * The rules that make an instructions row imported from the 2026-10-12
 * backup pending: the ones it was accepted under (apply_manual_translations.mjs)
 * plus foreign-script and mixed-script-word, which are corruption rather
 * than style (Cyrillic look-alike letters inside Portuguese words, a Latin o
 * inside a Russian one, Chinese characters inside Vietnamese sentences). A row applied through recipe_i18n_apply.mjs is held
 * to every rule; an imported row's other issues are reported, not handed out.
 */
export const LEGACY_INSTRUCTION_RULES = new Set([
	'empty',
	'literal-backslash-n',
	'line-count',
	'target-script',
	'copied-from-english',
	'length-ratio',
	'foreign-script',
	'mixed-script-word'
]);

// Scripts whose letters must not meet inside one word. Han and kana are left
// out: Latin letters next to them are normal Chinese and Japanese ("2cm",
// "BBQ酱", "pHを"), and they count as no script at all.
const WORD_SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Devanagari', 'Bengali', 'Hangul'].map((name) => ({
	name,
	re: new RegExp(String.raw`\p{Script=${name}}`, 'u')
}));

// Korean writes a particle straight after a unit or abbreviation: 350°F로,
// 5cm의, 200g을, PSI에서. An English word with a particle (juicer에서) is not one.
const KO_UNIT_PARTICLE = /^(?:[A-Za-zº]{1,3}|[A-Z]{1,5})\p{Script=Hangul}+$/u;

/**
 * The first word (letter run; hyphens, digits, spaces and symbols split
 * words) whose letters come from two of WORD_SCRIPTS, as an issue message,
 * or null. Names the word and the first letter of its less used script, the
 * one that is most likely the stray look-alike.
 * @param {string} what "title" or "instructions"
 * @param {string} text
 */
export function mixedScriptWord(what, text) {
	for (const word of text.match(/[\p{L}\p{M}'’]+/gu) ?? []) {
		/** @type {Map<string, string[]>} */
		const by = new Map();
		for (const ch of word) {
			const script = WORD_SCRIPTS.find((sc) => sc.re.test(ch));
			if (!script) continue;
			if (!by.has(script.name)) by.set(script.name, []);
			by.get(script.name).push(ch);
		}
		if (by.size < 2) continue;
		if (by.size === 2 && by.has('Hangul') && KO_UNIT_PARTICLE.test(word)) continue;
		const scripts = [...by].sort((a, b) => a[1].length - b[1].length);
		const letters = scripts[0][1];
		const code = /** @type {number} */ (letters[0].codePointAt(0)).toString(16).toUpperCase().padStart(4, '0');
		const names = scripts.map(([n]) => n).join(' and ');
		return `${what} word "${word}" mixes ${names} letters ("${letters[0]}" U+${code})`;
	}
	return null;
}

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

// Variant numbers that tell same-named recipes apart ("Pesto I", "Chili II").
const ROMAN = new Set(['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);
function romanTokens(source) {
	const tokens = source.match(/[\p{L}\p{N}]+/gu) ?? [];
	const out = tokens.filter((t) => ROMAN.has(t.toLowerCase()) && t === t.toUpperCase());
	if (tokens.at(-1) === 'I') out.push('I');
	return out;
}

/**
 * Words a translated title may keep from English (recipe_i18n_loanwords.json):
 * dish names used internationally, and per language the words it writes like
 * English. Any other word of a Latin-script title has to be either rare in the
 * English recipes (a proper noun or a foreign dish name: the source decides)
 * or about as common in the target language's own recipes. The second test is
 * what makes this work without a dictionary: the target vocabulary comes from
 * the same recipes' translated instructions, so a word the language really
 * uses for an ingredient shows up there as often as it does in English.
 */
const compileLoanwords = (/** @type {string[]} */ list) => {
	const single = new Set();
	/** @type {string[][]} */
	const phrases = [];
	for (const entry of list) {
		const tokens = words(entry);
		if (tokens.length === 1) single.add(tokens[0]);
		else if (tokens.length) phrases.push(tokens);
	}
	return { single, phrases };
};
const SHARED_LOANWORDS = compileLoanwords(LOANWORD_LISTS.shared);
const LANG_LOANWORDS = Object.fromEntries(Object.entries(LOANWORD_LISTS.lang).map(([lang, list]) => [lang, compileLoanwords(list)]));
/** The shared single-word loanwords. */
export const LOANWORDS = SHARED_LOANWORDS.single;

/**
 * The words of `title` a listed loanword or loan phrase covers in `lang`.
 * @param {string} lang
 * @param {string} title
 */
export function loanwordsIn(lang, title) {
	const tokens = words(title);
	const out = new Set();
	for (const lists of [SHARED_LOANWORDS, LANG_LOANWORDS[lang]]) {
		if (!lists) continue;
		for (const t of tokens) if (lists.single.has(t)) out.add(t);
		for (const p of lists.phrases) {
			for (let i = 0; i + p.length <= tokens.length; i++) if (p.every((w, k) => tokens[i + k] === w)) for (const w of p) out.add(w);
		}
	}
	return out;
}

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

/**
 * Words a title may keep from English whatever their frequency: listed
 * loanwords and loan phrases, and the words of a foreign name the source
 * title quotes ("Bacalhau à Zé do Pipo", "Agnolotti in Brodo", "Pan Tomaca"):
 * a source word next to a word that is rare in English and kept in the
 * title too. A listed loanword does not count as rare here, or "Chicken
 * Tikka" would let "chicken" through.
 */
export function keptWords(lang, source, title, vocab) {
	const kept = loanwordsIn(lang, title);
	const inTitle = new Set(words(title));
	const loans = loanwordsIn(lang, source);
	const src = words(source);
	const roman = new Set(romanTokens(source).map((t) => t.toLowerCase()));
	const rare = (w) => (vocab.en.get(w) ?? 0) < IDENTICAL_EN_DOCS && !loans.has(w) && !roman.has(w) && w.length > 1 && inTitle.has(w);
	src.forEach((w, i) => {
		if (inTitle.has(w) && !TELL_WORDS.has(w) && ((i > 0 && rare(src[i - 1])) || (i + 1 < src.length && rare(src[i + 1])))) kept.add(w);
	});
	return kept;
}

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
	const kept = keptWords(lang, source, title, vocab);
	const out = [];
	for (const w of new Set(words(title))) {
		if (kept.has(w)) continue;
		if (TELL_WORDS.has(w)) {
			out.push(w);
			continue;
		}
		if (w.length < 2 || roman.has(w)) continue;
		const en = vocab.en.get(w) ?? 0;
		if (en >= COMMON_EN_DOCS && (vocab.target.get(w) ?? 0) < share * en) out.push(w);
	}
	return out;
}

/**
 * Common English words of a title kept exactly as in English: none for a pure
 * proper noun or foreign dish name. A word the language uses about as often
 * as English does (es "de", fr "sauce") is the language's own and does not count.
 */
export function commonEnglishWords(lang, title, vocab) {
	const roman = new Set(romanTokens(title).map((t) => t.toLowerCase()));
	const share = TARGET_SHARE[lang] ?? DEFAULT_TARGET_SHARE;
	const kept = keptWords(lang, title, title, vocab);
	return [...new Set(words(title))].filter((w) => {
		if (kept.has(w)) return false;
		if (TELL_WORDS.has(w)) return true;
		if (w.length < 2 || roman.has(w)) return false;
		const en = vocab.en.get(w) ?? 0;
		return en >= IDENTICAL_EN_DOCS && (vocab.target.get(w) ?? 0) < share * en;
	});
}

function markupProblem(s) {
	if (/[\r\n\t]/.test(s)) return 'contains a line break or tab';
	if (s.includes('\\')) return 'contains a backslash';
	if (/[<>]/.test(s)) return "contains '<' or '>'";
	if (s.includes('**') || s.includes('__') || s.includes('`')) return 'contains markdown';
	if (s !== s.trim() || /\s{2}/.test(s)) return 'has leading, trailing or doubled spaces';
	return null;
}

/** The title without the source's Roman variant numerals (コーラ III is Japanese). */
const withoutNumerals = (source, title) => {
	const roman = new Set(romanTokens(source));
	return title.replace(/[\p{L}\p{N}]+/gu, (t) => (roman.has(t) ? '' : t)).trim() || title;
};

// Urdu function words with a different Punjabi form: what marks an Urdu
// title as not Shahmukhi Punjabi, where the pnb-only letters are too rare in
// a short title to tell (باربی کیو ساس, ویلنسیا). Not کی and کے: Punjabi has
// them too (لا کے, "having coated"; کی لائم, Key Lime).
const URDU_WORDS = new Set(['کا', 'سے', 'میں']);
// Arabic yeh, kaf, teh marbuta and alef maksura, where Shahmukhi has its own
// ی, ک and ہ: an Arabic title filed as pnb nearly always has one.
const ARABIC_ONLY = /[يكةى]/u;

/** Short texts may be kanji only (ja); Shahmukhi titles are told from Urdu by URDU_WORDS. */
function titleScriptOk(lang, title) {
	if (lang === 'ja') {
		// translate_gate's kana range stops before the long-vowel mark ー, which
		// half of all katakana loanwords carry (ソース), so short titles count it here.
		const japanese = (title.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/gu) ?? []).length;
		const latin = (title.match(/[a-zA-Z]/g) ?? []).length;
		return hasTargetScript('zh', title) || hasTargetScript('ja', title) || (japanese > 0 && japanese >= latin);
	}
	if (lang === 'pnb') return hasTargetScript('ar', title) === true;
	if (lang === 'ar') return hasTargetScript('ar', title) === true && !PNB_LETTERS.test(title);
	return hasTargetScript(lang, title) === true;
}

function titleLengthOk(lang, source, title) {
	const s = codePoints(source);
	const t = codePoints(title);
	if (t > MAX_TITLE) return false;
	// A very short source (Pho, Dosa, Kibbeh) often needs a gloss in brackets.
	const glossCap = s <= SHORT_SOURCE ? SHORT_SOURCE_CAP : 0;
	// Hangul runs about two thirds of the English length, not a third like Han.
	if (lang === 'ko') return t >= Math.max(1, Math.floor(0.2 * s) - 1) && t <= Math.max(2 * s + 20, glossCap);
	if (CJK_LANGS.has(lang)) return t >= Math.max(1, Math.floor(0.12 * s) - 1) && t <= Math.max(1.5 * s + 8, glossCap);
	return t >= Math.floor(0.35 * s) - 2 && t <= Math.max(3 * s + 30, glossCap);
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
	const mixed = mixedScriptWord('title', title);
	if (mixed) add('mixed-script-word', mixed);
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
		const loans = loanwordsIn(lang, title);
		const own = words(title).filter((w) => !loans.has(w));
		if (!keep && lang === 'vi' && own.length >= 3 && !own.some((w) => VI_MARKS.test(w))) {
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
		else if (!titleScriptOk(lang, withoutNumerals(source, title))) add('target-script', `title is not in the ${lang} script`);
		else if (lang === 'pnb') {
			const urdu = words(title).find((w) => URDU_WORDS.has(w));
			const arabic = title.match(ARABIC_ONLY);
			if (urdu) add('target-script', `title uses the Urdu word "${urdu}"; Punjabi writes دا/دی/دے, توں, وچ`);
			else if (arabic) add('target-script', `title has the Arabic letter "${arabic[0]}"; Shahmukhi writes ی, ک, ہ`);
		}
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
	const mixed = mixedScriptWord('instructions', text);
	if (mixed) add('mixed-script-word', mixed);
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
