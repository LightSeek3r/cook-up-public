// Artefacts vs the SQL they replace, on one database: the real API route
// handlers, sitemap and recipe page load (reading the artefacts through a
// fake ASSETS binding, with a D1 that throws if touched) against the D1
// implementations they replaced (test/sqlRoutes.ts) and the SQL query
// functions, on SQLite with every migration applied, through the shared D1
// adapter. Byte-identical responses are the bar: status, headers, body, key
// order and ties; for the page, its data as JSON or the error it throws.
//
// Runs on pipeline/fixtures/artefact-corpus.sql (a real slice of the corpus)
// always; with DATA_PARITY_DB=<sqlite file> (09_build_artefacts.mjs --save-db)
// also on the full corpus.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from '../test/d1';
import { artefactAssets, throwingDb } from '../test/assets';
import { SQL_ROUTES, sqlRecipePageLoad } from '../test/sqlRoutes';
import { matchRecipes } from '../test/sql/match';
import { searchRecipeTitles, getRecipesByIds } from '../test/sql/search';
import { buildArtefacts, fixtureDb } from '../../../pipeline/lib/artefacts.mjs';
import { loadCorpus, matchCore, recipesByIds, searchTitles, slackFor, titleQueryReady } from './index.js';
import { referenceTitleSearch } from '../test/titleSearch.mjs';
import { parseSearchQuery } from '../apiParams';
import * as ingredientsRoute from '../../routes/api/ingredients/+server';
import * as searchRoute from '../../routes/api/search/+server';
import * as matchRoute from '../../routes/api/match/+server';
import * as recipesRoute from '../../routes/api/recipes/+server';
import * as sitemapRoute from '../../routes/sitemap.xml/+server';
import * as recipePageServer from '../../routes/recipe/[id]/+page.server';
import { openMatchData } from '../client/matchData';
import { matchRequest } from '../matchRequest';

const FIXTURE = new URL('../../../pipeline/fixtures/artefact-corpus.sql', import.meta.url);
const ORIGIN = 'https://cook.test';
const LANGS = ['en', 'es', 'fr', 'de', 'ar', 'hi', 'zh', 'ja', 'ko', 'vi', 'pt', 'it', 'bn', 'ru', 'pnb', 'jv'];
const ALLERGEN_KEYS = ['gluten', 'dairy', 'nut', 'peanut', 'egg', 'soy', 'fish', 'shellfish', 'sesame'];
const DIETS = ['vegan', 'vegetarian', 'pescatarian', 'gluten_free', 'dairy_free'];
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'side'];

/** The artefact set of `db`, loaded the way a Worker would: text files as strings. */
function artefactsOf(db) {
	const { files } = buildArtefacts(db);
	const text = (prefix) =>
		Object.fromEntries(
			[...files]
				.filter(([p]) => p.startsWith(prefix))
				.map(([p, body]) => [p.slice(prefix.length, -'.json'.length), body.toString('utf8')])
		);
	const corpus = loadCorpus({ core: files.get('core.bin'), titles: text('titles/'), names: text('names/') });
	const json = (p) => JSON.parse(files.get(p).toString('utf8'));
	return { files, corpus, json };
}

const ROUTES = {
	'/api/match': matchRoute,
	'/api/search': searchRoute,
	'/api/ingredients': ingredientsRoute,
	'/api/recipes': recipesRoute,
	'/sitemap.xml': sitemapRoute
};

/** Everything a client can observe of a response. */
async function observed(response) {
	return { status: response.status, headers: [...response.headers], body: await response.text() };
}

