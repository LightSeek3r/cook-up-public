import { DEFAULT_LANG, RTL_LANGS, SUPPORTED_LANGS, type Lang } from '$lib/config';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import de from './de.json';
import ar from './ar.json';
import hi from './hi.json';
import zh from './zh.json';
import ja from './ja.json';
import ko from './ko.json';
import vi from './vi.json';
import pt from './pt.json';
import it from './it.json';
import bn from './bn.json';
import ru from './ru.json';
import pnb from './pnb.json';
import jv from './jv.json';

type Bundle = Record<string, string>;

const BUNDLES: Record<Lang, Bundle> = { en, es, fr, de, ar, hi, zh, ja, ko, vi, pt, it, bn, ru, pnb, jv };

/** Whitelists an untrusted language value; never returns anything outside SUPPORTED_LANGS. */
export function resolveLang(value: string | null | undefined): Lang {
	return SUPPORTED_LANGS.includes(value as Lang) ? (value as Lang) : DEFAULT_LANG;
}

export function dirFor(lang: Lang): 'ltr' | 'rtl' {
	return RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
}

/** Returns a translator that falls back to English, then to the key itself. */
export function t(lang: Lang) {
	const bundle = BUNDLES[lang];
	return (key: string): string => bundle[key] ?? BUNDLES[DEFAULT_LANG][key] ?? key;
}
