/**
 * In-memory write budget for /api/track. Every recorded view costs several D1
 * rows written against a 100k/day account-wide cap that admin sign-in and the
 * pipeline share, so this decides, before any D1 call, whether a view is
 * recorded at all. It never writes anything itself.
 *
 * The state is per isolate: Cloudflare runs many isolates across colos, starts
 * and evicts them at will, and none of them see each other's counters. So the
 * limits are a speed bump that caps what one isolate can spend, not an
 * account-wide guarantee — a determined, distributed sender still needs an
 * edge rule (the Workers Rate Limiting binding, or a WAF rule on a custom
 * domain) to stop. Real readers are far below every limit here.
 *
 * Past the daily soft budget only every SAMPLE_EVERY-th view is kept, so the
 * dashboard undercounts on such a day rather than the site running out of
 * writes.
 */

export interface TrackLimits {
	/** Per client IP: a burst of this many, refilled at one per `refillMs`. */
	burst: number;
	refillMs: number;
	/** Per isolate, per clock minute. */
	perMinute: number;
	/** Per isolate, per UTC day: full recording up to `softDaily`, sampled up to `hardDaily`. */
	softDaily: number;
	hardDaily: number;
	sampleEvery: number;
	/** Bounds the per-IP map, so a spray of addresses cannot grow it without limit. */
	maxTrackedIps: number;
}

export const DEFAULT_LIMITS: TrackLimits = {
	burst: 20,
	refillMs: 5_000,
	perMinute: 60,
	softDaily: 1_000,
	hardDaily: 3_000,
	sampleEvery: 10,
	maxTrackedIps: 5_000
};

export type TrackVerdict = 'record' | 'drop';

interface Bucket {
	tokens: number;
	at: number;
}

export function createTrackLimiter(limits: TrackLimits = DEFAULT_LIMITS, now = () => Date.now()) {
	const buckets = new Map<string, Bucket>();
	let minute = -1;
	let inMinute = 0;
	let day = -1;
	let inDay = 0;
	let sampled = 0;

	function takeToken(ip: string, t: number): boolean {
		let b = buckets.get(ip);
		if (!b) {
			// deliberate: wholesale reset instead of LRU; at worst it hands every
			// address a fresh burst once per maxTrackedIps new addresses.
			if (buckets.size >= limits.maxTrackedIps) buckets.clear();
			b = { tokens: limits.burst, at: t };
			buckets.set(ip, b);
		} else {
			b.tokens = Math.min(limits.burst, b.tokens + (t - b.at) / limits.refillMs);
			b.at = t;
		}
		if (b.tokens < 1) return false;
		b.tokens -= 1;
		return true;
	}

	return {
		take(ip: string): TrackVerdict {
			const t = now();
			if (!takeToken(ip, t)) return 'drop';

			const m = Math.floor(t / 60_000);
			if (m !== minute) {
				minute = m;
				inMinute = 0;
			}
			if (inMinute >= limits.perMinute) return 'drop';

			const d = Math.floor(t / 86_400_000);
			if (d !== day) {
				day = d;
				inDay = 0;
				sampled = 0;
			}
			if (inDay >= limits.hardDaily) return 'drop';
			if (inDay >= limits.softDaily && ++sampled % limits.sampleEvery !== 0) return 'drop';

			inMinute++;
			inDay++;
			return 'record';
		}
	};
}

/** One per isolate, which is the whole point and the whole limitation. */
export const trackLimiter = createTrackLimiter();
