#!/usr/bin/env node
// Usage: node scripts/e2e-server.mjs [port]   (started by playwright.config.ts)
//
// Serves the current build with `wrangler dev --local` on a throwaway D1 in
// .wrangler/e2e-state: recreated from scratch, all migrations applied, then
// tests/e2e/fixtures/seed.sql. The developer's own local D1 (.wrangler/state)
// is never touched. Needs a prior `npm run build:checked`.
//
// The pages and public APIs read the data artefacts from the static assets,
// not D1 (only /api/track and /admin use it), so the build's assets are
// served from a copy in .wrangler/e2e-assets whose data/ is built from the
// same seed. The build output itself is never modified.
//
// The browser only matches with artefacts of the data version its bundle was
// built against (lock.json), so the seed's files are stamped with that
// version: their own, a hash of different content, would send every match to
// /api/match and leave the browser path untested.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { buildArtefacts, fixtureDb } from '../pipeline/lib/artefacts.mjs';
import { readLock, writeTree } from './lib/datapack.mjs';

const PERSIST = '.wrangler/e2e-state';
const BUILD = '.svelte-kit/cloudflare';
const ASSETS = '.wrangler/e2e-assets';
const SEED = 'tests/e2e/fixtures/seed.sql';
const DB = 'cook-up-db';
const port = process.argv[2] ?? '8799';
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };

if (!existsSync(path.join(BUILD, '_worker.js'))) {
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
wrangler(['d1', 'execute', DB, '--local', '--persist-to', PERSIST, '--file', SEED]);

rmSync(ASSETS, { recursive: true, force: true });
const buildData = path.resolve(BUILD, 'data');
cpSync(BUILD, ASSETS, { recursive: true, filter: (src) => path.resolve(src) !== buildData });
const seed = buildArtefacts(fixtureDb(readFileSync(SEED, 'utf8')));
writeTree(path.join(ASSETS, 'data'), stamped(seed.files, seed.version, readLock().version));

/**
 * Every file with `"version":"<from>"` (core.bin's header and the JSON
 * files) rewritten to `to`, a same-length hash, so core.bin's layout holds.
 * manifest.json (pretty-printed, so not matched) keeps the seed's version
 * and sha256 list; nothing at runtime reads it.
 * @param {Map<string, Buffer>} files
 * @param {string} from
 * @param {string} to
 */
function stamped(files, from, to) {
	if (from.length !== to.length) throw new Error(`data versions ${from} and ${to} differ in length`);
	const needle = Buffer.from(`"version":"${from}"`);
	const replacement = Buffer.from(`"version":"${to}"`);
	const out = new Map();
	for (const [name, body] of files) {
		const copy = Buffer.from(body);
		for (let at = copy.indexOf(needle); at >= 0; at = copy.indexOf(needle, at + needle.length)) replacement.copy(copy, at);
		out.set(name, copy);
	}
	return out;
}

const dev = spawn(
	process.execPath,
	[
		WRANGLER, 'dev', '--local', '--persist-to', PERSIST, '--assets', ASSETS,
		'--ip', '127.0.0.1', '--port', port, '--show-interactive-dev-session=false'
	],
	{ stdio: ['ignore', 'inherit', 'inherit'], env }
);
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
	process.on(signal, () => dev.kill(signal));
}
dev.on('exit', (code) => process.exit(code ?? 0));
