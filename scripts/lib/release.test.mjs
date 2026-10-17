import { describe, expect, it } from 'vitest';
import { nextVersion, rollChangelog, setPackageVersion } from './release.mjs';

describe('nextVersion', () => {
	it('bumps patch, minor and major', () => {
		expect(nextVersion('0.1.1', 'patch')).toBe('0.1.2');
		expect(nextVersion('0.1.9', 'minor')).toBe('0.2.0');
		expect(nextVersion('0.9.9', 'major')).toBe('1.0.0');
	});

	it('takes an explicit version only when it is newer', () => {
		expect(nextVersion('0.1.1', '0.3.0')).toBe('0.3.0');
		expect(nextVersion('0.1.1', '0.1.10')).toBe('0.1.10');
		expect(() => nextVersion('0.1.1', '0.1.1')).toThrow('not newer');
		expect(() => nextVersion('0.1.1', '0.0.9')).toThrow('not newer');
	});

	it('rejects anything that is not MAJOR.MINOR.PATCH', () => {
		expect(() => nextVersion('0.1.1', 'bananas')).toThrow('MAJOR.MINOR.PATCH');
		expect(() => nextVersion('0.1.1', 'v0.2.0')).toThrow('MAJOR.MINOR.PATCH');
	});
});

describe('setPackageVersion', () => {
	it('sets package.json and keeps the layout', () => {
		const text = '{\n  "name": "x",\n  "version": "0.1.0",\n  "scripts": {}\n}\n';
		expect(setPackageVersion(text, '0.1.1')).toBe(text.replace('0.1.0', '0.1.1'));
	});

	it('sets both version entries of the lockfile', () => {
		const lock = JSON.stringify(
			{ name: 'x', version: '0.1.0', packages: { '': { name: 'x', version: '0.1.0' }, 'node_modules/a': { version: '9.9.9' } } },
			null,
			2
		);
		const out = JSON.parse(setPackageVersion(`${lock}\n`, '0.2.0'));
		expect(out.version).toBe('0.2.0');
		expect(out.packages[''].version).toBe('0.2.0');
		expect(out.packages['node_modules/a'].version).toBe('9.9.9');
	});
});

describe('rollChangelog', () => {
	const repo = 'https://github.com/o/r';
	const base = [
		'# Changelog',
		'',
		'Intro.',
		'',
		'## [Unreleased]',
		'',
		'### Fixed',
		'',
		'- A thing.',
		'',
		'## [0.1.0] - 2026-10-17',
		'',
		'### Added',
		'',
		'- Everything.',
		'',
		`[0.1.0]: ${repo}/releases/tag/v0.1.0`,
		''
	].join('\n');

	it('renames Unreleased, leaves a fresh one and links the release', () => {
		const { changelog, notes } = rollChangelog(base, '0.1.1', '2026-10-18', repo);
		expect(notes).toBe('### Fixed\n\n- A thing.');
		expect(changelog).toBe(
			[
				'# Changelog',
				'',
				'Intro.',
				'',
				'## [Unreleased]',
				'',
				'## [0.1.1] - 2026-10-18',
				'',
				'### Fixed',
				'',
				'- A thing.',
				'',
				'## [0.1.0] - 2026-10-17',
				'',
				'### Added',
				'',
				'- Everything.',
				'',
				`[0.1.1]: ${repo}/releases/tag/v0.1.1`,
				`[0.1.0]: ${repo}/releases/tag/v0.1.0`,
				''
			].join('\n')
		);
	});

	it('refuses an empty Unreleased section, a missing one and a repeated version', () => {
		const empty = base.replace('### Fixed\n\n- A thing.\n\n', '');
		expect(() => rollChangelog(empty, '0.1.1', '2026-10-18', repo)).toThrow('empty');
		expect(() => rollChangelog('# Changelog\n', '0.1.1', '2026-10-18', repo)).toThrow('Unreleased');
		expect(() => rollChangelog(base, '0.1.0', '2026-10-18', repo)).toThrow('already has');
	});
});
