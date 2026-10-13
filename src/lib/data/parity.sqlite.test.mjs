// Artefacts vs the SQL they replace, on one database: the real API route
// handlers (reading the artefacts through a fake ASSETS binding, with a D1
// that throws if touched) against the D1 implementations they replaced
// (test/sqlRoutes.ts) and the SQL query functions, on SQLite with every
// migration applied, through the shared D1 adapter. Byte-identical responses
// are the bar: status, headers, body, key order and ties. The recipe page is
// still D1-backed, so its data is compared against src/lib/data directly.
//
// Runs on pipeline/fixtures/artefact-corpus.sql (a real slice of the corpus)
// always; with DATA_PARITY_DB=<sqlite file> (09_build_artefacts.mjs --save-db)
// also on the full corpus.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from '../test/d1';
import { artefactAssets, throwingDb } from '../test/assets';
import { SQL_ROUTES } from '../test/sqlRoutes';
import { matchRecipes } from '../match';
import { searchRecipeTitles, getRecipesByIds } from '../search';
import { substitutionsFor } from '../substitutions';
import { buildArtefacts, fixtureDb } from '../../../pipeline/lib/artefacts.mjs';
import { loadCorpus, matchCore, nameForKey, recipePage, recipesByIds, searchTitles, slackFor } from './index.js';
import * as ingredientsRoute from '../../routes/api/ingredients/+server';
import * as searchRoute from '../../routes/api/search/+server';
import * as matchRoute from '../../routes/api/match/+server';
import * as recipesRoute from '../../routes/api/recipes/+server';
import * as recipePageServer from '../../routes/recipe/[id]/+page.server';

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
	'/api/recipes': recipesRoute
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
function matchUrl(sqlite, p) {
	const keyOf = (id) => sqlite.prepare('SELECT canonical_key k FROM ingredients WHERE id = ?').get(id)?.k ?? 'not_a_key';
	const search = new URLSearchParams({ have: p.have.map(keyOf).join(','), lang: p.lang });
	if (p.cuisine) search.set('cuisine', p.cuisine);
	if (p.mealType) search.set('meal', p.mealType);
	if (p.diet) search.set('diet', p.diet);
	if (p.sort) search.set('sort', p.sort);
	if (p.excludeAllergens?.length) search.set('noAllergen', p.excludeAllergens.join(','));
	if (p.mustUse?.length) search.set('must', p.mustUse.map(keyOf).join(','));
	if (p.offset !== undefined) search.set('offset', String(p.offset));
	return `/api/match?${search}`;
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

/** The recipe page's data from the artefacts, tips included, as +page.server.ts returns it. */
function pageFromArtefacts({ corpus, json }, id, lang) {
	const { recipe, related } = recipePage(corpus, json(`r/${id}.json`), lang);
	const nameByKey = new Map(recipe.ingredients.map((i) => [i.canonical_key, i.name]));
	const tips = substitutionsFor(recipe.ingredients.map((i) => i.canonical_key)).map((m) => ({
		from: m.from,
		to: m.to,
		fromName: nameByKey.get(m.from) ?? m.from,
		toName: nameForKey(corpus, m.to, lang) ?? m.to,
		benefit: m.benefit
	}));
	return { lang, tips, related, recipe };
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
		let harnessSize = 0;
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
			console.log(`artefact parity (${name}): harness matrix ${harnessSize} cases; ${compared} responses identical through the real route handlers`);
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
			const keys = sqlite.prepare('SELECT canonical_key AS k FROM ingredients ORDER BY recipe_count DESC LIMIT 12').all().map((r) => r.k);
			const many = Array.from({ length: 51 }, (_, k) => `ing_${k}`).join(',');
			const urls = [
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
			for (const url of urls) await same(url);
		});

		it('/api/search: FTS trigram semantics for 3+ characters, empty below', async () => {
			for (const q of searchQueries(sqlite, size.search)) {
				for (const lang of ['en', 'zh', LANGS[q.length % LANGS.length]]) await same(`/api/search?q=${encodeURIComponent(q)}&lang=${lang}`);
			}
		}, 300_000);

		it('searchRecipeTitles == searchTitles, LIKE path and limits included', async () => {
			const db = sqliteD1(sqlite);
			for (const q of searchQueries(sqlite, Math.ceil(size.search / 3))) {
				for (const p of [{ q, lang: 'zh' }, { q, lang: 'xx', limit: 50 }, { q, lang: 'ar', limit: -1 }]) {
					expect(JSON.stringify(searchTitles(art.corpus, p)), JSON.stringify(p)).toBe(JSON.stringify(await searchRecipeTitles(db, p)));
				}
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

		it('recipe page data (recipe, ingredients, nutrition, related, tips) for every recipe', async () => {
			const ids = sqlite.prepare('SELECT id FROM recipes ORDER BY id').all().map((r) => Number(r.id));
			const langs = size.pageLangs;
			for (const [k, id] of ids.entries()) {
				for (const lang of langs === 'all' ? [...LANGS, 'xx'] : [LANGS[k % LANGS.length], 'en']) {
					const url = new URL(`/recipe/${id}?lang=${lang}`, ORIGIN);
					const sql = await recipePageServer.load({ params: { id: String(id) }, url, platform });
					const resolved = sql.lang;
					expect(JSON.stringify(pageFromArtefacts(art, id, resolved)), `${id} ${lang}`).toBe(JSON.stringify(sql));
				}
			}
		}, 600_000);

		it('sitemap ids: every recipe, ascending', () => {
			const ids = sqlite.prepare('SELECT id FROM recipes ORDER BY id').all().map((r) => Number(r.id));
			expect(art.json('sitemap.json').ids).toEqual(ids);
		});
	});
}

paritySuite('fixture', () => fixtureDb(readFileSync(FIXTURE, 'utf8')), { match: 400, search: 150, ingredients: 120, pageLangs: 'all' });

const FULL = process.env.DATA_PARITY_DB;
if (FULL) paritySuite(`full corpus (${FULL})`, () => new DatabaseSync(FULL, { readOnly: true }), { match: 1500, search: 600, ingredients: 500, pageLangs: 'some' });
