// openMatchData over real artefacts (built from the fixture corpus): which
// files it fetches, the data-version check and its one past-the-cache retry,
// a failed language, and the queries it leaves to the server. Parity with the
// route is in src/lib/data/parity.sqlite.test.mjs.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildArtefacts, fixtureDb } from '../../../pipeline/lib/artefacts.mjs';
import { openMatchData, StaleDataError } from './matchData';
import * as matchRoute from '../../routes/api/match/+server';
import { artefactAssets, throwingDb } from '../test/assets';

const FIXTURE = new URL('../../../pipeline/fixtures/artefact-corpus.sql', import.meta.url);
const OTHER = 'ffffffffffffffff';

/** `files` with every `"version":"<from>"` rewritten to `to` (same length). */
function restamped(files, from, to) {
	const needle = Buffer.from(`"version":"${from}"`);
	const out = new Map();
	for (const [name, body] of files) {
		const copy = Buffer.from(body);
		for (let at = copy.indexOf(needle); at >= 0; at = copy.indexOf(needle, at + 1)) copy.write(`"version":"${to}"`, at);
		out.set(name, copy);
	}
	return out;
}

/**
 * A browser fetch over artefact files: `/data/<path>?v=…` (the query is
 * ignored, as the asset layer does), with `stale` served instead while the
 * request is not a `cache: 'reload'` one. Records every request.
 */
function server(files, { stale = new Map(), staleOnReload = false, missing = [] } = {}) {
	const requests = [];
	const fetch = async (url, init = {}) => {
		const { pathname, searchParams } = new URL(url, 'https://cook.test');
		const path = pathname.slice('/data/'.length);
		requests.push({ path, v: searchParams.get('v'), cache: init.cache, priority: init.priority });
		const useStale = stale.has(path) && (init.cache !== 'reload' || staleOnReload);
		const body = missing.includes(path) ? undefined : (useStale ? stale : files).get(path);
		return body ? new Response(body.slice()) : new Response('Not Found', { status: 404 });
	};
	return { fetch, requests };
}

describe('openMatchData', () => {
	let files;
	let version;
	let have;

	beforeAll(() => {
		const built = buildArtefacts(fixtureDb(readFileSync(FIXTURE, 'utf8')));
		files = built.files;
		version = built.version;
		const names = JSON.parse(files.get('mosaic/en.json').toString('utf8')).results;
		have = names.slice(0, 3).map((tile) => tile.canonical_key).sort();
	});

	const search = (lang, extra = '') => `have=${have.join(',')}&lang=${lang}${extra}`;

	async function routeBody(query) {
		const platform = { env: { DB: throwingDb, ASSETS: artefactAssets(files) }, ctx: { waitUntil: () => {} } };
		const response = await matchRoute.GET({ url: new URL(`https://cook.test/api/match?${query}`), platform });
		return response.text();
	}

	it('fetches core.bin, English and the page language under ?v=<data version>, and matches like the route', async () => {
		const { fetch, requests } = server(files);
		const data = await openMatchData({ version, lang: 'fr', fetch, priority: 'low' });
		expect(requests.map((r) => r.path).sort()).toEqual(['core.bin', 'names/en.json', 'names/fr.json', 'titles/fr.json']);
		expect(requests.every((r) => r.v === version && r.priority === 'low' && r.cache === 'default')).toBe(true);
		expect(data.ready('fr')).toBe(true);
		expect(JSON.stringify(data.match(search('fr')))).toBe(await routeBody(search('fr')));
	});

	it('answers only languages it has loaded; loading one fetches its two files once', async () => {
		const { fetch, requests } = server(files);
		const data = await openMatchData({ version, lang: 'en', fetch });
		expect(data.ready('ja')).toBe(false);
		expect(data.match(search('ja'))).toBeNull();
		await Promise.all([data.load('ja'), data.load('ja')]);
		expect(requests.filter((r) => r.path.endsWith('/ja.json')).map((r) => r.path).sort()).toEqual(['names/ja.json', 'titles/ja.json']);
		expect(JSON.stringify(data.match(search('ja')))).toBe(await routeBody(search('ja')));
		// An unknown language is English, as on the server.
		expect(JSON.stringify(data.match(search('xx')))).toBe(await routeBody(search('xx')));
	});

	it('leaves what the route answers 400 to the server', async () => {
		const data = await openMatchData({ version, lang: 'en', fetch: server(files).fetch });
		expect(data.match(search('en', '&offset=2.5'))).toBeNull();
		const many = Array.from({ length: 51 }, (_, k) => `ing_${k}`).join(',');
		expect(data.match(`have=${many}&lang=en`)).toBeNull();
		expect(data.match('lang=en')).toEqual({ results: [], total: 0, haveCount: 0 });
	});

	it('refetches a file of another data version once past the HTTP cache', async () => {
		const stale = restamped(files, version, OTHER);
		const { fetch, requests } = server(files, { stale: new Map([['core.bin', stale.get('core.bin')], ['titles/en.json', stale.get('titles/en.json')]]) });
		const data = await openMatchData({ version, lang: 'en', fetch });
		expect(requests.filter((r) => r.cache === 'reload').map((r) => r.path).sort()).toEqual(['core.bin', 'titles/en.json']);
		expect(data.ready('en')).toBe(true);
	});

	it('gives up with StaleDataError when the deployed core.bin is another data version (a tab older than the deploy)', async () => {
		const stale = restamped(files, version, OTHER);
		const { fetch } = server(files, { stale, staleOnReload: true });
		await expect(openMatchData({ version, lang: 'en', fetch })).rejects.toBeInstanceOf(StaleDataError);
	});

	it('a language whose files are stale or missing stays with the server; the others match', async () => {
		const stale = restamped(files, version, OTHER);
		const { fetch } = server(files, { stale: new Map([['names/de.json', stale.get('names/de.json')]]), staleOnReload: true, missing: ['titles/ko.json'] });
		const data = await openMatchData({ version, lang: 'de', fetch });
		expect(data.ready('de')).toBe(false);
		expect(data.match(search('de'))).toBeNull();
		await expect(data.load('ko')).rejects.toThrow(/HTTP 404/);
		expect(data.match(search('ko'))).toBeNull();
		await data.load('es');
		expect(JSON.stringify(data.match(search('es')))).toBe(await routeBody(search('es')));
	});

	it('a missing core.bin fails the whole set', async () => {
		await expect(openMatchData({ version, lang: 'en', fetch: server(files, { missing: ['core.bin'] }).fetch })).rejects.toThrow(/core\.bin: HTTP 404/);
	});
});
