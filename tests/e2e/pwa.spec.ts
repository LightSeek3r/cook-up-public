import { expect, test } from '@playwright/test';

// The service worker (src/service-worker.ts) against the real Worker bundle:
// installed, then answering with the network gone.

test('manifest and service worker make the app installable', async ({ page, request }) => {
	const manifest = await request.get('/manifest.webmanifest');
	expect(manifest.headers()['content-type']).toContain('application/manifest+json');
	for (const icon of (await manifest.json()).icons) {
		expect((await request.get(icon.src)).status(), icon.src).toBe(200);
	}
	// The URL the worker precaches and falls back to must itself answer 200, not
	// redirect: cache.addAll would fail the install on a 404, and a redirected
	// response cannot answer a navigation. static/offline.html is served there.
	const offline = await request.get('/offline', { maxRedirects: 0 });
	expect(offline.status()).toBe(200);
	expect(await offline.text()).toContain('You are offline');
	const worker = await request.get('/service-worker.js');
	expect(worker.status()).toBe(200);
	expect(worker.headers()['content-type']).toContain('javascript');

	await page.goto('/?lang=en');
	const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
	expect(scope).toBe(new URL('/', page.url()).href);
});

test('a page already visited opens offline, an unseen one gets the offline page', async ({ page, context }) => {
	await page.goto('/recipe/1?lang=en');
	await page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		// First visit: the worker only controls pages loaded after it activated.
		if (!navigator.serviceWorker.controller && registration.active) location.reload();
	});
	await page.waitForFunction(() => !!navigator.serviceWorker.controller);
	await page.reload();
	const title = await page.title();

	await context.setOffline(true);
	await page.reload();
	await expect(page).toHaveTitle(title);

	await page.goto('/glossary?lang=en');
	await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
	await context.setOffline(false);
});
