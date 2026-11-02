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
