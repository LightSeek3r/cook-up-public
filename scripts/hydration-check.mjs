#!/usr/bin/env node
// Usage: node scripts/hydration-check.mjs <base-url>
//
// Loads the home page in headless Chromium and requires that the app really
// hydrated: no page errors, no failed same-origin requests, /api/ingredients
// answered 200 and the mosaic rendered interactive tiles. Curling HTML cannot
// prove this, because chunks load from JavaScript.
//
// /api/track is aborted in the browser so a check against production never
// writes a page_view row. Needs `npx playwright install chromium` once.
import { pathToFileURL } from 'node:url';

/**
 * @param {string} base
 * @param {{ log?: (line: string) => void, timeoutMs?: number }} [opts]
 */
export async function hydrationCheck(base, opts = {}) {
	const log = opts.log ?? console.log;
	const { chromium } = await import('@playwright/test');
	const origin = new URL(base).origin;
	const browser = await chromium.launch();
	/** @type {string[]} */
	const errors = [];
	try {
		const page = await browser.newPage({ viewport: { width: 412, height: 823 } });
		await page.route('**/api/track**', (route) => route.abort());
		page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
		page.on('console', (m) => {
			// The aborted /api/track request logs a bare "net::ERR_FAILED"; only its
			// location names the URL.
			if (m.type() !== 'error' || /\/api\/track/.test(`${m.text()} ${m.location().url}`)) return;
			errors.push(`console.error: ${m.text().slice(0, 200)} ${m.location().url}`);
		});
		page.on('response', (r) => {
			if (r.status() >= 400 && r.url().startsWith(origin)) errors.push(`${r.status()} ${r.url()}`);
		});
		const ingredients = page.waitForResponse((r) => r.url().includes('/api/ingredients'), {
			timeout: opts.timeoutMs ?? 20_000
		});
		await page.goto(new URL('/?lang=en', base).href, { waitUntil: 'load' });
		const res = await ingredients.catch(() => null);
		if (!res) errors.push('/api/ingredients was never requested: the app did not hydrate');
		else if (res.status() !== 200) errors.push(`/api/ingredients answered ${res.status()}`);
		const tiles = await page
			.locator('button[aria-pressed]')
			.first()
			.waitFor({ timeout: 10_000 })
			.then(() => page.locator('button[aria-pressed]').count())
			.catch(() => 0);
		if (tiles === 0) errors.push('no interactive mosaic tiles rendered');
		log(`hydration: ${tiles} tiles, ${errors.length} problem(s)`);
	} finally {
		await browser.close();
	}
	for (const e of errors) log(`  HYDRATION PROBLEM ${e}`);
	log(errors.length ? 'HYDRATION FAILED' : 'HYDRATION OK');
	return { ok: errors.length === 0, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const base = process.argv[2];
	if (!base) {
		console.error('usage: node scripts/hydration-check.mjs <base-url>');
		process.exit(2);
	}
	const { ok } = await hydrationCheck(base);
	process.exit(ok ? 0 : 1);
}
