// /admin OTP budgets, binding and single use against SQLite with every
// migration applied: the limits live in SQL, so a spy cannot check them.
// `.mjs` for node:sqlite.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import {
	OTP_MAX_ATTEMPTS,
	OTP_MAX_FAILURES_PER_DAY,
	OTP_MAX_FAILURES_PER_DAY_GLOBAL,
	OTP_MAX_PER_DAY,
	OTP_MAX_PER_DAY_PER_EMAIL,
	OTP_MAX_PER_HOUR,
	createSession,
	issueOtp,
	pruneExpired,
	readSession,
	sha256Hex,
	verifyOtp
} from './auth';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
const ADMIN = 'admin@example.com';

let sqlite;
let writes = 0;

function d1(lite) {
	const statement = (sql, binds = []) => ({
		bind: (...b) => statement(sql, b),
		first: async () => {
			const before = lite.prepare('SELECT total_changes() AS n').get().n;
			const row = lite.prepare(sql).get(...binds) ?? null;
			writes += lite.prepare('SELECT total_changes() AS n').get().n - before;
			return row;
		},
		run: async () => {
			const r = lite.prepare(sql).run(...binds);
			writes += Number(r.changes);
			return { success: true, meta: { changes: Number(r.changes) } };
		},
		all: async () => ({ results: lite.prepare(sql).all(...binds) })
	});
	return {
		prepare: (sql) => statement(sql),
		batch: async (stmts) => Promise.all(stmts.map((s) => s.run()))
	};
}

let db;
let seq = 0;
const binding = async (label = `browser-${++seq}`) => sha256Hex(label);
const ip = (n) => `ip-hash-${n}`;

/** Shifts every row back in time, so windows can be crossed without waiting. */
const age = (sql) =>
	sqlite.exec(
		`UPDATE admin_otp SET created_at = datetime(created_at, '${sql}'), expires_at = datetime(expires_at, '${sql}')`
	);

beforeAll(() => {
	sqlite = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort())
		sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
	db = d1(sqlite);
});

beforeEach(() => {
	sqlite.exec('DELETE FROM admin_otp; DELETE FROM admin_session;');
	writes = 0;
});

async function issue(email = ADMIN, ipHash = ip(1), code = '123456') {
	const bindingHash = await binding();
	const issued = await issueOtp(db, email, code, { bindingHash, ipHash });
	return { issued, bindingHash };
}

describe('issueOtp budgets', () => {
	it('issues one code, then holds the same IP to the cooldown', async () => {
		expect((await issue()).issued).toBe(true);
		expect((await issue()).issued).toBe(false);
		// Another source is not held back by the first one's cooldown.
		expect((await issue(ADMIN, ip(2))).issued).toBe(true);
	});

	it('caps one IP per hour and per day without touching another IP', async () => {
		for (let i = 0; i < OTP_MAX_PER_HOUR; i++) {
			expect((await issue()).issued).toBe(true);
			age('-61 seconds');
		}
		expect((await issue()).issued).toBe(false);

		age('-61 minutes');
		for (let i = OTP_MAX_PER_HOUR; i < OTP_MAX_PER_DAY; i++) {
			expect((await issue()).issued).toBe(true);
			age('-61 seconds');
		}
		age('-61 minutes');
		expect((await issue()).issued).toBe(false);

		// A stranger exhausting their own budget cannot stop the admin's request.
		expect((await issue(ADMIN, ip(2))).issued).toBe(true);
	});

	it('caps an address across all IPs per day, and the window rolls over', async () => {
		for (let i = 0; i < OTP_MAX_PER_DAY_PER_EMAIL; i++) {
			expect((await issue(ADMIN, ip(100 + i))).issued).toBe(true);
		}
		expect((await issue(ADMIN, ip(999))).issued).toBe(false);
		// Other addresses keep their own budget.
		expect((await issue('second@example.com', ip(999))).issued).toBe(true);

		age('-1 day');
		age('-1 minute');
		expect((await issue(ADMIN, ip(999))).issued).toBe(true);
	});

	it('writes nothing when it refuses', async () => {
		await issue();
		writes = 0;
		await issue();
		expect(writes).toBe(0);
	});
});

