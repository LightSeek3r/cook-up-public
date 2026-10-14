// The project-root `_headers` file (static assets) against the headers the
// hook sets (Worker responses). `.mjs` for node:fs.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { HSTS, SECURITY_HEADERS } from './securityHeaders';

const ROOT = new URL('../../', import.meta.url);

/** The subset of Cloudflare's `_headers` grammar this file uses: a path line,
 *  then indented `Name: value` lines. */
function parseHeadersFile(text) {
	const rules = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		if (line.startsWith('/')) rules.push({ path: line, headers: {} });
		else {
			const at = line.indexOf(':');
			rules.at(-1).headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
		}
	}
	return rules;
}

describe('_headers', () => {
	const text = readFileSync(new URL('_headers', ROOT), 'utf8');

	it('is at the project root, never in static/, where adapter-cloudflare refuses to build', () => {
		expect(existsSync(new URL('static/_headers', ROOT))).toBe(false);
	});

	const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' };

	it('gives every static asset the same security headers as the hook, and the browser-match artefacts long-term caching', () => {
		expect(parseHeadersFile(text)).toEqual([
			{ path: '/*', headers: { ...SECURITY_HEADERS, 'strict-transport-security': HSTS } },
			// A type Cloudflare compresses; application/octet-stream goes out raw.
			{ path: '/data/core.bin', headers: { ...IMMUTABLE, 'content-type': 'application/x-protobuf' } },
			{ path: '/data/names/*', headers: IMMUTABLE },
			{ path: '/data/titles/*', headers: IMMUTABLE }
		]);
	});

	it('sets Cache-Control only under /data/, so the adapter\'s immutable rule for /_app/immutable/* stands', () => {
		for (const rule of parseHeadersFile(text)) {
			if (!rule.path.startsWith('/data/')) expect(rule.headers, rule.path).not.toHaveProperty('cache-control');
		}
		expect(text).not.toMatch(/^\s*!/m);
	});

	it('uses LF line endings, which the parser splits on', () => {
		expect(text).not.toContain('\r');
	});
});
