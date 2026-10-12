import { describe, it, expect } from 'vitest';
import { DEFAULT_LIMITS, createTrackLimiter, type TrackLimits } from './limiter';

function clock(start = Date.UTC(2026, 9, 12, 10, 0, 0)) {
	let t = start;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

const roomy: TrackLimits = {
	...DEFAULT_LIMITS,
	burst: 1e9,
	perMinute: 1e9
};

describe('createTrackLimiter', () => {
	it('lets one IP burst, then refills it at the configured rate', () => {
		const c = clock();
		const limiter = createTrackLimiter(DEFAULT_LIMITS, c.now);
		for (let i = 0; i < DEFAULT_LIMITS.burst; i++) expect(limiter.take('a')).toBe('record');
		expect(limiter.take('a')).toBe('drop');
		// Another reader behind a different address is unaffected.
		expect(limiter.take('b')).toBe('record');

		c.advance(DEFAULT_LIMITS.refillMs);
		expect(limiter.take('a')).toBe('record');
		expect(limiter.take('a')).toBe('drop');
	});

	it('caps the whole isolate per minute, across IPs', () => {
		const c = clock();
		const limiter = createTrackLimiter({ ...DEFAULT_LIMITS, perMinute: 3 }, c.now);
		expect(['a', 'b', 'c', 'd'].map((ip) => limiter.take(ip))).toEqual([
			'record',
			'record',
			'record',
			'drop'
		]);
		c.advance(60_000);
		expect(limiter.take('e')).toBe('record');
	});

	it('samples past the soft daily budget and stops at the hard one, until the UTC day turns', () => {
		const c = clock();
		const limits = { ...roomy, softDaily: 10, hardDaily: 12, sampleEvery: 5 };
		const limiter = createTrackLimiter(limits, c.now);
		const verdicts = Array.from({ length: 40 }, (_, i) => limiter.take(`ip${i}`));

		expect(verdicts.slice(0, 10).every((v) => v === 'record')).toBe(true);
		// Then one in five is kept: the 15th and 20th requests, which reach the hard cap.
		expect(verdicts.slice(10).filter((v) => v === 'record')).toHaveLength(2);
		expect(verdicts[14]).toBe('record');
		expect(verdicts[19]).toBe('record');
		expect(verdicts.slice(20).every((v) => v === 'drop')).toBe(true);

		c.advance(14 * 3_600_000);
		expect(limiter.take('next-day')).toBe('record');
	});

	it('does not spend daily budget on requests the IP bucket already dropped', () => {
		const c = clock();
		const limiter = createTrackLimiter(
			{ ...DEFAULT_LIMITS, burst: 1, perMinute: 1e9, softDaily: 2, hardDaily: 2 },
			c.now
		);
		expect(limiter.take('a')).toBe('record');
		for (let i = 0; i < 50; i++) expect(limiter.take('a')).toBe('drop');
		expect(limiter.take('b')).toBe('record');
	});

	it('keeps its per-IP map bounded under an address spray', () => {
		const c = clock();
		const limiter = createTrackLimiter({ ...roomy, burst: 1, maxTrackedIps: 3 }, c.now);
		for (const ip of ['a', 'b', 'c']) expect(limiter.take(ip)).toBe('record');
		expect(limiter.take('a')).toBe('drop');
		// The fourth address resets the map; that is the accepted cost of bounding it.
		expect(limiter.take('d')).toBe('record');
		expect(limiter.take('a')).toBe('record');
	});
});
