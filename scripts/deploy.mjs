#!/usr/bin/env node
// Usage: npm run deploy [-- options]
//
//   --fresh-cache       new `v=` API cache keys although the commit is unchanged
//                       (use after a reseed or translation batch)
//   --allow-dirty       deploy uncommitted changes (the version gets a -dirty suffix)
//   --dry-run           everything except the remote steps: no migration check,
//                       `wrangler deploy --dry-run`, then verify --url if given
//   --url=<origin>      site to verify (default: the URL wrangler prints, else
//                       $COOKUP_URL, else the workers.dev URL below)
//   --skip-browser      skip the Playwright hydration check
//
// Order, each step a hard stop:
//   1. no workerd / wrangler dev running (they lock .svelte-kit/cloudflare)
//   2. remote D1 has no pending migrations (read-only list; applying stays manual)
//   3. full build, with proof that the adapter finished and server/assets match
//   4. wrangler deploy, retried on Cloudflare 5xx/network errors without rebuilding
//   5. live check: version.json is this build, every chunk 200, API 200
//   6. headless-browser hydration check
import { spawn } from 'node:child_process';
import { verifiedBuild } from './build.mjs';
import { hydrationCheck } from './hydration-check.mjs';
import { findDevServers } from './lib/proc.mjs';
import { buildVersion } from './lib/version.mjs';
import { verifyDeploy } from './verify-deploy.mjs';

const DEFAULT_URL = 'https://cook-up.asakura-account.workers.dev';
const DB = 'cook-up-db';

const args = process.argv.slice(2);
const flag = (/** @type {string} */ name) => args.includes(`--${name}`);
const option = (/** @type {string} */ name) =>
	args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = flag('dry-run');
const log = (/** @type {string} */ line) => console.log(line);
const step = (/** @type {string} */ title) => log(`\n=== ${title}`);

/** @param {string} message @returns {never} */
function stop(message) {
	console.error(`\nDEPLOY STOPPED: ${message}`);
	process.exit(1);
}

/**
 * Runs wrangler with output streamed and captured.
 * @param {string[]} wranglerArgs
 * @returns {Promise<{ code: number, output: string }>}
 */
function wrangler(wranglerArgs) {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...wranglerArgs], {
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		/** @param {Buffer} chunk */
		const onData = (chunk) => {
			output += chunk.toString();
			process.stdout.write(chunk);
		};
		child.stdout.on('data', onData);
		child.stderr.on('data', onData);
		child.on('close', (code) => resolve({ code: code ?? 1, output }));
	});
}

// Cloudflare API hiccups seen in practice: 5xx/504 on upload, and the known
// transient "code 7403" authorization glitch. Anything else is a real error.
const TRANSIENT = /\b5\d\d\b|gateway|timed? ?out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up|\b7403\b/i;

step('1/6 no dev servers running');
const running = findDevServers();
if (running.length) {
	for (const p of running) log(`  pid ${p.pid} ${p.name} ${p.cmd.slice(0, 160)}`);
	stop(
		'stop every workerd / wrangler dev / vite dev process first (PowerShell: Get-Process workerd | Stop-Process; Linux: pkill workerd). ' +
			'They lock .svelte-kit/cloudflare, the adapter step then fails and a half-built bundle ships.'
	);
}
log('none');

if (flag('fresh-cache')) process.env.COOKUP_VERSION_SUFFIX = `c${Date.now().toString(36)}`;
const version = buildVersion();
log(`version: ${version}`);
if (version.includes('-dirty.') && !flag('allow-dirty')) {
	stop('uncommitted changes. Commit first so the deployed version names a commit you can roll back to, or pass --allow-dirty.');
}

step('2/6 remote D1 migrations');
if (dryRun) {
	log('skipped (--dry-run)');
} else {
	let listed = await wrangler(['d1', 'migrations', 'list', DB, '--remote']);
	if (listed.code !== 0 && TRANSIENT.test(listed.output)) {
		log('transient error, retrying once');
		listed = await wrangler(['d1', 'migrations', 'list', DB, '--remote']);
	}
	if (listed.code !== 0) stop('could not list remote migrations (see output above).');
	if (!listed.output.includes('No migrations to apply!')) {
		stop(
			`remote ${DB} has pending migrations. New code may depend on them (e.g. 0009's non_staple_count). ` +
				'Check the cost comment in each file against today\'s D1 quota, apply with `npm run db:migrate:remote`, then deploy again.'
		);
	}
}

step('3/6 build');
const build = await verifiedBuild({ log });
if (!build.ok) stop('build failed or is inconsistent; nothing was deployed.');
if (build.version !== version) stop(`built ${build.version} but expected ${version}: the tree changed during the build.`);

step(`4/6 wrangler deploy${dryRun ? ' --dry-run' : ''}`);
/** @type {{ code: number, output: string }} */
let deployed = { code: 1, output: '' };
for (let attempt = 1; attempt <= 4; attempt++) {
	deployed = await wrangler(dryRun ? ['deploy', '--dry-run'] : ['deploy']);
	if (deployed.code === 0 || !TRANSIENT.test(deployed.output) || attempt === 4) break;
	const wait = [10, 30, 60][attempt - 1];
	log(`transient Cloudflare error, retrying the same build in ${wait} s (attempt ${attempt + 1}/4)`);
	await new Promise((resolve) => setTimeout(resolve, wait * 1000));
}
if (deployed.code !== 0) stop('wrangler deploy failed.');
const versionId = deployed.output.match(/Current Version ID:\s*(\S+)/)?.[1];
const printedUrl = deployed.output.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
if (versionId) log(`Cloudflare version: ${versionId}`);

const url = option('url') ?? printedUrl ?? process.env.COOKUP_URL ?? (dryRun ? undefined : DEFAULT_URL);
const rollback = dryRun ? '' : ' Roll back with `npx wrangler rollback` (previous version), then investigate.';

step('5/6 live chunk and API check');
if (!url) {
	log('skipped (--dry-run without --url)');
} else {
	const verified = await verifyDeploy(url, { expectVersion: version, waitSeconds: 90, log });
	if (!verified.ok) stop(`${url} is not serving build ${version} consistently.${rollback}`);
}

step('6/6 browser hydration check');
if (!url || flag('skip-browser')) {
	log(url ? 'skipped (--skip-browser)' : 'skipped (no --url)');
} else {
	/** @type {{ ok: boolean, errors: string[] } | null} */
	let hydrated = null;
	// A browser can still reach a colo serving the previous version's assets for
	// a minute after step 5 passed (seen on 2026-10-12: two 404 chunks, gone 30 s
	// later), so only a failure that persists across retries means a broken build.
	for (const wait of [0, 30, 60]) {
		if (wait) {
			log(`hydration not clean yet, retrying in ${wait} s`);
			await new Promise((resolve) => setTimeout(resolve, wait * 1000));
		}
		try {
			hydrated = await hydrationCheck(url, { log });
		} catch (err) {
			log(`could not run the browser check: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
			log('install it once with `npx playwright install chromium`, or pass --skip-browser');
			stop(`hydration of ${url} is unverified.${rollback}`);
		}
		if (hydrated.ok) break;
	}
	if (!hydrated.ok) stop(`${url} does not hydrate.${rollback}`);
}

log(`\nDEPLOY OK ${version}${versionId ? ` (${versionId})` : ''}${url ? ` ${url}` : ''}`);
