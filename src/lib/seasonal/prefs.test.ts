import { describe, expect, it } from 'vitest';
import {
	SEASON_KEY,
	SEASON_ON_KEY,
	detectFrom,
	effectiveView,
	formatSeasonPref,
	parseEnabled,
	parseSeasonPref,
	readPrefs,
	writeChoice,
	writeEnabled,
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
	});
});