/** Same deterministic generator as C:\tmp\d1-match-a\compare.mjs. */
function random(seed) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** matchRecipes inputs covering every option, sized by `n`. */
function matchCases(sqlite, n) {
	const rnd = random(12345);
	const pickN = (pool, k) => {
		const p = [...pool];
		const out = [];
		while (out.length < k && p.length) out.push(p.splice(Math.floor(rnd() * p.length), 1)[0]);
		return out;
	};
	const pick = (list) => list[Math.floor(rnd() * list.length)];
	const ids = (q) => sqlite.prepare(q).all().map((r) => Number(r.id));
	const pop = ids('SELECT id FROM ingredients WHERE is_staple = 0 ORDER BY recipe_count DESC, id LIMIT 40');
	const staples = ids('SELECT id FROM ingredients WHERE is_staple = 1 ORDER BY recipe_count DESC, id LIMIT 5');
	const generics = ids('SELECT generic_id AS id FROM ingredient_generic_of GROUP BY generic_id ORDER BY COUNT(*) DESC, generic_id LIMIT 15');
	const all = ids('SELECT id FROM ingredients ORDER BY id');
	const cuisines = sqlite.prepare('SELECT DISTINCT cuisine AS c FROM recipes WHERE cuisine IS NOT NULL ORDER BY c').all().map((r) => r.c);
	const pool = [...pop, ...generics, ...staples.slice(0, 3)];
	const cases = [];
	for (const id of [...pop.slice(0, 10), ...staples.slice(0, 2), ...generics.slice(0, 5)]) cases.push({ have: [id], lang: 'en' });
	for (const sort of [undefined, 'kcal', 'grade', 'time'])
		for (const lang of [...LANGS, 'xx']) cases.push({ have: pickN(pool, 3), lang, sort, slack: 1 });
	for (let k = 0; k < n; k++) {
		const have = pickN(rnd() < 0.7 ? pool : all, 1 + Math.floor(rnd() * 12));
		const p = { have, lang: pick([...LANGS, 'xx']), slack: slackFor(new Set(have).size) };
		if (rnd() < 0.3) p.cuisine = rnd() < 0.1 ? 'martian' : pick(cuisines);
		if (rnd() < 0.2) p.mealType = pick(MEALS);
		if (rnd() < 0.3) p.diet = rnd() < 0.1 ? 'keto' : pick(DIETS);
		if (rnd() < 0.3) p.excludeAllergens = pickN([...ALLERGEN_KEYS, 'lupin'], 1 + Math.floor(rnd() * 3));
		if (rnd() < 0.6) p.sort = pick(['kcal', 'grade', 'time']);
		if (rnd() < 0.3) p.mustUse = [...pickN(have, 1 + Math.floor(rnd() * 2)), ...(rnd() < 0.2 ? [999999] : [])];
		if (rnd() < 0.2) p.slack = Math.floor(rnd() * 4);
		if (rnd() < 0.3) p.offset = pick([0, 5, 20, 50, -3]);
		if (rnd() < 0.3) p.limit = pick([0, 1, 10, 200, -1]);
		if (rnd() < 0.05) p.have = [...have, have[0], 999999];
		cases.push(p);
	}
	cases.push({ have: [], lang: 'en' }, { have: all.slice(0, 80), lang: 'en', slack: 2 });
	return cases;
}

/**
 * The 648-case matrix of the D1 match rewrite's harness (C:\tmp\d1-match-a\
 * compare.mjs, 2026-10-12), ported case for case: singles, growing random
 * combinations, generic/specific and multi-parent shapes, every option over a
 * fixed set of base selections, and edge inputs. 999999 is an id no
 * ingredient has.
 */
