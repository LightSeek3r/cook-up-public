import { describe, it, expect, vi, afterEach } from 'vitest';
import { version } from '$app/environment';
import { handle, handleError } from './hooks.server';
import { HSTS, SECURITY_HEADERS } from '$lib/securityHeaders';
import { NEVER_CACHE, PUBLIC_DATA } from '$lib/httpCache';

const ORIGIN = 'https://cook.test';
const V = `v=${encodeURIComponent(version)}`;

/** caches.default stand-in: a Map keyed by URL, recording every call. */
function fakeCache(entries: Record<string, Response> = {}, { failMatch = false } = {}) {
	const store = new Map(Object.entries(entries));
	const calls: string[] = [];
	return {
		calls,
		store,
		default: {
			match: async (key: string) => {
				calls.push(`match ${key}`);
				if (failMatch) throw new Error('cache down');
				return store.get(key)?.clone();
			},
			put: async (key: string, response: Response) => {
				calls.push(`put ${key}`);
				store.set(key, response);
			}
		}
	};
}

function eventFor(
	path: string,
	{
		method = 'GET',
		headers = {},
		cache = fakeCache(),
		routeId = null
	}: { method?: string; headers?: Record<string, string>; cache?: ReturnType<typeof fakeCache>; routeId?: string | null } = {}
) {
	const request = new Request(new URL(path, ORIGIN), { method, headers });
	const waited: Promise<unknown>[] = [];
	const event = {
		request,
		url: new URL(request.url),
		route: { id: routeId },
		platform: { caches: cache, ctx: { waitUntil: (p: Promise<unknown>) => waited.push(p) } }
	};
	return { event, cache, waited };
}

const jsonResponse = (body: unknown, cacheControl = PUBLIC_DATA, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': cacheControl }
	});

async function run(
	setup: ReturnType<typeof eventFor>,
	respond: (event: ReturnType<typeof eventFor>['event']) => Response | Promise<Response> = () =>
		jsonResponse({ ok: true })
) {
	const resolve = vi.fn(async () => respond(setup.event));
	const response = await handle({ event: setup.event as never, resolve: resolve as never });
	await Promise.all(setup.waited);
	return { response, resolve };
}

afterEach(() => vi.restoreAllMocks());

