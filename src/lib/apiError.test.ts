import { describe, it, expect } from 'vitest';
import { apiError, badRequest, d1Outage, DataUnavailableError, retryAfterSeconds } from './apiError';
import { NEVER_CACHE } from './httpCache';

describe('apiError', () => {
	it('answers { error: code } with the status, never cacheable', async () => {
		const response = apiError('unavailable', 503, { 'retry-after': '30' });
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'unavailable' });
		expect(response.headers.get('cache-control')).toBe(NEVER_CACHE);
		expect(response.headers.get('retry-after')).toBe('30');
		expect(response.headers.get('content-type')).toMatch(/application\/json/);
	});

	it('badRequest is a 400', async () => {
		const response = badRequest();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'bad_request' });
	});
});

describe('d1Outage', () => {
	// Message texts from https://developers.cloudflare.com/d1/observability/debug-d1/
	it.each([
		"D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to the Workers Paid plan or wait until midnight UTC.",
		"Your account has exceeded D1's free tier daily row write limit."
	])('a spent daily quota is a quota outage: %s', (message) => {
		expect(d1Outage(new Error(message))).toBe('quota');
	});

	it.each([
		'D1 DB is overloaded. Requests queued for too long.',
		'D1 DB is overloaded. Too many requests queued.',
		'D1_ERROR: Network connection lost.',
		'Internal error in D1 DB storage caused object to be reset.',
		'D1 DB reset because its code was updated.',
		'Cannot resolve D1 DB due to transient issue on remote node.',
		'D1 DB storage operation exceeded timeout which caused object to be reset.',
		'D1 DB exceeded its CPU time limit and was reset.'
	])('a retryable D1 error is transient: %s', (message) => {
		expect(d1Outage(new Error(message))).toBe('transient');
	});

	it.each([
		'D1_ERROR: too many SQL variables',
		'D1_ERROR: near ")": syntax error',
		'D1_ERROR: no such table: recipe_related',
		'Exceeded maximum DB size.',
		"Cannot read properties of undefined (reading 'id')"
	])('a bug is not an outage: %s', (message) => {
		expect(d1Outage(new Error(message))).toBeNull();
	});

	it('unreadable data artefacts are transient, whatever the message', () => {
		expect(d1Outage(new DataUnavailableError('data/core.bin: HTTP 404'))).toBe('transient');
		expect(d1Outage(new Error('data/core.bin: HTTP 404'))).toBeNull();
	});

	it('reads non-Error throwables too', () => {
		expect(d1Outage('D1 DB is overloaded. Too many requests queued.')).toBe('transient');
		expect(d1Outage(undefined)).toBeNull();
	});
});

describe('retryAfterSeconds', () => {
	it('waits out a spent quota until the next 00:00 UTC', () => {
		expect(retryAfterSeconds('quota', Date.UTC(2026, 9, 12, 22, 0, 0))).toBe(2 * 3600);
		expect(retryAfterSeconds('quota', Date.UTC(2026, 9, 12, 0, 0, 0))).toBe(86_400);
	});

	it('never says less than a minute, however close the reset is', () => {
		expect(retryAfterSeconds('quota', Date.UTC(2026, 9, 12, 23, 59, 59, 500))).toBe(60);
	});

	it('retries a transient error soon', () => {
		expect(retryAfterSeconds('transient')).toBe(30);
	});
});
