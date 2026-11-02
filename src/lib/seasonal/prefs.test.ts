import { describe, expect, it } from 'vitest';
import {
	SEASON_KEY,
	SEASON_ONLY_KEY,
	SEASON_ON_KEY,
	SEASON_SCOPE_KEY,
	detectFrom,
	effectiveView,
	formatSeasonPref,
	modeOf,
	parseEnabled,
	parseScope,
	parseSeasonPref,
	readExtras,
	readPrefs,
	writeChoice,
	writeEnabled,
	writeOnlyInSeason,
	writeScope,
	type StorageLike
} from './prefs';
import { SeasonPrefs, type SeasonPrefsEnv } from './prefs.svelte';
import type { Detection } from './zones';

class FakeStorage implements StorageLike {
	data = new Map<string, string>();
	getItem = (key: string) => this.data.get(key) ?? null;
	setItem = (key: string, value: string) => void this.data.set(key, String(value));
	removeItem = (key: string) => void this.data.delete(key);
}

const throwing: StorageLike = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('QuotaExceededError');
	},
	removeItem: () => {
		throw new Error('SecurityError');
	}
};

const madrid: Detection = {
	view: { zone: 'med', hemi: 'n' },
	source: 'timezone',
	tz: 'Europe/Madrid'
};

describe('stored preference', () => {
	it('parses strictly and formats back', () => {
		expect(parseSeasonPref('med:s')).toEqual({ zone: 'med', hemi: 's' });
		expect(parseSeasonPref('world')).toBe('world');
		expect(parseSeasonPref('trop:s')).toEqual({ zone: 'trop', hemi: 'n' });
		for (const raw of [null, '', 'auto', 'med', 'med:x', 'Med:n']) expect(parseSeasonPref(raw)).toBeNull();
		expect(formatSeasonPref({ zone: 'oce', hemi: 's' })).toBe('oce:s');
		expect(formatSeasonPref('world')).toBe('world');
		expect(formatSeasonPref(null)).toBe('');
		expect(parseEnabled('1')).toBe(true);
		for (const raw of [null, '', '0', 'true']) expect(parseEnabled(raw)).toBe(false);
	});

	it('reads and writes through a storage', () => {
		const storage = new FakeStorage();
		expect(readPrefs(storage)).toEqual({ choice: null, enabled: false });
		writeChoice(storage, { zone: 'trop', hemi: 's' });
		writeEnabled(storage, true);
		expect(storage.data.get(SEASON_KEY)).toBe('trop:n');
		expect(storage.data.get(SEASON_ON_KEY)).toBe('1');
		expect(readPrefs(storage)).toEqual({
			choice: { zone: 'trop', hemi: 'n' },
			enabled: true
		});
		writeChoice(storage, null);
		writeEnabled(storage, false);
		expect(storage.data.has(SEASON_KEY)).toBe(false);
		expect(readPrefs(storage)).toEqual({ choice: null, enabled: false });
	});

	it('survives storage that throws or is missing', () => {
		expect(readPrefs(throwing)).toEqual({ choice: null, enabled: false });
		expect(readPrefs(null)).toEqual({ choice: null, enabled: false });
		expect(() => writeChoice(throwing, 'world')).not.toThrow();
		expect(() => writeEnabled(throwing, true)).not.toThrow();
		expect(() => writeChoice(null, 'world')).not.toThrow();
	});

	it('prefers the override, then the detection, then the world', () => {
		expect(effectiveView('world', madrid)).toEqual({
			view: 'world',
			source: 'override'
		});
		expect(effectiveView(null, madrid)).toEqual(madrid);
		expect(effectiveView(null, null)).toEqual({
			view: 'world',
			source: 'fallback'
		});
	});

	it('detects from whatever the browser exposes', () => {
		expect(
			detectFrom({
				timeZone: () => 'Europe/Madrid',
				languages: () => ['de-DE']
			})
		).toEqual(madrid);
		expect(
			detectFrom({
				timeZone: () => {
					throw new RangeError();
				},
				languages: () => ['en-AU']
			})
		).toEqual({ view: { zone: 'subtrop', hemi: 's' }, source: 'language' });
		expect(detectFrom({})).toEqual({ view: 'world', source: 'fallback' });
	});
});

