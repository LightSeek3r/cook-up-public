import type { Lang } from '$lib/config';

/** Decimal comma, as the translation rules fix per language (es fr de pt it ru vi jv). */
const COMMA_LANGS: ReadonlySet<string> = new Set(['es', 'fr', 'de', 'pt', 'it', 'ru', 'vi', 'jv']);

/** Western digits in every language; only the decimal separator follows the language. */
export const numberFormatter = (lang: Lang) => (n: number) =>
	COMMA_LANGS.has(lang) ? String(n).replace('.', ',') : String(n);

// Plural categories a message may leave out, and the one that stands in for it.
const FALLBACK: Record<string, string> = { two: 'few', zero: 'other', many: 'other', few: 'other' };

/** "one:{n} clove|other:{n} cloves" -> { one, other }; a bare string serves every category. */
function parseForms(message: string): Record<string, string> {
	const forms: Record<string, string> = {};
	for (const part of message.split('|')) {
		const at = part.indexOf(':');
		const category = at > 0 && /^[a-z]+$/.test(part.slice(0, at)) ? part.slice(0, at) : 'other';
		forms[category] = at > 0 && category !== 'other' ? part.slice(at + 1) : part.replace(/^other:/, '');
	}
	return forms;
}

/**
 * The localized "<n> <unit word>" for the units a translated ingredient line spells
 * out (clove, can, pinch...), from the `unit.<name>` messages. Null when the unit has
 * no message, so the caller falls back to a bare count.
 */
export function unitLabeler(lang: Lang, t: (key: string) => string) {
	let rules: Intl.PluralRules | null = null;
	try {
		rules = new Intl.PluralRules(lang);
	} catch {
		// A language the runtime has no plural data for: one / other is right for most.
	}
	return (unit: string, quantity: number, formatted: string): string | null => {
		const key = `unit.${unit}`;
		const message = t(key);
		if (message === key) return null;
		const forms = parseForms(message);
		const category = rules ? rules.select(quantity) : quantity === 1 ? 'one' : 'other';
		const text = forms[category] ?? forms[FALLBACK[category]] ?? forms.other ?? Object.values(forms)[0];
		return text.replace('{n}', formatted);
	};
}
