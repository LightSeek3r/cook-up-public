import { browser } from '$app/environment';
import {
	SEASON_KEY,
	SEASON_ON_KEY,
	detectFrom,
	effectiveView,
	readPrefs,
	writeChoice,
	writeEnabled,
	type PrefSource,
	type StorageLike
} from './prefs';
import { formatView, normaliseView, type Detection, type SeasonView } from './zones';

export interface SeasonPrefsEnv {
	storage(): StorageLike | null;
	detect(): Detection;
	/** Calls back when another tab changes storage (key null: storage cleared). */
	onStorage(listener: (key: string | null) => void): void;
}

const sameChoice = (a: SeasonView | null, b: SeasonView | null) => (a ? formatView(a) : '') === (b ? formatView(b) : '');

/**
 * The reader's climate: their stored override, what the browser suggests,
 * and whether seasons rank recipes. One shared instance (seasonPrefs) so the
 * chip, the picker, the shelf and the filter bar agree.
 *
 * Nothing is read until hydrate(), which consumers call from onMount/$effect
 * (idempotent, like hydrateFavorites): the server never runs it, so SSR
 * renders the defaults (no choice, no detection, world, off) and the first
 * client render matches it.
 */
export class SeasonPrefs {
	#choice = $state.raw<SeasonView | null>(null);
	#detected = $state.raw<Detection | null>(null);
	#enabled = $state(false);
	#hydrated = false;
	readonly #env: SeasonPrefsEnv | null;

	/** `env` null (the server) makes every method a no-op. */
	constructor(env: SeasonPrefsEnv | null) {
		this.#env = env;
	}

	/** The stored override, null when automatic. */
	get choice(): SeasonView | null {
		return this.#choice;
	}

	/** The browser's suggestion, null until hydrated. */
	get detected(): Detection | null {
		return this.#detected;
	}

	get effective(): SeasonView {
		return effectiveView(this.#choice, this.#detected).view;
	}

	get source(): PrefSource {
		return effectiveView(this.#choice, this.#detected).source;
	}

	/** Whether seasons rank recipes; off by default. */
	get enabled(): boolean {
		return this.#enabled;
	}

	set enabled(on: boolean) {
		if (!this.#env) return;
		this.hydrate();
		this.#enabled = on;
		writeEnabled(this.#env.storage(), on);
	}

	hydrate(): void {
		const env = this.#env;
		if (this.#hydrated || !env) return;
		this.#hydrated = true;
		this.#read();
		this.#detected = env.detect();
		env.onStorage((key) => {
			if (key === null || key === SEASON_KEY || key === SEASON_ON_KEY) this.#read();
		});
	}

	/** Stores an override; null goes back to automatic. */
	set(view: SeasonView | null): void {
		if (!this.#env) return;
		this.hydrate();
		this.#choice = view && normaliseView(view);
		writeChoice(this.#env.storage(), this.#choice);
	}

	#read() {
		const stored = readPrefs(this.#env?.storage());
		if (!sameChoice(stored.choice, this.#choice)) this.#choice = stored.choice;
		this.#enabled = stored.enabled;
	}
}

function browserStorage(): Storage | null {
	try {
		return localStorage;
	} catch {
		return null;
	}
}

const browserEnv: SeasonPrefsEnv = {
	storage: browserStorage,
	detect: () =>
		detectFrom({
			timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
			languages: () => navigator.languages ?? [navigator.language]
		}),
	onStorage(listener) {
		addEventListener('storage', (event) => {
			if (event.storageArea === browserStorage()) listener(event.key);
		});
	}
};

export const seasonPrefs = new SeasonPrefs(browser ? browserEnv : null);
