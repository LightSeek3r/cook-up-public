import {
	loadCorpus,
	matchCore,
	recipesByIds,
	resolveKeys,
	searchIngredients,
	searchTitles,
	slackFor
} from '$lib/data';
import tiny from './warmup-corpus.json';

/**
 * Runs the data code once over a tiny corpus (the e2e seed's artefacts,
 * warmup-corpus.json), from the server `init` hook.
 *
 * The Cloudflare adapter calls `server.init()` in the Worker's global scope,
 * so this runs at isolate startup, which is not billed to any request (the
 * free plan's 10 ms is per request). Global scope cannot fetch, so the real
 * artefacts still load on first use; what moves out of the first request is
 * compiling and first-running the code that decodes and queries them (on the
 * preview Worker, 2026-10-13: a cold isolate's first match fell from a median
 * 27 to 16 ms of CPU, for about 5 ms more startup). Never throws: a failed
 * warm-up only leaves the first request slower.
 */
export function warmUp(): void {
	try {
		const core = Uint8Array.from(atob(tiny.core), (c) => c.charCodeAt(0));
		const corpus = loadCorpus({ core, names: { en: tiny.names }, titles: { en: tiny.titles } });
		const keys = corpus.core.keys();
		for (const selection of [keys.slice(0, 2), keys.slice(0, 5)]) {
			const have = resolveKeys(corpus, selection);
			const slack = slackFor(have.length);
			for (const sort of [undefined, 'kcal', 'grade', 'time'] as const) {
				JSON.stringify(matchCore(corpus, { have, lang: 'en', slack, mustUse: have.slice(0, 1), sort }));
			}
		}
		const title = corpus.core.sourceTitle(0) ?? 'tomato';
		JSON.stringify(searchTitles(corpus, { q: title.slice(0, 4), lang: 'en' }));
		JSON.stringify(searchIngredients(corpus, { q: keys[0].slice(0, 3), lang: 'en' }));
		JSON.stringify(recipesByIds(corpus, { ids: [...corpus.core.recipeId], lang: 'en' }));
	} catch (error) {
		console.error(JSON.stringify({ level: 'error', warmUp: String(error).slice(0, 300) }));
	}
}
