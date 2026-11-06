import { describe, expect, it } from 'vitest';
import { strategyFor } from './route';

const origin = 'https://cook-up.test';
const precached = new Set(['/offline', '/icon-192.png', '/_app/immutable/entry/app.abc.js']);

const strategy = (path: string, init: { method?: string; mode?: string; origin?: string } = {}) =>
	strategyFor({
		method: init.method ?? 'GET',
		url: new URL(path, init.origin ?? origin),
		origin,
		mode: init.mode ?? 'cors',
		precached
	});

describe('service worker routing', () => {
	it('answers build and static files from the precache', () => {
		expect(strategy('/offline')).toBe('precache');
		expect(strategy('/_app/immutable/entry/app.abc.js')).toBe('precache');
	});

	it('keeps content-addressed files cache-first', () => {
		expect(strategy('/data/core.bin?v=abc')).toBe('immutable');
		expect(strategy('/data/names/fr.json?v=abc')).toBe('immutable');
		expect(strategy('/_app/immutable/chunks/late.js')).toBe('immutable');
	});

	it('goes to the network first for navigations', () => {
		expect(strategy('/', { mode: 'navigate' })).toBe('navigation');
		expect(strategy('/recipe/12?lang=fr', { mode: 'navigate' })).toBe('navigation');
	});

	it.each(['/api/match?q=egg', '/api/track', '/admin', '/admin/login', '/manifest.webmanifest'])(
		'never intercepts %s',
		(path) => {
			expect(strategy(path, { mode: 'navigate' })).toBe('network');
			expect(strategy(path)).toBe('network');
		}
	);

	it('ignores writes, other origins and non-navigation fetches of pages', () => {
		expect(strategy('/api/track', { method: 'POST' })).toBe('network');
		expect(strategy('/data/core.bin', { method: 'POST' })).toBe('network');
		expect(strategy('/photo.jpg', { origin: 'https://upload.wikimedia.org' })).toBe('network');
		expect(strategy('/recipe/12')).toBe('network');
	});
});