function harnessCases(sqlite) {
	const rnd = random(12345);
	const pickN = (pool, n) => {
		const p = [...pool];
		const out = [];
		while (out.length < n && p.length) out.push(p.splice(Math.floor(rnd() * p.length), 1)[0]);
		return out;
	};
	const ids = (q, ...a) => sqlite.prepare(q).all(...a).map((r) => Number(r.id));
	const POP = ids('SELECT id FROM ingredients WHERE is_staple=0 ORDER BY recipe_count DESC, id LIMIT 40');
	const STAPLES = ids('SELECT id FROM ingredients WHERE is_staple=1 ORDER BY recipe_count DESC, id LIMIT 5');
	const RARE = ids('SELECT id FROM ingredients WHERE recipe_count BETWEEN 1 AND 3 ORDER BY id LIMIT 8');
	const UNUSED = ids('SELECT id FROM ingredients WHERE recipe_count = 0 ORDER BY id LIMIT 2');
	const GEN = ids('SELECT generic_id id FROM ingredient_generic_of GROUP BY generic_id ORDER BY COUNT(*) DESC, generic_id LIMIT 15');
	const specificsOf = (g) => ids('SELECT specific_id id FROM ingredient_generic_of WHERE generic_id=? ORDER BY specific_id', g);
	const MULTI = sqlite
		.prepare('SELECT specific_id s, GROUP_CONCAT(generic_id) g FROM ingredient_generic_of GROUP BY specific_id HAVING COUNT(*) >= 2 ORDER BY specific_id LIMIT 8')
		.all()
		.map((r) => ({ s: Number(r.s), g: String(r.g).split(',').map(Number) }));
	const CUISINES = sqlite
		.prepare('SELECT cuisine c FROM recipes WHERE cuisine IS NOT NULL GROUP BY cuisine ORDER BY COUNT(*) DESC LIMIT 4')
		.all()
		.map((r) => r.c);
	const HARNESS_MEALS = ['dessert', 'dinner', 'side', 'breakfast', 'snack'];

	const cases = [];
	const add = (p) => cases.push({ lang: 'en', ...p });
	for (const id of [...POP.slice(0, 20), ...STAPLES.slice(0, 3), ...RARE.slice(0, 5), ...GEN.slice(0, 10), ...UNUSED])
		for (const lang of ['en', 'fr']) add({ have: [id], lang });
	const POOL = [...POP, ...GEN, ...STAPLES.slice(0, 3)];
	for (const n of [2, 3, 4, 5, 6, 8, 10, 16, 25, 40]) for (let k = 0; k < 8; k++) add({ have: pickN(POOL, n) });
	for (const g of GEN.slice(0, 8)) {
		const sp = specificsOf(g);
		add({ have: [g, sp[0]] });
		add({ have: [sp[0]] });
		add({ have: [g, ...sp.slice(0, 2), POP[0]] });
	}
	for (const m of MULTI) {
		add({ have: m.g });
		add({ have: [...m.g, m.s] });
		add({ have: [m.g[0], POP[1], POP[2]] });
	}
	const BASES = [
		[POP[0]], [POP[1], POP[2]], [POP[0], POP[1], POP[3]], [GEN[0]], [GEN[0], GEN[1], POP[0]],
		pickN(POP, 4), pickN(POP, 6), pickN(POOL, 10), [STAPLES[0], POP[0], POP[4]], [MULTI[0]?.g ?? GEN[2]].flat(),
		pickN(POP.slice(10), 3), pickN(POOL, 20)
	];
	for (const have of BASES) {
		const v = (extra) => add({ have, ...extra });
		for (const sort of ['kcal', 'grade', 'time']) v({ sort });
		for (const lang of ['ja', 'bn', 'zh', 'ar', 'pnb', 'xx']) v({ lang });
		for (const cuisine of CUISINES) v({ cuisine });
		for (const mealType of HARNESS_MEALS.slice(0, 3)) v({ mealType });
		for (const diet of DIETS) v({ diet });
		v({ excludeAllergens: ['gluten'] });
		v({ excludeAllergens: ['dairy', 'egg'] });
		v({ excludeAllergens: ALLERGEN_KEYS });
		for (const offset of [50, 100, 10000]) v({ offset });
		v({ limit: 10, offset: 5 });
		v({ limit: 200 });
		v({ limit: 0 });
		if (have.length >= 3) {
			v({ mustUse: [have[0]] });
			v({ mustUse: have.slice(0, 2) });
			v({ mustUse: [999999] });
			v({ mustUse: [have[0], have[0], 999999] });
			v({ mustUse: [have[1]], sort: 'grade', offset: 50 });
		}
		v({ cuisine: CUISINES[0], diet: 'vegetarian', excludeAllergens: ['nut'], sort: 'time', lang: 'fr', mustUse: have.slice(0, 1) });
		v({ slack: 0 });
		v({ slack: 9 });
	}
	add({ have: [POP[0], POP[0], POP[1]] });
	add({ have: [POP[0], 999999] });
	add({ have: [999999] });
	add({ have: [POP[0], POP[1], 999999], slack: 1 });
	add({ have: [] });
	add({ have: ids('SELECT id FROM ingredients ORDER BY recipe_count DESC LIMIT 80') });
	add({ have: [POP[5], POP[1], POP[9], POP[0]] });
	add({ have: [POP[0], POP[9], POP[1], POP[5]] });
	return cases.map((p) => ({ ...p, slack: p.slack ?? slackFor(new Set(p.have).size) }));
}

/**
 * A matchRecipes input as the /api/match URL a client would send for it: ids
 * become canonical_keys (unknown ids a key no ingredient has), in the order
 * given; limit and slack have no URL form (the route derives slack).
 */
