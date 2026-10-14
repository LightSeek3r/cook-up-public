/**
 * Publishes the artefacts built by pipeline/09_build_artefacts.mjs as a data
 * pack (scripts/lib/datapack.mjs) on a GitHub release `data-<version>`, checks
 * the uploaded asset by downloading it again, then pins it in
 * src/lib/data/lock.json and installs it locally (what `npm run data:fetch`
 * does everywhere else). Commit the lock file to ship the data with the code.
 *
 * Re-publishing the same data version reuses its release when the asset there
 * holds the same manifest. The tag never starts with "v": deploy.yml deploys
 * v* tags.
 *
 * Usage: node pipeline/tools/publish_artefacts.mjs [--dir=pipeline/out/artefacts] [--repo=owner/name] [--dry-run]
 * Publishes to the public data repository (DATA_REPO below) unless --repo says otherwise.
 * Needs the gh CLI, authenticated with write access to it (GH_TOKEN or `gh auth login`).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkBudgets } from '../lib/artefacts.mjs';
import { install, LOCK_PATH, pack, readTree, sha256, unpack, verifyAgainstManifest, writeLock } from '../../scripts/lib/datapack.mjs';

const option = (/** @type {string} */ name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = process.argv.includes('--dry-run');

/** @param {string[]} args */
const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// A small public repository that holds nothing but the data releases, so builds download them
// without a token (the site serves every one of these files publicly under /data anyway). The
// translation backups (recipe-i18n-*, i18n-backup-*) stay releases of the private code repository.
const DATA_REPO = 'LightSeek3r/cook-up-data';

/** @param {string} repo @param {string} tag @param {string} asset @returns {Buffer | null} */
function downloadAsset(repo, tag, asset) {
	const dir = mkdtempSync(path.join(tmpdir(), 'cookup-pack-'));
	try {
		gh(['release', 'download', tag, '--repo', repo, '--pattern', asset, '--dir', dir]);
		return readFileSync(path.join(dir, asset));
	} catch {
		return null;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function main() {
	const dir = path.resolve(option('dir') ?? 'pipeline/out/artefacts');
	const files = readTree(dir);
	const problems = [...verifyAgainstManifest(files), ...checkBudgets(files)];
	if (problems.length) throw new Error(`${dir} is not a publishable artefact set: ${problems.slice(0, 5).join('; ')}`);
	const manifestBytes = /** @type {Buffer} */ (files.get('manifest.json'));
	const manifest = JSON.parse(manifestBytes.toString('utf8'));
	const repo = option('repo') ?? DATA_REPO;
	const tag = `data-${manifest.version}`;
	const asset = `${tag}.pack.gz`;

	let bytes = pack(files);
	const packFile = path.resolve('pipeline/out', asset);
	writeFileSync(packFile, bytes);
	console.log(`publish: ${files.size} files, version ${manifest.version}, pack ${(bytes.length / 1e6).toFixed(1)} MB (${path.relative(process.cwd(), packFile)})`);
	if (dryRun) return;

	const existing = downloadAsset(repo, tag, asset);
	if (existing) {
		const same = sha256(/** @type {Buffer} */ (unpack(existing).get('manifest.json'))) === sha256(manifestBytes);
		if (!same) throw new Error(`release ${tag} exists with different content; refusing to overwrite it`);
		console.log(`publish: release ${tag} already holds this data; reusing its asset`);
		bytes = existing;
	} else {
		const notes = [
			`Static data artefacts, data version ${manifest.version}: ${manifest.counts.recipes} recipes, ${manifest.counts.ingredients} ingredients, ${manifest.langs.length} languages, ${files.size} files.`,
			'',
			'Built by pipeline/09_build_artefacts.mjs from the pipeline snapshot (pipeline/out + translation backup). Pinned by src/lib/data/lock.json; install with `npm run data:fetch`.',
			'',
			'Derived from the Wikibooks Cookbook (CC BY-SA 3.0), Open Food Facts (ODbL) and USDA FoodData Central (public domain); see the repository README.',
			'',
			'Not a deploy tag (deploy.yml only reacts to v* tags).'
		].join('\n');
		gh(['release', 'create', tag, packFile, '--repo', repo, '--title', `Data ${manifest.version}`, '--notes', notes, '--latest=false'], {
			stdio: ['ignore', 'inherit', 'inherit']
		});
		const back = downloadAsset(repo, tag, asset);
		if (!back || sha256(back) !== sha256(bytes)) throw new Error(`release ${tag}: the uploaded asset does not download back identical`);
		console.log(`publish: release ${tag} created; asset downloaded back, sha256 ${sha256(back)}`);
	}

	writeLock({
		version: manifest.version,
		repo,
		tag,
		asset,
		sha256: sha256(bytes),
		bytes: bytes.length,
		manifest_sha256: sha256(manifestBytes)
	});
	install(unpack(bytes));
	console.log(`publish: wrote ${LOCK_PATH} and installed the data; commit the lock file`);
}

main();
