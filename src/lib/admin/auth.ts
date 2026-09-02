import type { D1Database } from '@cloudflare/workers-types';

/**
 * OTP + session primitives for /admin.
 *
 * State lives in D1 rather than KV so there is no new binding to provision and
 * so every branch here is testable against the same spy harness the rest of
 * `src/lib` uses. Nothing reversible is ever written: the table holds SHA-256
 * hashes, and the only copies of the real code and the real session token are
 * the one in the email and the one in the cookie.
 */

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_MAX_PER_HOUR = 5;
export const SESSION_TTL_DAYS = 7;
export const SESSION_COOKIE = 'cookup_admin';

/**
 * A uniformly distributed six-digit code.
 *
 * The obvious `getRandomValues(...) % 1e6` is biased: 2^32 is not a multiple of
 * 10^6, so the low ~4,967,296 values of the range make codes 000000-967295
 * fractionally likelier than the rest. Rejection sampling discards the short
 * tail instead, at the cost of one extra draw roughly once every 3,700 calls.
 */
const OTP_CEILING = Math.floor(0x100000000 / 1_000_000) * 1_000_000;

export function generateOtp(draw: () => number = drawUint32): string {
	let n = draw();
	while (n >= OTP_CEILING) n = draw();
	return String(n % 1_000_000).padStart(6, '0');
}

function drawUint32(): number {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return buf[0];
}

/** 256 bits of entropy, hex-encoded. This is the raw cookie value. */
export function generateSessionToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return hex(bytes);
}

const hex = (bytes: Uint8Array) =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return hex(new Uint8Array(digest));
}

/**
 * Comparison whose running time does not depend on how many leading characters
 * match. Both operands here are SHA-256 hex, so the length check can never be
 * the branch that leaks — it is a guard, not a shortcut.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export const normaliseEmail = (raw: string) => raw.trim().toLowerCase();

/** `ADMIN_EMAILS` is a comma-separated secret, so it is parsed, not trusted. */
export function parseAllowlist(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map(normaliseEmail)
		.filter(Boolean);
}

export const isAllowed = (email: string, allowlist: string[]) =>
	allowlist.includes(normaliseEmail(email));

export type RateVerdict = 'ok' | 'cooldown' | 'hourly';

/**
 * Throttles code issuance. The allowlist already stops an attacker logging in,
 * but without this anyone who knows the address can use the endpoint to flood
 * that inbox — the request is unauthenticated by necessity.
 */
export async function checkRate(db: D1Database, email: string): Promise<RateVerdict> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS hourly,
              MAX(CASE WHEN created_at > datetime('now', ?) THEN 1 ELSE 0 END) AS recent
       FROM admin_otp
       WHERE email = ? AND created_at > datetime('now', '-1 hour')`
		)
		.bind(`-${OTP_COOLDOWN_SECONDS} seconds`, normaliseEmail(email))
		.first<{ hourly: number; recent: number | null }>();

	if (row?.recent) return 'cooldown';
	if ((row?.hourly ?? 0) >= OTP_MAX_PER_HOUR) return 'hourly';
	return 'ok';
}

/**
 * Stores a new code, burning any earlier live one for the same address so a
 * second "send me a code" click cannot leave two valid codes in flight.
 */
export async function issueOtp(db: D1Database, email: string, code: string): Promise<void> {
	const addr = normaliseEmail(email);
	await db
		.prepare(
			`UPDATE admin_otp SET consumed_at = datetime('now')
       WHERE email = ? AND consumed_at IS NULL`
		)
		.bind(addr)
		.run();

	await db
		.prepare(
			`INSERT INTO admin_otp (email, code_hash, expires_at)
       VALUES (?, ?, datetime('now', ?))`
		)
		.bind(addr, await sha256Hex(code), `+${OTP_TTL_MINUTES} minutes`)
		.run();
}

export type VerifyResult = 'ok' | 'invalid' | 'expired' | 'locked';

export async function verifyOtp(
	db: D1Database,
	email: string,
	code: string
): Promise<VerifyResult> {
	const addr = normaliseEmail(email);
	const row = await db
		.prepare(
			`SELECT id, code_hash, attempts
       FROM admin_otp
       WHERE email = ? AND consumed_at IS NULL AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
		)
		.bind(addr)
		.first<{ id: number; code_hash: string; attempts: number }>();

	if (!row) return 'expired';
	if (row.attempts >= OTP_MAX_ATTEMPTS) {
		await consume(db, row.id);
		return 'locked';
	}

	if (!timingSafeEqual(row.code_hash, await sha256Hex(code))) {
		const attempts = row.attempts + 1;
		await db
			.prepare(
				`UPDATE admin_otp
         SET attempts = ?, consumed_at = CASE WHEN ? >= ? THEN datetime('now') ELSE NULL END
         WHERE id = ?`
			)
			.bind(attempts, attempts, OTP_MAX_ATTEMPTS, row.id)
			.run();
		return attempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid';
	}

	await consume(db, row.id);
	return 'ok';
}

const consume = (db: D1Database, id: number) =>
	db.prepare(`UPDATE admin_otp SET consumed_at = datetime('now') WHERE id = ?`).bind(id).run();

export async function createSession(db: D1Database, email: string, token: string): Promise<void> {
	await db
		.prepare(
			`INSERT INTO admin_session (token_hash, email, expires_at)
       VALUES (?, ?, datetime('now', ?))`
		)
		.bind(await sha256Hex(token), normaliseEmail(email), `+${SESSION_TTL_DAYS} days`)
		.run();
}

export async function readSession(db: D1Database, token: string | undefined): Promise<string | null> {
	if (!token) return null;
	const row = await db
		.prepare(
			`SELECT email FROM admin_session
       WHERE token_hash = ? AND expires_at > datetime('now')`
		)
		.bind(await sha256Hex(token))
		.first<{ email: string }>();
	return row?.email ?? null;
}

export async function destroySession(db: D1Database, token: string | undefined): Promise<void> {
	if (!token) return;
	await db
		.prepare(`DELETE FROM admin_session WHERE token_hash = ?`)
		.bind(await sha256Hex(token))
		.run();
}

/** Swept on code issuance rather than on a cron, which D1 has no equivalent of. */
export async function pruneExpired(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(`DELETE FROM admin_session WHERE expires_at <= datetime('now')`),
		db.prepare(`DELETE FROM admin_otp WHERE created_at <= datetime('now', '-1 day')`)
	]);
}
