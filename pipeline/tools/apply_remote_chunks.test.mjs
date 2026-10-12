import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyChunks } from './apply_remote_chunks.mjs';

let dir;
let used;
let sent;

function plan(writes, generated_at = '2026-10-12T00:00:00.000Z') {
	const chunks = writes.map((w, i) => ({ file: `${String(i + 1).padStart(3, '0')}.sql`, writes: w, statements: 1 }));
	for (const c of chunks) writeFileSync(path.join(dir, c.file), `-- ${c.file}\n`);
	writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ generated_at, chunks }));
}

const exec = (fail = {}) => (sql) => {
	const file = /-- (\d+\.sql)/.exec(sql)[1];
	if (fail[file]?.length) throw fail[file].shift();
	sent.push(file);
	used += Number(file.slice(0, 3)) * 10;
};

const run = (opts = {}) => applyChunks({ dir, exec: exec(opts.fail), used: () => used, budget: 1000, ...opts });

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), 'chunks-'));
	used = 0;
	sent = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('applyChunks', () => {
	it('applies every chunk in order and records each one', () => {
		plan([10, 20, 30]);
		expect(run()).toEqual({ applied: 3, remaining: 0, stopped: null });
		expect(sent).toEqual(['001.sql', '002.sql', '003.sql']);
		expect(JSON.parse(readFileSync(path.join(dir, 'applied.json'), 'utf8')).applied).toEqual(sent);
	});

	it('refuses to start when the plan exceeds what is left of today’s budget', () => {
		plan([400, 400]);
		used = 300;
		expect(run()).toMatchObject({ applied: 0, stopped: 'budget' });
		expect(sent).toEqual([]);
		expect(run({ paidPlan: true })).toMatchObject({ applied: 2, stopped: null });
	});

	it('stops before a chunk that would cross the budget once real usage runs over the estimate', () => {
		plan([100, 100, 100]);
		const result = applyChunks({ dir, exec: (sql) => (exec()(sql), (used += 450)), used: () => used, budget: 1000 });
		expect(result).toEqual({ applied: 2, remaining: 1, stopped: 'budget' });
	});

	it('resumes at the first uncommitted chunk after a failure, never resending a committed one', () => {
		plan([10, 10, 10]);
		expect(run({ fail: { '002.sql': [new Error('SQLITE_CONSTRAINT')] } })).toEqual({ applied: 1, remaining: 2, stopped: 'error' });
		expect(run()).toEqual({ applied: 2, remaining: 0, stopped: null });
		expect(sent).toEqual(['001.sql', '002.sql', '003.sql']);
	});

	it('retries once on the transient 7403 error', () => {
		plan([10]);
		const err = Object.assign(new Error('Command failed'), { stderr: 'code: 7403 The given account is not valid' });
		expect(run({ fail: { '001.sql': [err] } })).toMatchObject({ applied: 1, stopped: null });
		expect(run({ fail: {} })).toMatchObject({ applied: 0, stopped: null });
	});

	it('will not mix progress from another generation', () => {
		plan([10], 'a');
		run();
		plan([10], 'b');
		expect(() => run()).toThrow(/another generation/);
	});

	it('dry run touches nothing', () => {
		plan([10]);
		expect(run({ dryRun: true })).toMatchObject({ applied: 0, remaining: 1 });
		expect(existsSync(path.join(dir, 'applied.json'))).toBe(false);
	});
});
