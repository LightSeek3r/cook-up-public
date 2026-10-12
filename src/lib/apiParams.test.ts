import { describe, it, expect } from 'vitest';
import { version } from '$app/environment';
import {
	canonicalUrl,
	parseMatchQuery,
	parseRecipesQuery,
	MAX_HAVE,
	MAX_IDS,
	MAX_OFFSET
} from './apiParams';
import { apiUrl, VERSION_PARAM } from './httpCache';
import { matchRequest, type MatchRequestInput } from './matchRequest';
import { slackFor } from './match';

const ORIGIN = 'https://cook.test';
const params = (query: string) => new URLSearchParams(query);
const canonical = (pathAndQuery: string) => canonicalUrl(new URL(pathAndQuery, ORIGIN), version);
const keys = (n: number) => Array.from({ length: n }, (_, k) => `ing_${String(k).padStart(3, '0')}`);

describe('parseMatchQuery', () => {
	it('treats have, must and noAllergen as sorted sets', () => {
		const query = parseMatchQuery(
			params('have=onion,Egg,onion,garlic&must=onion,egg,egg&noAllergen=gluten,dairy,gluten,bogus')
		);
		expect(query?.have).toEqual(['egg', 'garlic', 'onion']);
		expect(query?.must).toEqual(['egg', 'onion']);
		expect(query?.noAllergen).toEqual(['dairy', 'gluten']);
	});

	it(`accepts up to MAX_HAVE (${MAX_HAVE}) ingredients and rejects more`, () => {
		expect(parseMatchQuery(params(`have=${keys(MAX_HAVE).join(',')}`))?.have).toHaveLength(MAX_HAVE);
		expect(parseMatchQuery(params(`have=${keys(MAX_HAVE + 1).join(',')}`))).toBeNull();
		// Duplicates and junk do not count towards the cap.
		const padded = [...keys(MAX_HAVE), ...keys(MAX_HAVE), '1', 'x-y'].join(',');
		expect(parseMatchQuery(params(`have=${padded}`))?.have).toHaveLength(MAX_HAVE);
	});

	it('keeps must only inside have, and only once the selection has slack', () => {
		expect(slackFor(2)).toBe(0);
		expect(parseMatchQuery(params('have=egg,onion&must=egg'))?.must).toEqual([]);
		expect(parseMatchQuery(params('have=egg,onion,leek&must=egg,tofu'))?.must).toEqual(['egg']);
	});

	it.each([
		['', 0],
		['offset=', 0],
		['offset=0', 0],
		['offset=50', 50],
		['offset=007', 7],
		[`offset=${MAX_OFFSET}`, MAX_OFFSET]
	])('reads %s as offset %i', (query, offset) => {
		expect(parseMatchQuery(params(`have=egg&${query}`))?.offset).toBe(offset);
	});

	it.each(['2.5', '1e999', '1e3', '-1', '+5', ' 5', 'abc', '0x10', 'Infinity', String(MAX_OFFSET + 1), '9'.repeat(400)])(
		'rejects offset=%s',
		(offset) => {
			expect(parseMatchQuery(params(`have=egg&offset=${encodeURIComponent(offset)}`))).toBeNull();
		}
	);

	it('drops filter values that are not whitelisted', () => {
		const query = parseMatchQuery(params('have=egg&cuisine=mars&meal=brunch&diet=keto&sort=random'));
		expect(query).toMatchObject({ cuisine: undefined, meal: undefined, diet: undefined, sort: undefined });
	});
});

describe('parseRecipesQuery', () => {
	it('sorts and dedupes the ids', () => {
		expect(parseRecipesQuery(params('ids=30,4,30,x,-2,17')).ids).toEqual([4, 17, 30]);
	});

	it(`keeps the MAX_IDS (${MAX_IDS}) lowest ids of a longer list, whatever its order`, () => {
		const ids = Array.from({ length: MAX_IDS + 20 }, (_, k) => MAX_IDS + 20 - k);
		const { ids: kept } = parseRecipesQuery(params(`ids=${ids.join(',')}`));
		expect(kept).toHaveLength(MAX_IDS);
		expect(kept[0]).toBe(1);
		expect(kept.at(-1)).toBe(MAX_IDS);
	});
});

