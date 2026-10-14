import { describe, it, expect } from 'vitest';
import { searchRecipeTitles, getRecipesByIds, ftsPhrase, likeTerm } from './search';
import { MIN_FTS_LENGTH, RECIPE_HIT_LIMIT } from '$lib/search';
import type { D1Database } from '@cloudflare/workers-types';
import { assertD1Binds } from '../d1';

/** Same shape as match.test.ts's harness: records the SQL text and binds without
 *  a real D1. `searchRecipeTitles` touches `db` at most once. */
function spyDb(results: unknown[] = []) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					calls.push({ sql, binds });
					return {
						all: async () => {
							assertD1Binds(binds);
							return { results };
						}
					};
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

	it('collapses one recipe to one row before ranking, and fetches titles for the page only', async () => {
		// A pre-0008 index, or a translated row indexed by an older pipeline,
		// gives one recipe several FTS hits; the DISTINCT subquery collapses them.
		// search.sqlite.test.mjs checks the outcome on a real index.
		const { db, calls } = spyDb();
		await searchRecipeTitles(db, { q: 'goulash', lang: 'fr' });
		const [inner, outer] = calls[0].sql.split(/\)\s*r\b/);
		expect(inner).toContain('SELECT DISTINCT r.id');
		expect(inner).toContain('LIMIT ?');
		expect(inner).not.toContain('recipe_i18n t');
		expect(outer).toContain('LEFT JOIN recipe_i18n t');
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
		expect(calls[0].binds).toEqual(['"goulash"', RECIPE_HIT_LIMIT, 'de']);
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
		expect(calls[0].binds[1]).toBe(RECIPE_HIT_LIMIT);

		const { db: db2, calls: calls2 } = spyDb();
		await searchRecipeTitles(db2, { q: 'goulash', lang: 'en', limit: 3 });
		expect(calls2[0].binds[1]).toBe(3);

		const { db: db3, calls: calls3 } = spyDb();
		await searchRecipeTitles(db3, { q: '寿', lang: 'en', limit: 3 });
		expect(calls3[0].binds.at(-1)).toBe(3);
	});

	it('returns [] rather than undefined when D1 reports no results', async () => {
		const { db } = spyDb(undefined as never);
		expect(await searchRecipeTitles(db, { q: 'goulash', lang: 'en' })).toEqual({ recipes: [] });
	});
});

describe('getRecipesByIds', () => {
	it('never touches the database for an empty id list', async () => {
		const { db, calls } = spyDb();
		expect(await getRecipesByIds(db, { ids: [], lang: 'en' })).toEqual({ recipes: [] });
		expect(calls).toHaveLength(0);
	});

	it('binds the ids as one JSON array, so the bind count does not grow with the list', async () => {
		const ids = Array.from({ length: 500 }, (_, k) => k + 1);
		const { db, calls } = spyDb();
		await getRecipesByIds(db, { ids, lang: 'en' });
		expect(calls[0].sql).toContain('WHERE r.id IN (SELECT value FROM json_each(?))');
		const placeholders = (calls[0].sql.match(/\?/g) ?? []).length;
		expect(placeholders).toBe(calls[0].binds.length);
		expect(calls[0].binds).toEqual(['en', JSON.stringify(ids)]);
	});

	it('orders rows by id, so a permutation of the list is the same response', async () => {
		const { db, calls } = spyDb();
		await getRecipesByIds(db, { ids: [3, 1, 2], lang: 'en' });
		expect(calls[0].sql).toMatch(/ORDER BY r\.id\s*$/);
	});

	it('collapses one recipe to one row', async () => {
		const { db, calls } = spyDb();
		await getRecipesByIds(db, { ids: [1], lang: 'en' });
		expect(calls[0].sql).toContain('GROUP BY r.id');
	});

	it('resolves the displayed title through the language fallback', async () => {
		const { db, calls } = spyDb();
		await getRecipesByIds(db, { ids: [1], lang: 'de' });
		expect(calls[0].sql).toContain('COALESCE(t.title, src.title)');
		expect(calls[0].binds[0]).toBe('de');
	});

	it('returns [] rather than undefined when D1 reports no results', async () => {
		const { db } = spyDb(undefined as never);
		expect(await getRecipesByIds(db, { ids: [1], lang: 'en' })).toEqual({ recipes: [] });
	});
});
