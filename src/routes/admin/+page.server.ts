import { fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { requireDb } from '$lib/db';
import { cachedDashboard } from '$lib/admin/stats';
import { corpusFor, manifestCounts } from '$lib/server/data';
import { NEVER_CACHE } from '$lib/httpCache';
import {
	OTP_TTL_MINUTES,
	PENDING_COOKIE,
	SESSION_COOKIE,
	SESSION_TTL_DAYS,
	createSession,
	destroySession,
	generateOtp,
	generateSessionToken,
	hashClientIp,
	isAllowed,
	issueOtp,
	normaliseEmail,
	parseAllowlist,
	pruneExpired,
	readSession,
	sha256Hex,
	verifyOtp
} from '$lib/admin/auth';
import { mailConfig, sendOtpEmail } from '$lib/admin/email';
import type { Actions, PageServerLoad } from './$types';

const cookieOptions = {
	path: '/',
	httpOnly: true,
	// `strict` and not `lax`: nothing should ever arrive at /admin as a result of
	// following a link from somewhere else.
	sameSite: 'strict' as const,
	secure: !dev,
	maxAge: SESSION_TTL_DAYS * 24 * 60 * 60
};

const pendingCookieOptions = {
	...cookieOptions,
	path: '/admin',
	maxAge: OTP_TTL_MINUTES * 60
};

/** `getClientAddress` throws where the adapter cannot tell; the budget then falls back to one shared bucket. */
function clientAddress(getClientAddress: () => string): string {
	try {
		return getClientAddress() || 'unknown';
	} catch {
		return 'unknown';
	}
}

export const load: PageServerLoad = async ({ cookies, platform, setHeaders }) => {
	// Per-user, cookie-gated: never let the adapter's edge cache or a shared
	// cache store it, whatever header a future change adds elsewhere.
	setHeaders({ 'cache-control': NEVER_CACHE });
	const db = requireDb(platform);
	const email = await readSession(
		db,
		cookies.get(SESSION_COOKIE),
		parseAllowlist(platform?.env?.ADMIN_EMAILS)
	);

	if (!email) return { authed: false as const };
	const corpus = async () => {
		const [loaded, counts] = await Promise.all([corpusFor(platform, 'en'), manifestCounts(platform)]);
		return { corpus: loaded, counts };
	};
	return { authed: true as const, email, dashboard: await cachedDashboard(db, corpus) };
};

export const actions: Actions = {
	/**
	 * Deliberately answers identically whether or not the address is on the
	 * allowlist, whether or not the mail was accepted, and whether or not the
	 * request was throttled. Any difference here would turn this endpoint into
	 * an oracle for "is this the admin's address".
	 *
	 * That includes timing: the D1 writes and the call to Resend happen only
	 * for an allowlisted address, so they run after the response, never before
	 * it.
	 */
	requestCode: async ({ request, cookies, platform, getClientAddress }) => {
		const db = requireDb(platform);
		const form = await request.formData();
		const email = normaliseEmail(String(form.get('email') ?? ''));

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { stage: 'email', error: 'invalidEmail' });
		}

		const nonce = generateSessionToken();
		cookies.set(PENDING_COOKIE, nonce, pendingCookieOptions);

		const allowed = isAllowed(email, parseAllowlist(platform?.env?.ADMIN_EMAILS));
		const mail = mailConfig(platform?.env);
		const ip = clientAddress(getClientAddress);

		const work = (async () => {
			await pruneExpired(db).catch(() => {});
			if (!allowed || !mail) return;
			const code = generateOtp();
			const issued = await issueOtp(db, email, code, {
				bindingHash: await sha256Hex(nonce),
				// The Resend key is the one secret guaranteed present whenever a
				// code can be issued at all, so it doubles as the IP-hash key.
				ipHash: await hashClientIp(ip, mail.apiKey)
			});
			if (issued) await sendOtpEmail(mail, email, code);
		})().catch(() => {});

		if (platform?.ctx?.waitUntil) platform.ctx.waitUntil(work);
		else await work;

		return { stage: 'code', email };
	},

	verify: async ({ request, cookies, platform }) => {
		const db = requireDb(platform);
		const form = await request.formData();
		const email = normaliseEmail(String(form.get('email') ?? ''));
		const code = String(form.get('code') ?? '').trim();

		if (!/^\d{6}$/.test(code)) {
			return fail(400, { stage: 'code', email, error: 'invalidCode' });
		}

		// verifyOtp runs even without a nonce or for an address off the
		// allowlist, so neither case is distinguishable by response time.
		const nonce = cookies.get(PENDING_COOKIE) ?? '';
		const verified = await verifyOtp(db, email, code, await sha256Hex(nonce));
		const allowed = isAllowed(email, parseAllowlist(platform?.env?.ADMIN_EMAILS));

		if (!verified || !nonce || !allowed) {
			return fail(400, { stage: 'code', email, error: 'invalid' });
		}

		const token = generateSessionToken();
		await createSession(db, email, token);
		cookies.delete(PENDING_COOKIE, { path: pendingCookieOptions.path });
		cookies.set(SESSION_COOKIE, token, cookieOptions);

		return { stage: 'done' };
	},

	logout: async ({ cookies, platform }) => {
		const db = requireDb(platform);
		await destroySession(db, cookies.get(SESSION_COOKIE));
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return { stage: 'email' };
	}
};
