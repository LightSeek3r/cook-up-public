import { expect, test, type Page } from '@playwright/test';

// The "add to home screen" banner (src/components/InstallPrompt.svelte): 5 s on
// the page, Android/Chromium through beforeinstallprompt, iOS Safari by hint.
// The 5 s are real time (a faked clock also freezes the app's own timers), so
// each test pays them once.

const banner = (page: Page) => page.getByRole('complementary', { name: 'Install Cook Up' });

/** Hydrated /?lang=en. */
async function open(page: Page) {
	await page.goto('/?lang=en');
	await expect(page.locator('button[aria-pressed]').filter({ hasText: 'Tomato' }).first()).toBeVisible();
}

const fireInstallOffer = (page: Page) =>
	page.evaluate(() => {
		const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
			prompt: () => Promise<void>;
			userChoice: Promise<{ outcome: string }>;
		};
		offer.prompt = async () => {
			(window as unknown as { __prompted: boolean }).__prompted = true;
		};
		offer.userChoice = Promise.resolve({ outcome: 'accepted' });
		window.dispatchEvent(offer);
	});

test.describe('Chromium (Android, desktop)', () => {
	test('appears after 5 seconds, installs through the browser dialog and does not come back', async ({ page }) => {
		await open(page);
		await fireInstallOffer(page);
		await page.waitForTimeout(3000);
		await expect(banner(page)).toHaveCount(0);

		await expect(banner(page)).toBeVisible({ timeout: 6000 });
		await banner(page).getByRole('button', { name: 'Install' }).click();
		expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
		await expect(banner(page)).toHaveCount(0);
	});

	test('"Not now" hides it and keeps it away on the next visit', async ({ page }) => {
		await open(page);
		await fireInstallOffer(page);
		await expect(banner(page)).toBeVisible({ timeout: 8000 });
		await banner(page).getByRole('button', { name: 'Not now' }).click();
		await expect(banner(page)).toHaveCount(0);

		await open(page);
		await fireInstallOffer(page);
		await page.waitForTimeout(6500);
		await expect(banner(page)).toHaveCount(0);
	});

	test('stays hidden when the browser never offers the install', async ({ page }) => {
		await open(page);
		await page.waitForTimeout(6500);
		await expect(banner(page)).toHaveCount(0);
	});

	test('stays hidden in the installed app', async ({ page }) => {
		await page.addInitScript(() => {
			const real = window.matchMedia.bind(window);
			window.matchMedia = (query: string) =>
				query === '(display-mode: standalone)' ? ({ ...real('all'), matches: true } as MediaQueryList) : real(query);
		});
		await open(page);
		await fireInstallOffer(page);
		await page.waitForTimeout(6500);
		await expect(banner(page)).toHaveCount(0);
	});
});

test.describe('iOS Safari', () => {
	test.use({
		userAgent:
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
		hasTouch: true
	});

	test('shows the Share → Add to Home Screen hint, without an Install button', async ({ page }) => {
		await open(page);
		await expect(banner(page)).toBeVisible({ timeout: 8000 });
		await expect(banner(page)).toContainText('Add to Home Screen');
		await expect(banner(page).getByRole('button', { name: 'Install' })).toHaveCount(0);
	});
});
