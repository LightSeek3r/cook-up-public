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
			id: '/',
			name: 'Cook Up',
			short_name: 'Cook Up',
			description: 'Pick what you have. Get recipes you can actually make.',
			start_url: '/',
			scope: '/',
			display: 'standalone',
			background_color: '#ecedee',
			theme_color: '#ecedee',
			categories: ['food', 'lifestyle'],
			icons: [
				{
					src: '/icon-192.png',
					sizes: '192x192',
					type: 'image/png',
					purpose: 'any'
				},
				{
					src: '/icon-512.png',
					sizes: '512x512',
					type: 'image/png',
					purpose: 'any'
				},
				// Full-bleed with the mark inside the maskable safe circle
				// (scripts/gen-brand-icons.mjs), so the same file serves launchers that
				// crop. Two entries, not one `any maskable`: that combination is
				// discouraged because `any` icons are not meant to be cropped.
				{
					src: '/icon-512.png',
					sizes: '512x512',
					type: 'image/png',
					purpose: 'maskable'
				},
				{
					src: '/favicon.svg',
					sizes: 'any',
					type: 'image/svg+xml',
					purpose: 'any'
				}
			],
			shortcuts: [
				{
					name: 'Favorites',
					url: '/favorites',
					icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
				},
				{
					name: 'In season',
					url: '/seasonal',
					icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
				}
			]
		},
		{
			headers: {
				'content-type': 'application/manifest+json',
				'cache-control': PUBLIC_STATIC
			}
		}
	);
};
