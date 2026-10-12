import { registerMessages } from '$lib/i18n';
import type { LayoutLoad } from './$types';

// Registered in a load, not in the layout component: loads finish before any
// component renders, on the server and on every client navigation, so no t()
// call can run against a language whose dictionary has not arrived yet.
export const load: LayoutLoad = ({ data }) => {
	registerMessages(data.lang, data.messages);
	return data;
};