describe('canonicalUrl: what the page fetches is already canonical', () => {
	const input = (over: Partial<MatchRequestInput> = {}): MatchRequestInput => ({
		selected: ['onion', 'egg', 'garlic', 'tomato'],
		lang: 'fr',
		cuisine: '',
		meal: '',
		diet: '',
		sort: '',
		noAllergen: [],
		must: [],
		slack: slackFor(4),
		...over
	});

	it.each([
		['a bare selection', input()],
		['one ingredient', input({ selected: ['egg'], slack: 0 })],
		[
			'every filter',
			input({
				cuisine: 'italian',
				meal: 'dinner',
				diet: 'vegetarian',
				sort: 'kcal',
				noAllergen: ['gluten', 'dairy'],
				must: ['tomato', 'egg']
			})
		]
	])('/api/match, %s', (_, request) => {
		for (const offset of [0, 50, 100]) {
			const url = `${ORIGIN}${apiUrl('/api/match', matchRequest(request, offset))}`;
			expect(canonical(url)).toBe(url);
		}
	});

	it('/api/search and /api/ingredients, as +page.svelte builds them', () => {
		for (const q of ['chicken', 'Poulet rôti', '鸡肉汤', 'a&b=c']) {
			const search = `${ORIGIN}${apiUrl('/api/search', { q, lang: 'ja' })}`;
			expect(canonical(search)).toBe(search);
			const withQ = new URLSearchParams({ lang: 'ja' });
			withQ.set('q', q);
			const ingredients = `${ORIGIN}${apiUrl('/api/ingredients', withQ)}`;
			expect(canonical(ingredients)).toBe(ingredients);
		}
		const mosaic = `${ORIGIN}${apiUrl('/api/ingredients', new URLSearchParams({ lang: 'ar' }))}`;
		expect(canonical(mosaic)).toBe(mosaic);
	});

	it('/api/recipes when the ids are sent sorted', () => {
		const url = `${ORIGIN}${apiUrl('/api/recipes', { ids: '3,17,488', lang: 'en' })}`;
		expect(canonical(url)).toBe(url);
	});
});

describe('canonicalUrl: everything else maps onto that one URL', () => {
	const v = `${VERSION_PARAM}=${encodeURIComponent(version)}`;

	it('drops unknown parameters and pins v to this build', () => {
		expect(canonical('/api/search?q=chicken&lang=en&_r=123&v=junk')).toBe(
			`${ORIGIN}/api/search?q=chicken&lang=en&${v}`
		);
		expect(canonical('/api/search?lang=en&q=chicken')).toBe(`${ORIGIN}/api/search?q=chicken&lang=en&${v}`);
	});

	it('orders parameters and sorts lists', () => {
		expect(canonical('/api/match?sort=time&have=onion,egg,egg&lang=de&noAllergen=gluten,dairy')).toBe(
			`${ORIGIN}/api/match?have=egg%2Conion&lang=de&sort=time&noAllergen=dairy%2Cgluten&${v}`
		);
		expect(canonical('/api/recipes?lang=en&ids=488,3,17,3')).toBe(
			`${ORIGIN}/api/recipes?ids=3%2C17%2C488&lang=en&${v}`
		);
	});

	it('writes the language the route will use', () => {
		expect(canonical('/api/ingredients')).toBe(`${ORIGIN}/api/ingredients?lang=en&${v}`);
		expect(canonical('/api/ingredients?lang=xx')).toBe(`${ORIGIN}/api/ingredients?lang=en&${v}`);
	});

	it('trims and clamps q the way the route does', () => {
		expect(canonical(`/api/search?q=${encodeURIComponent('  pie  ')}&lang=en`)).toBe(
			`${ORIGIN}/api/search?q=pie&lang=en&${v}`
		);
		const long = canonical(`/api/search?q=${'x'.repeat(100)}&lang=en`);
		expect(new URL(long!).searchParams.get('q')).toHaveLength(64);
	});

	it('is idempotent', () => {
		for (const path of ['/api/match?have=b,a&must=a&offset=50&x=1', '/api/recipes?ids=9,1', '/api/search?q=pie']) {
			const once = canonical(path)!;
			expect(canonical(once)).toBe(once);
		}
	});

	it('gives the sitemap one URL, without a version: crawlers fetch it bare', () => {
		expect(canonical('/sitemap.xml?_r=1&v=2')).toBe(`${ORIGIN}/sitemap.xml`);
		expect(canonical('/sitemap.xml')).toBe(`${ORIGIN}/sitemap.xml`);
	});
});

describe('canonicalUrl: no key at all', () => {
	it.each(['/api/match?have=egg&offset=2.5', `/api/match?have=${keys(MAX_HAVE + 1).join(',')}`])(
		'for a query the route answers 400: %s',
		(path) => {
			expect(canonical(path)).toBeNull();
		}
	);

	it.each(['/admin', '/admin?x=1', '/api/track?path=/', '/', '/?have=egg', '/recipe/1', '/robots.txt', '/api/matches', '/api/match/'])(
		'for a route that is not listed: %s',
		(path) => {
			expect(canonical(path)).toBeNull();
		}
	);

	it('when clamping q would cut a surrogate pair, which would change the query', () => {
		const q = `${'a'.repeat(63)}😀`;
		expect(canonical(`/api/search?q=${encodeURIComponent(q)}&lang=en`)).toBeNull();
		expect(canonical(`/api/search?q=${encodeURIComponent(`${'a'.repeat(62)}😀`)}&lang=en`)).not.toBeNull();
	});
});
