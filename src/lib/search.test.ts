import { describe, it, expect } from 'vitest';
import { normaliseQuery, MAX_QUERY } from './search';

describe('normaliseQuery', () => {
	it('trims and clamps the raw query at the boundary', () => {
		expect(normaliseQuery('  goulash  ')).toBe('goulash');
		expect(normaliseQuery(null)).toBe('');
		expect(normaliseQuery('x'.repeat(200))).toHaveLength(MAX_QUERY);
	});
});
