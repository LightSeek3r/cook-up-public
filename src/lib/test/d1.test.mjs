// `.mjs` for node:sqlite.
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1, assertD1Binds, D1_MAX_BOUND_PARAMS } from './d1';

const params = (n) => Array.from({ length: n }, (_, k) => k);
const sql = (n) => `SELECT ${params(n).map(() => '?').join(' + ')} AS total`;

describe('the shared D1 test adapter', () => {
	const db = sqliteD1(new DatabaseSync(':memory:'));

	it('allows exactly D1\'s 100 bound parameters', async () => {
		expect(D1_MAX_BOUND_PARAMS).toBe(100);
		const row = await db.prepare(sql(100)).bind(...params(100)).first();
		expect(row.total).toBe(4950);
	});

	it('fails a statement binding 101, as D1 does and SQLite does not', async () => {
		await expect(db.prepare(sql(101)).bind(...params(101)).all()).rejects.toThrow(/too many SQL variables/);
		await expect(db.prepare(sql(101)).bind(...params(101)).first()).rejects.toThrow(/too many SQL variables/);
		await expect(db.prepare(sql(101)).bind(...params(101)).run()).rejects.toThrow(/too many SQL variables/);
		expect(() => assertD1Binds(params(101))).toThrow();
	});

	it('runs a statement with no bind() call', async () => {
		expect(await db.prepare('SELECT 1 AS one').all()).toEqual({ results: [{ one: 1 }] });
		expect(await db.prepare('SELECT 1 WHERE 0').first()).toBeNull();
	});
});