describe('SeasonPrefs', () => {
	function setup(initial: Record<string, string> = {}) {
		const storage = new FakeStorage();
		for (const [key, value] of Object.entries(initial)) storage.setItem(key, value);
		const listeners: ((key: string | null) => void)[] = [];
		let detections = 0;
		const env: SeasonPrefsEnv = {
			storage: () => storage,
			detect: () => {
				detections++;
				return madrid;
			},
			onStorage: (listener) => void listeners.push(listener)
		};
		const prefs = new SeasonPrefs(env);
		return { storage, prefs, listeners, detections: () => detections };
	}

	it('renders the defaults until hydrated, then reads storage and detects once', () => {
		const { prefs, listeners, detections } = setup({ [SEASON_ON_KEY]: '1' });
		expect([prefs.choice, prefs.detected, prefs.effective, prefs.source, prefs.enabled]).toEqual([null, null, 'world', 'fallback', false]);
		expect(detections()).toBe(0);
		prefs.hydrate();
		prefs.hydrate();
		expect(detections()).toBe(1);
		expect(listeners).toHaveLength(1);
		expect([prefs.choice, prefs.detected, prefs.effective, prefs.source, prefs.enabled]).toEqual([
			null,
			madrid,
			madrid.view,
			'timezone',
			true
		]);
	});

	it('stores an override and goes back to automatic', () => {
		const { prefs, storage } = setup();
		prefs.set({ zone: 'oce', hemi: 's' });
		expect(prefs.choice).toEqual({ zone: 'oce', hemi: 's' });
		expect(prefs.effective).toEqual({ zone: 'oce', hemi: 's' });
		expect(prefs.source).toBe('override');
		expect(storage.data.get(SEASON_KEY)).toBe('oce:s');
		prefs.set(null);
		expect(prefs.source).toBe('timezone');
		expect(storage.data.has(SEASON_KEY)).toBe(false);
		prefs.enabled = true;
		expect(storage.data.get(SEASON_ON_KEY)).toBe('1');
	});

	it("follows another tab's changes", () => {
		const { prefs, storage, listeners } = setup();
		prefs.hydrate();
		storage.setItem(SEASON_KEY, 'world');
		storage.setItem(SEASON_ON_KEY, '1');
		listeners[0]('unrelated');
		expect(prefs.choice).toBeNull();
		listeners[0](SEASON_KEY);
		expect(prefs.choice).toBe('world');
		expect(prefs.enabled).toBe(true);
		storage.data.clear();
		listeners[0](null);
		expect([prefs.choice, prefs.enabled]).toEqual([null, false]);
	});

	it('does nothing without a browser', () => {
		const prefs = new SeasonPrefs(null);
		prefs.hydrate();
		prefs.set('world');
		prefs.enabled = true;
		expect([prefs.choice, prefs.detected, prefs.effective, prefs.source, prefs.enabled]).toEqual([null, null, 'world', 'fallback', false]);
		prefs.mode = 'world';
		prefs.onlyInSeason = true;
		expect([prefs.mode, prefs.scope, prefs.onlyInSeason]).toEqual(['off', 'local', false]);
	});

	it('maps the three-way mode onto enabled and scope, and keeps the scope while off', () => {
		const { prefs, storage } = setup();
		expect([prefs.mode, prefs.scope, prefs.view]).toEqual(['off', 'local', 'world']);
		prefs.hydrate();
		expect(prefs.view).toEqual(madrid.view);
		prefs.mode = 'world';
		expect([prefs.enabled, prefs.scope, prefs.view]).toEqual([true, 'world', 'world']);
		expect(storage.data.get(SEASON_SCOPE_KEY)).toBe('world');
		prefs.mode = 'off';
		expect([prefs.enabled, prefs.scope, prefs.mode]).toEqual([false, 'world', 'off']);
		prefs.mode = 'local';
		expect([prefs.enabled, prefs.mode, prefs.view]).toEqual([true, 'local', madrid.view]);
		expect(storage.data.has(SEASON_SCOPE_KEY)).toBe(false);
		prefs.onlyInSeason = true;
		expect(storage.data.get(SEASON_ONLY_KEY)).toBe('1');
	});

	it('reads scope and the in-season filter at hydration and from other tabs', () => {
		const { prefs, storage, listeners } = setup({ [SEASON_SCOPE_KEY]: 'world', [SEASON_ONLY_KEY]: '1' });
		expect([prefs.scope, prefs.onlyInSeason]).toEqual(['local', false]);
		prefs.hydrate();
		expect([prefs.scope, prefs.onlyInSeason, prefs.mode]).toEqual(['world', true, 'off']);
		storage.removeItem(SEASON_SCOPE_KEY);
		listeners[0](SEASON_SCOPE_KEY);
		expect(prefs.scope).toBe('local');
		storage.setItem(SEASON_ONLY_KEY, '0');
		listeners[0](SEASON_ONLY_KEY);
		expect(prefs.onlyInSeason).toBe(false);
	});
});

describe('scope and in-season filter storage', () => {
	it('parses strictly, defaults to local and off, and survives broken storage', () => {
		expect(parseScope('world')).toBe('world');
		for (const raw of [null, '', 'local', 'World', 'med:n']) expect(parseScope(raw)).toBe('local');
		expect(modeOf(false, 'world')).toBe('off');
		expect(modeOf(true, 'world')).toBe('world');
		expect(readExtras(throwing)).toEqual({ scope: 'local', onlyInSeason: false });
		expect(readExtras(null)).toEqual({ scope: 'local', onlyInSeason: false });
		expect(() => writeScope(throwing, 'world')).not.toThrow();
		expect(() => writeOnlyInSeason(throwing, true)).not.toThrow();
		const storage = new FakeStorage();
		writeScope(storage, 'world');
		writeOnlyInSeason(storage, true);
		expect(readExtras(storage)).toEqual({ scope: 'world', onlyInSeason: true });
		writeScope(storage, 'local');
		expect(storage.data.has(SEASON_SCOPE_KEY)).toBe(false);
	});
});
