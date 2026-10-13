// The public API routes over the data artefacts built from a small SQLite
// corpus (every migration applied), the sitemap over that SQLite through the
// shared D1 adapter and its 100-bind cap: input validation, the answers that
// must load no data at all, and the property the edge-cache key normalisation
// in hooks.server.ts rests on — a raw URL and its canonical URL get the same
// response. `.mjs` for node:sqlite.
import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { version } from '$app/environment';
import { canonicalUrl, MAX_HAVE, MAX_IDS } from './apiParams';
import { sqliteD1 } from './test/d1';
import { artefactAssets } from './test/assets';
import { buildArtefacts } from '../../pipeline/lib/artefacts.mjs';
import * as ingredients from '../routes/api/ingredients/+server';
import * as search from '../routes/api/search/+server';
import * as match from '../routes/api/match/+server';
import * as recipes from '../routes/api/recipes/+server';
import * as sitemap from '../routes/sitemap.xml/+server';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
const ORIGIN = 'https://cook.test';
const KEYS = ['egg', 'onion', 'garlic', 'tomato', 'milk', 'flour', 'butter', 'leek'];
const RECIPES = 160;
let platform;

/** A platform with no data artefacts, whose D1 fails the test if anything reaches it. */
const noDb = {
	env: {
		DB: {
			prepare: () => {
				throw new Error('reached D1');
			}
		}
	}
};

