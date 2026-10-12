import { loadGlossary } from '$lib/glossary/load';
import { resolveLang } from '$lib/i18n';
import type { PageLoad } from './$types';

// Reads `lang` through searchParams.get so SvelteKit tracks only that key:
// changing ?q or ?cat (the debounced URL sync) must not re-run this load.
export const load: PageLoad = async ({ url }) => {
	const lang = resolveLang(url.searchParams.get('lang'));
	return { lang, entries: await loadGlossary(lang) };
};
