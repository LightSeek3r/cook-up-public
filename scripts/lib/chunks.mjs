/**
 * Proves a running site serves one coherent build: every `/_app/immutable`
 * file the HTML references, and everything those files import, returns 200, and
 * the HTML's `__sveltekit_<hash>` global matches both `/_app/version.json` and
 * the global the client chunks read.
 *
 * Fetching the HTML alone is not enough. On 2026-10-12 the page rendered fine
 * while 9 chunks 404ed and hydration crashed, because the Worker (server build)
 * and the static assets came from two different builds. That split shows up
 * here as missing chunks and as two different `__sveltekit_` hashes.
 *
 * Only fetch() and URL, no Node imports: the Playwright suite imports this file
 * and svelte-check type-checks it without @types/node.
 */

/**
 * SvelteKit's djb2 (`@sveltejs/kit/src/utils/hash.js`), which turns
 * `version.name` into the `__sveltekit_<hash>` global name.
 * @param {string} value
 */
export function kitHash(value) {
	let hash = 5381;
	let i = value.length;
	while (i) hash = (hash * 33) ^ value.charCodeAt(--i);
	return (hash >>> 0).toString(36);
}

const IMMUTABLE = '/_app/immutable/';

/**
 * Asset URLs referenced by a page: attributes, the inline `import("…")` boot
 * script, and the `Link: <…>; rel=modulepreload` header.
 * @param {string} html
 * @param {string | null} linkHeader
 * @param {string} pageUrl
 */
export function pageAssets(html, linkHeader, pageUrl) {
	const found = new Set();
	for (const m of html.matchAll(/["']([^"'\s<>]*\/_app\/immutable\/[^"'\s<>]+)["']/g)) {
		found.add(new URL(m[1], pageUrl).href);
	}
	for (const m of (linkHeader ?? '').matchAll(/<([^>]+)>/g)) {
		const url = new URL(m[1], pageUrl);
		if (url.pathname.startsWith(IMMUTABLE)) found.add(url.href);
	}
	return found;
}

/**
 * Relative `.js`/`.css` specifiers inside a built chunk: static imports,
 * dynamic `import()`, and Vite's `__vite__mapDeps` preload lists. All of them
 * are quoted `./x` or `../x` paths in the minified output.
 * @param {string} code
 * @param {string} fileUrl
 */
export function chunkImports(code, fileUrl) {
	const found = new Set();
	for (const m of code.matchAll(/["'](\.\.?\/[^"'\s]+\.(?:js|css))["']/g)) {
		const url = new URL(m[1], fileUrl);
		if (url.pathname.startsWith(IMMUTABLE)) found.add(url.href);
	}
	return found;
}

/**
 * @param {string} url
 * @param {number} [attempts]
 * @returns {Promise<Response>}
 */
async function get(url, attempts = 3) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fetch(url, {
				headers: { 'user-agent': 'cook-up-verify/1' },
				redirect: 'follow',
				signal: AbortSignal.timeout(20_000)
			});
		} catch (err) {
			// Network errors only; an HTTP 404 is an answer, not something to retry.
			if (attempt >= attempts) throw err;
			await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
		}
	}
}

/**
 * @typedef {{ url: string, status: number | string }} Failure
 * @typedef {{
 *   version: string | null,
 *   htmlGlobal: string | null,
 *   chunkGlobals: string[],
 *   pages: string[],
 *   checked: number,
 *   urls: string[],
 *   failures: Failure[],
 *   problems: string[]
 * }} ChunkReport
 */

/**
 * @param {string} base  site origin, e.g. https://cook-up.example.workers.dev
 * @param {{ pages?: string[], expectVersion?: string, concurrency?: number }} [options]
 * @returns {Promise<ChunkReport>}
 */
