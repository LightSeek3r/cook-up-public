import { describe, it, expect } from 'vitest';
import {
	MAX_PATH,
	deviceFrom,
	isTrackablePath,
	normaliseLang,
	normalisePath,
	recipeIdFromPath,
	recordPageView,
	referrerHost
} from './analytics';
import type { D1Database } from '@cloudflare/workers-types';

function spyDb() {
	const calls: { sql: string; binds: unknown[] }[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					return { run: async () => ({ success: true }) };
				}
			};
		}
	} as unknown as D1Database;
	return { db, calls };
}

describe('normalisePath', () => {
	it('keeps a plain same-origin path', () => {
		expect(normalisePath('/recipe/42')).toBe('/recipe/42');
	});

	it('drops the query string, which is where the ingredient selection lives', () => {
		expect(normalisePath('/?have=onion,garlic&lang=fr')).toBe('/');
		expect(normalisePath('/recipe/7#steps')).toBe('/recipe/7');
	});

	it('rejects anything that is not an absolute same-origin path', () => {
		expect(normalisePath(null)).toBeNull();
		expect(normalisePath('')).toBeNull();
		expect(normalisePath('recipe/42')).toBeNull();
		expect(normalisePath('https://evil.example/x')).toBeNull();
		// Protocol-relative: `//evil.example` is a different origin, not a path.
		expect(normalisePath('//evil.example/x')).toBeNull();
	});

	it('rejects a path longer than the cap', () => {
		expect(normalisePath('/' + 'a'.repeat(MAX_PATH))).toBeNull();
	});
});

describe('recipeIdFromPath', () => {
	it('extracts the id so views-per-recipe is an indexed group-by', () => {
		expect(recipeIdFromPath('/recipe/1234')).toBe(1234);
	});

	it('is null for every non-recipe path', () => {
		expect(recipeIdFromPath('/')).toBeNull();
		expect(recipeIdFromPath('/favorites')).toBeNull();
		expect(recipeIdFromPath('/recipe/abc')).toBeNull();
		expect(recipeIdFromPath('/recipe/12/extra')).toBeNull();
	});
});

describe('isTrackablePath', () => {
	it('accepts only the three real page routes', () => {
		expect(isTrackablePath('/')).toBe(true);
		expect(isTrackablePath('/favorites')).toBe(true);
		expect(isTrackablePath('/recipe/9')).toBe(true);
	});

	it('rejects probes, the admin page, and anything unbounded', () => {
		expect(isTrackablePath('/admin')).toBe(false);
		expect(isTrackablePath('/wp-login.php')).toBe(false);
		expect(isTrackablePath('/api/track')).toBe(false);
		expect(isTrackablePath('/recipe/')).toBe(false);
	});
});

describe('normaliseLang', () => {
	it('accepts a supported language and rejects everything else', () => {
		expect(normaliseLang('fr')).toBe('fr');
		expect(normaliseLang('ar')).toBe('ar');
		expect(normaliseLang('xx')).toBeNull();
		expect(normaliseLang(null)).toBeNull();
	});
});

describe('referrerHost', () => {
	it('keeps the host only, never the path or query', () => {
		expect(referrerHost('https://news.example/a/b?c=d', 'cook-up.app')).toBe('news.example');
	});

	it('drops our own host, so internal navigation is not a referral', () => {
		expect(referrerHost('https://cook-up.app/recipe/1', 'cook-up.app')).toBeNull();
		expect(referrerHost('https://COOK-UP.app/x', 'cook-up.app')).toBeNull();
	});

	it('is null for absent or unparseable values', () => {
		expect(referrerHost(null, 'cook-up.app')).toBeNull();
		expect(referrerHost('not a url', 'cook-up.app')).toBeNull();
	});
});

describe('deviceFrom', () => {
	it('prefers the client hint when the browser sends one', () => {
		expect(deviceFrom('?1', 'Mozilla/5.0 (Macintosh)')).toBe('mobile');
		expect(deviceFrom('?0', 'Mozilla/5.0 (iPhone)')).toBe('desktop');
	});

	it('falls back to the user agent for browsers that send no hint', () => {
		expect(deviceFrom(null, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile');
		expect(deviceFrom(null, 'Mozilla/5.0 (X11; Linux x86_64)')).toBe('desktop');
		expect(deviceFrom(null, null)).toBe('desktop');
	});
});

describe('recordPageView', () => {
	it('binds every column in order, with the visit flag as 0/1', async () => {
		const { db, calls } = spyDb();
		await recordPageView(db, {
			path: '/recipe/42',
			recipeId: 42,
			lang: 'fr',
			country: 'FR',
			referrerHost: 'news.example',
			device: 'mobile',
			isNewVisit: true
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].sql).toContain('INSERT INTO page_view');
		expect(calls[0].binds).toEqual(['/recipe/42', 42, 'fr', 'FR', 'news.example', 'mobile', 1]);
	});

	it('writes nulls rather than placeholder strings when data is absent', async () => {
		const { db, calls } = spyDb();
		await recordPageView(db, {
			path: '/',
			recipeId: null,
			lang: null,
			country: null,
			referrerHost: null,
			device: 'desktop',
			isNewVisit: false
		});

		expect(calls[0].binds).toEqual(['/', null, null, null, null, 'desktop', 0]);
	});
});
