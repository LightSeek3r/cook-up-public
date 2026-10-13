// How the API routes, the recipe page and the sitemap obtain the data
// artefacts: what they fetch from ASSETS and when, that they never touch D1,
// and that unreadable artefacts are a DataUnavailableError (answered 503 by
// the error hook) and not a 500 or a D1 fallback. On the e2e seed, artefacts
// built in memory. `.mjs` for node:sqlite (buildArtefacts).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildArtefacts, fixtureDb } from '../../../pipeline/lib/artefacts.mjs';
import { artefactAssets, throwingDb } from '../test/assets';
import { DataUnavailableError, d1Outage } from '../apiError';
import * as ingredients from '../../routes/api/ingredients/+server';
import * as search from '../../routes/api/search/+server';
import * as match from '../../routes/api/match/+server';
import * as recipes from '../../routes/api/recipes/+server';
import * as sitemap from '../../routes/sitemap.xml/+server';
import * as recipePage from '../../routes/recipe/[id]/+page.server';

const SEED = readFileSync(new URL('../../../tests/e2e/fixtures/seed.sql', import.meta.url), 'utf8');
const { files: FILES } = buildArtefacts(fixtureDb(SEED));
// The same corpus with one name changed: another data version.
const { files: OTHER, version: OTHER_VERSION } = buildArtefacts(
	fixtureDb(`${SEED}\nUPDATE ingredient_i18n SET name = 'Oignon jaune' WHERE ingredient_id = 2 AND lang = 'fr';`)
);

const ROUTES = { '/api/ingredients': ingredients, '/api/search': search, '/api/match': match, '/api/recipes': recipes, '/sitemap.xml': sitemap };
const DATA_URLS = [
	'/api/match?have=tomato,onion&lang=fr',
	'/api/search?q=rice&lang=fr',
	'/api/ingredients?lang=fr&q=oig',
	'/api/ingredients?lang=fr',
	'/api/recipes?ids=1,2&lang=fr'
];

/** A fresh binding (so a fresh corpus) over `files`, with a D1 that throws if touched. */
function platformOver(files) {
	const ASSETS = artefactAssets(files);
	return { ASSETS, platform: { env: { DB: throwingDb, ASSETS }, ctx: { waitUntil: () => {} } } };
}

const get = (path, platform) => {
	const url = new URL(path, 'https://cook.test');
	return ROUTES[url.pathname].GET({ url, platform });
};

describe('loading', () => {
	it('fetches core.bin and English once, then two small files per new language, then nothing', async () => {
		const { ASSETS, platform } = platformOver(FILES);
		const body = await (await get('/api/match?have=tomato&lang=en', platform)).json();
		expect(body.results.map((r) => r.id)).toEqual([1, 2]);
		expect(ASSETS.fetched.sort()).toEqual(['/data/core.bin', '/data/names/en.json', '/data/titles/en.json']);

		ASSETS.fetched.length = 0;
		const fr = await (await get('/api/match?have=tomato,onion&lang=fr', platform)).json();
		expect(fr.results[0].title).toBe("Ragoût de tomates et d'oignons");
		expect(ASSETS.fetched.sort()).toEqual(['/data/names/fr.json', '/data/titles/fr.json']);

		ASSETS.fetched.length = 0;
		for (const path of DATA_URLS.filter((p) => !p.includes('lang=fr&q') && !p.endsWith('lang=fr'))) {
			expect((await get(path, platform)).status).toBe(200);
		}
		expect(ASSETS.fetched).toEqual([]);
	});

	it('serves the mosaic file as the body and fetches it once', async () => {
		const { ASSETS, platform } = platformOver(FILES);
		const first = await get('/api/ingredients?lang=ar', platform);
		const second = await get('/api/ingredients?lang=ar', platform);
		const text = await first.text();
		expect(await second.text()).toBe(text);
		expect(JSON.parse(text).results.find((t) => t.canonical_key === 'onion').name).toBe('بصل');
		expect(Object.keys(JSON.parse(text))).toEqual(['results']);
		expect(first.headers.get('content-type')).toBe('application/json');
		expect(first.headers.get('content-length')).toBe(String(new TextEncoder().encode(text).length));
		expect(ASSETS.fetched.filter((p) => p.startsWith('/data/mosaic/'))).toEqual(['/data/mosaic/ar.json']);
	});

	it.each([
		'/api/match?lang=en',
		'/api/match?have=1,2&lang=en',
		'/api/match?have=egg&offset=2.5',
		'/api/search?q=eg&lang=en',
		'/api/ingredients?lang=en&q=eg',
		'/api/recipes?lang=en',
		'/api/recipes?ids=x,-1'
	])('%s is answered without any data or D1', async (path) => {
		const response = await get(path, { env: { DB: throwingDb } });
		expect([200, 400]).toContain(response.status);
	});

	it('the routes never read D1, every branch (the D1 stub throws on any access)', async () => {
		const { platform } = platformOver(FILES);
		for (const path of DATA_URLS) expect((await get(path, platform)).status, path).toBe(200);
	});
});

