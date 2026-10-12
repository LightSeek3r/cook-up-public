import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The SvelteKit `version.name` for this tree.
 *
 * Kit's default is the build timestamp, and every chunk importing
 * `$app/environment` embeds it, so two builds of one commit got different chunk
 * names. A deploy that paired one build's server with another's assets then
 * 404ed on every chunk (2026-10-12). Keyed on the commit instead, a rebuild is
 * byte-identical. Uncommitted changes get a content-hash suffix so they never
 * share a version with the clean commit.
 *
 * The version is also the `v=` API cache key (src/lib/httpCache.ts), so
 * redeploying the same commit keeps warm caches. COOKUP_VERSION_SUFFIX forces
 * fresh keys, which is what a redeploy after a reseed needs
 * (`npm run deploy -- --fresh-cache`).
 *
 * Computed once and kept in process.env: SvelteKit evaluates svelte.config.js
 * several times per build, in this process and in forked children, which
 * inherit the environment. Without that, the Date.now() fallback (no git) or a
 * file edited mid-build gave the server and the client two different versions,
 * and the client then crashed on hydration.
 */
export function buildVersion() {
	process.env.COOKUP_VERSION ||= computeVersion();
	return process.env.COOKUP_VERSION;
}

function computeVersion() {
	const suffix = process.env.COOKUP_VERSION_SUFFIX ? `-${process.env.COOKUP_VERSION_SUFFIX}` : '';
	try {
		const git = (/** @type {string[]} */ ...args) =>
			execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		const sha = git('rev-parse', '--short=12', 'HEAD').trim();
		const diff = git('diff', 'HEAD', '--binary');
		const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
		if (!diff && untracked.length === 0) return `${sha}${suffix}`;
		const hash = createHash('sha256').update(diff);
		for (const file of untracked) hash.update(file).update(readFileSync(file));
		return `${sha}-dirty.${hash.digest('hex').slice(0, 8)}${suffix}`;
	} catch {
		const ci = process.env.GITHUB_SHA ?? process.env.WORKERS_CI_COMMIT_SHA;
		return `${ci ? ci.slice(0, 12) : Date.now()}${suffix}`;
	}
}
