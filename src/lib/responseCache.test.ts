import { describe, it, expect, vi } from 'vitest';
import { createResponseCache, CACHE_MAX_ENTRIES, CACHE_TTL_MS } from './responseCache';

function clock(start = 0) {
	let time = start;
	return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe('createResponseCache', () => {
	it('loads once and serves the same value on a hit', async () => {
		const cache = createResponseCache();
		const load = vi.fn(async () => ({ results: [1] }));
		const first = await cache.get('/api/match?have=onion', load);
		const second = await cache.get('/api/match?have=onion', load);
		expect(load).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});

	it('loads again for a different key', async () => {
		const cache = createResponseCache();
		const load = vi.fn(async () => 'x');
		await cache.get('a', load);
		await cache.get('b', load);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('shares one in-flight request between concurrent callers', async () => {
		const cache = createResponseCache();
		let resolve!: (value: string) => void;
		const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
		const a = cache.get('k', load);
		const b = cache.get('k', load);
		resolve('done');
		expect(await a).toBe('done');
		expect(await b).toBe('done');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('expires an entry after the TTL', async () => {
		const time = clock();
		const cache = createResponseCache({ ttlMs: 1000, now: time.now });
		const load = vi.fn(async () => 'x');
		await cache.get('k', load);
		time.advance(999);
		await cache.get('k', load);
		expect(load).toHaveBeenCalledTimes(1);
		time.advance(1);
		await cache.get('k', load);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('evicts the least recently used entry beyond the cap', async () => {
		const cache = createResponseCache({ maxEntries: 2 });
		const load = vi.fn(async () => 'x');
		await cache.get('a', load);
		await cache.get('b', load);
		await cache.get('a', load); // refreshes `a`, so `b` is now the oldest
		await cache.get('c', load);
		expect(cache.size).toBe(2);
		expect(load).toHaveBeenCalledTimes(3);

		await cache.get('a', load);
		expect(load).toHaveBeenCalledTimes(3);
		await cache.get('b', load);
		expect(load).toHaveBeenCalledTimes(4);
	});

	it('does not keep a failed request, so the next call retries', async () => {
		const cache = createResponseCache();
		const load = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new Error('500'))
			.mockResolvedValueOnce('ok');
		await expect(cache.get('k', load)).rejects.toThrow('500');
		expect(cache.size).toBe(0);
		expect(await cache.get('k', load)).toBe('ok');
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('defaults to a small, short-lived cache', () => {
		expect(CACHE_MAX_ENTRIES).toBe(30);
		expect(CACHE_TTL_MS).toBe(5 * 60_000);
	});
});
