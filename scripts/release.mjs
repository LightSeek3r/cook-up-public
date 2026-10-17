#!/usr/bin/env node
// Usage: npm run release -- <patch|minor|major|X.Y.Z> [--dry-run]
//
// Cuts a release from the notes under `## [Unreleased]` in CHANGELOG.md:
//   1. checks: on main, clean tree, in sync with origin/main, gh signed in, tag unused
//   2. package.json, package-lock.json (both entries) and CHANGELOG.md (heading, fresh
//      Unreleased section, release link) get the new version; nothing else writes it,
//      the README badge reads package.json
//   3. one commit `chore: release vX.Y.Z`, pushed to main
//   4. GitHub release + tag vX.Y.Z on that commit, notes = the changelog section
//
// --dry-run prints the new version and the release notes and changes nothing. The commit
// carries no co-author line and uses your git identity (set user.email to your GitHub
// noreply address first if the repository's history uses it).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { nextVersion, rollChangelog, setPackageVersion } from './lib/release.mjs';

const REPO_URL = 'https://github.com/LightSeek3r/cook-up-public';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((a) => !a.startsWith('--'));

/** @param {string} message @returns {never} */
function stop(message) {
	console.error(`\nRELEASE STOPPED: ${message}`);
	process.exit(1);
}

/**
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{ input?: string, allowFail?: boolean }} [opts]
 */
function run(cmd, cmdArgs, opts = {}) {
	const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', input: opts.input });
	if (r.status !== 0 && !opts.allowFail) {
		stop(`\`${cmd} ${cmdArgs.join(' ')}\` failed:\n${(r.stderr || r.stdout || '').trim()}`);
	}
	return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

if (!bump) stop('say what to release: patch, minor, major or an explicit X.Y.Z');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let version;
try {
	version = nextVersion(pkg.version, bump);
} catch (e) {
	stop(e instanceof Error ? e.message : String(e));
}
const tag = `v${version}`;

/** @type {{ changelog: string, notes: string }} */
let rolled;
try {
	rolled = rollChangelog(
		readFileSync('CHANGELOG.md', 'utf8'),
		version,
		new Date().toISOString().slice(0, 10),
		REPO_URL
	);
} catch (e) {
	stop(e instanceof Error ? e.message : String(e));
}

console.log(`${pkg.version} -> ${version}\n\nRelease notes:\n\n${rolled.notes}\n`);
if (dryRun) {
	console.log('--dry-run: nothing written, committed or pushed.');
	process.exit(0);
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out;
if (branch !== 'main') stop(`on ${branch}: releases are cut from main`);
if (run('git', ['status', '--porcelain']).out) stop('the working tree is not clean');
run('git', ['fetch', 'origin', 'main', '--tags']);
if (run('git', ['rev-parse', 'HEAD']).out !== run('git', ['rev-parse', 'origin/main']).out) {
	stop('main is not at origin/main: pull or push first');
}
if (run('git', ['tag', '--list', tag]).out) stop(`tag ${tag} already exists`);
run('gh', ['auth', 'status']);

writeFileSync('package.json', setPackageVersion(readFileSync('package.json', 'utf8'), version));
writeFileSync(
	'package-lock.json',
	setPackageVersion(readFileSync('package-lock.json', 'utf8'), version)
);
writeFileSync('CHANGELOG.md', rolled.changelog);

run('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md']);
run('git', ['commit', '-m', `chore: release ${tag}`]);
run('git', ['push', 'origin', 'main']);
const sha = run('git', ['rev-parse', 'HEAD']).out;

const release = run(
	'gh',
	['release', 'create', tag, '--target', sha, '--title', `Cook Up ${version}`, '--notes-file', '-', '--latest'],
	{ input: `${rolled.notes}\n`, allowFail: true }
);
if (!release.ok) {
	stop(
		`${tag} is committed and pushed (${sha.slice(0, 7)}) but the GitHub release failed. Retry with:\n` +
			`  gh release create ${tag} --target ${sha} --title "Cook Up ${version}" --latest --notes-file -\n` +
			`and paste the [${version}] section of CHANGELOG.md.`
	);
}
console.log(`\nReleased ${tag}: ${release.out}`);
