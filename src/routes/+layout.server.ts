import { resolveLang } from '$lib/i18n';
import { messagesFor } from '$lib/i18n/messages.server';
import type { LayoutServerLoad } from './$types';

// searchParams.get tracks only `lang`, so changing ?have or ?q never refetches
// the dictionary; switching language does, as a few-KB __data.json.
export const load: LayoutServerLoad = ({ url }) => {
	const lang = resolveLang(url.searchParams.get('lang'));
	return { lang, messages: messagesFor(lang) };
};
