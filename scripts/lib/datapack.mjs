/**
 * The data pack: every artefact file of one data version (pipeline/lib/
 * artefacts.mjs) in a single gzip, published as a GitHub release asset and
 * pinned by src/lib/data/lock.json. Layout inside the gzip:
 *   "CKUPPACK" | u32 LE index byte length | index JSON [[path, bytes], ...] | bodies, in index order
 * No tar: Node has none built in, and this needs no dependency or system tool.
 *
 * Installed copies (npm run data:fetch):
 *   static/data/<path>             every file; static assets (env.ASSETS in the Worker, fetch in the browser)
 *   src/lib/data/generated/<path>  the hot files again (isHot), for bundling into the Worker
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const LOCK_PATH = 'src/lib/data/lock.json';
export const STATIC_DIR = 'static/data';
export const GENERATED_DIR = 'src/lib/data/generated';
const MAGIC = 'CKUPPACK';

/** @param {Buffer | Uint8Array} buf */
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Files the Worker may bundle; per-recipe files and mosaics are assets only.
 * @param {string} p
 */
export const isHot = (p) => !p.startsWith('r/') && !p.startsWith('mosaic/');

/**
 * @typedef {object} DataLock
 * @property {string} version data version (manifest.json's)
 * @property {string} repo owner/name holding the release
 * @property {string} tag release tag, never v* (deploy.yml deploys v* tags)
 * @property {string} asset release asset name
 * @property {string} sha256 of the asset
 * @property {number} bytes of the asset
 * @property {string} manifest_sha256 of manifest.json inside it
 */

/** @returns {DataLock} */
export function readLock(file = LOCK_PATH) {
	return JSON.parse(readFileSync(file, 'utf8'));
}

/** @param {DataLock} lock */
export function writeLock(lock, file = LOCK_PATH) {
	writeFileSync(file, JSON.stringify(lock, null, '\t') + '\n');
}

/** @param {Map<string, Buffer>} files */
export function pack(files) {
	const paths = [...files.keys()].sort();
	const index = Buffer.from(JSON.stringify(paths.map((p) => [p, /** @type {Buffer} */ (files.get(p)).length])), 'utf8');
	const head = Buffer.alloc(12);
	head.write(MAGIC, 0, 'latin1');
	head.writeUInt32LE(index.length, 8);
	return gzipSync(Buffer.concat([head, index, ...paths.map((p) => /** @type {Buffer} */ (files.get(p)))]), { level: 9 });
}

/**
 * @param {Buffer} gz
 * @returns {Map<string, Buffer>}
 */
export function unpack(gz) {
	const raw = gunzipSync(gz);
	if (raw.toString('latin1', 0, 8) !== MAGIC) throw new Error('not a data pack');
	const indexBytes = raw.readUInt32LE(8);
	/** @type {[string, number][]} */
	const index = JSON.parse(raw.toString('utf8', 12, 12 + indexBytes));
	const files = new Map();
	let at = 12 + indexBytes;
	for (const [p, bytes] of index) {
		if (p.includes('..') || path.isAbsolute(p)) throw new Error(`unsafe path in data pack: ${p}`);
		files.set(p, raw.subarray(at, at + bytes));
		at += bytes;
	}
	if (at !== raw.length) throw new Error('data pack has trailing bytes');
	return files;
}

/**
 * Problems of a file set against its own manifest.json: every listed file
 * present with its size and sha256, nothing unlisted.
 * @param {Map<string, Buffer>} files
 */
export function verifyAgainstManifest(files) {
	const raw = files.get('manifest.json');
	if (!raw) return ['manifest.json missing'];
	const manifest = JSON.parse(raw.toString('utf8'));
	const problems = [];
	const listed = new Set();
	for (const f of manifest.files) {
		listed.add(f.path);
		const body = files.get(f.path);
		if (!body) problems.push(`${f.path} missing`);
		else if (body.length !== f.bytes || sha256(body) !== f.sha256) problems.push(`${f.path} differs from manifest.json`);
	}
	for (const p of files.keys()) if (p !== 'manifest.json' && !listed.has(p)) problems.push(`${p} is not in manifest.json`);
	return problems;
}

/**
 * Every file under `dir`, keyed by its /-separated relative path.
 * @param {string} dir
 * @returns {Map<string, Buffer>}
 */
export function readTree(dir) {
	const files = new Map();
	if (!existsSync(dir)) return files;
	/** @param {string} d @param {string} rel */
	const walk = (d, rel) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const r = rel ? `${rel}/${e.name}` : e.name;
			if (e.isDirectory()) walk(path.join(d, e.name), r);
			else files.set(r, readFileSync(path.join(d, e.name)));
		}
	};
	walk(dir, '');
	return files;
}

/**
 * Replaces `dir` with exactly `files`.
 * @param {string} dir
 * @param {Map<string, Buffer>} files
 */
export function writeTree(dir, files) {
	rmSync(dir, { recursive: true, force: true });
	for (const [p, body] of files) {
		const file = path.join(dir, p);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, body);
	}
}

/**
 * Problems with the installed data against the lock (empty = installed and
 * intact): both trees present, the lock's manifest, every file's sha256.
 * @param {DataLock} lock
 * @param {{ staticDir?: string, generatedDir?: string }} [dirs]
 */
export function checkInstalled(lock, dirs = {}) {
	const staticDir = dirs.staticDir ?? STATIC_DIR;
	const generatedDir = dirs.generatedDir ?? GENERATED_DIR;
	const problems = [];
	const all = readTree(staticDir);
	const manifest = all.get('manifest.json');
	if (!manifest) return [`${staticDir}/manifest.json missing: run \`npm run data:fetch\``];
	if (sha256(manifest) !== lock.manifest_sha256) {
		return [`${staticDir} holds another data version than ${LOCK_PATH} (${lock.version}): run \`npm run data:fetch\``];
	}
	problems.push(...verifyAgainstManifest(all).map((p) => `${staticDir}: ${p}`));
	const hot = readTree(generatedDir);
	for (const [p, body] of all) {
		if (!isHot(p)) continue;
		const copy = hot.get(p);
		if (!copy || sha256(copy) !== sha256(body)) problems.push(`${generatedDir}/${p} missing or different from ${staticDir}`);
	}
	for (const p of hot.keys()) if (!all.has(p) || !isHot(p)) problems.push(`${generatedDir}/${p} is not part of data version ${lock.version}`);
	return problems;
}

/**
 * Installs an unpacked, verified file set into both trees.
 * @param {Map<string, Buffer>} files
 * @param {{ staticDir?: string, generatedDir?: string }} [dirs]
 */
export function install(files, dirs = {}) {
	writeTree(dirs.staticDir ?? STATIC_DIR, files);
	writeTree(dirs.generatedDir ?? GENERATED_DIR, new Map([...files].filter(([p]) => isHot(p))));
}
