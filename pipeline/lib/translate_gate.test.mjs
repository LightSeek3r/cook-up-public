import { describe, it, expect } from 'vitest';
import {
	nonEmptyLineCount,
	hasLiteralBackslashN,
	hasTargetScript,
	looksUntranslated,
	lengthRatioOk
} from './translate_gate.mjs';

// Pins the two real corruption incidents this project hit while manually
// translating recipe_i18n rows: an agent typing the literal characters
// backslash+n instead of a real newline, and an agent inserting the English
// source unchanged as if it were a Japanese translation.
describe('hasLiteralBackslashN', () => {
	it('flags the literal two-character backslash-n bug', () => {
		expect(hasLiteralBackslashN('line1\\nline2')).toBe(true);
	});

	it('does not false-positive on a real newline character', () => {
		expect(hasLiteralBackslashN('line1\nline2')).toBe(false);
	});
});

describe('hasTargetScript', () => {
	it('accepts genuine Japanese text', () => {
		expect(hasTargetScript('ja', 'これは日本語です')).toBe(true);
	});

	it('rejects English placeholder text copied through as Japanese', () => {
		expect(hasTargetScript('ja', 'This is English placeholder text.')).toBe(false);
	});

	it('rejects Japanese kana when checking for Chinese', () => {
		expect(hasTargetScript('zh', 'これは日本語です')).toBe(false);
	});

	it('accepts genuine Chinese text', () => {
		expect(hasTargetScript('zh', '这是中文说明')).toBe(true);
	});

	it('accepts genuine Korean, Arabic, Hindi text', () => {
		expect(hasTargetScript('ko', '이것은 한국어입니다')).toBe(true);
		expect(hasTargetScript('ar', 'هذا نص عربي')).toBe(true);
		expect(hasTargetScript('hi', 'यह हिन्दी पाठ है')).toBe(true);
	});

	it('is undefined (skipped) for Latin-script targets', () => {
		expect(hasTargetScript('fr', 'Ceci est du texte français')).toBeUndefined();
		expect(hasTargetScript('pt', 'Isto é texto em português')).toBeUndefined();
		expect(hasTargetScript('it', 'Questo è testo italiano')).toBeUndefined();
		expect(hasTargetScript('jv', 'Iki teks basa Jawa')).toBeUndefined();
	});

	it('accepts genuine Bengali and Russian text', () => {
		expect(hasTargetScript('bn', 'এটি বাংলা পাঠ্য')).toBe(true);
		expect(hasTargetScript('ru', 'Это русский текст')).toBe(true);
	});

	it('rejects English placeholder text for Bengali and Russian', () => {
		expect(hasTargetScript('bn', 'This is English placeholder text.')).toBe(false);
		expect(hasTargetScript('ru', 'This is English placeholder text.')).toBe(false);
	});

	// Real incident, 2026-09-25: a `bn` batch came back with genuine Bengali
	// prose but Devanagari (Hindi) words and digits mixed in throughout — e.g.
	// "१. জল, খামির এবং চিনি মিশিয়ে..." (Devanagari "१." step-number, Bengali
	// prose). The old check only asked "is any Bengali character present",
	// which this text passes, so all 152 rows in that batch slipped through
	// undetected and had to be deleted and retranslated.
	it('rejects Bengali text with Devanagari words/digits mixed in', () => {
		expect(hasTargetScript('bn', '१. জল, খামির এবং চিনি মিশিয়ে কয়েক মিনিট অপেক্ষা করুন।')).toBe(false);
	});

	it('still accepts pure Bengali digits and text', () => {
		expect(hasTargetScript('bn', '১. জল, খামির এবং চিনি মিশিয়ে কয়েক মিনিট অপেক্ষা করুন।')).toBe(true);
	});

	it('rejects Hindi text with Bengali characters mixed in (the reverse case)', () => {
		expect(hasTargetScript('hi', 'यह হিন্দी टेक्स्ट है')).toBe(false);
	});

	// Real incident, 2026-09-25: an agent mechanically swapped only the step
	// markers to Bengali ordinal words (প্রথম, দ্বিতীয়, ...) while leaving the
	// entire body untranslated in English. The old "any Bengali present" check
	// passed this trivially — 1866 of 2539 rows in one batch were this shape.
	it('rejects English body text with only Bengali ordinal-word step markers', () => {
		const text =
			'প্রথম: Stir together apples, sugar and water in a large saucepan. Simmer for 5 minutes.\n' +
			'দ্বিতীয়: Add water and cornstarch. Cook, stirring, until thick and bubbly.';
		expect(hasTargetScript('bn', text)).toBe(false);
	});

	it('still accepts a genuine Bengali translation with one stray English loanword', () => {
		const text =
			'প্রথম পদক্ষেপ: একটি অগভীর পাত্রে তেল, মধু, সরষে, রসুন, ক্যায়েন, ধনিয়া, লেবুর রস এবং লবণ মিশিয়ে নিন এবং সব seasonings ভালোভাবে মিশ করুন।\n' +
			'দ্বিতীয় পদক্ষেপ: স্যালমন যোগ করে ঘরের তাপমাত্রায় ৩০ মিনিটের জন্য ম্যারিনেট করতে দিন।';
		expect(hasTargetScript('bn', text)).toBe(true);
	});

	// pnb (Western Punjabi, Shahmukhi) shares the Arabic Unicode block with ar —
	// the exact failure mode this pins: plain Arabic output mislabelled pnb
	// must be rejected, the same way zh rejects kana.
	describe('pnb (Western Punjabi, Shahmukhi) vs plain Arabic', () => {
		it('accepts genuine Shahmukhi Punjabi containing an Urdu/Punjabi-only letter', () => {
			expect(hasTargetScript('pnb', 'ایہ پنجابی متن اے')).toBe(true);
		});

		it('rejects plain Arabic text mislabelled as pnb', () => {
			expect(hasTargetScript('pnb', 'هذا نص عربي')).toBe(false);
		});

		it('rejects English placeholder text for pnb', () => {
			expect(hasTargetScript('pnb', 'This is English placeholder text.')).toBe(false);
		});
	});
});

describe('looksUntranslated', () => {
	it('flags a byte-identical copy-through', () => {
		expect(looksUntranslated('Mix the flour.', 'Mix the flour.')).toBe(true);
	});

	it('accepts genuinely different text', () => {
		expect(looksUntranslated('Mix the flour.', 'Mélangez la farine.')).toBe(false);
	});
});

describe('lengthRatioOk', () => {
	it('accepts a comparable-length translation', () => {
		expect(lengthRatioOk('Mix the flour and sugar.', 'Mélangez la farine et le sucre.')).toBe(true);
	});

	it('rejects near-empty degenerate output', () => {
		expect(lengthRatioOk('1. Mix the flour and sugar together well.', 'ok')).toBe(false);
	});

	it('rejects wildly bloated output', () => {
		expect(lengthRatioOk('Mix.', 'x'.repeat(50))).toBe(false);
	});
});

describe('nonEmptyLineCount', () => {
	it('counts only non-empty trimmed lines', () => {
		expect(nonEmptyLineCount('1. First step.\n\n2. Second step.\n')).toBe(2);
	});
});
