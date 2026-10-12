import { describe, it, expect } from 'vitest';
import { version } from '$app/environment';
import { apiUrl, NEVER_CACHE, PUBLIC_DATA, PUBLIC_STATIC, VERSION_PARAM } from './httpCache';

describe('apiUrl', () => {
	it('appends the build version after the given parameters', () => {
		const url = apiUrl('/api/search', { q: 'pie', lang: 'fr' });
		expect(url).toBe(`/api/search?q=pie&lang=fr&${VERSION_PARAM}=${encodeURIComponent(version)}`);
	});

	it('accepts a prebuilt query string, as the match request is one', () => {
		const url = new URL(apiUrl('/api/match', 'have=egg%2Conion&lang=en'), 'http://x');
		expect(url.searchParams.get('have')).toBe('egg,onion');
		expect(url.searchParams.get(VERSION_PARAM)).toBe(version);
	});

	it('does not mutate a URLSearchParams it is given', () => {
		const search = new URLSearchParams({ lang: 'en' });
		apiUrl('/api/ingredients', search);
		expect(search.has(VERSION_PARAM)).toBe(false);
	});
});

// The adapter's worker stores a GET response at the edge unless its
// Cache-Control matches /(private|no-cache|no-store)/i.
const adapterWouldStore = (value: string) => !/(private|no-cache|no-store)/i.test(value);

describe('header values', () => {
	it('public values are storable and carry an edge TTL where data is behind them', () => {
		expect(adapterWouldStore(PUBLIC_DATA)).toBe(true);
		expect(PUBLIC_DATA).toMatch(/\bs-maxage=\d+/);
		expect(adapterWouldStore(PUBLIC_STATIC)).toBe(true);
	});

	it('public data keeps its TTLs and lets the browser revalidate in the background', () => {
		expect(PUBLIC_DATA).toMatch(/\bmax-age=3600\b/);
		expect(PUBLIC_DATA).toMatch(/\bs-maxage=86400\b/);
		expect(PUBLIC_DATA).toMatch(/\bstale-while-revalidate=86400\b/);
	});

	it('NEVER_CACHE is never stored', () => {
		expect(adapterWouldStore(NEVER_CACHE)).toBe(false);
	});
});
