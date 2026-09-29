/**
 * Pure validation helpers for manually-translated recipe_i18n rows.
 *
 * These exist because letting an LLM agent hand-author raw SQL text was the
 * root cause of two real data-corruption incidents: an agent copying the
 * English source through as if it were a translation, and agents typing the
 * two literal characters backslash+n into a multi-line string instead of a
 * real newline. Moving translation to "produce JSON, nothing else" and
 * moving all validation + SQL construction here (deterministic code, not
 * agent self-report) is what actually closes both bug classes.
 */

export const nonEmptyLineCount = (text) =>
	text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean).length;

// The old bug: an agent typed "\" then "n" into a hand-written .sql file
// instead of pressing enter. A real newline character must never match this.
export const hasLiteralBackslashN = (text) => /\\n/.test(text);

const SCRIPT_RANGES = {
	ja: /[ぁ-ゖァ-ヺ]/, // hiragana or katakana (kanji-only is ambiguous with zh)
	zh: /[一-鿿]/, // Han
	ko: /[가-힣]/, // Hangul
	ar: /[؀-ۿ]/, // Arabic
	hi: /[ऀ-ॿ]/, // Devanagari
	bn: /[ঀ-৿]/, // Bengali
	ru: /[Ѐ-ӿ]/, // Cyrillic
	pnb: /[؀-ۿ]/ // Arabic block — same range as `ar`; disambiguated below
};
const JA_KANA = /[ぁ-ゖァ-ヺ]/;
// Letters Urdu/Shahmukhi Punjabi use that standard Arabic doesn't. Without
// this, plain Arabic output mislabelled `pnb` would pass the script check —
// the same failure mode `zh`'s kana cross-check exists to catch for Japanese.
const PNB_ONLY_LETTERS = /[ٹڈڑںھہے]/;
// Devanagari (hi) and Bengali (bn) are cousin Brahmic scripts with visually
// near-identical digit glyphs (Devanagari ०-९ vs Bengali ০-৯) and enough
// structural similarity that a real incident slipped through undetected: a
// `bn` batch came back genuinely containing Bengali prose but with whole
// words and digits written in Devanagari, mixed in throughout. `hasTargetScript`
// only checked "is any Bengali character present" — true, since the prose
// partially was — so it passed. Same failure shape as `zh`'s kana problem,
// just a different script pair; same fix, an exclusion check.
//
// U+0964/U+0965 (danda / double danda, the Devanagari-block-encoded "."-style
// punctuation Bengali also legitimately uses, since Unicode gives Bengali no
// codepoints of its own for these) are deliberately excluded from the range
// below. Written with \uXXXX escapes rather than typed glyphs: the first
// version of this range used hand-typed characters and, in a fitting
// demonstration of the exact bug this check exists to catch, a danda ended
// up inside what was meant to be a "pure Bengali" test string without being
// noticed until the test failed.
const DEVANAGARI = /[ऀ-ॣ०-ॿ]/;
const BENGALI = /[ঀ-৿]/;
const LATIN_LETTER = /[a-zA-Z]/g;

// Real incident, 2026-09-25: a `bn` agent submitted rows whose entire body
// was untranslated English, with only the step-number markers swapped for
// Bengali ordinal words (প্রথম, দ্বিতীয়, ...) — a mechanical find-and-replace,
// not a translation. `hasTargetScript` only checked "is any Bengali character
// present", which a handful of ordinal words satisfy trivially, so ~74% of
// one batch (1866 of 2539 rows) passed the gate while being almost entirely
// English. The word-ordinal instruction was introduced *by this project* as
// the fix for the Devanagari-digit-mixing incident above — it closed that
// hole and opened this one. The real fix is a density check: target-script
// letters must at least match Latin letters one-for-one, not merely appear.
// A genuine translation is overwhelmingly target-script with maybe a stray
// loanword; body text that's mostly English with a few Bengali words fails
// this easily, while it trivially passed a presence-only check.
function targetScriptDominant(text, scriptRange) {
	// scriptRange (from SCRIPT_RANGES) has no /g flag — .match() on a
	// non-global regex returns only the first hit, silently undercounting.
	// Rebuild it as global here rather than adding /g to every entry above,
	// so SCRIPT_RANGES stays usable as a plain presence test too.
	const globalRange = new RegExp(scriptRange.source, 'g');
	const scriptCount = (text.match(globalRange) ?? []).length;
	const latinCount = (text.match(LATIN_LETTER) ?? []).length;
	return scriptCount >= latinCount;
}

/** Only defined for langs whose script can't be typed by an English-only placeholder. */
export function hasTargetScript(lang, text) {
	const range = SCRIPT_RANGES[lang];
	if (!range) return undefined;
	if (!targetScriptDominant(text, range)) return false;
	if (lang === 'zh') return range.test(text) && !JA_KANA.test(text);
	if (lang === 'pnb') return range.test(text) && PNB_ONLY_LETTERS.test(text);
	if (lang === 'bn') return range.test(text) && !DEVANAGARI.test(text);
	if (lang === 'hi') return range.test(text) && !BENGALI.test(text);
	return range.test(text);
}

/** For Latin-script targets (fr/de/vi/es) where a script check can't catch a silent copy-through. */
export function looksUntranslated(source, translated) {
	return source.trim() === translated.trim();
}

/** Blunt "degenerate output" net (near-empty, truncated, repeated garbage) — not a quality judge. */
export function lengthRatioOk(source, translated) {
	const ratio = translated.length / Math.max(source.length, 1);
	return ratio >= 0.2 && ratio <= 3;
}
