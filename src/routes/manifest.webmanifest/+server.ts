import { json } from '@sveltejs/kit';
import { PUBLIC_STATIC } from '$lib/httpCache';
import type { RequestHandler } from './$types';

/**
 * A dedicated endpoint rather than a static static/manifest.webmanifest file,
 * so the content-type is guaranteed to be application/manifest+json — static
 * asset serving guesses MIME from the extension, and `.webmanifest` isn't a
 * type every host maps correctly.
 */
export const GET: RequestHandler = () => {
	return json(
		{
			name: 'Cook Up',
			short_name: 'Cook Up',
			description: 'Pick what you have. Get recipes you can actually make.',
			start_url: '/',
			scope: '/',
			display: 'standalone',
			background_color: '#ecedee',
			theme_color: '#ecedee',
			icons: [
				{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
				{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
				{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
			]
		},
		{ headers: { 'content-type': 'application/manifest+json', 'cache-control': PUBLIC_STATIC } }
	);
};
