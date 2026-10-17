// Pure helpers for scripts/release.mjs: no git, no network, no file access, so
// they can be tested on strings.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** @param {string} v @returns {[number, number, number]} */
function parse(v) {
	const m = SEMVER.exec(v);
	if (!m) throw new Error(`not a MAJOR.MINOR.PATCH version: ${v}`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * @param {string} current  e.g. 0.1.1
 * @param {string} bump     patch | minor | major | an explicit MAJOR.MINOR.PATCH
 */
export function nextVersion(current, bump) {
	const [major, minor, patch] = parse(current);
	if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
	if (bump === 'minor') return `${major}.${minor + 1}.0`;
	if (bump === 'major') return `${major + 1}.0.0`;
	const next = parse(bump);
	if (cmp(next, [major, minor, patch]) <= 0) throw new Error(`${bump} is not newer than the current version ${current}`);
	return bump;
}

/** @param {number[]} a @param {number[]} b */
function cmp(a, b) {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return 0;
}

/**
 * Sets the version in package.json or package-lock.json text, keeping npm's
 * 2-space layout and trailing newline. The lockfile also names the root
 * package under packages[""].
 * @param {string} text
 * @param {string} version
 */
export function setPackageVersion(text, version) {
	const json = JSON.parse(text);
	json.version = version;
	if (json.packages?.['']) json.packages[''].version = version;
	return `${JSON.stringify(json, null, 2)}\n`;
}

/**
 * Turns the `## [Unreleased]` section into `## [version] - date`, leaves a
 * fresh empty Unreleased section above it and adds the release link. The
 * section body is what the GitHub release says, so it must not be empty.
 * @param {string} changelog
 * @param {string} version
 * @param {string} date  YYYY-MM-DD
 * @param {string} repoUrl  e.g. https://github.com/owner/repo
 * @returns {{ changelog: string, notes: string }}
 */
export function rollChangelog(changelog, version, date, repoUrl) {
	const start = changelog.indexOf('## [Unreleased]');
	if (start === -1) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
	const bodyStart = start + '## [Unreleased]'.length;
	const next = changelog.slice(bodyStart).search(/^## \[/m);
	// The link references live after the last released section, so a later heading must exist.
	if (next === -1) throw new Error('CHANGELOG.md needs a released version below the Unreleased section');
	const bodyEnd = bodyStart + next;
	const notes = changelog.slice(bodyStart, bodyEnd).trim();
	if (!notes) throw new Error('"## [Unreleased]" is empty: write the release notes there first');
	if (changelog.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already has ${version}`);

	const links = changelog.slice(bodyEnd);
	const linkLine = `[${version}]: ${repoUrl}/releases/tag/v${version}`;
	const firstLink = links.search(/^\[\d+\.\d+\.\d+\]: /m);
	const withLink =
		firstLink === -1
			? `${links.replace(/\n*$/, '\n\n')}${linkLine}\n`
			: `${links.slice(0, firstLink)}${linkLine}\n${links.slice(firstLink)}`;

	const rolled = `${changelog.slice(0, bodyStart)}\n\n## [${version}] - ${date}\n\n${notes}\n\n${withLink}`;
	return { changelog: rolled, notes };
}
