import { loadGlossary, toSummary } from '$lib/glossary/load';
import { resolveLang } from '$lib/i18n';
import type { PageServerLoad } from './$types';

// Server-only so the content never ships as JS: a universal load re-ran in the
// browser on hydration and downloaded every term's full text in two languages.
// Reads `lang` through searchParams.get so SvelteKit tracks only that key:
// changing ?q or ?cat (the debounced URL sync) must not re-run this load.
export const load: PageServerLoad = async ({ url }) => {
	const lang = resolveLang(url.searchParams.get('lang'));
	return { lang, entries: (await loadGlossary(lang)).map(toSummary) };
};
