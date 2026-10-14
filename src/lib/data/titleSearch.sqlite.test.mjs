// Title search over translated titles: the fixture corpus with a few real
// translations written in, through the real /api/search route (artefacts
// only, D1 throws) against the SQL reference extended by translated titles
// (src/lib/test/titleSearch.mjs).
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { artefactAssets, throwingDb } from '../test/assets';
import { referenceTitleSearch } from '../test/titleSearch.mjs';
import { buildArtefacts, fixtureDb } from '../../../pipeline/lib/artefacts.mjs';
import { loadCorpus, searchTitles, titleQueryReady } from './index.js';
import * as searchRoute from '../../routes/api/search/+server';

const FIXTURE = readFileSync(new URL('../../../pipeline/fixtures/artefact-corpus.sql', import.meta.url), 'utf8');

const TITLES = [
	[3593, 'zh', '米饭牛肉汤'],
	[4850, 'zh', '克罗托波汤'],
	[6066, 'zh', '波兰黄瓜汤（Zupa Ogórkowa）'],
	[3593, 'fr', 'Soupe de riz au bœuf'],
	[6070, 'fr', 'Rosół (soupe polonaise à la viande)'],
	[4850, 'fr', 'Crème de crotopo'],
	[6066, 'de', 'Zupa Ogórkowa (polnische Gurkensuppe)']
];

let sqlite;
let corpus;
let platform;
const ids = (result) => result.recipes.map((r) => r.id);

async function route(q, lang) {
	const url = new URL(`https://cook.test/api/search?q=${encodeURIComponent(q)}&lang=${lang}`);
	const response = await searchRoute.GET(/** @type {any} */ ({ url, platform }));
	return JSON.parse(await response.text());
}

beforeAll(() => {
	sqlite = fixtureDb(FIXTURE);
	const update = sqlite.prepare('UPDATE recipe_i18n SET title = ? WHERE recipe_id = ? AND lang = ?');
	for (const [id, lang, title] of TITLES) expect(update.run(title, id, lang).changes).toBe(1);
	const { files } = buildArtefacts(sqlite);
	const text = (prefix) =>
		Object.fromEntries([...files].filter(([p]) => p.startsWith(prefix)).map(([p, b]) => [p.slice(prefix.length, -5), b.toString('utf8')]));
	corpus = loadCorpus({ core: files.get('core.bin'), titles: text('titles/'), names: text('names/') });
	platform = { env: { DB: throwingDb, ASSETS: artefactAssets(files) }, ctx: { waitUntil: () => {} } };
}, 120_000);

describe('titleQueryReady', () => {
	it('is 3+ characters, or any CJK character', () => {
		expect(titleQueryReady('')).toBe(false);
		expect(titleQueryReady('so')).toBe(false);
		expect(titleQueryReady('sou')).toBe(true);
		expect(titleQueryReady('汤')).toBe(true);
		expect(titleQueryReady('卵')).toBe(true);
		expect(titleQueryReady('국')).toBe(true);
		expect(titleQueryReady('ラ')).toBe(true);
		expect(titleQueryReady('é')).toBe(false);
		expect(titleQueryReady('דג')).toBe(false);
	});
});

describe('translated titles', () => {
	it('one or two CJK characters find the language title, shown in that language', async () => {
		const hits = await route('汤', 'zh');
		expect(ids(hits).sort()).toEqual([3593, 4850, 6066]);
		expect(hits.recipes.map((r) => r.title)).toEqual(expect.arrayContaining(['米饭牛肉汤', '克罗托波汤']));
		expect(ids(await route('黄瓜', 'zh'))).toEqual([6066]);
		expect(ids(await route('汤', 'en'))).toEqual([]);
	});

	it('3+ characters match the translated title folded, and the English title still', async () => {
		expect(ids(await route('牛肉汤', 'zh'))).toEqual([3593]);
		expect(ids(await route('SOUPE', 'fr')).sort()).toEqual([3593, 6070]);
		expect(ids(await route('boeuf', 'fr'))).toEqual([3593]);
		expect(ids(await route('creme', 'fr'))).toEqual([4850]);
		expect(ids(await route('rosol', 'fr'))).toEqual([6070]);
		expect(ids(await route('gurkensuppe', 'de'))).toEqual([6066]);
		expect(ids(await route('soupe', 'en'))).toEqual([]);
		const english = await route('Soup', 'zh');
		expect(ids(english)).toEqual(ids(await route('Soup', 'en')));
		expect(english.recipes.find((r) => r.id === 3593).title).toBe('米饭牛肉汤');
	});

	it('short Latin queries stay empty, and every hit has the RecipeHit shape', async () => {
		expect(await route('so', 'fr')).toEqual({ recipes: [] });
		for (const r of (await route('soup', 'fr')).recipes) {
			expect(Object.keys(r)).toEqual(['id', 'title', 'cuisine', 'total_minutes', 'balance_grade', 'nutrition_coverage']);
		}
	});

	it('the route answers the reference, ranking included, for fragments of every title', async () => {
		const queries = new Set(['汤', '肉汤', 'Soupe', 'soupe de', 'à la', 'A LA', 'ogórkowa', 'ogorkowa', 'Polish', 'polonaise', 'Zupa', 'crotopo']);
		for (const [, , title] of TITLES) {
			const chars = [...title];
			for (let at = 0; at + 1 < chars.length; at += 2) for (const len of [1, 2, 3, 5]) queries.add(chars.slice(at, at + len).join(''));
		}
		let found = 0;
		for (const q of queries) {
			for (const lang of ['zh', 'fr', 'de', 'en']) {
				const want = titleQueryReady(q.trim()) ? await referenceTitleSearch(sqlite, { q, lang }) : { recipes: [] };
				expect(await route(q, lang), `${q} ${lang}`).toEqual(JSON.parse(JSON.stringify(want)));
				expect(JSON.stringify(searchTitles(corpus, { q, lang, limit: -1 }))).toBe(JSON.stringify(await referenceTitleSearch(sqlite, { q, lang, limit: -1 })));
				if (want.recipes.length) found++;
			}
		}
		expect(found).toBeGreaterThan(queries.size);
	});
});