beforeAll(() => {
	const sqlite = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort())
		sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
	const run = (sql, rows) => {
		const st = sqlite.prepare(sql);
		for (const r of rows) st.run(...r);
	};
	run(`INSERT INTO ingredients (id, canonical_key, category) VALUES (?, ?, 'other')`, KEYS.map((key, k) => [k + 1, key]));
	run(`INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES (?, ?, ?)`, [
		...KEYS.map((key, k) => [k + 1, 'en', key]),
		[1, 'fr', 'œuf'],
		[2, 'fr', 'oignon']
	]);
	const ids = Array.from({ length: RECIPES }, (_, k) => 10 + k * 3);
	run(`INSERT INTO recipes (id, source_url, source_lang, license, total_minutes) VALUES (?, 'u', 'en', 'PD', ?)`,
		ids.map((id, k) => [id, k % 7 ? 5 + (k % 40) : null]));
	run(`INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES (?, ?, ?, '')`, [
		...ids.map((id, k) => [id, 'en', `${KEYS[k % KEYS.length]} dish ${id}`]),
		...ids.filter((_, k) => k % 3 === 0).map((id) => [id, 'fr', `plat ${id}`])
	]);
	run(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (?, ?)`,
		ids.flatMap((id, k) => KEYS.map((_, i) => i + 1).filter((i) => (k + i) % 3 !== 0).map((i) => [id, i])));
	sqlite.exec(`UPDATE ingredients SET recipe_count = (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = ingredients.id);
		UPDATE recipes SET non_staple_count = (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = recipes.id);
		INSERT INTO recipe_title_fts(rowid, title) SELECT rowid, title FROM recipe_i18n WHERE lang = 'en';
		INSERT INTO ingredient_fts(rowid, name) SELECT rowid, name FROM ingredient_i18n;`);
	platform = {
		env: { DB: sqliteD1(sqlite), ASSETS: artefactAssets(buildArtefacts(sqlite).files) },
		ctx: { waitUntil: () => {} }
	};
});

const ROUTES = {
	'/api/ingredients': ingredients,
	'/api/search': search,
	'/api/match': match,
	'/api/recipes': recipes,
	'/sitemap.xml': sitemap
};
const get = (pathAndQuery, on = platform) => {
	const url = new URL(pathAndQuery, ORIGIN);
	return ROUTES[url.pathname].GET({ url, platform: on });
};

describe('/api/match input validation', () => {
	it.each(['2.5', '1e999', '-1', 'abc', '10001'])('offset=%s is a 400 that loads no data', async (offset) => {
		const response = await get(`/api/match?have=egg&lang=en&offset=${offset}`, noDb);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'bad_request' });
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('a valid offset pages through the matches', async () => {
		const first = await (await get('/api/match?have=egg&lang=en')).json();
		const second = await (await get('/api/match?have=egg&lang=en&offset=50')).json();
		expect(first.total).toBeGreaterThan(50);
		expect(second.total).toBe(first.total);
		expect(second.results[0].id).not.toBe(first.results[0].id);
	});

	it(`a selection over MAX_HAVE (${MAX_HAVE}) is a 400 that loads no data`, async () => {
		const many = Array.from({ length: MAX_HAVE + 1 }, (_, k) => `ing_${k}`).join(',');
		const response = await get(`/api/match?have=${many}&lang=en`, noDb);
		expect(response.status).toBe(400);
	});

	it('a selection of exactly MAX_HAVE keys is answered', async () => {
		const many = [...KEYS, ...Array.from({ length: MAX_HAVE - KEYS.length }, (_, k) => `ing_${k}`)].join(',');
		const response = await get(`/api/match?have=${many}&lang=en`);
		expect(response.status).toBe(200);
		expect((await response.json()).haveCount).toBe(KEYS.length);
	});
});

describe('answers that load no data', () => {
	it.each(['e', 'eg', '卵', '鸡肉'])('/api/ingredients?q=%s (the page filters short queries itself)', async (q) => {
		const response = await get(`/api/ingredients?lang=en&q=${encodeURIComponent(q)}`, noDb);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ results: [] });
	});

	it.each(['', 'e', 'eg', '  eg  '])('/api/search?q=%s', async (q) => {
		const response = await get(`/api/search?lang=en&q=${encodeURIComponent(q)}`, noDb);
		expect(await response.json()).toEqual({ recipes: [] });
	});

	it.each(['/api/match?lang=en', '/api/match?have=1,2&lang=en', '/api/recipes?lang=en', '/api/recipes?ids=x,-1'])(
		'%s',
		async (path) => {
			expect((await get(path, noDb)).status).toBe(200);
		}
	);

	it('a three-character query does use the index', async () => {
		const response = await get('/api/ingredients?lang=fr&q=oig');
		expect((await response.json()).results.map((r) => r.canonical_key)).toEqual(['onion']);
	});
});

describe('/api/recipes for long favorites lists', () => {
	it('answers 150 favorites, as a long favorites list sends them', async () => {
		const ids = Array.from({ length: 150 }, (_, k) => 10 + k * 3).reverse();
		const response = await get(`/api/recipes?ids=${ids.join(',')}&lang=fr`);
		expect(response.status).toBe(200);
		const { recipes: rows } = await response.json();
		expect(rows.map((r) => r.id)).toEqual([...ids].sort((a, b) => a - b));
		expect(rows[0].title).toBe('plat 10');
		expect(rows[1].title).toBe('onion dish 13');
	});

	it(`answers MAX_IDS (${MAX_IDS}) ids and drops the highest past that`, async () => {
		const ids = Array.from({ length: MAX_IDS + 10 }, (_, k) => k + 1);
		const { recipes: rows } = await (await get(`/api/recipes?ids=${ids.join(',')}&lang=en`)).json();
		expect(rows.length).toBe(rows.filter((r) => r.id <= MAX_IDS).length);
		expect(rows.length).toBeGreaterThan(100);
	});
});

describe('a raw URL and its canonical URL get the same response', () => {
	it.each([
		'/api/ingredients?q=oni&lang=fr&junk=1',
		'/api/ingredients?lang=de',
		'/api/ingredients',
		'/api/search?lang=en&q=%20dish%2013%20&v=old',
		'/api/match?have=onion,egg,Egg&lang=fr&_r=7',
		'/api/match?sort=time&have=leek,garlic,onion,egg&must=egg,tofu,leek&lang=en&offset=0',
		'/api/match?have=garlic,egg,onion&must=garlic&noAllergen=gluten,gluten,dairy&diet=keto&lang=fr&offset=050',
		'/api/match?have=egg&cuisine=mars&lang=xx',
		'/api/recipes?ids=91,13,10,13,abc&lang=fr&x=y',
		'/sitemap.xml?_r=1'
	])('%s', async (path) => {
		const raw = new URL(path, ORIGIN);
		const key = canonicalUrl(raw, version);
		expect(key).not.toBeNull();
		expect(key).not.toBe(raw.href);
		const [a, b] = await Promise.all([get(path), get(key)]);
		expect(a.status).toBe(200);
		expect(b.status).toBe(200);
		expect(await b.text()).toBe(await a.text());
	});
});
