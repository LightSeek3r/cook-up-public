// Calls the real route handlers on SQLite (every migration applied, a tiny
// fixture) and checks the Cache-Control of every response branch: public data
// must be edge-cacheable, anything per-user or with side effects never.
// `.mjs` for node:sqlite.
import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { NEVER_CACHE, PUBLIC_DATA, PUBLIC_STATIC } from './httpCache';
import * as ingredients from '../routes/api/ingredients/+server';
import * as search from '../routes/api/search/+server';
import * as match from '../routes/api/match/+server';
import * as recipes from '../routes/api/recipes/+server';
import * as track from '../routes/api/track/+server';
import * as sitemap from '../routes/sitemap.xml/+server';
import * as robots from '../routes/robots.txt/+server';
import * as manifest from '../routes/manifest.webmanifest/+server';
import * as admin from '../routes/admin/+page.server';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
let platform;

beforeAll(() => {
	const sqlite = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort())
		sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
	sqlite.exec(`INSERT INTO ingredients (id, canonical_key, category, recipe_count) VALUES (1, 'egg', 'protein', 1);
		INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES (1, 'en', 'egg');
		INSERT INTO recipes (id, source_url, source_lang, license, non_staple_count) VALUES (7, 'u', 'en', 'PD', 1);
		INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES (7, 'en', 'Eggnog', '');
		INSERT INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (7, 1);
		INSERT INTO recipe_title_fts(rowid, title) SELECT rowid, title FROM recipe_i18n;
		INSERT INTO ingredient_fts(rowid, name) SELECT rowid, name FROM ingredient_i18n;`);
	const DB = {
		prepare: (sql) => {
			const make = (b) => ({
				bind: (...x) => make(x),
				all: async () => ({ results: sqlite.prepare(sql).all(...b) }),
				first: async () => sqlite.prepare(sql).get(...b) ?? null,
				run: async () => (sqlite.prepare(sql).run(...b), { meta: {} })
			});
			return make([]);
		}
	};
	platform = { env: { DB }, ctx: { waitUntil: () => {} } };
});

const get = (route, path) => route.GET({ url: new URL(`https://cook.test${path}`), platform });

describe('Cache-Control on every public GET branch', () => {
	it.each([
		[ingredients, '/api/ingredients?lang=en'],
		[ingredients, '/api/ingredients?lang=en&q=eg'],
		[ingredients, '/api/ingredients?lang=en&q=egg&v=1'],
		[search, '/api/search?q=eg&lang=en'],
		[search, '/api/search?q=egg&lang=en&v=1'],
		[match, '/api/match?lang=en'],
		[match, '/api/match?have=not_a_food&lang=en'],
		[match, '/api/match?have=egg&lang=en&v=1'],
		[recipes, '/api/recipes?lang=en'],
		[recipes, '/api/recipes?ids=7&lang=en'],
		[sitemap, '/sitemap.xml']
	])('%#: %s', async (route, path) => {
		const response = await get(route, path);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(PUBLIC_DATA);
	});

	it('serves real data on those branches, so the header is not only on empty answers', async () => {
		expect((await (await get(match, '/api/match?have=egg&lang=en')).json()).results).toHaveLength(1);
		expect((await (await get(search, '/api/search?q=eggn&lang=en')).json()).recipes).toHaveLength(1);
		expect(await (await get(sitemap, '/sitemap.xml')).text()).toContain('/recipe/7<');
	});

	it.each([
		[robots, '/robots.txt'],
		[manifest, '/manifest.webmanifest']
	])('%#: static %s', async (route, path) => {
		expect((await get(route, path)).headers.get('cache-control')).toBe(PUBLIC_STATIC);
	});

	it('robots.txt keeps crawlers out of /api/ and /admin', async () => {
		const body = await (await get(robots, '/robots.txt')).text();
		expect(body).toMatch(/^Disallow: \/api\/$/m);
		expect(body).toMatch(/^Disallow: \/admin$/m);
	});

	it.each([undefined, 'not-a-session'])('/admin is never cacheable (session cookie %s)', async (token) => {
		const headers = {};
		await admin.load({
			cookies: { get: () => token },
			platform,
			setHeaders: (h) => Object.assign(headers, h)
		});
		expect(headers['cache-control']).toBe(NEVER_CACHE);
	});

	it('/api/track is never cacheable', async () => {
		const response = await track.POST({
			url: new URL('https://cook.test/api/track?path=/&lang=en'),
			request: new Request('https://cook.test/api/track', { method: 'POST' }),
			platform
		});
		expect(response.status).toBe(204);
		expect(response.headers.get('cache-control')).toBe(NEVER_CACHE);
	});
});
