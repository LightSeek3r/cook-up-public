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
	const match = page.waitForResponse((r) => r.url().includes('/api/match'));
	await tile(page, 'Tomato').click();
	expect((await match).status()).toBe(200);
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

	for (const path of ['/recipe/999999?lang=en', '/glossary/no-such-term?lang=en', '/no-such-page']) {
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
	const report = await verifyChunks(baseURL!, { pages: ['/', '/glossary', '/recipe/1'] });
	expect(report.failures).toEqual([]);
	expect(report.problems).toEqual([]);
	expect(report.checked).toBeGreaterThan(10);
	expect(chunkReportOk(report)).toBe(true);
});
