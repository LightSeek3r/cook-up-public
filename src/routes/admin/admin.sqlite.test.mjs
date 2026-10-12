// /admin actions end to end against SQLite with every migration applied, with
// Resend replaced by a stub that captures the code. `.mjs` for node:sqlite.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { actions, load } from './+page.server';
import { PENDING_COOKIE, SESSION_COOKIE } from '$lib/admin/auth';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
const ADMIN = 'admin@example.com';

let sqlite;

function d1(lite) {
	const statement = (sql, binds = []) => ({
		bind: (...b) => statement(sql, b),
		first: async () => lite.prepare(sql).get(...binds) ?? null,
		run: async () => (lite.prepare(sql).run(...binds), { success: true }),
		all: async () => ({ results: lite.prepare(sql).all(...binds) })
	});
	return {
		prepare: (sql) => statement(sql),
		batch: async (stmts) => Promise.all(stmts.map((s) => s.run()))
	};
}

/** One browser: its own cookie jar and IP. */
function browser(ip = '203.0.113.1') {
	const jar = new Map();
	const options = new Map();
	return {
		jar,
		options,
		ip,
		cookies: {
			get: (name) => jar.get(name),
			set: (name, value, opts) => {
				jar.set(name, value);
				options.set(name, opts);
			},
			delete: (name) => jar.delete(name)
		}
	};
}

let env;
let pending;
let sent;

function event(who, fields) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return {
		request: new Request('https://cook.test/admin', { method: 'POST', body: form }),
		cookies: who.cookies,
		getClientAddress: () => who.ip,
		setHeaders: () => {},
		platform: {
			env,
			ctx: { waitUntil: (p) => pending.push(p) }
		}
	};
}

const settle = () => Promise.all(pending.splice(0));

async function requestCode(who, email = ADMIN) {
	const res = await actions.requestCode(event(who, { email }));
	await settle();
	return res;
}

const verify = (who, code, email = ADMIN) => actions.verify(event(who, { email, code }));

beforeAll(() => {
	sqlite = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort())
		sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
});

beforeEach(() => {
	sqlite.exec('DELETE FROM admin_otp; DELETE FROM admin_session;');
	env = { DB: d1(sqlite), ADMIN_EMAILS: ADMIN, RESEND_API_KEY: 'key', RESEND_FROM: 'from@x.test' };
	pending = [];
	sent = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			const body = JSON.parse(init.body);
			sent.push({ to: body.to[0], code: /^(\d{6})/.exec(body.subject)[1] });
			return new Response('{}', { status: 200 });
		})
	);
});

afterEach(() => vi.unstubAllGlobals());

describe('requestCode', () => {
	it('answers the same for an allowlisted and an unknown address', async () => {
		const a = browser();
		const b = browser();
		const forAdmin = await actions.requestCode(event(a, { email: ADMIN }));
		const forStranger = await actions.requestCode(event(b, { email: 'nobody@example.com' }));

		// Nothing allowlist-dependent has happened before the response.
		expect(sent).toHaveLength(0);
		expect(sqlite.prepare('SELECT COUNT(*) AS n FROM admin_otp').get().n).toBe(0);
		expect({ ...forAdmin, email: '' }).toEqual({ ...forStranger, email: '' });
		expect(a.jar.has(PENDING_COOKIE)).toBe(true);
		expect(b.jar.has(PENDING_COOKIE)).toBe(true);

		await settle();
		expect(sent.map((m) => m.to)).toEqual([ADMIN]);
	});

	it('scopes the pending nonce cookie to /admin and to the code lifetime', async () => {
		const a = browser();
		await requestCode(a);
		expect(a.options.get(PENDING_COOKIE)).toMatchObject({ path: '/admin', httpOnly: true, sameSite: 'strict', maxAge: 600 });
	});
});

describe('verify', () => {
	it('signs in with the emailed code from the same browser', async () => {
		const a = browser();
		await requestCode(a);
		expect(await verify(a, sent[0].code)).toEqual({ stage: 'done' });
		expect(a.jar.has(SESSION_COOKIE)).toBe(true);
		expect(a.jar.has(PENDING_COOKIE)).toBe(false);

		const data = await load(event(a, {}));
		expect(data.authed).toBe(true);
	});

	it('gives one error for an unknown address, a wrong code, a used code and another browser', async () => {
		const admin = browser();
		const stranger = browser('198.51.100.9');
		await requestCode(admin);
		await requestCode(stranger, 'nobody@example.com');
		const code = sent[0].code;
		const wrong = code === '000000' ? '111111' : '000000';

		const errors = [
			await verify(stranger, code, 'nobody@example.com'),
			await verify(admin, wrong),
			await verify(stranger, code),
			await verify(browser(), code)
		];
		await verify(admin, code);
		errors.push(await verify(admin, code));

		for (const e of errors) {
			expect(e.status).toBe(400);
			expect(e.data).toMatchObject({ stage: 'code', error: 'invalid' });
		}
	});

	it('gives the same error once the attempt ceiling is reached, for any address', async () => {
		const admin = browser();
		const stranger = browser('198.51.100.9');
		await requestCode(admin);
		await requestCode(stranger, 'nobody@example.com');
		const results = [];
		for (let i = 0; i < 7; i++) {
			results.push((await verify(admin, '000000')).data.error);
			results.push((await verify(stranger, '000000', 'nobody@example.com')).data.error);
		}
		expect(new Set(results)).toEqual(new Set(['invalid']));
	});

	it("is not cancelled by a stranger requesting a code for the admin's address", async () => {
		const admin = browser();
		await requestCode(admin);
		const code = sent[0].code;
		const stranger = browser('198.51.100.9');
		await requestCode(stranger);
		expect(await verify(admin, code)).toEqual({ stage: 'done' });
	});

	it('refuses a valid code once the address has left the allowlist', async () => {
		const a = browser();
		await requestCode(a);
		env.ADMIN_EMAILS = 'someone-else@example.com';
		expect((await verify(a, sent[0].code)).data.error).toBe('invalid');
	});
});

describe('load', () => {
	it('revokes a live session as soon as its address leaves the allowlist', async () => {
		const a = browser();
		await requestCode(a);
		await verify(a, sent[0].code);
		expect((await load(event(a, {}))).authed).toBe(true);

		env.ADMIN_EMAILS = 'someone-else@example.com';
		expect((await load(event(a, {}))).authed).toBe(false);
	});
});
