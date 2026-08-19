/**
 * Stage 01 — fetch raw sources into pipeline/data/ (git-ignored).
 *
 * Sources, phase 2 scope (commercial-safe, decision ADR-A1):
 *  - Wikibooks Cookbook, Category:Recipes            CC BY-SA 3.0
 *  - Open Food Facts ingredient taxonomy             ODbL
 *
 * Gutenberg (PD) and USDA FDC are deliberately out of scope here: Wikibooks'
 * Category:Recipes alone is ~3,824 pages (already "low-thousands"), with
 * consistent template/heading structure Gutenberg's prose doesn't have; FDC
 * belongs with phase 3 (stage 04 consumes it, not stage 03). See
 * tasks/todo.md's phase-2 review note for the full reasoning.
 *
 * Resumable: a page already saved on disk is not re-fetched, so repeated dev
 * runs are cheap. Output:
 *   pipeline/data/wikibooks/<pageid>.json  { pageid, title, wikitext, revision_timestamp, url }
 *   pipeline/data/manifest.json            retrieval date, source URLs, licenses
 *   pipeline/data/off-ingredients.txt      raw OFF taxonomy (parsed by pipeline/lib/taxonomy.mjs)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('pipeline/data');
const WIKIBOOKS_DIR = path.join(DATA_DIR, 'wikibooks');
const API = 'https://en.wikibooks.org/w/api.php';
const USER_AGENT = 'cook-up-pipeline/0.1 (https://github.com/; phase-2 recipe ingest; contact via repo issues)';

// Override with `node pipeline/01_fetch.mjs --limit=50` for a dry run.
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;

async function apiGet(params) {
	const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
	const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!res.ok) throw new Error(`Wikibooks API ${res.status} for ${url}`);
	return res.json();
}

async function listCategoryPages(category, limit) {
	const titles = [];
	let cmcontinue;
	do {
		const data = await apiGet({
			action: 'query',
			list: 'categorymembers',
			cmtitle: `Category:${category}`,
			cmtype: 'page',
			cmlimit: Math.min(500, limit - titles.length),
			...(cmcontinue ? { cmcontinue } : {})
		});
		titles.push(...data.query.categorymembers.map((m) => ({ pageid: m.pageid, title: m.title })));
		cmcontinue = data.continue?.cmcontinue;
	} while (cmcontinue && titles.length < limit);
	return titles.slice(0, limit);
}

async function fetchWikitextBatch(pages) {
	const data = await apiGet({
		action: 'query',
		prop: 'revisions',
		rvprop: 'content|timestamp',
		rvslots: 'main',
		pageids: pages.map((p) => p.pageid).join('|')
	});
	const out = [];
	for (const page of Object.values(data.query.pages ?? {})) {
		const rev = page.revisions?.[0];
		const wikitext = rev?.slots?.main?.['*'];
		if (!wikitext) continue;
		out.push({
			pageid: page.pageid,
			title: page.title,
			wikitext,
			revision_timestamp: rev.timestamp,
			url: `https://en.wikibooks.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
		});
	}
	return out;
}

async function fetchWikibooksCategory(category, limit) {
	await mkdir(WIKIBOOKS_DIR, { recursive: true });
	const allTitles = await listCategoryPages(category, limit);
	console.log(`01_fetch: ${allTitles.length} pages in Category:${category}`);

	const toFetch = allTitles.filter((p) => !existsSync(path.join(WIKIBOOKS_DIR, `${p.pageid}.json`)));
	console.log(`01_fetch: ${allTitles.length - toFetch.length} already cached, fetching ${toFetch.length}`);

	const BATCH = 50;
	let fetched = 0;
	for (let i = 0; i < toFetch.length; i += BATCH) {
		const batch = toFetch.slice(i, i + BATCH);
		const pages = await fetchWikitextBatch(batch);
		await Promise.all(
			pages.map((p) => writeFile(path.join(WIKIBOOKS_DIR, `${p.pageid}.json`), JSON.stringify(p)))
		);
		fetched += pages.length;
		if (i + BATCH < toFetch.length) await new Promise((r) => setTimeout(r, 200));
	}
	console.log(`01_fetch: wrote ${fetched} pages to ${WIKIBOOKS_DIR}`);
	return allTitles.length;
}

async function fetchOffTaxonomy() {
	const dest = path.join(DATA_DIR, 'off-ingredients.txt');
	if (existsSync(dest)) {
		console.log('01_fetch: off-ingredients.txt already cached, skipping');
		return;
	}
	const url =
		'https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/food/ingredients.txt';
	const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!res.ok) throw new Error(`OFF taxonomy fetch failed: ${res.status}`);
	await writeFile(dest, await res.text());
	console.log('01_fetch: wrote off-ingredients.txt');
}

async function writeManifest(pageCount) {
	const manifestPath = path.join(DATA_DIR, 'manifest.json');
	const existing = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
	const manifest = {
		...existing,
		wikibooks: {
			source: 'https://en.wikibooks.org/wiki/Category:Recipes',
			license: 'CC-BY-SA-3.0',
			retrieved_at: new Date().toISOString(),
			page_count: pageCount
		},
		off_taxonomy: {
			source:
				'https://github.com/openfoodfacts/openfoodfacts-server/blob/main/taxonomies/food/ingredients.txt',
			license: 'ODbL',
			retrieved_at: new Date().toISOString()
		}
	};
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

const pageCount = await fetchWikibooksCategory('Recipes', LIMIT);
await fetchOffTaxonomy();
await writeManifest(pageCount);
console.log('01_fetch: done');
