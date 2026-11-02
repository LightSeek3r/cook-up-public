/**
 * Pure climate-preference logic: the stored override and the seasonal
 * ranking toggle, read and written through any Storage-like object. The
 * reactive store over localStorage is prefs.svelte.ts.
 */
import { detectView, formatView, parseView, type Detection, type DetectionSource, type SeasonView } from './zones';

/** 'med:s' | 'world'; absent or '' means detect automatically. */
export const SEASON_KEY = 'cookup-season';
/** '1' when seasons rank recipes; anything else is off, the default. */
export const SEASON_ON_KEY = 'cookup-season-on';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PrefSource = 'override' | DetectionSource;

/** The stored override, null for automatic (and for anything unreadable). */
export const parseSeasonPref = (raw: string | null): SeasonView | null => parseView(raw);

export const formatSeasonPref = (view: SeasonView | null): string => (view ? formatView(view) : '');

export const parseEnabled = (raw: string | null): boolean => raw === '1';

export const formatEnabled = (on: boolean): string => (on ? '1' : '0');

/** Which calendar the shelf, the badges and the ranking read: the reader's climate or the world's. */
export type SeasonScope = 'local' | 'world';
/** 'world' or absent ('local', the default). */
export const SEASON_SCOPE_KEY = 'cookup-season-scope';
/** '1' when only recipes with nothing out of season left to buy are listed. */
export const SEASON_ONLY_KEY = 'cookup-season-only';

export const parseScope = (raw: string | null): SeasonScope => (raw === 'world' ? 'world' : 'local');

/** Off, or on with one of the two calendars: the filter bar's three-way control. */
export type SeasonMode = 'off' | SeasonScope;

export const modeOf = (enabled: boolean, scope: SeasonScope): SeasonMode => (enabled ? scope : 'off');

export interface StoredExtras {
	scope: SeasonScope;
	onlyInSeason: boolean;
}

/** Kept apart from readPrefs so its shape, and every caller of it, stays as it was. */
export function readExtras(storage: StorageLike | null | undefined): StoredExtras {
	try {
		return {
			scope: parseScope(storage?.getItem(SEASON_SCOPE_KEY) ?? null),
			onlyInSeason: parseEnabled(storage?.getItem(SEASON_ONLY_KEY) ?? null)
		};
	} catch {
		return { scope: 'local', onlyInSeason: false };
	}
}

export function writeScope(storage: StorageLike | null | undefined, scope: SeasonScope): void {
	try {
		if (scope === 'world') storage?.setItem(SEASON_SCOPE_KEY, 'world');
		else storage?.removeItem(SEASON_SCOPE_KEY);
	} catch {
		/* same as writeChoice */
	}
}

export function writeOnlyInSeason(storage: StorageLike | null | undefined, on: boolean): void {
	try {
		storage?.setItem(SEASON_ONLY_KEY, formatEnabled(on));
	} catch {
		/* same as writeChoice */
	}
}

export interface StoredPrefs {
	choice: SeasonView | null;
	enabled: boolean;
}

/** Private-mode Safari and blocking extensions throw on access: unreadable storage reads as the defaults. */
export function readPrefs(storage: StorageLike | null | undefined): StoredPrefs {
	try {
		return {
			choice: parseSeasonPref(storage?.getItem(SEASON_KEY) ?? null),
			enabled: parseEnabled(storage?.getItem(SEASON_ON_KEY) ?? null)
		};
	} catch {
		return { choice: null, enabled: false };
	}
}

/** Stores the override; null forgets it so detection applies again. */
export function writeChoice(storage: StorageLike | null | undefined, view: SeasonView | null): void {
	try {
		if (view) storage?.setItem(SEASON_KEY, formatSeasonPref(view));
		else storage?.removeItem(SEASON_KEY);
	} catch {
		/* a choice that fails to persist still applies to this page */
	}
}

export function writeEnabled(storage: StorageLike | null | undefined, on: boolean): void {
	try {
		storage?.setItem(SEASON_ON_KEY, formatEnabled(on));
	} catch {
		/* same as writeChoice */
	}
}

export interface EffectiveView {
	view: SeasonView;
	source: PrefSource;
	tz?: string;
}

/** The override if there is one, else the detection, else (before detection ran) the world. */
export function effectiveView(choice: SeasonView | null, detected: Detection | null): EffectiveView {
	if (choice) return { view: choice, source: 'override' };
	return detected ?? { view: 'world', source: 'fallback' };
}

/** The browser's time zone and languages, read defensively (some embedded browsers lack either). */
export function detectFrom(env: { timeZone?: () => string | undefined; languages?: () => readonly string[] | undefined }): Detection {
	let tz: string | undefined;
	let languages: readonly string[] | undefined;
	try {
		tz = env.timeZone?.();
	} catch {
		tz = undefined;
	}
	try {
		languages = env.languages?.();
	} catch {
		languages = undefined;
	}
	return detectView(tz, languages);
}