const keyOf = (sqlite, id) => sqlite.prepare('SELECT canonical_key k FROM ingredients WHERE id = ?').get(id)?.k ?? 'not_a_key';

function matchUrl(sqlite, p) {
	const key = (id) => keyOf(sqlite, id);
	const search = new URLSearchParams({ have: p.have.map(key).join(','), lang: p.lang });
	if (p.cuisine) search.set('cuisine', p.cuisine);
	if (p.mealType) search.set('meal', p.mealType);
	if (p.diet) search.set('diet', p.diet);
	if (p.sort) search.set('sort', p.sort);
	if (p.excludeAllergens?.length) search.set('noAllergen', p.excludeAllergens.join(','));
	if (p.mustUse?.length) search.set('must', p.mustUse.map(key).join(','));
	if (p.offset !== undefined) search.set('offset', String(p.offset));
	return `/api/match?${search}`;
}

/** Hand-written /api/match URLs: odd casing, unknown keys and values, bad offsets, over the cap. */
function handMatchUrls(sqlite) {
	const keys = sqlite.prepare('SELECT canonical_key AS k FROM ingredients ORDER BY recipe_count DESC LIMIT 12').all().map((r) => r.k);
	const many = Array.from({ length: 51 }, (_, k) => `ing_${k}`).join(',');
	return [
		`/api/match?have=${keys.slice(0, 3).join(',')}&lang=fr`,
		`/api/match?have=${keys.slice(0, 6).join(',')}&lang=zh&sort=kcal&must=${keys[1]}`,
		`/api/match?have=${keys.slice(2, 5).join(',')},not_a_key&lang=bn&diet=vegetarian&noAllergen=dairy,gluten`,
		`/api/match?have=${keys.slice(0, 2).join(',')}&lang=hi&sort=time&offset=5`,
		`/api/match?have=${keys.join(',')}&lang=jv&sort=grade&meal=dinner`,
		`/api/match?have=${keys.slice(0, 4).map((k) => k.toUpperCase()).join(',')},${keys[0]}&lang=xx&cuisine=mars&sort=bogus`,
		`/api/match?have=nothing_here&lang=en`,
		`/api/match?lang=en`,
		`/api/match?have=${keys[0]}&lang=en&offset=2.5`,
		`/api/match?have=${keys[0]}&lang=en&offset=10001`,
		`/api/match?have=${many}&lang=en`
	];
}

/** Search queries: title fragments in varied case, non-ASCII, query syntax, short. */
function searchQueries(sqlite, n) {
	const rnd = random(777);
	const titles = sqlite.prepare('SELECT DISTINCT title FROM recipe_i18n ORDER BY title').all().map((r) => r.title);
	const out = new Set(['chicken', 'CHICKEN', 'soup', 'crème', 'CRÊPE', 'a"b', '"chi', '%%%', '_a_', '\\', '😀😀', 'a😀😀', 'xyz',
		'鸡肉', 'ß', 'İst', 'ſoup', 'µg', '(polish', 'chick*', 'NEAR(a b)', 'OR chicken', 'x'.repeat(70), '  egg  ', 'e', 'eg', '卵']);
	for (let k = 0; k < n; k++) {
		const chars = [...titles[Math.floor(rnd() * titles.length)]];
		const len = 1 + Math.floor(rnd() * 7);
		const at = Math.floor(rnd() * Math.max(1, chars.length - len));
		let q = chars.slice(at, at + len).join('');
		if (rnd() < 0.3) q = q.toUpperCase();
		out.add(q);
	}
	return [...out];
}

function ingredientQueries(sqlite, n) {
	const rnd = random(4242);
	const names = sqlite.prepare('SELECT name FROM ingredient_i18n ORDER BY ingredient_id, lang').all().map((r) => r.name);
	const out = new Set(['egg', 'EGG', 'oni', 'tom', 'ÖL', 'lait', 'xyz', 'a"b', '%%%', 'e', 'eg']);
	for (let k = 0; k < n; k++) {
		const chars = [...names[Math.floor(rnd() * names.length)]];
		const len = 3 + Math.floor(rnd() * 4);
		const at = Math.floor(rnd() * Math.max(1, chars.length - len));
		let q = chars.slice(at, at + len).join('');
		if (rnd() < 0.2) q = q.toUpperCase();
		out.add(q);
	}
	return [...out];
}

