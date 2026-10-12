import { describe, it, expect } from 'vitest';
import {
	OTP_MAX_ATTEMPTS,
	generateOtp,
	hashClientIp,
	isAllowed,
	issueOtp,
	normaliseEmail,
	parseAllowlist,
	readSession,
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

// Budgets, binding and single use are exercised against real SQLite in
// auth.sqlite.test.mjs; these only pin what reaches D1.
describe('issueOtp', () => {
	it('stores digests only, never the code, nonce or IP', async () => {
		const { db, calls } = spyDb([{ id: 1 }]);
		const issued = await issueOtp(db, 'Admin@Example.com', '123456', {
			bindingHash: await sha256Hex('nonce'),
			ipHash: await hashClientIp('203.0.113.7', 'secret')
		});

		expect(issued).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].sql).toContain('INSERT INTO admin_otp');
		expect(calls[0].binds[0]).toBe('admin@example.com');
		expect(calls[0].binds[1]).toBe(await sha256Hex('123456'));
		for (const raw of ['123456', 'nonce', '203.0.113.7', 'secret']) {
			expect(calls[0].binds).not.toContain(raw);
		}
	});

	it('reports a refused insert so no email goes out for it', async () => {
		const { db } = spyDb([null]);
		const binding = { bindingHash: 'b', ipHash: 'i' };
		expect(await issueOtp(db, 'a@b.co', '123456', binding)).toBe(false);
	});
});

describe('verifyOtp', () => {
	const claimed = async () => ({ id: 1, code_hash: await sha256Hex('123456') });

	it('accepts the right code and consumes it so it cannot be replayed', async () => {
		const { db, calls } = spyDb([await claimed(), { id: 1 }]);
		expect(await verifyOtp(db, 'a@b.co', '123456', 'binding')).toBe(true);
		expect(calls).toHaveLength(2);
		expect(calls[1].sql).toContain("consumed_at = datetime('now')");
		expect(calls[1].sql).toContain('consumed_at IS NULL');
	});

	it('rejects a wrong code with one statement and no second write', async () => {
		const { db, calls } = spyDb([await claimed()]);
		expect(await verifyOtp(db, 'a@b.co', '000000', 'binding')).toBe(false);
		expect(calls).toHaveLength(1);
	});

	it('takes the same single round trip when there is nothing to claim', async () => {
		const { db, calls } = spyDb([null]);
		expect(await verifyOtp(db, 'stranger@example.com', '123456', 'binding')).toBe(false);
		expect(calls).toHaveLength(1);
		expect(calls[0].sql).toContain('binding_hash = ?');
		expect(calls[0].sql).toContain('consumed_at IS NULL');
		expect(calls[0].sql).toContain("expires_at > datetime('now')");
		expect(calls[0].binds).toContain(OTP_MAX_ATTEMPTS);
	});

	it('loses a race for the same code rather than consuming it twice', async () => {
		const { db } = spyDb([await claimed(), null]);
		expect(await verifyOtp(db, 'a@b.co', '123456', 'binding')).toBe(false);
	});
});

describe('readSession', () => {
	it('skips the query when there is no token or no allowlist', async () => {
		const { db, calls } = spyDb();
		expect(await readSession(db, undefined, ['a@b.co'])).toBeNull();
		expect(await readSession(db, 'token', [])).toBeNull();
		expect(calls).toHaveLength(0);
	});

	it('drops a live session whose address left the allowlist', async () => {
		const { db } = spyDb([{ email: 'gone@example.com' }, { email: 'kept@example.com' }]);
		expect(await readSession(db, 'token', ['kept@example.com'])).toBeNull();
		expect(await readSession(db, 'token', ['kept@example.com'])).toBe('kept@example.com');
	});
});

describe('hashClientIp', () => {
	it('depends on the secret, so the IPv4 space cannot be enumerated against it', async () => {
		const a = await hashClientIp('203.0.113.7', 'one');
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toBe(await hashClientIp('203.0.113.7', 'two'));
		expect(a).not.toBe(await sha256Hex('203.0.113.7'));
	});
});
