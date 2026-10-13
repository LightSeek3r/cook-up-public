import { loadCorpus } from '$lib/data';
import { DataUnavailableError } from '$lib/apiError';

/**
 * The data artefacts in the Worker: fetched from env.ASSETS (static/data,
 * deployed with the Worker as one version) on first use, then kept in module
 * scope for the isolate's lifetime. A cold isolate pays one subrequest per
 * file and no parsing beyond core.bin's header; each language's two small
 * files are fetched the first time a request asks for that language.
 *
 * Anything that goes wrong while loading (a missing file, a corrupt one,
 * files from different data builds) is a DataUnavailableError, which the
 * error hook answers 503, and is not remembered: the next request retries.
 * There is deliberately no D1 fallback.
 */

type Corpus = ReturnType<typeof loadCorpus>;
type Assets = App.Platform['env']['ASSETS'];

/** ASSETS ignores the host; only the path names a file. */
const BASE = 'https://assets.invalid/data/';

interface Loaded {
	corpus: Corpus;
	/** loadCorpus reads these lazily, so a language added here is picked up. */
	names: Record<string, string>;
	titles: Record<string, string>;
	langs: Map<string, Promise<void>>;
	mosaics: Map<string, Promise<string>>;
}

interface PromiseCache<K, V> {
	get(key: K): Promise<V> | undefined;
	set(key: K, value: Promise<V>): unknown;
	delete(key: K): unknown;
}

/** Keyed by the binding, so tests that bring their own artefacts get their own corpus. */
const loaded = new WeakMap<Assets, Promise<Loaded>>();

function unavailable(error: unknown): DataUnavailableError {
	if (error instanceof DataUnavailableError) return error;
	const message = error instanceof Error ? error.message : String(error);
	return new DataUnavailableError(message, { cause: error });
}

/** `load()` once per key; a failure is not cached, so the next caller retries. */
function once<K, V>(cache: PromiseCache<K, V>, key: K, load: () => Promise<V>): Promise<V> {
	let promise = cache.get(key);
	if (!promise) {
		promise = load().catch((error: unknown) => {
			cache.delete(key);
			throw unavailable(error);
		});
		cache.set(key, promise);
	}
	return promise;
}

async function read(assets: Assets, path: string): Promise<Response> {
	const response = (await assets.fetch(BASE + path)) as unknown as Response;
	if (!response.ok) throw new DataUnavailableError(`data/${path}: HTTP ${response.status}`);
	return response;
}

const readText = async (assets: Assets, path: string) => (await read(assets, path)).text();

function assetsOf(platform: App.Platform | undefined): Assets {
	const assets = platform?.env?.ASSETS;
	if (!assets) throw new DataUnavailableError('no ASSETS binding');
	return assets;
}

async function loadBase(assets: Assets): Promise<Loaded> {
	const [core, en] = await Promise.all([
		read(assets, 'core.bin').then((response) => response.arrayBuffer()),
		readText(assets, 'names/en.json')
	]);
	const names: Record<string, string> = { en };
	const titles: Record<string, string> = {};
	const corpus = loadCorpus({ core, names, titles });
	// Parses and checks the file now, so a bad one fails here, as a 503, and
	// not halfway through some later request as a 500.
	corpus.name(0, 'en');
	return { corpus, names, titles, langs: new Map(), mosaics: new Map() };
}

async function base(platform: App.Platform | undefined): Promise<{ assets: Assets; data: Loaded }> {
	const assets = assetsOf(platform);
	return { assets, data: await once(loaded, assets, () => loadBase(assets)) };
}

/** The corpus, with `lang`'s titles and ingredient names loaded and checked. */
export async function corpusFor(platform: App.Platform | undefined, lang: string): Promise<Corpus> {
	const { assets, data } = await base(platform);
	await once(data.langs, lang, async () => {
		const [names, titles] = await Promise.all([
			lang === 'en' ? null : readText(assets, `names/${lang}.json`),
			readText(assets, `titles/${lang}.json`)
		]);
		if (names !== null) data.names[lang] = names;
		data.titles[lang] = titles;
		data.corpus.name(0, lang);
		data.corpus.title(0, lang);
	});
	return data.corpus;
}

/**
 * The /api/ingredients mosaic of `lang` as the response body. The file is
 * `{"version":…,"lang":…,"results":[…]}`, written by JSON.stringify, so the
 * body `{"results":[…]}` is a slice of it: nothing is parsed or re-serialised.
 */
export async function mosaicBody(platform: App.Platform | undefined, lang: string): Promise<string> {
	const { assets, data } = await base(platform);
	return once(data.mosaics, lang, async () => {
		const file = await readText(assets, `mosaic/${lang}.json`);
		const head = `{"version":${JSON.stringify(data.corpus.version)},"lang":${JSON.stringify(lang)},`;
		if (!file.startsWith(`${head}"results":[`) || !file.endsWith(']}')) {
			throw new DataUnavailableError(`data/mosaic/${lang}.json is not a mosaic of data version ${data.corpus.version}`);
		}
		return `{${file.slice(head.length)}`;
	});
}