/**
 * Everything a page load's caller observes: the data as JSON (key order
 * included), or the error thrown, by kind, status and body.
 */
async function pageOutcome(load, path, platform) {
	const url = new URL(path, ORIGIN);
	const id = decodeURIComponent(url.pathname.slice('/recipe/'.length));
	try {
		return { data: JSON.stringify(await load({ params: { id }, url, platform })) };
	} catch (error) {
		return { thrown: error?.constructor?.name, status: error?.status, body: error?.body };
	}
}

function paritySuite(name, open, size) {
	describe(`artefact parity: ${name}`, () => {
		let sqlite;
		/** D1 only: what the SQL reference and the (still D1-backed) recipe page read. */
		let platform;
		/** ASSETS only: what the real API routes read; touching DB throws. */
		let artefactPlatform;
		let art;
		let compared = 0;
		let pages = 0;
		let harnessSize = 0;
		let browserCompared = 0;
		const sqlGet = async (path) => {
			const url = new URL(path, ORIGIN);
			return observed(await SQL_ROUTES[url.pathname].GET({ url, platform }));
		};
		const routeGet = async (path) => {
			const url = new URL(path, ORIGIN);
			return observed(await ROUTES[url.pathname].GET({ url, platform: artefactPlatform }));
		};
		/** The real route's response is the SQL reference's, byte for byte. */
		const same = async (path) => {
			const [route, sql] = [await routeGet(path), await sqlGet(path)];
			expect(route, path).toEqual(sql);
			compared++;
			return sql;
		};

		beforeAll(() => {
			sqlite = open();
			platform = { env: { DB: sqliteD1(sqlite) }, ctx: { waitUntil: () => {} } };
			art = artefactsOf(sqlite);
			artefactPlatform = { env: { DB: throwingDb, ASSETS: artefactAssets(art.files) }, ctx: { waitUntil: () => {} } };
		}, 120_000);

		afterAll(() => {
			console.log(`artefact parity (${name}): harness matrix ${harnessSize} cases; ${compared} responses identical through the real route handlers; ${browserCompared} browser matches identical to the route; ${pages} recipe page loads identical through the real load`);
		});

		it('matchRecipes == matchCore over generated inputs (rows, totals, ties)', async () => {
			const cases = matchCases(sqlite, size.match);
			const db = sqliteD1(sqlite);
			let nonEmpty = 0;
			for (const p of cases) {
				const sql = await matchRecipes(db, p);
				const js = matchCore(art.corpus, p);
				if (sql.total) nonEmpty++;
				expect(JSON.stringify(js), JSON.stringify(p)).toBe(JSON.stringify(sql));
			}
			// Guards the generator, not the parity: most inputs must find something.
			expect(nonEmpty).toBeGreaterThan(cases.length / 5);
		}, 300_000);

		it('matchRecipes == matchCore over the D1 match harness matrix', async () => {
			const db = sqliteD1(sqlite);
			const cases = harnessCases(sqlite);
			harnessSize = cases.length;
			let nonEmpty = 0;
			for (const p of cases) {
				const sql = await matchRecipes(db, p);
				if (sql.total) nonEmpty++;
				expect(JSON.stringify(matchCore(art.corpus, p)), JSON.stringify(p)).toBe(JSON.stringify(sql));
			}
			expect(nonEmpty).toBeGreaterThan(cases.length / 3);
		}, 300_000);

		it('/api/match: the real route == the D1 route over the harness matrix and generated inputs as URLs', async () => {
			const urls = new Set([...harnessCases(sqlite), ...matchCases(sqlite, size.match)].map((p) => matchUrl(sqlite, p)));
			let found = 0;
			for (const url of urls) if (JSON.parse((await same(url)).body).total) found++;
			expect(found).toBeGreaterThan(urls.size / 3);
		}, 600_000);

		it('/api/match answers the same response for hand-written URLs, 400s included', async () => {
			for (const url of handMatchUrls(sqlite)) await same(url);
		});

		it('browser matching (src/lib/client) answers exactly what the real /api/match route does', async () => {
			// What the home page sends: matchRequest's string, pages by offset.
			const pageUrls = harnessCases(sqlite).map((p) => {
				const keys = (ids) => ids.map((id) => keyOf(sqlite, id));
				const selected = keys(p.have);
				const input = {
					selected,
					lang: p.lang,
					cuisine: p.cuisine ?? '',
					meal: p.mealType ?? '',
					diet: p.diet ?? '',
					sort: p.sort ?? '',
					noAllergen: p.excludeAllergens ?? [],
					must: p.mustUse?.length ? keys(p.mustUse) : [],
					slack: slackFor(new Set(selected).size)
				};
				return `/api/match?${matchRequest(input, Math.max(0, p.offset ?? 0))}`;
			});
			const urls = new Set([
				...pageUrls,
				...harnessCases(sqlite).map((p) => matchUrl(sqlite, p)),
				...matchCases(sqlite, size.match).map((p) => matchUrl(sqlite, p)),
				...handMatchUrls(sqlite)
			]);
			const data = await openMatchData({ version: art.corpus.version, lang: 'en', fetch: (url) => artefactAssets(art.files).fetch(new URL(url, ORIGIN)) });
			for (const lang of LANGS) await data.load(lang);
			let local = 0;
			for (const url of urls) {
				const route = await routeGet(url);
				const body = data.match(url.slice(url.indexOf('?') + 1));
				if (route.status === 200) {
					expect(JSON.stringify(body), url).toBe(route.body);
					local++;
				} else expect(body, url).toBeNull();
			}
			expect(local).toBeGreaterThan(urls.size * 0.9);
			browserCompared = local;
		}, 600_000);

		// Search matches translated titles too, which the SQL never did: the
		// expected body is the D1 route's wherever no translated title of the
		// language contains the query (always for English), else the SQL
		// reference extended by them (test/titleSearch.mjs). One or two CJK
		// characters are searched where the D1 route answered them empty.
		it('/api/search: the D1 route for source titles, plus translated titles; empty below 3 characters unless CJK', async () => {
			for (const q of searchQueries(sqlite, size.search)) {
				for (const lang of ['en', 'zh', LANGS[q.length % LANGS.length]]) {
					const path = `/api/search?q=${encodeURIComponent(q)}&lang=${lang}`;
					const [route, sql] = [await routeGet(path), await sqlGet(path)];
					const p = parseSearchQuery(new URL(path, ORIGIN).searchParams);
					const body = titleQueryReady(p.q) ? JSON.stringify(await referenceTitleSearch(sqlite, p)) : sql.body;
					const headers = sql.headers.map(([k, v]) => [k, k === 'content-length' ? String(Buffer.byteLength(body)) : v]);
					expect(route, path).toEqual({ ...sql, headers, body });
					if (p.lang === 'en') expect(route, path).toEqual(sql);
					compared++;
				}
			}
		}, 300_000);

		it('searchTitles == the SQL reference (plus translated titles), LIKE path and limits included', async () => {
			const db = sqliteD1(sqlite);
			for (const q of searchQueries(sqlite, Math.ceil(size.search / 3))) {
				for (const p of [{ q, lang: 'zh' }, { q, lang: 'xx', limit: 50 }, { q, lang: 'ar', limit: -1 }, { q, lang: 'en', limit: 30 }]) {
					expect(JSON.stringify(searchTitles(art.corpus, p)), JSON.stringify(p)).toBe(JSON.stringify(await referenceTitleSearch(sqlite, p)));
				}
				expect(JSON.stringify(searchTitles(art.corpus, { q, lang: 'en' }))).toBe(JSON.stringify(await searchRecipeTitles(db, { q, lang: 'en' })));
			}
		}, 300_000);

		it('/api/ingredients: the mosaic file of every language, and ?q= search', async () => {
			for (const lang of [...LANGS, 'xx']) await same(`/api/ingredients?lang=${lang}`);
			await same('/api/ingredients');
			for (const q of ingredientQueries(sqlite, size.ingredients)) {
				for (const lang of ['en', LANGS[q.length % LANGS.length]]) await same(`/api/ingredients?lang=${lang}&q=${encodeURIComponent(q)}`);
			}
		}, 300_000);

		it('/api/recipes and getRecipesByIds', async () => {
			const ids = sqlite.prepare('SELECT id FROM recipes ORDER BY id').all().map((r) => Number(r.id));
			const rnd = random(99);
			const db = sqliteD1(sqlite);
			for (let k = 0; k < 40; k++) {
				const list = Array.from({ length: Math.floor(rnd() * 150) }, () => (rnd() < 0.1 ? 1 + Math.floor(rnd() * 600000) : ids[Math.floor(rnd() * ids.length)]));
				const lang = LANGS[k % LANGS.length];
				await same(`/api/recipes?ids=${list.join(',')}&lang=${lang}`);
				const p = { ids: [...list, list[0] ?? 1], lang: k % 5 ? lang : 'xx' };
				expect(JSON.stringify(recipesByIds(art.corpus, p))).toBe(JSON.stringify(await getRecipesByIds(db, p)));
			}
			await same(`/api/recipes?ids=${ids.slice(0, 600).join(',')}&lang=fr&v=x`);
			await same('/api/recipes?ids=x,-1,0&lang=en');
		});

		/** The real load's outcome is the D1 load's. */
		const samePage = async (path) => {
			const real = await pageOutcome(recipePageServer.load, path, artefactPlatform);
			const sql = await pageOutcome(sqlRecipePageLoad, path, platform);
			expect(real, path).toEqual(sql);
			pages++;
			return sql;
		};

		it('recipe page load (recipe, translation or source fallback, is_machine, ingredients, nutrition, related, tips): every recipe, every language and an unknown one', async () => {
			const ids = sqlite.prepare('SELECT id FROM recipes ORDER BY id').all().map((r) => Number(r.id));
			let machine = 0;
			let fallback = 0;
			for (const id of ids) {
				for (const lang of [...LANGS, 'xx']) {
					const { data } = await samePage(`/recipe/${id}?lang=${lang}`);
					expect(data, `${id} ${lang}`).toBeDefined();
					const { recipe, lang: shown } = JSON.parse(data);
					if (recipe.is_machine) machine++;
					if (shown !== recipe.source_lang && !sqlite.prepare('SELECT 1 FROM recipe_i18n WHERE recipe_id = ? AND lang = ?').get(id, shown)) fallback++;
				}
			}
			// Guards the corpus, not the parity: both branches must be exercised.
			expect(machine).toBeGreaterThan(0);
			expect(fallback).toBeGreaterThan(0);
		}, 1_800_000);

		it('recipe page load: invalid and unknown ids throw the same errors (400, 404)', async () => {
			const { max } = sqlite.prepare('SELECT MAX(id) AS max FROM recipes').get();
			const gap = sqlite.prepare('SELECT r.id + 1 AS id FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM recipes s WHERE s.id = r.id + 1) ORDER BY r.id LIMIT 1').get().id;
			const first = sqlite.prepare('SELECT MIN(id) AS id FROM recipes').get().id;
			const outcomes = [];
			for (const id of ['0', '-1', 'abc', '1.5', '%20', 'Infinity', String(Number(max) + 1), String(gap), '999999999', '5869', '479561']) {
				outcomes.push((await samePage(`/recipe/${encodeURIComponent(id)}?lang=fr`)).status);
			}
			// Number()'s own forms of a known id resolve to it, as before.
			for (const id of [`${first}.0`, `0${first}`, ` ${first}`]) {
				expect((await samePage(`/recipe/${encodeURIComponent(id)}?lang=ja`)).data).toBeDefined();
			}
			expect(outcomes).toEqual([400, 400, 400, 400, 400, 400, 404, 404, 404, 404, 404]);
		});

		it('/sitemap.xml: the real route == the D1 route', async () => {
			const { body } = await same('/sitemap.xml');
			const ids = sqlite.prepare('SELECT id FROM recipes ORDER BY id').all().map((r) => Number(r.id));
			expect(body.match(/\/recipe\/\d+</g)).toHaveLength(ids.length);
			expect(art.json('sitemap.json').ids).toEqual(ids);
		});
	});
}

paritySuite('fixture', () => fixtureDb(readFileSync(FIXTURE, 'utf8')), { match: 400, search: 150, ingredients: 120 });

const FULL = process.env.DATA_PARITY_DB;
if (FULL) paritySuite(`full corpus (${FULL})`, () => new DatabaseSync(FULL, { readOnly: true }), { match: 1500, search: 600, ingredients: 500 });