describe('verifyOtp', () => {
	it('accepts the right code once, bound to the browser that asked for it', async () => {
		const { bindingHash } = await issue();
		expect(await verifyOtp(db, ADMIN, '123456', await binding('someone-else'))).toBe(false);
		expect(await verifyOtp(db, ADMIN, '123456', bindingHash)).toBe(true);
		expect(await verifyOtp(db, ADMIN, '123456', bindingHash)).toBe(false);
	});

	it("does not let a stranger's request or guesses cancel the admin's code", async () => {
		const admin = await issue(ADMIN, ip(1), '111111');
		const stranger = await issue(ADMIN, ip(2), '222222');
		for (let i = 0; i < OTP_MAX_ATTEMPTS + 2; i++) {
			expect(await verifyOtp(db, ADMIN, '000000', stranger.bindingHash)).toBe(false);
		}
		expect(await verifyOtp(db, ADMIN, '111111', admin.bindingHash)).toBe(true);
	});

	it('stops accepting even the right code after the attempt ceiling', async () => {
		const { bindingHash } = await issue();
		for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
			expect(await verifyOtp(db, ADMIN, '000000', bindingHash)).toBe(false);
		}
		expect(await verifyOtp(db, ADMIN, '123456', bindingHash)).toBe(false);
		expect(sqlite.prepare('SELECT attempts FROM admin_otp').get().attempts).toBe(OTP_MAX_ATTEMPTS);
	});

	it('never counts more attempts than the ceiling under parallel guesses', async () => {
		const { bindingHash } = await issue();
		await Promise.all(
			Array.from({ length: OTP_MAX_ATTEMPTS * 3 }, () => verifyOtp(db, ADMIN, '000000', bindingHash))
		);
		expect(sqlite.prepare('SELECT attempts FROM admin_otp').get().attempts).toBe(OTP_MAX_ATTEMPTS);
	});

	it('does not count a success as a failure', async () => {
		const { bindingHash } = await issue();
		await verifyOtp(db, ADMIN, '000000', bindingHash);
		await verifyOtp(db, ADMIN, '123456', bindingHash);
		expect(sqlite.prepare('SELECT attempts FROM admin_otp').get().attempts).toBe(1);
	});

	it('refuses an expired code', async () => {
		const { bindingHash } = await issue();
		age('-11 minutes');
		expect(await verifyOtp(db, ADMIN, '123456', bindingHash)).toBe(false);
	});

	it('writes nothing for an address that has no code', async () => {
		expect(await verifyOtp(db, 'stranger@example.com', '123456', await binding())).toBe(false);
		expect(writes).toBe(0);
	});

	it('stops at the daily failure cap per address, which one IP cannot reach alone', async () => {
		// One IP's whole daily issuance, every attempt wrong.
		for (let i = 0; i < OTP_MAX_PER_DAY; i++) {
			const { bindingHash } = await issue(ADMIN, ip(1), '999999');
			for (let a = 0; a < OTP_MAX_ATTEMPTS; a++) await verifyOtp(db, ADMIN, '000000', bindingHash);
			age('-61 minutes');
		}
		expect(OTP_MAX_PER_DAY * OTP_MAX_ATTEMPTS).toBeLessThan(OTP_MAX_FAILURES_PER_DAY);
		const admin = await issue(ADMIN, ip(2));
		expect(await verifyOtp(db, ADMIN, '123456', admin.bindingHash)).toBe(true);

		// Past the cap, even the right code is refused until the window rolls.
		sqlite.exec(`UPDATE admin_otp SET attempts = ${OTP_MAX_FAILURES_PER_DAY} WHERE id = (SELECT MIN(id) FROM admin_otp)`);
		const late = await issue(ADMIN, ip(3));
		expect(await verifyOtp(db, ADMIN, '123456', late.bindingHash)).toBe(false);
	});

	it('stops at the global daily failure cap across addresses', async () => {
		const other = await issue('other@example.com', ip(1), '999999');
		sqlite
			.prepare('UPDATE admin_otp SET attempts = ? WHERE binding_hash = ?')
			.run(OTP_MAX_FAILURES_PER_DAY_GLOBAL, other.bindingHash);
		const { bindingHash } = await issue(ADMIN, ip(2));
		expect(await verifyOtp(db, ADMIN, '123456', bindingHash)).toBe(false);
	});

	it('ignores rows from before codes were bound to a browser', async () => {
		sqlite
			.prepare(
				`INSERT INTO admin_otp (email, code_hash, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))`
			)
			.run(ADMIN, await sha256Hex('123456'));
		expect(await verifyOtp(db, ADMIN, '123456', await sha256Hex(''))).toBe(false);
	});
});

describe('readSession', () => {
	it('honours the allowlist as it is now, not as it was at sign-in', async () => {
		await createSession(db, ADMIN, 'token');
		expect(await readSession(db, 'token', [ADMIN])).toBe(ADMIN);
		expect(await readSession(db, 'token', ['someone@example.com'])).toBeNull();
		expect(await readSession(db, 'wrong', [ADMIN])).toBeNull();
	});
});

describe('pruneExpired', () => {
	it('drops codes older than the daily window, which resets the budgets', async () => {
		await issue();
		age('-25 hours');
		await pruneExpired(db);
		expect(sqlite.prepare('SELECT COUNT(*) AS n FROM admin_otp').get().n).toBe(0);
	});
});
