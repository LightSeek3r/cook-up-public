import { DEFAULT_LANG, type Lang } from '$lib/config';
import type { Messages } from './index';
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

export const BUNDLES: Record<Lang, Messages> = {
	en, es, fr, de, ar, hi, zh, ja, ko, vi, pt, it, bn, ru, pnb, jv
};

const merged = new Map<Lang, Messages>();

/**
 * The one dictionary a page in `lang` needs, English filled in underneath, so the
 * browser never has to download English as well just for fallbacks.
 */
export function messagesFor(lang: Lang): Messages {
	let hit = merged.get(lang);
	if (!hit) {
		hit = lang === DEFAULT_LANG ? BUNDLES.en : { ...BUNDLES.en, ...BUNDLES[lang] };
		merged.set(lang, hit);
	}
	return hit;
}
