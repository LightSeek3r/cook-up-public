import { expect, test as base, type ConsoleMessage } from '@playwright/test';
import { chunkReportOk, pageAssets, verifyChunks } from '../../scripts/lib/chunks.mjs';

// Data comes from tests/e2e/fixtures/seed.sql; glossary content is bundled.

type Fixtures = { allowedConsole: RegExp[]; browserErrors: string[] };

// Every test fails on an uncaught page error or a console error. That is what
// catches a broken hydration, a CSP hash mismatch ("Refused to execute inline
// script") or a 404ing chunk, none of which change what the SSR HTML shows.
const test = base.extend<Fixtures>({
	allowedConsole: [[], { option: true }],
	browserErrors: [
		async ({ page, allowedConsole }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
			page.on('console', (m: ConsoleMessage) => {
				if (m.type() !== 'error') return;
				const text = `${m.text()} ${m.location().url}`;
				if (!allowedConsole.some((re) => re.test(text))) errors.push(`console.error: ${text}`);
			});
			await use(errors);
			expect(errors, 'browser errors during the test').toEqual([]);
		},
		{ auto: true }
	]
});

const tile = (page: import('@playwright/test').Page, name: string) =>
	page.locator('button[aria-pressed]').filter({ hasText: name }).first();

test('home hydrates and the mosaic loads', async ({ page }) => {
	const ingredients = page.waitForResponse((r) => r.url().includes('/api/ingredients'));
	await page.goto('/?lang=en');
	expect((await ingredients).status()).toBe(200);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
	await expect(tile(page, 'Tomato')).toBeVisible();
	await expect(tile(page, 'Tomato')).toHaveAttribute('aria-pressed', 'false');
	// Staples never get a tile.
	await expect(page.locator('button[aria-pressed]').filter({ hasText: /^\s*Salt\s*$/ })).toHaveCount(0);
});

