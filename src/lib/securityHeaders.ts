/**
 * Response headers every response carries: hooks.server.ts sets them on what
 * the Worker renders, the project-root `_headers` file on static assets, which
 * the Workers asset layer serves without running the hook. securityHeaders.test
 * keeps the two identical.
 *
 * CSP is not here: SvelteKit generates it for pages (svelte.config.js
 * `kit.csp`), with hashes only it knows.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()',
	// Redundant with the CSP's frame-ancestors for modern browsers, kept for
	// the handful that only honour this older header.
	'x-frame-options': 'DENY'
};

/**
 * HTTPS only. A year, without `includeSubDomains` or `preload`: both are hard
 * to undo, and whatever custom domain the site moves to may have subdomains
 * that are not ready for them. `*.workers.dev` is on the preload list anyway.
 */
export const HSTS = 'max-age=31536000';