describe('unreadable artefacts are a DataUnavailableError, never a D1 fallback', () => {
	const without = (...paths) => new Map([...FILES].filter(([p]) => !paths.includes(p)));
	const replaced = (path, body) => new Map([...FILES, [path, body]]);
	/** Every data URL against `files` rejects with DataUnavailableError, a transient outage. */
	const unavailable = async (files, urls = DATA_URLS) => {
		for (const path of urls) {
			const { platform } = platformOver(files);
			const error = await get(path, platform).then(
				() => null,
				(e) => e
			);
			expect(error, path).toBeInstanceOf(DataUnavailableError);
			expect(d1Outage(error)).toBe('transient');
		}
	};

	it('no ASSETS binding', async () => {
		for (const path of DATA_URLS) await expect(get(path, { env: { DB: throwingDb } }), path).rejects.toBeInstanceOf(DataUnavailableError);
	});

	it('core.bin missing', () => unavailable(without('core.bin')));
	it('names/en.json missing', () => unavailable(without('names/en.json')));
	it("the request language's files missing", async () => {
		await unavailable(without('names/fr.json'), DATA_URLS.filter((p) => !p.endsWith('lang=fr')));
		await unavailable(without('titles/fr.json'), DATA_URLS.filter((p) => !p.endsWith('lang=fr')));
		await unavailable(without('mosaic/fr.json'), ['/api/ingredients?lang=fr']);
	});

	it('core.bin corrupt or truncated', async () => {
		await unavailable(replaced('core.bin', Buffer.from('not a core file at all')));
		await unavailable(replaced('core.bin', FILES.get('core.bin').subarray(0, 200)));
	});

	it('a file from another data build', async () => {
		expect(OTHER_VERSION).not.toBe(JSON.parse(FILES.get('names/en.json').toString()).version);
		await unavailable(replaced('names/en.json', OTHER.get('names/en.json')));
		await unavailable(replaced('names/fr.json', OTHER.get('names/fr.json')), DATA_URLS.filter((p) => !p.endsWith('lang=fr')));
		await unavailable(replaced('titles/fr.json', OTHER.get('titles/fr.json')), DATA_URLS.filter((p) => !p.endsWith('lang=fr')));
		await unavailable(replaced('mosaic/fr.json', OTHER.get('mosaic/fr.json')), ['/api/ingredients?lang=fr']);
	});

	it('a failure is not remembered: the next request retries and succeeds', async () => {
		const ASSETS = artefactAssets(FILES);
		let failures = 2;
		const flaky = {
			fetch: (input) => (failures-- > 0 ? Promise.resolve(new Response('busy', { status: 503 })) : ASSETS.fetch(input))
		};
		const platform = { env: { DB: throwingDb, ASSETS: flaky } };
		await expect(get('/api/match?have=tomato&lang=fr', platform)).rejects.toBeInstanceOf(DataUnavailableError);
		const response = await get('/api/match?have=tomato&lang=fr', platform);
		expect(response.status).toBe(200);
		expect((await response.json()).total).toBe(2);
	});
});

