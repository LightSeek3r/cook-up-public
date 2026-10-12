import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { buildVersion } from './scripts/lib/version.mjs';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// The git commit, so rebuilding one commit reproduces its chunk names
		// exactly (see scripts/lib/version.mjs).
		version: { name: buildVersion() },
		alias: {
			$components: 'src/components'
		},
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// Ingredient tiles set `style="--i: …"` inline for the reveal stagger —
				// a real inline attribute, which no nonce/hash can cover, only
				// 'unsafe-inline'. Scoped component CSS is extracted to build-time
				// files, not inlined, so this doesn't loosen anything script-side.
				'style-src': ['self', 'unsafe-inline'],
				// `upload.wikimedia.org` hosts the recipe photographs, hotlinked rather
				// than mirrored. This is the one third-party origin the site contacts,
				// and it is a deliberate trade rather than an oversight:
				//
				//   - Self-hosting 750 images would keep this directive at 'self' and
				//     preserve the zero-third-party-request property the project
				//     established when it dropped Google Fonts. It costs a build asset
				//     step and tens of megabytes of repo weight.
				//   - Hotlinking costs a DNS + TLS handshake to Wikimedia on any recipe
				//     page that has a photo, and leaks the visitor's IP and referrer
				//     to them.
				//
				// Chosen: hotlink. This is a content site, not an installable app, and
				// Wikimedia is a stable non-commercial host that already serves the
				// underlying recipe text. Narrowed to that exact host — NOT a wildcard —
				// so nothing else can load images. `referrerpolicy="no-referrer"` on the
				// <img> keeps the visitor's page out of Wikimedia's logs.
				'img-src': ['self', 'data:', 'https://upload.wikimedia.org'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};
