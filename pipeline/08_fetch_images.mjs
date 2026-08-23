/**
 * Stage 08 — resolve each recipe's lead image filename to a URL plus the
 * attribution its licence requires.
 *
 * Input:  pipeline/out/recipes.jsonl (`image_files`, from stage 02)
 * Output: pipeline/out/recipe_images.jsonl
 * Cache:  pipeline/data/commons_images.json (keyed by filename; delete to refetch)
 *
 * Why a network stage at all, when everything else in this pipeline is offline:
 * three of the four things needed per image cannot be derived from a filename.
 *
 *  - The thumbnail URL cannot be constructed reliably. The full-size path is a
 *    deterministic MD5 of the filename, but hand-built `/thumb/.../640px-` paths
 *    404 unpredictably (verified: 640px on one file returned 400 while 500px on
 *    the same file returned 200). MediaWiki has to be asked which thumb exists.
 *  - The **author** and **licence** are mandatory. These files are Wikimedia
 *    Commons uploads under CC BY / CC BY-SA / CC0 / PD — all free, none non-free
 *    (sampled and confirmed), but the share-alike ones require per-image credit.
 *    The page footer's CC-BY-SA-3.0 line covers the Wikibooks *text*; a photo has
 *    its own author and often a different licence.
 *
 * One batched `imageinfo` call per 50 titles gets URL, author and licence
 * together, so the whole corpus costs ~17 requests. Results are cached on disk so
 * re-running the pipeline is free and offline.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('pipeline/out');
const CACHE = path.resolve('pipeline/data/commons_images.json');
const API = 'https://en.wikibooks.org/w/api.php';
const BATCH = 50;
// Wikimedia asks for a descriptive agent on API access. ASCII only: a header
// value is a ByteString, and an em dash here threw
// "Cannot convert argument to a ByteString" on every request.
const USER_AGENT = 'cook-up/0.0.1 (offline recipe data pipeline; contact via repo)';
/** Requested thumbnail width. MediaWiki returns the nearest it can actually make. */
const THUMB_WIDTH = 640;

/** Strips the campaign params the API appends to thumbnail URLs. */
const cleanUrl = (url) => (url ? url.split('?')[0] : null);

/** extmetadata values are HTML fragments ("<a href=...>Name</a>"). */
const plainText = (html) =>
	html
		? html
				.replace(/<[^>]+>/g, '')
				.replace(/\s+/g, ' ')
				.trim()
		: null;

async function fetchBatch(titles) {
	const params = new URLSearchParams({
		action: 'query',
		format: 'json',
		formatversion: '2',
		prop: 'imageinfo',
		iiprop: 'url|extmetadata',
		iiurlwidth: String(THUMB_WIDTH),
		titles: titles.map((t) => `File:${t}`).join('|')
	});
	const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
	if (!res.ok) throw new Error(`imageinfo HTTP ${res.status}`);
	const body = await res.json();
	const out = new Map();
	for (const page of body.query?.pages ?? []) {
		const info = page.imageinfo?.[0];
		if (!info) continue; // deleted, or local-to-Wikibooks with no imageinfo
		const meta = info.extmetadata ?? {};
		const name = page.title.replace(/^File:/, '');
		out.set(name, {
			url: cleanUrl(info.thumburl) ?? cleanUrl(info.url),
			width: info.thumbwidth ?? null,
			height: info.thumbheight ?? null,
			page: info.descriptionurl ?? null,
			author: plainText(meta.Artist?.value),
			licence: meta.LicenseShortName?.value ?? null
		});
	}
	return out;
}

async function main() {
	const recipes = (await readFile(path.join(OUT_DIR, 'recipes.jsonl'), 'utf8'))
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	let cache = {};
	try {
		cache = JSON.parse(await readFile(CACHE, 'utf8'));
	} catch {
		/* first run */
	}

	// Only the FIRST file per recipe. The lead image is the one the page presents;
	// a gallery would need its own UI and licence list for marginal gain.
	const wanted = [...new Set(recipes.map((r) => r.image_files?.[0]).filter(Boolean))];
	const missing = wanted.filter((name) => !(name in cache));
	console.log(
		`08_fetch_images: ${wanted.length} lead images across ${recipes.filter((r) => r.image_files?.length).length} recipes; ${wanted.length - missing.length} cached, ${missing.length} to fetch`
	);

	for (let i = 0; i < missing.length; i += BATCH) {
		const slice = missing.slice(i, i + BATCH);
		try {
			const got = await fetchBatch(slice);
			// Cache a null for anything the API had nothing for, so it isn't retried
			// on every run — an absent file is a fact, not a transient failure.
			for (const name of slice) cache[name] = got.get(name) ?? null;
		} catch (err) {
			console.warn(`08_fetch_images: batch at ${i} failed (${err.message}) — leaving uncached, rerun to retry`);
		}
		process.stdout.write(`\r  fetched ${Math.min(i + BATCH, missing.length)}/${missing.length}`);
	}
	if (missing.length) process.stdout.write('\n');

	await mkdir(path.dirname(CACHE), { recursive: true });
	await writeFile(CACHE, JSON.stringify(cache, null, 1));

	// A row is only emitted when the licence AND a URL are both known: without the
	// licence there is no lawful way to display it, so a missing one means no image
	// rather than an unattributed one.
	const rows = [];
	let noLicence = 0;
	for (const r of recipes) {
		const name = r.image_files?.[0];
		if (!name) continue;
		const info = cache[name];
		if (!info?.url) continue;
		if (!info.licence) {
			noLicence++;
			continue;
		}
		rows.push(
			JSON.stringify({
				recipe_id: r.id,
				url: info.url,
				width: info.width,
				height: info.height,
				page: info.page,
				author: info.author,
				licence: info.licence
			})
		);
	}
	await writeFile(path.join(OUT_DIR, 'recipe_images.jsonl'), rows.join('\n') + '\n');

	const licences = {};
	for (const row of rows) {
		const l = JSON.parse(row).licence;
		licences[l] = (licences[l] ?? 0) + 1;
	}
	console.log(`08_fetch_images: wrote ${rows.length} recipe images (${noLicence} skipped for having no stated licence)`);
	console.log('08_fetch_images: licences', licences);
}

await main();
