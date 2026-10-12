import { fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { requireDb } from '$lib/db';
import { cachedDashboard } from '$lib/admin/stats';
import { NEVER_CACHE } from '$lib/httpCache';
import {
	SESSION_COOKIE,
	SESSION_TTL_DAYS,
	checkRate,
	createSession,
	destroySession,
	generateOtp,
	generateSessionToken,
	isAllowed,
	issueOtp,
	normaliseEmail,
	parseAllowlist,
	pruneExpired,
	readSession,
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

export const load: PageServerLoad = async ({ cookies, platform, setHeaders }) => {
	// Per-user, cookie-gated: never let the adapter's edge cache or a shared
	// cache store it, whatever header a future change adds elsewhere.
	setHeaders({ 'cache-control': NEVER_CACHE });
	const db = requireDb(platform);
	const email = await readSession(db, cookies.get(SESSION_COOKIE));

	if (!email) return { authed: false as const };
	return { authed: true as const, email, dashboard: await cachedDashboard(db) };
};

export const actions: Actions = {
	/**
	 * Deliberately answers identically whether or not the address is on the
	 * allowlist, whether or not the mail was accepted, and whether or not the
	 * request was throttled. Any difference here would turn this endpoint into
	 * an oracle for "is this the admin's address".
	 */
	requestCode: async ({ request, platform }) => {
		const db = requireDb(platform);
		const form = await request.formData();
		const email = normaliseEmail(String(form.get('email') ?? ''));

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { stage: 'email', error: 'invalidEmail' });
		}

		await pruneExpired(db).catch(() => {});

		const allowed = isAllowed(email, parseAllowlist(platform?.env?.ADMIN_EMAILS));
		const mail = mailConfig(platform?.env);

		if (allowed && mail && (await checkRate(db, email)) === 'ok') {
			const code = generateOtp();
			await issueOtp(db, email, code);
			await sendOtpEmail(mail, email, code);
		}

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

		const result = await verifyOtp(db, email, code);
		if (result !== 'ok') {
			return fail(400, { stage: 'code', email, error: result });
		}

		const token = generateSessionToken();
		await createSession(db, email, token);
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
