import { defineConfig, devices } from '@playwright/test';

// Smoke suite against the real Worker bundle (`wrangler dev --local`) on a
// fixture D1, so it covers what unit tests cannot: hydration, CSP hashes, the
// chunk graph and RTL. Run `npm run build:checked` first; `npm run test:e2e`
// then starts and stops the server itself.
const PORT = Number(process.env.E2E_PORT ?? 8799);

export default defineConfig({
	testDir: 'tests/e2e',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `node scripts/e2e-server.mjs ${PORT}`,
		url: `http://127.0.0.1:${PORT}/_app/version.json`,
		timeout: 180_000,
		// Never attach to a server already on the port: it may be serving real
		// data, and every assertion here assumes the fixture.
		reuseExistingServer: false,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
