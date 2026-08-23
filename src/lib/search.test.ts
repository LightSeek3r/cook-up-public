import { describe, it, expect } from 'vitest';
import {
	searchRecipeTitles,
	ftsPhrase,
	likeTerm,
	normaliseQuery,
	MAX_QUERY,
	MIN_FTS_LENGTH,
	RECIPE_HIT_LIMIT
} from './search';
import type { D1Database } from '@cloudflare/workers-types';

/** Same shape as match.test.ts's harness: records the SQL text and binds without
 *  a real D1. `searchRecipeTitles` touches `db` at most once. */
function spyDb(results: unknown[] = []) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					return { all: async () => ({ results }) };
				}
			};
		}
	} as unknown as D1Database;
	return { db, calls };
}

describe('query hardening', () => {
	it('neutralises FTS operator syntax by doubling quotes', () => {
		expect(ftsPhrase('tomato')).toBe('"tomato"');
		// Without the doubling this would close the phrase and inject `OR`.
		expect(ftsPhrase('a" OR b')).toBe('"a"" OR b"');
		expect(ftsPhrase('NEAR/2')).toBe('"NEAR/2"');
	});

	it('escapes every LIKE wildcard, backslash included', () => {
		expect(likeTerm('100%')).toBe('100\\%');
		expect(likeTerm('a_b')).toBe('a\\_b');
		expect(likeTerm('a\\b')).toBe('a\\\\b');
	});

	it('trims and clamps the raw query at the boundary', () => {
		expect(normaliseQuery('  goulash  ')).toBe('goulash');
		expect(normaliseQuery(null)).toBe('');
		expect(normaliseQuery('x'.repeat(200))).toHaveLength(MAX_QUERY);
	});
});

describe('searchRecipeTitles', () => {
	it('never touches the database for an empty or whitespace query', async () => {
		const { db, calls } = spyDb();
		expect(await searchRecipeTitles(db, { q: '   ', lang: 'en' })).toEqual({ recipes: [] });
		expect(calls).toHaveLength(0);
	});

	it('uses the FTS index once the query is long enough to be trigram-indexable', async () => {
		const { db, calls } = spyDb();
		await searchRecipeTitles(db, { q: 'goulash', lang: 'en' });
		expect(calls[0].sql).toContain('recipe_title_fts');
		expect(calls[0].sql).toContain('f.title MATCH ?');
		expect(calls[0].binds).toContain('"goulash"');
	});

	it('falls back to LIKE below the trigram floor, for CJK', async () => {
		const { db, calls } = spyDb();
		await searchRecipeTitles(db, { q: '寿司', lang: 'ja' });
		expect('寿司'.length).toBeLessThan(MIN_FTS_LENGTH);
		expect(calls[0].sql).not.toContain('recipe_title_fts');
		expect(calls[0].sql).toContain('LIKE ?');
		expect(calls[0].binds).toContain('%寿司%');
	});

	it('collapses one recipe to one row — the load-bearing GROUP BY', async () => {
		// Titles are never translated, so recipe_i18n holds the same English
		// string once per language: up to ten identical FTS hits per recipe.
		const { db, calls } = spyDb();
		await searchRecipeTitles(db, { q: 'goulash', lang: 'fr' });
		expect(calls[0].sql).toContain('GROUP BY r.id');
	});

	it('does not copy the ingredient search\'s lang filter, which would duplicate rows here', async () => {
		// `m.lang IN (?, 'en')` expresses a translation preference over
		// ingredient_i18n. Over recipe_i18n it just returns the same title twice.
		const { db, calls } = spyDb();
		await searchRecipeTitles(db, { q: 'goulash', lang: 'fr' });
		expect(calls[0].sql).not.toContain("m.lang IN");
	});

	it('still resolves the displayed title through the language fallback', async () => {
		const { db, calls } = spyDb();
		await searchRecipeTitles(db, { q: 'goulash', lang: 'de' });
		expect(calls[0].sql).toContain('COALESCE(t.title, src.title)');
		expect(calls[0].binds[0]).toBe('de');
	});

	it.each([{ q: 'goulash' }, { q: '寿' }])(
		'placeholder count equals bind length for %o',
		async ({ q }) => {
			const { db, calls } = spyDb();
			await searchRecipeTitles(db, { q, lang: 'en' });
			const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
			expect(placeholders).toBe(calls[0].binds.length);
		}
	);

	it('defaults the limit and passes an explicit one through', async () => {
		const { db, calls } = spyDb();
		await searchRecipeTitles(db, { q: 'goulash', lang: 'en' });
		expect(calls[0].binds.at(-1)).toBe(RECIPE_HIT_LIMIT);

		const { db: db2, calls: calls2 } = spyDb();
		await searchRecipeTitles(db2, { q: 'goulash', lang: 'en', limit: 3 });
		expect(calls2[0].binds.at(-1)).toBe(3);
	});

	it('returns [] rather than undefined when D1 reports no results', async () => {
		const { db } = spyDb(undefined as never);
		expect(await searchRecipeTitles(db, { q: 'goulash', lang: 'en' })).toEqual({ recipes: [] });
	});
});
