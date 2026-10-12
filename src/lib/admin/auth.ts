import type { D1Database } from '@cloudflare/workers-types';

/**
 * OTP + session primitives for /admin.
 *
 * State lives in D1 rather than KV so there is no new binding to provision and
 * so every branch here is testable against the same spy harness the rest of
 * `src/lib` uses. Nothing reversible is ever written: the table holds SHA-256
 * hashes, and the only copies of the real code and the real session token are
 * the one in the email and the one in the cookie.
 *
 * Threat model for the limits below: anyone may know the admin's address. Each
 * code is bound to the browser that asked for it (a random nonce in a cookie),
 * so a stranger's guesses only ever land on codes the stranger requested, and
 * a stranger's request no longer burns the admin's live code. The per-IP
 * budgets are what one source can spend; the per-address and global budgets
 * cap the brute-force ceiling (at most OTP_MAX_FAILURES_PER_DAY guesses a day,
 * against one-in-a-million odds each) and the inbox flood. Only an attacker
 * spending several IPs' worth of budget can reach those, and then only until
 * the 24-hour window rolls over.
 */

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Issuance, per address and client IP. */
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_PER_DAY = 8;
/** Issuance, per address across all IPs: the inbox ceiling. */
export const OTP_MAX_PER_DAY_PER_EMAIL = 20;
/**
 * Failed verifications per address per day. Above one IP's whole budget
 * (OTP_MAX_PER_DAY * OTP_MAX_ATTEMPTS = 40), so a single source cannot use it
 * to lock the admin out.
 */
export const OTP_MAX_FAILURES_PER_DAY = 50;
export const OTP_MAX_FAILURES_PER_DAY_GLOBAL = 100;
export const SESSION_TTL_DAYS = 7;
export const SESSION_COOKIE = 'cookup_admin';
/** Holds the nonce a pending code is bound to. */
export const PENDING_COOKIE = 'cookup_admin_pending';

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

/** 256 bits of entropy, hex-encoded. Used for the session cookie and the pending-code nonce. */
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
 * The IPv4 space is small enough to enumerate, so a bare SHA-256 of an address
 * is reversible. Mixing in a Worker secret keeps the stored value opaque to
 * anyone who can read the table but not the secrets.
 */
export const hashClientIp = (ip: string, secret: string) =>
	sha256Hex(`admin-otp-ip\u0000${secret}\u0000${ip}`);

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

export interface IssueBinding {
	/** SHA-256 of the nonce in the requesting browser's PENDING_COOKIE. */
	bindingHash: string;
	ipHash: string;
}

/**
 * Stores a new code if every issuance budget allows it, and reports whether it
 * did; only then may the caller send the email. The budget check and the
 * insert are one statement, so concurrent requests cannot both squeeze under
 * a limit. Earlier codes are not burned: they are bound to a nonce the browser
 * no longer holds, and burning them was what let a stranger's request cancel
 * the admin's code.
 */
export async function issueOtp(
	db: D1Database,
	email: string,
	code: string,
	{ bindingHash, ipHash }: IssueBinding
): Promise<boolean> {
	const addr = normaliseEmail(email);
	const row = await db
		.prepare(
			`INSERT INTO admin_otp (email, code_hash, expires_at, binding_hash, ip_hash)
       SELECT ?, ?, datetime('now', ?), ?, ?
       FROM (
         SELECT COUNT(*) AS day_email,
                COALESCE(SUM(ip_hash = ?), 0) AS day_ip,
                COALESCE(SUM(ip_hash = ? AND created_at > datetime('now', '-1 hour')), 0) AS hour_ip,
                COALESCE(SUM(ip_hash = ? AND created_at > datetime('now', ?)), 0) AS recent_ip
         FROM admin_otp
         WHERE email = ? AND created_at > datetime('now', '-1 day')
       ) AS budget
       WHERE budget.recent_ip = 0 AND budget.hour_ip < ? AND budget.day_ip < ? AND budget.day_email < ?
       RETURNING id`
		)
		.bind(
			addr,
			await sha256Hex(code),
			`+${OTP_TTL_MINUTES} minutes`,
			bindingHash,
			ipHash,
			ipHash,
			ipHash,
			ipHash,
			`-${OTP_COOLDOWN_SECONDS} seconds`,
			addr,
			OTP_MAX_PER_HOUR,
			OTP_MAX_PER_DAY,
			OTP_MAX_PER_DAY_PER_EMAIL
		)
		.first<{ id: number }>();
	return row !== null;
}