describe('the recipe page and the sitemap', () => {
	/** The load's result, or what it threw. */
	const page = (path, platform) => {
		const url = new URL(path, 'https://cook.test');
		const id = decodeURIComponent(url.pathname.slice('/recipe/'.length));
		return recipePage.load({ params: { id }, url, platform }).catch((error) => ({ error }));
	};
	const without = (...paths) => new Map([...FILES].filter(([p]) => !paths.includes(p)));
	const replaced = (path, body) => new Map([...FILES, [path, body]]);

	it("fetches the corpus once, then only each viewed recipe's own file", async () => {
		const { ASSETS, platform } = platformOver(FILES);
		const fr = await page('/recipe/1?lang=fr', platform);
		expect(fr.recipe.title).toBe("Ragoût de tomates et d'oignons");
		expect(fr.recipe.is_machine).toBe(1);
		expect(fr.recipe.ingredients.map((i) => i.name)).toEqual(['Tomate', 'Oignon', 'Sel']);
		expect(fr.related.map((r) => r.id)).toEqual([2, 3]);
		expect(ASSETS.fetched.sort()).toEqual([
			'/data/core.bin',
			'/data/names/en.json',
			'/data/names/fr.json',
			'/data/r/1.json',
			'/data/titles/fr.json'
		]);

		ASSETS.fetched.length = 0;
		const untranslated = await page('/recipe/2?lang=fr', platform);
		expect(untranslated.recipe.title).toBe('Garlic tomato rice');
		expect(untranslated.recipe.is_machine).toBe(0);
		expect(ASSETS.fetched).toEqual(['/data/r/2.json']);
	});

	it('an unknown id is a 404 and an invalid one a 400 that loads nothing, never D1', async () => {
		const { ASSETS, platform } = platformOver(FILES);
		for (const path of ['/recipe/7?lang=en', '/recipe/999999', '/recipe/5869?lang=ar']) {
			const { error } = await page(path, platform);
			expect({ status: error.status, body: error.body }, path).toEqual({ status: 404, body: { message: 'recipe not found' } });
		}
		ASSETS.fetched.length = 0;
		for (const path of ['/recipe/0', '/recipe/-3', '/recipe/abc', '/recipe/2.5']) {
			const { error } = await page(path, platform);
			expect({ status: error.status, body: error.body }, path).toEqual({ status: 400, body: { message: 'invalid recipe id' } });
		}
		expect(ASSETS.fetched).toEqual([]);
	});

	it.each([
		['no ASSETS binding', null],
		['core.bin missing', without('core.bin')],
		["the language's names missing", without('names/fr.json')],
		["the recipe's file missing", without('r/1.json')],
		["the recipe's file corrupt", replaced('r/1.json', Buffer.from('{"recipe":'))],
		["another recipe's file", replaced('r/1.json', FILES.get('r/2.json'))],
		['an empty file', replaced('r/1.json', Buffer.from('null'))]
	])('%s: the page load throws DataUnavailableError', async (_, files) => {
		const platform = files ? platformOver(files).platform : { env: { DB: throwingDb } };
		const { error } = await page('/recipe/1?lang=fr', platform);
		expect(error).toBeInstanceOf(DataUnavailableError);
		expect(d1Outage(error)).toBe('transient');
	});

	it('the sitemap lists every recipe from sitemap.json', async () => {
		const { ASSETS, platform } = platformOver(FILES);
		const body = await (await get('/sitemap.xml', platform)).text();
		expect(body.match(/\/recipe\/\d+/g)).toEqual([1, 2, 3, 4, 5, 6].map((id) => `/recipe/${id}`));
		expect(ASSETS.fetched).toEqual(['/data/sitemap.json']);
	});

	it.each([
		['missing', without('sitemap.json')],
		['corrupt', replaced('sitemap.json', Buffer.from('{"ids":[1,'))],
		['without ids', replaced('sitemap.json', Buffer.from('{"ids":["1"]}'))]
	])('sitemap.json %s: DataUnavailableError', async (_, files) => {
		await expect(get('/sitemap.xml', platformOver(files).platform)).rejects.toBeInstanceOf(DataUnavailableError);
	});
});
