import { describe, it, expect } from 'vitest';
import { POST } from './+server';

let nextIp = 0;

/** Calls the handler the way SvelteKit would; returns the response and the rows it tried to write. */
async function track(query: string, headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' }) {
	const writes: unknown[][] = [];
	const pending: Promise<unknown>[] = [];
	const url = new URL(`https://cook.test/api/track?${query}`);
	const db = {
		prepare: () => ({
			bind: (...binds: unknown[]) => ({
				run: async () => {
					writes.push(binds);
					return { success: true };
				}
			})
		})
	};
	const ip = `198.51.100.${++nextIp}`;
	const res = await POST({
		url,
		request: new Request(url, { method: 'POST', headers }),
		platform: { env: { DB: db }, cf: { country: 'FR' }, ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } },
		getClientAddress: () => ip
	} as unknown as Parameters<typeof POST>[0]);
	await Promise.all(pending);
	return { res, writes };
}

describe('POST /api/track', () => {
	it('records a page view sent by our own layout', async () => {
		const { res, writes } = await track('path=/recipe/42&lang=fr&new=1', {
			'sec-fetch-site': 'same-origin',
			'sec-ch-ua-mobile': '?1'
		});
		expect(res.status).toBe(204);
		expect(writes).toEqual([['/recipe/42', 42, 'fr', 'FR', null, 'mobile', 1]]);
	});

	it('records from a browser that sends Origin but no fetch metadata', async () => {
		const { writes } = await track('path=/&lang=en', { origin: 'https://cook.test' });
		expect(writes).toHaveLength(1);
	});

	it.each([
		['a cross-site beacon', { 'sec-fetch-site': 'cross-site' }],
		['a foreign Origin', { origin: 'https://evil.test' }],
		['a bare script with no browser headers', {}]
	])('writes nothing for %s, and still answers 204', async (_label, headers) => {
		const { res, writes } = await track('path=/&lang=en', headers as Record<string, string>);
		expect(res.status).toBe(204);
		expect(writes).toHaveLength(0);
	});

	it('writes nothing for a payload the client never sends', async () => {
		for (const q of ['path=/&lang=en&junk=1', 'path=/nope&lang=en', 'path=/&lang=xx', '']) {
			const { res, writes } = await track(q);
			expect(res.status).toBe(204);
			expect(writes).toHaveLength(0);
		}
	});
});
