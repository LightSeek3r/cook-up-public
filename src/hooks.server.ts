import type { Handle } from '@sveltejs/kit';
import { resolveLang, dirFor } from '$lib/i18n';

/**
 * Injects the active language + text direction into `app.html`.
 *
 * `resolveLang` whitelists against SUPPORTED_LANGS, so the value interpolated
 * into the `<html>` attributes can never be attacker-controlled.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const lang = resolveLang(event.url.searchParams.get('lang'));
	const dir = dirFor(lang);

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%cookup.lang%', lang).replace('%cookup.dir%', dir)
	});
};