/**
 * True only for the right code, on a live code bound to this browser's nonce,
 * within every attempt budget. Every other outcome — no such address, no code,
 * expired, already used, wrong code, too many attempts, daily cap reached — is
 * the same `false`, because any distinction would tell a stranger which
 * addresses are on the allowlist.
 *
 * The first statement claims an attempt atomically, so parallel guesses each
 * take a distinct slot and can never exceed OTP_MAX_ATTEMPTS between them. It
 * also runs, and matches nothing, for an address with no rows, which keeps the
 * unknown-address path the same single round trip as a wrong guess.
 */
export async function verifyOtp(
	db: D1Database,
	email: string,
	code: string,
	bindingHash: string
): Promise<boolean> {
	const addr = normaliseEmail(email);
	const claimed = await db
		.prepare(
			`UPDATE admin_otp SET attempts = attempts + 1
       WHERE id = (
           SELECT id FROM admin_otp
           WHERE email = ? AND binding_hash = ?
             AND consumed_at IS NULL AND expires_at > datetime('now')
           ORDER BY id DESC LIMIT 1
         )
         AND attempts < ?
         AND (SELECT COALESCE(SUM(attempts), 0) FROM admin_otp
              WHERE email = ? AND created_at > datetime('now', '-1 day')) < ?
         AND (SELECT COALESCE(SUM(attempts), 0) FROM admin_otp
              WHERE created_at > datetime('now', '-1 day')) < ?
       RETURNING id, code_hash`
		)
		.bind(
			addr,
			bindingHash,
			OTP_MAX_ATTEMPTS,
			addr,
			OTP_MAX_FAILURES_PER_DAY,
			OTP_MAX_FAILURES_PER_DAY_GLOBAL
		)
		.first<{ id: number; code_hash: string }>();

	const guess = await sha256Hex(code);
	if (!claimed || !timingSafeEqual(claimed.code_hash, guess)) return false;

	// A success is not a failure, so the claimed attempt is handed back; the
	// `consumed_at IS NULL` guard is what makes the code single-use even when
	// the right code is submitted twice at once.
	const consumed = await db
		.prepare(
			`UPDATE admin_otp SET consumed_at = datetime('now'), attempts = attempts - 1
       WHERE id = ? AND consumed_at IS NULL
       RETURNING id`
		)
		.bind(claimed.id)
		.first<{ id: number }>();
	return consumed !== null;
}

export async function createSession(db: D1Database, email: string, token: string): Promise<void> {
	await db
		.prepare(
			`INSERT INTO admin_session (token_hash, email, expires_at)
       VALUES (?, ?, datetime('now', ?))`
		)
		.bind(await sha256Hex(token), normaliseEmail(email), `+${SESSION_TTL_DAYS} days`)
		.run();
}

/**
 * The session's address is checked against the allowlist as it is *now*, so
 * removing an address from ADMIN_EMAILS revokes its sessions on the next
 * request instead of when they expire.
 */
export async function readSession(
	db: D1Database,
	token: string | undefined,
	allowlist: string[]
): Promise<string | null> {
	if (!token || allowlist.length === 0) return null;
	const row = await db
		.prepare(
			`SELECT email FROM admin_session
       WHERE token_hash = ? AND expires_at > datetime('now')`
		)
		.bind(await sha256Hex(token))
		.first<{ email: string }>();
	return row && isAllowed(row.email, allowlist) ? row.email : null;
}

export async function destroySession(db: D1Database, token: string | undefined): Promise<void> {
	if (!token) return;
	await db
		.prepare(`DELETE FROM admin_session WHERE token_hash = ?`)
		.bind(await sha256Hex(token))
		.run();
}

/**
 * Swept on code issuance rather than on a cron, which D1 has no equivalent of.
 * The one-day horizon doubles as the window of every daily budget above.
 */
export async function pruneExpired(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(`DELETE FROM admin_session WHERE expires_at <= datetime('now')`),
		db.prepare(`DELETE FROM admin_otp WHERE created_at <= datetime('now', '-1 day')`)
	]);
}