describe('security headers', () => {
	it('are on every response the Worker renders, with HSTS over https', async () => {
		const { response } = await run(eventFor('/recipe/1'), () => new Response('<html></html>'));
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			expect(response.headers.get(name)).toBe(value);
		}
		expect(response.headers.get('strict-transport-security')).toBe(HSTS);
	});

	it('leave HSTS off plain http, i.e. local development', async () => {
		const setup = eventFor('/');
		const event = { ...setup.event, url: new URL('http://localhost:5173/') };
		const { response } = await run({ ...setup, event }, () => new Response('ok'));
		expect(response.headers.get('strict-transport-security')).toBeNull();
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('fill in the language and direction of app.html', async () => {
		const setup = eventFor('/?lang=ar');
		let html = '';
		await handle({
			event: setup.event as never,
			resolve: (async (_: unknown, opts: { transformPageChunk: (c: { html: string }) => string }) => {
				html = opts.transformPageChunk({ html: '<html lang="%cookup.lang%" dir="%cookup.dir%">' });
				return new Response(html);
			}) as never
		});
		expect(html).toBe('<html lang="ar" dir="rtl">');
	});
});

describe('edge-cache key normalisation', () => {
	const canonical = `${ORIGIN}/api/search?q=pie&lang=en&${V}`;

	it('answers a non-canonical URL from the canonical entry, without the route', async () => {
		const cache = fakeCache({ [canonical]: jsonResponse({ recipes: ['cached'] }) });
		const { response, resolve } = await run(eventFor('/api/search?lang=en&q=pie&_r=123', { cache }));
		expect(resolve).not.toHaveBeenCalled();
		expect(await response.json()).toEqual({ recipes: ['cached'] });
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(cache.calls).toEqual([`match ${canonical}`]);
	});

	it('on a miss, runs the route and stores the response under the canonical URL too', async () => {
		const cache = fakeCache();
		const { response, resolve } = await run(eventFor('/api/search?q=pie&lang=en&v=bogus', { cache }));
		expect(resolve).toHaveBeenCalledOnce();
		expect(await response.json()).toEqual({ ok: true });
		expect(cache.calls).toEqual([`match ${canonical}`, `put ${canonical}`]);
		const stored = cache.store.get(canonical)!;
		expect(await stored.json()).toEqual({ ok: true });
		expect(stored.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('costs a canonical request nothing: the adapter already looked it up and will store it', async () => {
		const cache = fakeCache();
		await run(eventFor(canonical, { cache }));
		expect(cache.calls).toEqual([]);
	});

	it('looks up even a canonical URL when the request told the adapter to skip its lookup', async () => {
		const cache = fakeCache({ [canonical]: jsonResponse({ recipes: ['cached'] }) });
		const { resolve } = await run(eventFor(canonical, { cache, headers: { 'cache-control': 'no-cache' } }));
		expect(resolve).not.toHaveBeenCalled();
	});

	it.each([
		[NEVER_CACHE, 200],
		['public, max-age=60', 400],
		['no-cache', 200]
	])('never stores a response with Cache-Control %s and status %i', async (cacheControl, status) => {
		const cache = fakeCache();
		await run(eventFor('/api/search?q=pie&lang=en&x=1', { cache }), () =>
			jsonResponse({}, cacheControl, status)
		);
		expect(cache.calls.filter((c) => c.startsWith('put'))).toEqual([]);
	});

	it('never stores a response that sets a cookie', async () => {
		const cache = fakeCache();
		await run(eventFor('/api/search?q=pie&lang=en&x=1', { cache }), () => {
			const response = jsonResponse({});
			response.headers.set('set-cookie', 'a=b');
			return response;
		});
		expect(cache.calls.filter((c) => c.startsWith('put'))).toEqual([]);
	});

	it.each([
		['GET', '/admin?x=1'],
		['POST', '/admin?/request'],
		['POST', '/api/track?path=/&lang=en&junk=1'],
		['GET', '/api/track?path=/'],
		['POST', '/api/search?q=pie&x=1'],
		['GET', '/?have=egg&x=1'],
		['GET', '/recipe/7?lang=fr&x=1'],
		['GET', '/api/match?have=egg&offset=2.5']
	])('leaves %s %s alone', async (method, path) => {
		const cache = fakeCache();
		const { resolve } = await run(eventFor(path, { method, cache }));
		expect(resolve).toHaveBeenCalledOnce();
		expect(cache.calls).toEqual([]);
	});

	it('falls through to the route when the cache itself fails', async () => {
		const cache = fakeCache({}, { failMatch: true });
		const { resolve, response } = await run(eventFor('/api/search?q=pie&x=1', { cache }));
		expect(resolve).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
	});

	it('works without a platform cache (vite dev, tests)', async () => {
		const setup = eventFor('/api/search?q=pie&x=1');
		const event = { ...setup.event, platform: undefined as never };
		const { response } = await run({ ...setup, event });
		expect(response.status).toBe(200);
	});
});

describe('server errors', () => {
	const QUOTA = new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");
	const throwing = (error: unknown) => (event: ReturnType<typeof eventFor>['event']) => {
		handleError({ error, event: event as never, status: 500, message: 'Internal Error' });
		return new Response('<html>error page</html>', { status: 500, headers: { 'content-type': 'text/html' } });
	};

	it('a spent D1 quota on an API is a 503 { error: "unavailable" } with Retry-After', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { response } = await run(eventFor('/api/match?have=egg&lang=en'), throwing(QUOTA));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'unavailable' });
		const retryAfter = Number(response.headers.get('retry-after'));
		expect(retryAfter).toBeGreaterThanOrEqual(60);
		expect(retryAfter).toBeLessThanOrEqual(86_400);
		expect(response.headers.get('cache-control')).toBe(NEVER_CACHE);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('a transient D1 error on a page is a 503 that keeps the rendered error page', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { response } = await run(
			eventFor('/recipe/7'),
			throwing(new Error('D1 DB is overloaded. Too many requests queued.'))
		);
		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('30');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('<html>error page</html>');
	});

	it('any other API failure is a 500 { error: "internal" }', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { response } = await run(
			eventFor('/api/recipes?ids=1'),
			throwing(new Error('D1_ERROR: too many SQL variables'))
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: 'internal' });
	});

	it('any other page failure keeps its status', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { response } = await run(eventFor('/recipe/7'), throwing(new TypeError('boom')));
		expect(response.status).toBe(500);
	});

	it('handleError gives pages a code and logs one JSON line, without the query string', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { event } = eventFor('/recipe/7?lang=fr&have=egg', { routeId: '/recipe/[id]' });
		expect(handleError({ error: QUOTA, event: event as never, status: 500, message: 'Internal Error' })).toEqual({
			message: 'Service Unavailable',
			code: 'unavailable'
		});
		expect(handleError({ error: new Error('x'), event: event as never, status: 500, message: 'Internal Error' })).toEqual({
			message: 'Internal Error',
			code: 'internal'
		});
		expect(log).toHaveBeenCalledTimes(2);
		const line = JSON.parse(log.mock.calls[0][0] as string);
		expect(line).toMatchObject({ level: 'error', status: 500, outage: 'quota', route: '/recipe/[id]', path: '/recipe/7' });
		expect(log.mock.calls[0][0]).not.toContain('have=egg');
	});

	it('handleError does not log a 404', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { event } = eventFor('/nope');
		expect(handleError({ error: new Error('Not found: /nope'), event: event as never, status: 404, message: 'Not Found' })).toEqual({
			message: 'Not Found',
			code: 'not_found'
		});
		expect(log).not.toHaveBeenCalled();
	});
});
