import { describe, it, expect } from 'vitest';
import { esc, checkBudget, addUsage, commandUsage, D1BudgetExceeded, D1_READ_BUDGET, D1_WRITE_BUDGET } from './d1.mjs';

describe('esc', () => {
	it('quotes strings and doubles embedded single quotes', () => {
		expect(esc("O'Brien")).toBe("'O''Brien'");
	});

	it('passes numbers through unquoted', () => {
		expect(esc(42)).toBe('42');
	});

	it('maps null/undefined to SQL NULL', () => {
		expect(esc(null)).toBe('NULL');
		expect(esc(undefined)).toBe('NULL');
	});
});

describe('commandUsage', () => {
	it('sums every statement of a multi-statement command, not just the first', () => {
		const parsed = [
			{ results: [], meta: { rows_read: 3, rows_written: 0 } },
			{ results: [], meta: { rows_read: 10, rows_written: 400 } },
			{ results: [], meta: {} }
		];
		expect(commandUsage(parsed)).toEqual({ rows_read: 13, rows_written: 400 });
	});
});

describe('addUsage', () => {
	it('adds usage on top of an existing ledger without mutating it', () => {
		const ledger = { rows_read: 100, rows_written: 5 };
		const next = addUsage(ledger, { rows_read: 20, rows_written: 3 });
		expect(next).toEqual({ rows_read: 120, rows_written: 8 });
		expect(ledger).toEqual({ rows_read: 100, rows_written: 5 }); // unchanged
	});

	it('treats a missing field as zero', () => {
		expect(addUsage({ rows_read: 10, rows_written: 0 }, { rows_read: 5 })).toEqual({
			rows_read: 15,
			rows_written: 0
		});
	});
});

// Pins the real incident this guard exists to prevent: the D1 free-tier daily
// read quota was exhausted twice in one week. The user's explicit ceiling is
// 80% of each cap, not 100% — checkBudget must trip at that threshold, before
// the real 5,000,000 / 100,000 caps are ever reached.
describe('checkBudget', () => {
	it('allows a ledger comfortably under both budgets', () => {
		expect(() => checkBudget({ rows_read: 1000, rows_written: 10 })).not.toThrow();
	});

	it('throws once reads reach 80% of the read cap', () => {
		expect(() => checkBudget({ rows_read: D1_READ_BUDGET, rows_written: 0 })).toThrow(D1BudgetExceeded);
	});

	it('throws once writes reach 80% of the write cap', () => {
		expect(() => checkBudget({ rows_read: 0, rows_written: D1_WRITE_BUDGET })).toThrow(D1BudgetExceeded);
	});

	it('does not throw one row below either budget', () => {
		expect(() =>
			checkBudget({ rows_read: D1_READ_BUDGET - 1, rows_written: D1_WRITE_BUDGET - 1 })
		).not.toThrow();
	});

	it('never lets the budget reach the real 100% cap', () => {
		expect(D1_READ_BUDGET).toBeLessThan(5_000_000);
		expect(D1_WRITE_BUDGET).toBeLessThan(100_000);
	});
});
