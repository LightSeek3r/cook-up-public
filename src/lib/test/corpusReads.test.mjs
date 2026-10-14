// The app must never read the recipe corpus from D1: those tables are dropped
// by migrations/0013_retire_recipe_corpus.sql, and every corpus read goes
// through the data artefacts. A statement naming one of them would pass every
// test that still builds the corpus schema and fail only in production, so
// this scans the source for SQL that names a corpus table, outside the D1
// reference code and the tests (src/lib/test, *.test.*). `.mjs` for node:fs.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RUNTIME_TABLES, tablesNamed } from '../../../pipeline/lib/migrations.mjs';

const SRC = path.resolve(import.meta.dirname, '../..');
const TEST_DIR = path.join(SRC, 'lib', 'test');
const GENERATED = path.join(SRC, 'lib', 'data', 'generated');
const SOURCE = /\.(ts|js|mjs|svelte)$/;
const isTest = (file) => /\.test\.(ts|js|mjs)$/.test(file);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return p === GENERATED ? [] : walk(p);
		return SOURCE.test(e.name) ? [p] : [];
	});
}

/** @param {string} file */
const corpusRefs = (file) => tablesNamed(readFileSync(file, 'utf8')).map((table) => `${path.relative(SRC, file)}: ${table}`);

const app = walk(SRC).filter((f) => !f.startsWith(TEST_DIR + path.sep) && !isTest(f));

describe('no D1 read of the retired recipe corpus', () => {
	it('scans the app code (routes, hooks, src/lib/server, src/lib/admin, …)', () => {
		const rel = app.map((f) => path.relative(SRC, f).split(path.sep).join('/'));
		for (const expected of ['hooks.server.ts', 'routes/admin/+page.server.ts', 'routes/api/track/+server.ts', 'lib/admin/stats.ts', 'lib/admin/auth.ts', 'lib/server/data.ts']) {
			expect(rel).toContain(expected);
		}
	});

	it('finds no SQL naming a corpus table in the app code', () => {
		expect(app.flatMap(corpusRefs)).toEqual([]);
	});

	it('would find one: the D1 reference code names them', () => {
		expect(corpusRefs(path.join(TEST_DIR, 'sql', 'match.ts')).length).toBeGreaterThan(4);
		expect(corpusRefs(path.join(TEST_DIR, 'sql', 'search.ts')).join('\n')).toMatch(/recipe_title_fts/);
	});

	it('still lets the app name its runtime tables', () => {
		const runtime = (file) => tablesNamed(readFileSync(path.join(SRC, 'lib', 'admin', file), 'utf8'), { tables: RUNTIME_TABLES });
		expect(runtime('stats.ts')).toEqual(['page_view']);
		expect(runtime('auth.ts')).toEqual(expect.arrayContaining(['admin_otp', 'admin_session']));
	});

	it('keeps the D1 reference code out of the app: nothing outside the tests imports src/lib/test', () => {
		const imports = app.flatMap((f) =>
			[...readFileSync(f, 'utf8').matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)]
				.map((m) => m[1])
				.filter(
					(spec) =>
						spec.startsWith('$lib/test') ||
						(spec.startsWith('.') && path.resolve(path.dirname(f), spec).startsWith(TEST_DIR + path.sep))
				)
				.map((spec) => `${path.relative(SRC, f)}: ${spec}`)
		);
		expect(imports).toEqual([]);
	});
});