test('selecting an ingredient shows matching recipes', async ({ page }) => {
	await page.goto('/?lang=en');
	// Matched in the browser or by /api/match, whichever is ready (see below).
	await tile(page, 'Tomato').click();
	await expect(tile(page, 'Tomato')).toHaveAttribute('aria-pressed', 'true');
	await expect(page).toHaveURL(/[?&]have=tomato\b/);
	const results = page.locator('#results');
	await expect(results.getByRole('link', { name: /Tomato and onion stew/ })).toBeVisible();
	await expect(results.getByRole('link', { name: /Garlic tomato rice/ })).toBeVisible();

	await results.getByRole('link', { name: /Tomato and onion stew/ }).click();
	await expect(page).toHaveURL(/\/recipe\/1\b/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tomato and onion stew');
});

test('recipe page renders ingredients, steps and related recipes', async ({ page }) => {
	const res = await page.goto('/recipe/1?lang=en');
	expect(res?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tomato and onion stew');
	await expect(page.getByText('Onion', { exact: false }).first()).toBeVisible();
	await expect(page.getByText('Simmer for 20 minutes')).toBeVisible();
	await expect(page.getByRole('link', { name: /Garlic tomato rice/ })).toBeVisible();
});

test('recipe page serves the stored translation', async ({ page }) => {
	await page.goto('/recipe/1?lang=fr');
	await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("Ragoût de tomates et d'oignons");
	await expect(page.getByText('Laisser mijoter 20 minutes')).toBeVisible();
});

test('glossary list links to a term page', async ({ page }) => {
	await page.goto('/glossary?lang=en');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const terms = page.locator('a[href^="/glossary/"]');
	expect(await terms.count()).toBeGreaterThan(100);
	await page.locator('a[href^="/glossary/sous-vide"]').first().click();
	await expect(page).toHaveURL(/\/glossary\/sous-vide\b/);
	await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
});

test('glossary term renders right-to-left in Arabic', async ({ page }) => {
	const res = await page.goto('/glossary/braise?lang=ar');
	expect(res?.status()).toBe(200);
	await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
	await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/[\u0600-\u06FF]/);
});

test.describe('not found', () => {
	// The browser itself logs the document's 404 as a console error.
	test.use({ allowedConsole: [/status of 404/] });

	for (const path of ['/recipe/999999?lang=en', '/glossary/no-such-term?lang=en', '/no-such-page', '/seasonal/13?lang=en']) {
		test(`${path} answers 404 with the error page`, async ({ page }) => {
			const res = await page.goto(path);
			expect(res?.status()).toBe(404);
			await expect(page.getByText('404').first()).toBeVisible();
			await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
		});
	}
});

test('static files carry the security headers from _headers', async ({ request, baseURL }) => {
	const home = await request.get('/');
	const chunk = [...pageAssets(await home.text(), home.headers()['link'] ?? null, baseURL!)].find((u) =>
		u.endsWith('.js')
	);
	expect(chunk).toBeTruthy();
	for (const url of ['/favicon.svg', chunk!]) {
		const res = await request.get(url);
		expect(res.status(), url).toBe(200);
		expect(res.headers()['x-content-type-options'], url).toBe('nosniff');
	}
});

test('every referenced /_app/immutable file is served from one build', async ({ baseURL }) => {
	const report = await verifyChunks(baseURL!, { pages: ['/', '/glossary', '/recipe/1', '/seasonal/4'] });
	expect(report.failures).toEqual([]);
	expect(report.problems).toEqual([]);
	expect(report.checked).toBeGreaterThan(10);
	expect(chunkReportOk(report)).toBe(true);
});

test.describe('matching in the browser', () => {
	const DATA = ['/data/core.bin', '/data/names/en.json', '/data/titles/en.json'];
	type Page = import('@playwright/test').Page;

	/** Ids of the result cards, in the order shown. */
	const shownIds = (page: Page) =>
		page.locator('#results a.card-link').evaluateAll((links) =>
			links.map((a) => Number(new URL((a as HTMLAnchorElement).href).pathname.split('/').pop()))
		);

	async function serverIds(request: import('@playwright/test').APIRequestContext, query: string) {
		const res = await request.get(`/api/match?${query}`);
		expect(res.status()).toBe(200);
		return ((await res.json()) as { results: { id: number }[] }).results.map((r) => r.id);
	}

	/** /api/match requests the page makes from now on. */
	function matchRequests(page: Page) {
		const urls: string[] = [];
		page.on('request', (r) => {
			if (new URL(r.url()).pathname === '/api/match') urls.push(r.url());
		});
		return urls;
	}

	test('once the artefacts are in, taps match locally with the same results as /api/match', async ({ page, request }) => {
		const loaded = Promise.all(
			DATA.map((path) => page.waitForResponse((r) => new URL(r.url()).pathname === path))
		);
		await page.goto('/?lang=en');
		for (const res of await loaded) {
			expect(res.status(), res.url()).toBe(200);
			expect(new URL(res.url()).searchParams.get('v'), res.url()).toMatch(/^[0-9a-f]{16}$/);
			expect(res.headers()['cache-control'], res.url()).toBe('public, max-age=31536000, immutable');
			await res.finished();
		}
		const asked = matchRequests(page);

		await tile(page, 'Tomato').click();
		await expect(page.locator('#results')).toHaveAttribute('data-source', 'local');
		await expect(page.locator('#results a.card-link').first()).toBeVisible();
		expect(await shownIds(page)).toEqual(await serverIds(request, 'have=tomato&lang=en'));

		await tile(page, 'Onion').click();
		await expect(page).toHaveURL(/[?&]have=tomato(%2C|,)onion\b/);
		await expect(page.locator('#results a.card-link').first()).toBeVisible();
		expect(await shownIds(page)).toEqual(await serverIds(request, 'have=onion,tomato&lang=en'));
		expect(asked).toEqual([]);
	});

	test.describe('falls back to /api/match', () => {
		// The browser logs the aborted artefact downloads.
		test.use({ allowedConsole: [/ERR_FAILED/] });

		test('while the artefacts cannot be downloaded', async ({ page, request }) => {
			await page.route('**/data/**', (route) => route.abort());
			await page.goto('/?lang=en');
			const match = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/match');
			await tile(page, 'Tomato').click();
			expect((await match).status()).toBe(200);
			await expect(page.locator('#results')).toHaveAttribute('data-source', 'server');
			expect(await shownIds(page)).toEqual(await serverIds(request, 'have=tomato&lang=en'));
		});
	});

	test('when the artefacts are another data version (a tab older than the deploy)', async ({ page, request }) => {
		const stale: string[] = [];
		await page.route('**/data/titles/en.json*', (route, req) => {
			stale.push(req.url());
			return route.fulfill({ json: { version: '0000000000000000', lang: 'en', ids: [], titles: [] } });
		});
		await page.goto('/?lang=en');
		// The first copy and the past-the-cache retry.
		await expect.poll(() => stale.length).toBe(2);
		const match = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/match');
		await tile(page, 'Tomato').click();
		expect((await match).status()).toBe(200);
		await expect(page.locator('#results')).toHaveAttribute('data-source', 'server');
		expect(await shownIds(page)).toEqual(await serverIds(request, 'have=tomato&lang=en'));
	});
});

test.describe('seasons', () => {
	// Mid-April: in tests/e2e/fixtures/seasons tomato is in season in Madrid
	// (med:n) and in Sydney (subtrop:s, rotated), onion only in Sydney; garlic,
	// egg and rice are all year.
	const APRIL = new Date('2026-04-15T10:00:00Z');
	type Page = import('@playwright/test').Page;

	const shelf = (page: Page) => page.getByRole('region', { name: 'In season now' });
	const shownIds = (page: Page) =>
		page.locator('#results a.card-link').evaluateAll((links) =>
			links.map((a) => Number(new URL((a as HTMLAnchorElement).href).pathname.split('/').pop()))
		);

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(APRIL);
	});

	test.describe('in Madrid', () => {
		test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });

		test('the home shelf lists what is in season in the detected climate', async ({ page }) => {
			await page.goto('/?lang=en');
			await expect(shelf(page)).toBeVisible();
			await expect(shelf(page).getByText('Your climate: Mediterranean')).toBeVisible();
			await expect(shelf(page).getByText('detected from Europe/Madrid')).toBeVisible();
			await expect(shelf(page).getByRole('button', { name: /Tomato/ })).toBeVisible();
			await expect(shelf(page).getByRole('button', { name: /Onion/ })).toHaveCount(0);
			// One tap adds it to the selection, like the board's tile.
			await shelf(page).getByRole('button', { name: /Tomato/ }).click();
			await expect(page).toHaveURL(/[?&]have=tomato\b/);
			await expect(tile(page, 'Tomato')).toHaveAttribute('aria-pressed', 'true');
			// The shelf's own Tomato button is pressed too, so pick the board tile by its badge.
			await expect(
				page
					.locator('button[aria-pressed]')
					.filter({ hasText: 'Tomato' })
					.filter({ has: page.getByRole('img', { name: /In season/ }) })
			).toBeVisible();
		});

		test.describe('seasonal ranking', () => {
			// core.bin refused, so every match is a visible /api/match request.
			test.use({ allowedConsole: [/ERR_FAILED/] });

			test('puts recipes needing out-of-season food last and sends the season', async ({ page, request }) => {
				await page.route('**/data/core.bin*', (route) => route.abort());
				await page.goto('/?lang=en&have=rice');
				const plain = (await (await request.get('/api/match?have=rice&lang=en')).json()).results.map((r: { id: number }) => r.id);
				await expect.poll(() => shownIds(page)).toEqual(plain);

				const seasonal = page.waitForRequest(
					(r) => new URL(r.url()).pathname === '/api/match' && new URL(r.url()).searchParams.get('season') === 'med.n.4'
				);
				await page.getByText('Quick filters').click();
				await page.getByRole('radiogroup', { name: 'Seasonal ranking' }).getByRole('radio', { name: 'My climate' }).check();
				await seasonal;
				const ranked = (await (await request.get('/api/match?have=rice&lang=en&season=med.n.4')).json()).results.map(
					(r: { id: number }) => r.id
				);
				// Egg fried rice still needs an onion, out of season in April here.
				expect(ranked).not.toEqual(plain);
				expect(ranked.indexOf(2)).toBeLessThan(ranked.indexOf(3));
				await expect.poll(() => shownIds(page)).toEqual(ranked);

				// A stored preference: it survives a reload.
				await page.reload();
				// The stored preference is no URL filter, so the panel comes back closed.
				await page.getByText('Quick filters').click();
				await expect(page.getByRole('radiogroup', { name: 'Seasonal ranking' }).getByRole('radio', { name: 'My climate' })).toBeChecked();
			});
		});

		test('the recipe page counts its fresh items in season', async ({ page }) => {
			await page.goto('/recipe/1?lang=en');
			await expect(page.getByText('1 of 2 fresh items in season')).toBeVisible();
			await expect(page.getByRole('img', { name: /^Out of season/ })).toHaveCount(1);
		});

		test('/seasonal/4 renders April, server side and hydrated', async ({ page, request }) => {
			const html = await (await request.get('/seasonal/4?lang=en')).text();
			expect(html).toContain('In season in April');
			expect(html).toContain('Tomato');
			const res = await page.goto('/seasonal/4?lang=en');
			expect(res?.status()).toBe(200);
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('In season in April');
			await expect(page.getByRole('link', { name: /Add Tomato to your ingredients/ })).toBeVisible();
			await expect(page.getByRole('navigation', { name: 'Months' }).getByRole('link', { name: /April/ })).toHaveAttribute(
				'aria-current',
				'page'
			);
		});

		test('/seasonal goes on to the reader\'s month', async ({ page }) => {
			await page.goto('/seasonal?lang=en');
			await expect(page).toHaveURL(/\/seasonal\/4\?lang=en$/);
		});
	});

	test.describe('in Sydney', () => {
		test.use({ timezoneId: 'Australia/Sydney', locale: 'en-AU' });

		test('the shelf follows the southern calendar', async ({ page }) => {
			await page.goto('/?lang=en');
			await expect(shelf(page).getByText('Your climate: Humid subtropical · Southern')).toBeVisible();
			await expect(shelf(page).getByRole('button', { name: /Onion/ })).toBeVisible();
			await expect(shelf(page).getByRole('button', { name: /Tomato/ })).toBeVisible();
		});

		test('the climate picker overrides the detection and persists', async ({ page }) => {
			await page.goto('/?lang=en');
			await shelf(page).getByRole('button', { name: /Your climate/ }).click();
			const dialog = page.getByRole('dialog', { name: 'Your climate' });
			await expect(dialog).toBeVisible();
			await dialog.getByRole('radio', { name: /^Mediterranean/ }).check();
			await dialog.getByRole('radio', { name: 'Northern', exact: true }).check();
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			await expect(shelf(page).getByText('Your climate: Mediterranean', { exact: true })).toBeVisible();
			await expect(shelf(page).getByRole('button', { name: /Onion/ })).toHaveCount(0);
			await page.reload();
			await expect(shelf(page).getByText('Your climate: Mediterranean', { exact: true })).toBeVisible();
		});
	});
});