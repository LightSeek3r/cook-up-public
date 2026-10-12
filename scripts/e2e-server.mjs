#!/usr/bin/env node
// Usage: node scripts/e2e-server.mjs [port]   (started by playwright.config.ts)
//
// Serves the current build with `wrangler dev --local` on a throwaway D1 in
// .wrangler/e2e-state: recreated from scratch, all migrations applied, then
// tests/e2e/fixtures/seed.sql. The developer's own local D1 (.wrangler/state)
// is never touched. Needs a prior `npm run build:checked`.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const PERSIST = '.wrangler/e2e-state';
const DB = 'cook-up-db';
const port = process.argv[2] ?? '8799';
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };

if (!existsSync('.svelte-kit/cloudflare/_worker.js')) {
	console.error('no build found: run `npm run build:checked` first');
	process.exit(1);
}

/** @param {string[]} args */
function wrangler(args) {
	const run = spawnSync(process.execPath, [WRANGLER, ...args], { stdio: ['ignore', 'inherit', 'inherit'], env });
	if (run.status !== 0) {
		console.error(`wrangler ${args.join(' ')} failed`);
		process.exit(1);
	}
}

rmSync(PERSIST, { recursive: true, force: true });
// stdin closed, so wrangler treats the "apply?" prompt as non-interactive and proceeds.
wrangler(['d1', 'migrations', 'apply', DB, '--local', '--persist-to', PERSIST]);
wrangler(['d1', 'execute', DB, '--local', '--persist-to', PERSIST, '--file', 'tests/e2e/fixtures/seed.sql']);

const dev = spawn(
	process.execPath,
	[WRANGLER, 'dev', '--local', '--persist-to', PERSIST, '--ip', '127.0.0.1', '--port', port, '--show-interactive-dev-session=false'],
	{ stdio: ['ignore', 'inherit', 'inherit'], env }
);
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
	process.on(signal, () => dev.kill(signal));
}
dev.on('exit', (code) => process.exit(code ?? 0));
