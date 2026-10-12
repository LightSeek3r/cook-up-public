import { describe, it, expect } from 'vitest';
import { matchRequest, type MatchRequestInput } from './matchRequest';

const base: MatchRequestInput = {
	selected: ['onion', 'garlic', 'tomato'],
	lang: 'en',
	cuisine: '',
	meal: '',
	diet: '',
	sort: '',
	noAllergen: [],
	must: [],
	slack: 1
};

describe('matchRequest', () => {
	it('is empty when nothing is selected, so the effect can skip the fetch', () => {
		expect(matchRequest({ ...base, selected: [] })).toBe('');
		expect(matchRequest({ ...base, selected: [], cuisine: 'indian' }, 50)).toBe('');
	});

	it('sends only the parameters that are set', () => {
		expect(matchRequest(base)).toBe('have=garlic%2Conion%2Ctomato&lang=en');
	});

	it('carries every filter the route reads, in a fixed order', () => {
		const query = matchRequest(
			{
				...base,
				cuisine: 'indian',
				meal: 'dinner',
				diet: 'vegetarian',
				sort: 'kcal',
				noAllergen: ['milk', 'gluten'],
				must: ['onion']
			},
			50
		);
		expect(query).toBe(
			'have=garlic%2Conion%2Ctomato&lang=en&cuisine=indian&meal=dinner&diet=vegetarian' +
				'&sort=kcal&noAllergen=gluten%2Cmilk&must=onion&offset=50'
		);
	});

	it('is the same string for the same selection in any order, with duplicates', () => {
		const reordered = matchRequest({ ...base, selected: ['tomato', 'onion', 'garlic', 'onion'] });
		expect(reordered).toBe(matchRequest(base));
		expect(matchRequest({ ...base, noAllergen: ['milk', 'egg'] })).toBe(
			matchRequest({ ...base, noAllergen: ['egg', 'milk'] })
		);
	});

	it('drops `must` while slack is 0, matching the route', () => {
		expect(matchRequest({ ...base, must: ['onion'], slack: 0 })).not.toContain('must=');
		expect(matchRequest({ ...base, must: ['onion'], slack: 1 })).toContain('must=onion');
	});

	it('omits offset 0, so page one and the effect share one key', () => {
		expect(matchRequest(base, 0)).toBe(matchRequest(base));
		expect(matchRequest(base, 50)).toBe(`${matchRequest(base)}&offset=50`);
	});

	it('changes with the language, which changes the response', () => {
		expect(matchRequest({ ...base, lang: 'fr' })).not.toBe(matchRequest(base));
	});
});
