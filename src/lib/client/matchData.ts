import { decodeCore, loadCorpus, matchResponse } from '$lib/data';
import { parseMatchQuery } from '$lib/apiParams';

/**
 * The /api/match artefacts in the browser: core.bin, English names (every
 * language's fallback) and each language's names and titles, fetched from
 * the static assets and checked against the data version this build was made
 * with. Loaded through a dynamic import, so the decoder and the match code
 * stay out of the home page's first-load JavaScript.
 */

export type MatchBody = ReturnType<typeof matchResponse>;
type Corpus = ReturnType<typeof loadCorpus>;
type NamesFile = Parameters<typeof loadCorpus>[0]['names'][string];
type TitlesFile = NonNullable<Parameters<typeof loadCorpus>[0]['titles']>[string];
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * `?v=` is the data version (a hash of every file's content, lock.json), so
 * each data build has its own URLs: _headers serves them immutable, and a
 * deploy that changes no data leaves the browser's copy valid.
 */
export const dataUrl = (path: string, version: string) => `/data/${path}?v=${version}`;

/** Artefacts of a data version other than this build's. */
export class StaleDataError extends Error {}

export interface MatchData {
	readonly version: string;
	/** Loads `lang`'s names and titles once; `match` answers in it after this resolves. */
	load(lang: string): Promise<void>;
	ready(lang: string): boolean;
	/**
	 * The /api/match body for a query string as the page sends it, or null when
	 * this cannot answer it: the query's language is not loaded, or the route
	 * would answer 400. Throws if the match itself fails.
	 */
	match(search: string): MatchBody | null;
}

export interface OpenOptions {
	version: string;
	lang: string;
	fetch: Fetch;
	priority?: RequestPriority;
}

/** core.bin, English and `lang`, every file checked to be data version `version`. */
export async function openMatchData({ version, lang, fetch, priority }: OpenOptions): Promise<MatchData> {
	/**
	 * A file of this data version. Another version means a stale copy: the HTTP
	 * cache can hold one under this URL when a request raced a deploy (the
	 * assets ignore `?v=`), so it is fetched once more past the cache, and only
	 * a second mismatch (this tab predates the deployed data) gives up.
	 */
	async function get<T>(path: string, read: (response: Response) => Promise<T>, versionOf: (value: T) => string) {
		for (const cache of ['default', 'reload'] as const) {
			const response = await fetch(dataUrl(path, version), { cache, priority });
			if (!response.ok) throw new Error(`data/${path}: HTTP ${response.status}`);
			const value = await read(response);
			if (versionOf(value) === version) return value;
		}
		throw new StaleDataError(`data/${path} is not data version ${version}`);
	}
	const json = <T extends { version: string }>(path: string) =>
		get(path, (response) => response.json() as Promise<T>, (file) => file.version);

	const [core, en] = await Promise.all([
		get('core.bin', async (response) => decodeCore(await response.arrayBuffer()), (c) => c.version),
		json<Exclude<NamesFile, string>>('names/en.json')
	]);
	// loadCorpus reads these records lazily, so a language added later is picked up.
	const names: Record<string, NamesFile> = { en };
	const titles: Record<string, TitlesFile> = {};
	const corpus: Corpus = loadCorpus({ core, names, titles });
	corpus.name(0, 'en');

	const langs = new Map<string, Promise<void>>();
	const loaded = new Set<string>();

	function load(lang: string): Promise<void> {
		let promise = langs.get(lang);
		if (!promise) {
			// A failed language stays failed: its matches go to the server.
			promise = (async () => {
				const [ownNames, ownTitles] = await Promise.all([
					lang === 'en' ? null : json<Exclude<NamesFile, string>>(`names/${lang}.json`),
					json<Exclude<TitlesFile, string>>(`titles/${lang}.json`)
				]);
				if (ownNames) names[lang] = ownNames;
				titles[lang] = ownTitles;
				// Parses and checks both now, as the Worker does, so a bad file fails
				// here and not halfway through a match.
				corpus.name(0, lang);
				corpus.title(0, lang);
				loaded.add(lang);
			})();
			langs.set(lang, promise);
		}
		return promise;
	}

	// Only that language's matches go to the server if it fails (see load).
	await load(lang).catch(() => {});

	return {
		version,
		load,
		ready: (lang) => loaded.has(lang),
		match(search) {
			const query = parseMatchQuery(new URLSearchParams(search));
			if (!query || !loaded.has(query.lang)) return null;
			return matchResponse(corpus, query);
		}
	};
}
