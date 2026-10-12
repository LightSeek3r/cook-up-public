#!/usr/bin/env node
// Usage: node scripts/build.mjs           (npm run build:checked)
//        node scripts/build.mjs --check   check the existing .svelte-kit output only
//
// `vite build` plus proof that the adapter step finished and that the server
// build and the deployable assets come from this one build. Exits non-zero
// otherwise. The full, unfiltered log is kept in .wrangler/deploy/build.log.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildVersion } from './lib/version.mjs';

export const LOG_PATH = '.wrangler/deploy/build.log';
const CLIENT = '.svelte-kit/output/client';
const SERVER = '.svelte-kit/output/server';
const DEPLOY = '.svelte-kit/cloudflare';

const stripAnsi = (/** @type {string} */ s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

/** @param {string} dir @returns {Map<string, number>} relative path -> size */
function listFiles(dir) {
	const files = new Map();
	if (!existsSync(dir)) return files;
	/** @param {string} d */
	const walk = (d) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const full = join(d, entry.name);
			if (entry.isDirectory()) walk(full);
			else files.set(relative(dir, full).replaceAll('\\', '/'), statSync(full).size);
		}
	};
	walk(dir);
	return files;
}

/** @param {string} file */
const readVersion = (file) =>
	existsSync(file) ? /** @type {{ version: string }} */ (JSON.parse(readFileSync(file, 'utf8'))).version : null;

/**
 * Checks the build artefacts against each other. Returns a list of problems.
 * @param {string} expected  version the build should carry
 * @param {number} startedAt ms timestamp the build started
 */
export function checkArtefacts(expected, startedAt) {
	const problems = [];
	const clientVersion = readVersion(join(CLIENT, '_app/version.json'));
	const deployVersion = readVersion(join(DEPLOY, '_app/version.json'));
	if (clientVersion !== expected) problems.push(`client version.json is ${clientVersion}, expected ${expected}`);
	if (deployVersion !== clientVersion) {
		problems.push(`${DEPLOY}/_app/version.json is ${deployVersion}, client build is ${clientVersion} (adapter output is stale)`);
	}

	// The server's copy of the version names the `__sveltekit_<hash>` global the
	// HTML defines; the client chunks read the one from version.json. Any
	// difference and every page fails to hydrate.
	// Rollup numbers the chunk (internal.js, internal2.js, ...) depending on what
	// else the server build contains, so search every candidate for the constant.
	const serverVersion =
		[...listFiles(SERVER).keys()]
			.filter((f) => /(^|\/)internal\d*\.js$/.test(f))
			.map((f) => readFileSync(join(SERVER, f), 'utf8').match(/\bversion = "([^"]*)"/)?.[1])
			.find(Boolean) ?? null;
	if (serverVersion !== clientVersion) {
		problems.push(`server build embeds version ${serverVersion}, client build is ${clientVersion}: they would not hydrate`);
	}

	const built = listFiles(join(CLIENT, '_app/immutable'));
	const shipped = listFiles(join(DEPLOY, '_app/immutable'));
	const missing = [...built.keys()].filter((f) => shipped.get(f) !== built.get(f));
	const extra = [...shipped.keys()].filter((f) => !built.has(f));
	if (built.size === 0) problems.push(`${CLIENT}/_app/immutable is empty`);
	if (missing.length) problems.push(`${missing.length} built chunks missing or different in ${DEPLOY}, e.g. ${missing[0]}`);
	if (extra.length) problems.push(`${extra.length} stale chunks in ${DEPLOY} not produced by this build, e.g. ${extra[0]}`);

	// The adapter copies the project-root _headers (security headers for static
	// files, which never pass through hooks.server.ts) and appends its own rules.
	if (existsSync('_headers')) {
		const shippedHeaders = join(DEPLOY, '_headers');
		const own = readFileSync('_headers', 'utf8');
		if (!existsSync(shippedHeaders) || !readFileSync(shippedHeaders, 'utf8').startsWith(own)) {
			problems.push(`${shippedHeaders} does not start with the project-root _headers`);
		}
	}

	const worker = join(DEPLOY, '_worker.js');
	if (!existsSync(worker)) problems.push(`${worker} missing`);
	else if (statSync(worker).mtimeMs < startedAt - 2_000) problems.push(`${worker} predates this build`);
	return problems;
}

/**
 * @param {{ log?: (line: string) => void }} [opts]
 * @returns {Promise<{ ok: boolean, version: string, problems: string[] }>}
 */
export async function verifiedBuild(opts = {}) {
	const log = opts.log ?? console.log;
	const version = buildVersion();
	const startedAt = Date.now();
	mkdirSync('.wrangler/deploy', { recursive: true });
	const file = createWriteStream(LOG_PATH);
	log(`building version ${version} (full log: ${LOG_PATH})`);

	let output = '';
	const code = await new Promise((resolve) => {
		const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
			// Pinned so svelte.config.js and this check cannot compute different versions.
			env: { ...process.env, COOKUP_VERSION: version },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		/** @param {Buffer} chunk */
		const onData = (chunk) => {
			const text = chunk.toString();
			output += text;
			file.write(text);
			process.stdout.write(text);
		};
		child.stdout.on('data', onData);
		child.stderr.on('data', onData);
		child.on('close', resolve);
	});
	await new Promise((resolve) => file.end(resolve));

	const problems = [];
	const plain = stripAnsi(output);
	if (code !== 0) problems.push(`vite build exited with ${code}`);
	if (!/Using @sveltejs\/adapter-cloudflare[\s\S]*✔ done/.test(plain)) {
		problems.push('adapter-cloudflare never printed "✔ done": the deploy folder was not (fully) rewritten');
	}
	const locks = plain.match(/\b(EPERM|EBUSY|EACCES)\b[^\n]*/);
	if (locks) problems.push(`file lock error during build: ${locks[0].trim()}`);
	problems.push(...checkArtefacts(version, startedAt));

	for (const p of problems) log(`BUILD PROBLEM: ${p}`);
	log(problems.length ? 'BUILD FAILED' : `BUILD OK ${version}`);
	return { ok: problems.length === 0, version, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	if (process.argv.includes('--check')) {
		// Checks an existing build (e.g. from a plain `vite build`) without rebuilding.
		const version = readVersion(join(CLIENT, '_app/version.json'));
		const problems = version ? checkArtefacts(version, 0) : [`no ${CLIENT}/_app/version.json`];
		for (const p of problems) console.log(`BUILD PROBLEM: ${p}`);
		console.log(problems.length ? 'BUILD INCONSISTENT' : `BUILD CONSISTENT ${version}`);
		process.exit(problems.length ? 1 : 0);
	}
	const { ok } = await verifiedBuild();
	process.exit(ok ? 0 : 1);
}
