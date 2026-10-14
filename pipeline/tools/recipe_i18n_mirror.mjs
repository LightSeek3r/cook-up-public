/**
 * Off-machine copy of the recipe translation store: the whole store as one
 * data pack (scripts/lib/datapack.mjs) on a private GitHub release
 * `recipe-i18n-<hash>` of this repository, checked by downloading it again;
 * and the way back. The store is git-ignored (54 MB of text, rewritten by
 * every batch), so this is the copy that survives the laptop. Run it after
 * every translation session.
 *
 * Usage:
 *   node pipeline/tools/recipe_i18n_mirror.mjs [--dry-run] [--repo=owner/name] [--store=pipeline/data/recipe-i18n]
 *   node pipeline/tools/recipe_i18n_mirror.mjs --restore=<pack file> [--store=...] [--force]
 * Publishing needs the gh CLI, authenticated (GH_TOKEN or `gh auth login`).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFlags } from '../lib/glossary_apply_lib.mjs';
import { KINDS, parseFile, storeExists, STORE_DIR } from '../lib/recipe_i18n_store.mjs';
import { pack, readTree, sha256, unpack } from '../../scripts/lib/datapack.mjs';

const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

/** Parses every file of a store tree (throws on the first damaged one) and returns it. */
function verifiedTree(files) {
	for (const [p, body] of files) {
		const m = p.match(/^(titles|instructions)\/([a-z]+)\.jsonl(\.gz)?$/);
		if (!m || !KINDS.includes(m[1]) || (m[1] === 'titles') === Boolean(m[3])) throw new Error(`${p} is not a store file`);
		parseFile(m[1], m[2], body, p);
	}
	return files;
}

function originRepo() {
	const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
	const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
	if (!m) throw new Error(`origin ${url} is not a GitHub repository; pass --repo=owner/name`);
	return m[1];
}

function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const storeDir = path.resolve(str('store') ?? STORE_DIR);
	const restore = str('restore');
	if (restore) {
		if (storeExists(storeDir) && !has('force')) throw new Error(`${storeDir} already holds a store; --force replaces it`);
		const files = verifiedTree(unpack(readFileSync(restore)));
		for (const [p, body] of files) {
			mkdirSync(path.dirname(path.join(storeDir, p)), { recursive: true });
			writeFileSync(path.join(storeDir, p), body);
		}
		console.log(`recipe_i18n_mirror: restored ${files.size} files into ${storeDir}`);
		return;
	}

	const files = verifiedTree(new Map([...readTree(storeDir)].filter(([p]) => !p.endsWith('.tmp'))));
	if (!files.size) throw new Error(`${storeDir} is empty`);
	const bytes = pack(files);
	const hash = sha256(bytes).slice(0, 12);
	const tag = `recipe-i18n-${hash}`;
	const asset = `${tag}.pack.gz`;
	const packFile = path.resolve('pipeline/out', asset);
	mkdirSync(path.dirname(packFile), { recursive: true });
	writeFileSync(packFile, bytes);
	console.log(`recipe_i18n_mirror: ${files.size} files, pack ${(bytes.length / 1e6).toFixed(1)} MB (${path.relative(process.cwd(), packFile)})`);
	if (has('dry-run')) return;

	const repo = str('repo') ?? originRepo();
	const notes = 'Recipe translation store (pipeline/data/recipe-i18n), restore with `node pipeline/tools/recipe_i18n_mirror.mjs --restore=<asset>`. Not a deploy tag.';
	gh(['release', 'create', tag, packFile, '--repo', repo, '--title', `Recipe translations ${hash}`, '--notes', notes, '--latest=false'], {
		stdio: ['ignore', 'inherit', 'inherit']
	});
	const dir = mkdtempSync(path.join(tmpdir(), 'cookup-i18n-'));
	try {
		gh(['release', 'download', tag, '--repo', repo, '--pattern', asset, '--dir', dir]);
		const back = path.join(dir, asset);
		if (!existsSync(back) || sha256(readFileSync(back)) !== sha256(bytes)) throw new Error(`release ${tag}: the asset does not download back identical`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	console.log(`recipe_i18n_mirror: release ${tag} created and downloaded back identical`);
}

try {
	main();
} catch (err) {
	console.error(`recipe_i18n_mirror: ${err.message}`);
	process.exitCode = 1;
}
