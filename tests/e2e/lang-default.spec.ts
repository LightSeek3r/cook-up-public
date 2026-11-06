import { expect, test } from '@playwright/test';

// static/lang-init.js in a real browser: a page opened without ?lang= follows
// the visitor, and the redirect happens before hydration.

test.describe('browser in French', () => {
	test.use({ locale: 'fr-FR' });

	test('opens / in French, keeping the rest of the URL', async ({ page }) => {
		await page.goto('/recipe/1');
		await expect(page).toHaveURL(/\/recipe\/1\?lang=fr$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
	});

	test('an explicit ?lang= is not overridden', async ({ page }) => {
		await page.goto('/?lang=en');
		await expect(page).toHaveURL(/\?lang=en$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('the language picked in the selector is the next default, English included', async ({ page }) => {
		await page.goto('/?lang=fr');
		await page.getByRole('combobox').first().selectOption('en');
		await expect(page).toHaveURL(/\?lang=en$/);
		await page.goto('/');
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});
});

test.describe('browser in English', () => {
	test.use({ locale: 'en-US' });

	test('stays on / without a redirect', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});
});
