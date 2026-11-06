import { browser } from '$app/environment';
import { currentMonth, type Seasons } from './index';
import { loadSeasons } from './load';

export interface SeasonDataEnv {
	load(): Promise<Seasons>;
	month(): number;
	/** Calls back when the tab is shown again (the month may have turned while it was hidden). */
	onVisible(listener: () => void): void;
}

/**
 * The parsed seasons.json and the reader's month, shared by every badge,
 * the shelf and the seasonal pages. Empty until want(), which consumers call
 * from onMount/$effect: the server never runs it, so SSR and the first client
 * render both show no season marks and nothing waits for the file. A file
 * that cannot be had (an older data build without it, a network failure)
 * leaves `seasons` null for good, and the marks simply never appear.
 */
export class SeasonData {
	#seasons = $state.raw<Seasons | null>(null);
	#month = $state(0);
	#started = false;
	readonly #env: SeasonDataEnv | null;

	constructor(env: SeasonDataEnv | null) {
		this.#env = env;
	}

	get seasons(): Seasons | null {
		return this.#seasons;
	}

	/** 1-12 on the reader's clock, 0 until want() ran. */
	get month(): number {
		return this.#month;
	}

	want(): void {
		const env = this.#env;
		if (this.#started || !env) return;
		this.#started = true;
		this.#month = env.month();
		env.onVisible(() => {
			const month = env.month();
			if (month !== this.#month) this.#month = month;
		});
		env.load().then(
			(seasons) => (this.#seasons = seasons),
			() => {}
		);
	}
}

const browserEnv: SeasonDataEnv = {
	load: () => loadSeasons(),
	month: () => currentMonth(),
	onVisible(listener) {
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) listener();
		});
	}
};

export const seasonData = new SeasonData(browser ? browserEnv : null);
