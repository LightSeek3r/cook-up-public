#!/usr/bin/env node
// Usage: npm run data:fetch [-- --from=<pack.gz>] [-- --check]
//
// Installs the data version pinned by src/lib/data/lock.json (static data
// artefacts, README "Data artefacts") into static/data and, for the files the
// Worker may bundle, src/lib/data/generated. Both are gitignored: the pack is
// a release asset of the public data repository the lock names, checked against
// the lock's sha256 before anything is written, and every file against the manifest.
//
// Download: `gh release download` when the gh CLI is installed (it uses
// GH_TOKEN or its own login), else the GitHub REST API, with GITHUB_TOKEN or
// GH_TOKEN when set and without any token otherwise (public repository). Packs are cached in node_modules/.cache/cook-up-data. --check
// only verifies what is installed (the same check scripts/build.mjs runs).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkInstalled, install, LOCK_PATH, readLock, sha256, unpack, verifyAgainstManifest } from './lib/datapack.mjs';

const CACHE = 'node_modules/.cache/cook-up-data';

/** @param {string} message @returns {never} */
function fail(message) {
	console.error(`data:fetch: ${message}`);
	process.exit(1);
}

/** @param {import('./lib/datapack.mjs').DataLock} lock @param {string} dir */
function viaGh(lock, dir) {
	execFileSync('gh', ['release', 'download', lock.tag, '--repo', lock.repo, '--pattern', lock.asset, '--dir', dir, '--clobber'], {
		stdio: ['ignore', 'inherit', 'inherit']
	});
	return readFileSync(path.join(dir, lock.asset));
}

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The plain release URL of a public repository. Unlike api.github.com it has no per-IP quota of 60
 * requests an hour, which Cloudflare's shared build network exhausts (HTTP 403 on the first call,
 * 2026-10-15). null when the repository is private or the asset is missing.
 * @param {import('./lib/datapack.mjs').DataLock} lock
 */
async function viaReleaseUrl(lock) {
	const url = `https://github.com/${lock.repo}/releases/download/${lock.tag}/${lock.asset}`;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(url, { headers: { 'user-agent': 'cook-up-data-fetch' } });
			if (response.ok) return Buffer.from(await response.arrayBuffer());
			console.log(`data:fetch: ${url}: HTTP ${response.status}`);
			if (response.status === 404) return null;
		} catch (error) {
			console.log(`data:fetch: ${url}: ${error instanceof Error ? error.message : error}`);
		}
		await sleep(attempt * 2000);
	}
	return null;
}

/** @param {import('./lib/datapack.mjs').DataLock} lock */
async function viaRest(lock) {
	// The data repository is public: no token is needed (Cloudflare's build has none). A token is
	// only for the API fallback below, and required if the lock ever points at a private repository.
	const direct = await viaReleaseUrl(lock);
	if (direct) return direct;
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	const headers = {
		...(token ? { authorization: `Bearer ${token}` } : {}),
		'x-github-api-version': '2022-11-28',
		'user-agent': 'cook-up-data-fetch'
	};
	const release = await fetch(`https://api.github.com/repos/${lock.repo}/releases/tags/${lock.tag}`, {
		headers: { ...headers, accept: 'application/vnd.github+json' }
	});
	if (!release.ok) {
		fail(`release ${lock.tag} of ${lock.repo}: HTTP ${release.status}${token ? '' : ' (no GITHUB_TOKEN/GH_TOKEN set: needed if that repository is private)'}`);
	}
	/** @type {{ assets: { id: number, name: string }[] }} */
	const body = await release.json();
	const asset = body.assets.find((a) => a.name === lock.asset);
	if (!asset) fail(`release ${lock.tag} has no asset ${lock.asset}`);
	// The asset endpoint redirects to storage; fetch drops the Authorization
	// header on that cross-origin hop, as the storage URL is pre-signed.
	const download = await fetch(`https://api.github.com/repos/${lock.repo}/releases/assets/${asset.id}`, {
		headers: { ...headers, accept: 'application/octet-stream' }
	});
	if (!download.ok) fail(`asset ${lock.asset}: HTTP ${download.status}`);
	return Buffer.from(await download.arrayBuffer());
}

function hasGh() {
	try {
		execFileSync('gh', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

/**
 * The pinned pack's bytes, verified against the lock.
 * @param {import('./lib/datapack.mjs').DataLock} lock
 * @param {string | undefined} from
 */
async function obtain(lock, from) {
	const ok = (/** @type {Buffer} */ b) => b.length === lock.bytes && sha256(b) === lock.sha256;
	if (from) {
		const bytes = readFileSync(from);
		if (!ok(bytes)) fail(`${from} is not the pack ${LOCK_PATH} pins (sha256 ${lock.sha256})`);
		return bytes;
	}
	const cached = path.join(CACHE, lock.asset);
	if (existsSync(cached)) {
		const bytes = readFileSync(cached);
		if (ok(bytes)) return bytes;
	}
	mkdirSync(CACHE, { recursive: true });
	const tmp = path.join(CACHE, 'download');
	mkdirSync(tmp, { recursive: true });
	console.log(`data:fetch: downloading ${lock.asset} (${(lock.bytes / 1e6).toFixed(1)} MB) from ${lock.repo} release ${lock.tag}`);
	const bytes = hasGh() ? viaGh(lock, tmp) : await viaRest(lock);
	if (!ok(bytes)) fail(`downloaded ${lock.asset} does not match ${LOCK_PATH}: refusing to install it`);
	writeFileSync(`${cached}.tmp`, bytes);
	renameSync(`${cached}.tmp`, cached);
	return bytes;
}

async function main() {
	const args = process.argv.slice(2);
	const lock = readLock();
	const installed = checkInstalled(lock);
	if (args.includes('--check')) {
		for (const p of installed) console.error(`DATA PROBLEM: ${p}`);
		console.log(installed.length ? 'DATA NOT INSTALLED' : `DATA OK ${lock.version}`);
		process.exit(installed.length ? 1 : 0);
	}
	if (installed.length === 0) {
		console.log(`data:fetch: data ${lock.version} already installed and intact`);
		return;
	}
	const from = args.find((a) => a.startsWith('--from='))?.slice(7);
	const files = unpack(await obtain(lock, from));
	const problems = verifyAgainstManifest(files);
	const manifest = files.get('manifest.json');
	if (manifest && sha256(manifest) !== lock.manifest_sha256) problems.push(`manifest.json is not the one ${LOCK_PATH} pins`);
	if (problems.length) fail(`pack is inconsistent: ${problems.slice(0, 5).join('; ')}`);
	install(files);
	const after = checkInstalled(lock);
	if (after.length) fail(`installed data does not verify: ${after.slice(0, 5).join('; ')}`);
	console.log(`data:fetch: installed data ${lock.version} (${files.size} files) into static/data and src/lib/data/generated`);
}

await main();
