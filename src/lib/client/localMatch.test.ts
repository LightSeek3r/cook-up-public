import { describe, it, expect, vi } from 'vitest';
import { createLocalMatch, localMatch, type LocalMatchDeps } from './localMatch';
import type { MatchData } from './matchData';

const BODY = { results: [], total: 0, haveCount: 0 };

/** A MatchData that answers every query with BODY in any loaded language. */
function fakeData(): MatchData & { loads: string[] } {
	const loads: string[] = [];
	const loaded = new Set<string>();
	return {
		version: 'v1',
		loads,
		async load(lang) {
			loads.push(lang);
			loaded.add(lang);
		},
		ready: (lang) => loaded.has(lang),
		match: (search) => (loaded.has(new URLSearchParams(search).get('lang') ?? '') ? BODY : null)
	};
}

function setup({ constrained = false } = {}) {
	const idle: (() => void)[] = [];
	let resolve!: (data: MatchData) => void;
	let reject!: (error: unknown) => void;
	const opened = new Promise<MatchData>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	const deps = {
		open: vi.fn<LocalMatchDeps['open']>(() => opened),
		whenIdle: vi.fn<LocalMatchDeps['whenIdle']>((run) => void idle.push(run)),
		constrained: () => constrained,
		warn: vi.fn<LocalMatchDeps['warn']>()
	};
	return { local: createLocalMatch(deps), deps, idle, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createLocalMatch', () => {
	it('downloads at an idle moment, once, with low priority, and matches only once the data is in', async () => {
		const { local, deps, idle, resolve } = setup();
		local.prefetch('fr');
		local.prefetch('fr');
		expect(deps.whenIdle).toHaveBeenCalledTimes(1);
		expect(deps.open).not.toHaveBeenCalled();
		expect(local.match('have=tomato&lang=fr')).toBeNull();

		idle[0]();
		expect(deps.open).toHaveBeenCalledWith('fr', 'low');
		expect(local.match('have=tomato&lang=fr')).toBeNull();
		expect(local.ready('fr')).toBe(false);

		const data = fakeData();
		resolve(data);
		await tick();
		await data.load('fr');
		expect(local.ready('fr')).toBe(true);
		expect(local.ready('de')).toBe(false);
		expect(local.match('have=tomato&lang=fr')).toBe(BODY);
	});

	it('a tap downloads at once and supersedes the idle download', async () => {
		const { local, deps, idle } = setup();
		local.prefetch('en');
		local.want('en');
		expect(deps.open).toHaveBeenCalledWith('en', 'auto');
		idle[0]();
		local.want('en');
		expect(deps.open).toHaveBeenCalledTimes(1);
	});

	it('on Save-Data or 2G it waits for the first tap', () => {
		const { local, deps } = setup({ constrained: true });
		local.prefetch('ja');
		expect(deps.whenIdle).not.toHaveBeenCalled();
		local.want('ja');
		expect(deps.open).toHaveBeenCalledWith('ja', 'auto');
	});

	it('loads the language the page switched to, during the download or after it', async () => {
		const { local, resolve } = setup();
		local.want('en');
		local.prefetch('ar');
		const data = fakeData();
		resolve(data);
		await tick();
		expect(data.loads).toEqual(['ar']);
		local.prefetch('ja');
		expect(data.loads).toEqual(['ar', 'ja']);
	});

	it('a failed download leaves every match to the server for good, without a second download', async () => {
		const { local, deps, reject } = setup();
		local.want('en');
		reject(new Error('data/core.bin: HTTP 503'));
		await tick();
		expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 503'));
		local.want('en');
		local.prefetch('en');
		expect(deps.open).toHaveBeenCalledTimes(1);
		expect(local.match('have=tomato&lang=en')).toBeNull();
	});

	it('a match that throws discards the data: that query and every later one go to the server', async () => {
		const { local, deps, resolve } = setup();
		local.want('en');
		const data = fakeData();
		let calls = 0;
		data.match = () => {
			calls++;
			throw new Error('corrupt');
		};
		resolve(data);
		await tick();
		expect(local.match('have=tomato&lang=en')).toBeNull();
		expect(local.match('have=onion&lang=en')).toBeNull();
		expect(calls).toBe(1);
		expect(local.ready('en')).toBe(false);
		expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('corrupt'));
	});

	it('is off outside the browser', () => {
		expect(localMatch('have=tomato&lang=en')).toBeNull();
	});
});
