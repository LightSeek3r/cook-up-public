import { describe, expect, it } from 'vitest';
import { VIEW_COUNT, ZONES } from '$lib/data/seasons.js';
import { StaleSeasonsError, createSeasonsLoader, fetchSeasons } from './load';

const LINE = 'fff'.repeat(VIEW_COUNT);
const file = (version: string, lines = 2) =>
	JSON.stringify({
		version,
		zones: ZONES,
		masks: Array(lines).fill(LINE).join('\n')
	});

type Reply = { status?: number; body: string };

/** A fetch answering from a queue of replies (the last one repeats), recording each request. */
function server(...replies: Reply[]) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetch = async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		const reply = replies.length > 1 ? replies.shift()! : replies[0];
		return new Response(reply.body, { status: reply.status ?? 200 });
	};
	return { fetch, requests };
}

describe('fetchSeasons', () => {
	it('fetches this data version and parses it', async () => {
		const { fetch, requests } = server({ body: file('v1') });
		const seasons = await fetchSeasons({
			version: 'v1',
			fetch,
			ingredients: 2,
			priority: 'low'
		});
		expect(seasons.ingredients).toBe(2);
		expect(seasons.masks).toHaveLength(2 * VIEW_COUNT);
		expect(requests).toEqual([
			{
				url: '/data/seasons.json?v=v1',
				init: { cache: 'default', priority: 'low' }
			}
		]);
	});

	it('refetches past the HTTP cache once when the copy is stale', async () => {
		const { fetch, requests } = server({ body: file('v0') }, { body: file('v1') });
		await expect(fetchSeasons({ version: 'v1', fetch })).resolves.toMatchObject({ version: 'v1' });
		expect(requests.map((r) => r.init?.cache)).toEqual(['default', 'reload']);
	});

	it('gives up on a second stale copy', async () => {
		const { fetch, requests } = server({ body: file('v0') });
		await expect(fetchSeasons({ version: 'v1', fetch })).rejects.toBeInstanceOf(StaleSeasonsError);
		expect(requests).toHaveLength(2);
	});

	it('rejects HTTP errors and files that do not fit the corpus', async () => {
		await expect(
			fetchSeasons({
				version: 'v1',
				fetch: server({ status: 404, body: '' }).fetch
			})
		).rejects.toThrow(/HTTP 404/);
		await expect(
			fetchSeasons({
				version: 'v1',
				fetch: server({ body: file('v1', 3) }).fetch,
				ingredients: 2
			})
		).rejects.toThrow(/different ingredients/);
		await expect(fetchSeasons({ version: 'v1', fetch: server({ body: '{' }).fetch })).rejects.toThrow();
	});
});

describe('createSeasonsLoader', () => {
	it('downloads once for every caller', async () => {
		const { fetch, requests } = server({ body: file('v1') });
		const loader = createSeasonsLoader(() => ({ version: 'v1', fetch }));
		const [a, b] = await Promise.all([loader.load('low'), loader.load()]);
		expect(a).toBe(b);
		expect(await loader.load()).toBe(a);
		expect(requests).toHaveLength(1);
		expect(requests[0].init?.priority).toBe('low');
	});

	it('forgets a failure so the next load tries again', async () => {
		const { fetch, requests } = server({ status: 503, body: '' }, { body: file('v1') });
		const loader = createSeasonsLoader(() => ({ version: 'v1', fetch }));
		await expect(loader.load()).rejects.toThrow(/HTTP 503/);
		await expect(loader.load()).resolves.toMatchObject({ version: 'v1' });
		expect(requests).toHaveLength(2);
	});

	it('reset forgets a loaded file', async () => {
		const { fetch, requests } = server({ body: file('v1') });
		const loader = createSeasonsLoader(() => ({ version: 'v1', fetch }));
		await loader.load();
		loader.reset();
		await loader.load();
		expect(requests).toHaveLength(2);
	});
});
