import { describe, it, expect } from 'vitest';
import {
	OTP_MAX_ATTEMPTS,
	generateOtp,
	isAllowed,
	issueOtp,
	normaliseEmail,
	parseAllowlist,
	sha256Hex,
	timingSafeEqual,
	verifyOtp
} from './auth';
import type { D1Database } from '@cloudflare/workers-types';

/** Serves queued `first()` rows and records every statement. */
function spyDb(rows: unknown[] = []) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	const queue = [...rows];
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					return {
						first: async () => queue.shift() ?? null,
						run: async () => ({ success: true }),
						all: async () => ({ results: [] })
					};
				}
			};
		}
	} as unknown as D1Database;
	return { db, calls };
}

describe('generateOtp', () => {
	it('is always six digits, zero-padded', () => {
		expect(generateOtp(() => 0)).toBe('000000');
		expect(generateOtp(() => 42)).toBe('000042');
		expect(generateOtp(() => 999_999)).toBe('999999');
	});

	it('rejects draws in the biased tail instead of folding them in', () => {
		// 4_294_000_000 is the first value that would bias the modulo, so it must
		// be discarded and the next draw used.
		const draws = [4_294_000_000, 123_456];
		expect(generateOtp(() => draws.shift()!)).toBe('123456');
		expect(draws).toHaveLength(0);
	});
});

describe('sha256Hex', () => {
	it('matches the known digest of the empty string', async () => {
		expect(await sha256Hex('')).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
	});

	it('produces 64 hex characters and never echoes the input', async () => {
		const digest = await sha256Hex('123456');
		expect(digest).toMatch(/^[0-9a-f]{64}$/);
		expect(digest).not.toContain('123456');
	});
});

describe('timingSafeEqual', () => {
	it('is true only for an exact match', () => {
		expect(timingSafeEqual('abc', 'abc')).toBe(true);
		expect(timingSafeEqual('abc', 'abd')).toBe(false);
		expect(timingSafeEqual('abc', 'ab')).toBe(false);
		expect(timingSafeEqual('', '')).toBe(true);
	});
});

describe('allowlist', () => {
	it('normalises case and whitespace on both sides', () => {
		const list = parseAllowlist(' Admin@Example.com , second@example.com ');
		expect(list).toEqual(['admin@example.com', 'second@example.com']);
		expect(isAllowed('ADMIN@example.com ', list)).toBe(true);
		expect(isAllowed('other@example.com', list)).toBe(false);
	});

	it('treats a missing secret as an empty allowlist, not as open access', () => {
		expect(parseAllowlist(undefined)).toEqual([]);
		expect(isAllowed('anyone@example.com', parseAllowlist(undefined))).toBe(false);
		expect(parseAllowlist(',, ,')).toEqual([]);
	});

	it('lowercases addresses consistently', () => {
		expect(normaliseEmail('  Foo@BAR.com ')).toBe('foo@bar.com');
	});
});

describe('issueOtp', () => {
	it('burns any earlier live code before inserting the new one', async () => {
		const { db, calls } = spyDb();
		await issueOtp(db, 'Admin@Example.com', '123456');

		expect(calls).toHaveLength(2);
		expect(calls[0].sql).toContain('UPDATE admin_otp SET consumed_at');
		expect(calls[0].binds).toEqual(['admin@example.com']);
		expect(calls[1].sql).toContain('INSERT INTO admin_otp');
		// The code is hashed, never stored.
		expect(calls[1].binds[1]).toBe(await sha256Hex('123456'));
		expect(calls[1].binds).not.toContain('123456');
	});
});

describe('verifyOtp', () => {
	const row = async (over: Partial<{ id: number; code_hash: string; attempts: number }> = {}) => ({
		id: 1,
		code_hash: await sha256Hex('123456'),
		attempts: 0,
		...over
	});

	it('accepts the right code and consumes it so it cannot be replayed', async () => {
		const { db, calls } = spyDb([await row()]);
		expect(await verifyOtp(db, 'a@b.co', '123456')).toBe('ok');
		expect(calls.at(-1)!.sql).toContain('UPDATE admin_otp SET consumed_at');
	});

	it('reports expired when no live code exists, revealing nothing about the allowlist', async () => {
		const { db } = spyDb([null]);
		expect(await verifyOtp(db, 'stranger@example.com', '123456')).toBe('expired');
	});

	it('counts a wrong code as an attempt', async () => {
		const { db, calls } = spyDb([await row()]);
		expect(await verifyOtp(db, 'a@b.co', '000000')).toBe('invalid');
		expect(calls.at(-1)!.binds[0]).toBe(1);
	});

	it('locks out on the final attempt rather than allowing unlimited guesses', async () => {
		const { db } = spyDb([await row({ attempts: OTP_MAX_ATTEMPTS - 1 })]);
		expect(await verifyOtp(db, 'a@b.co', '000000')).toBe('locked');
	});

	it('refuses a code that is already at the attempt ceiling', async () => {
		const { db, calls } = spyDb([await row({ attempts: OTP_MAX_ATTEMPTS })]);
		expect(await verifyOtp(db, 'a@b.co', '123456')).toBe('locked');
		expect(calls.at(-1)!.sql).toContain('consumed_at');
	});

	it('only ever looks at unconsumed, unexpired rows', async () => {
		const { db, calls } = spyDb([null]);
		await verifyOtp(db, 'a@b.co', '123456');
		expect(calls[0].sql).toContain('consumed_at IS NULL');
		expect(calls[0].sql).toContain("expires_at > datetime('now')");
	});
});