export async function verifyChunks(base, options = {}) {
	const pages = options.pages ?? ['/'];
	const concurrency = options.concurrency ?? 8;
	/** @type {Failure[]} */
	const failures = [];
	/** @type {string[]} */
	const problems = [];
	const htmlGlobals = new Set();
	const chunkGlobals = new Set();
	const seen = new Set();
	/** @type {string[]} */
	let queue = [];

	for (const path of pages) {
		const pageUrl = new URL(path, base).href;
		const res = await get(pageUrl);
		const html = await res.text();
		if (res.status !== 200) failures.push({ url: pageUrl, status: res.status });
		for (const m of html.matchAll(/__sveltekit_([a-z0-9]+)/g)) htmlGlobals.add(m[1]);
		for (const url of pageAssets(html, res.headers.get('link'), pageUrl)) {
			if (!seen.has(url)) {
				seen.add(url);
				queue.push(url);
			}
		}
	}
	if (seen.size === 0) problems.push(`no ${IMMUTABLE} references found in ${pages.join(', ')}`);

	while (queue.length) {
		const batch = queue;
		queue = [];
		for (let i = 0; i < batch.length; i += concurrency) {
			await Promise.all(
				batch.slice(i, i + concurrency).map(async (url) => {
					try {
						const res = await get(url);
						if (res.status !== 200) {
							failures.push({ url, status: res.status });
							await res.body?.cancel();
							return;
						}
						if (!url.endsWith('.js')) {
							await res.body?.cancel();
							return;
						}
						const code = await res.text();
						for (const m of code.matchAll(/__sveltekit_([a-z0-9]+)/g)) chunkGlobals.add(m[1]);
						for (const next of chunkImports(code, url)) {
							if (!seen.has(next)) {
								seen.add(next);
								queue.push(next);
							}
						}
					} catch (err) {
						failures.push({ url, status: err instanceof Error ? err.message : String(err) });
					}
				})
			);
		}
	}

	/** @type {string | null} */
	let version = null;
	const versionUrl = new URL('/_app/version.json', base).href;
	try {
		const res = await get(versionUrl);
		if (res.status === 200) version = /** @type {{ version: string }} */ (await res.json()).version;
		else failures.push({ url: versionUrl, status: res.status });
	} catch (err) {
		failures.push({ url: versionUrl, status: err instanceof Error ? err.message : String(err) });
	}

	const htmlGlobal = htmlGlobals.size === 1 ? [...htmlGlobals][0] : null;
	if (htmlGlobals.size !== 1) {
		problems.push(`expected one __sveltekit_ global in the HTML, found [${[...htmlGlobals].join(', ')}]`);
	}
	if (version !== null && htmlGlobal && kitHash(version) !== htmlGlobal) {
		problems.push(
			`HTML global __sveltekit_${htmlGlobal} is not hash(version.json "${version}") = ${kitHash(version)}: Worker and assets come from different builds`
		);
	}
	for (const g of chunkGlobals) {
		if (htmlGlobal && g !== htmlGlobal) {
			problems.push(`client chunks read __sveltekit_${g} but the HTML defines __sveltekit_${htmlGlobal}`);
		}
	}
	if (options.expectVersion && version !== null && version !== options.expectVersion) {
		problems.push(`live version.json is "${version}", expected "${options.expectVersion}"`);
	}

	return {
		version,
		htmlGlobal,
		chunkGlobals: [...chunkGlobals],
		pages,
		checked: seen.size,
		urls: [...seen],
		failures,
		problems
	};
}

/**
 * The headers a `_headers` file sets for every path (`/*` rules). Detach
 * (`! Name`) lines and other path patterns are ignored.
 * @param {string} text
 * @returns {Map<string, string>} lower-case name -> value
 */
export function globalHeaderRules(text) {
	const rules = new Map();
	let inGlobal = false;
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith('#')) continue;
		if (!/^\s/.test(line)) {
			inGlobal = line.trim() === '/*';
			continue;
		}
		const m = line.trim().match(/^([^!:\s][^:]*):\s*(.*)$/);
		if (inGlobal && m) rules.set(m[1].trim().toLowerCase(), m[2].trim());
	}
	return rules;
}

/**
 * Checks that static files, which the asset layer serves without running
 * hooks.server.ts, carry the `/*` headers from `_headers`.
 * @param {string[]} urls
 * @param {Map<string, string>} rules
 * @returns {Promise<string[]>} problems
 */
export async function checkStaticHeaders(urls, rules) {
	const problems = [];
	for (const url of urls) {
		const res = await get(url);
		await res.body?.cancel();
		if (res.status !== 200) {
			problems.push(`${res.status} ${url}`);
			continue;
		}
		for (const [name, value] of rules) {
			const actual = res.headers.get(name);
			if (actual !== value) problems.push(`${url}: ${name} is ${actual === null ? 'missing' : `"${actual}"`}, expected "${value}"`);
		}
	}
	return problems;
}

/** @param {ChunkReport} report */
export const chunkReportOk = (report) => report.failures.length === 0 && report.problems.length === 0;
