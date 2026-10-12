import { DEFAULT_LANG, RTL_LANGS, SUPPORTED_LANGS, type Lang } from '$lib/config';

export type Messages = Record<string, string>;

// No bundle is imported here: this module reaches the browser, and importing all
// 16 JSON files put every language into every visitor's JS. The root layout load
// registers the one dictionary the page needs (already merged over English, see
// messages.server.ts). Keyed by language with identical content per key, so a
// module-level map is safe to share between the requests one isolate serves.
const registry = new Map<Lang, Messages>();

export function registerMessages(lang: Lang, messages: Messages): void {
	registry.set(lang, messages);
}

/** Whitelists an untrusted language value; never returns anything outside SUPPORTED_LANGS. */
export function resolveLang(value: string | null | undefined): Lang {
	return SUPPORTED_LANGS.includes(value as Lang) ? (value as Lang) : DEFAULT_LANG;
}

export function dirFor(lang: Lang): 'ltr' | 'rtl' {
	return RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
}

/**
 * Returns a translator that falls back to English (merged in before
 * registration), then to the key itself. The lookup happens per call, not when
 * the translator is created, so a translator made before its language finished
 * registering still resolves once it has.
 */
export function t(lang: Lang) {
	return (key: string): string => registry.get(lang)?.[key] ?? registry.get(DEFAULT_LANG)?.[key] ?? key;
}
