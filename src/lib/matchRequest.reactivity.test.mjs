// Runs the home page's match-effect wiring under Svelte's real client runtime.
// Vitest resolves `svelte` to its server build, where `$effect` never runs, so
// the probe is compiled for the client here and evaluated against
// `svelte/internal/client` directly.
import { describe, it, expect } from 'vitest';
import { compileModule } from 'svelte/compiler';
import * as $ from 'svelte/internal/client';
import { matchRequest } from './matchRequest';

// Mirrors +page.svelte: `params` derived from the page URL, `selected` / `must`
// / `noAllergen` derived as fresh arrays on every navigation, and the match
// effect both as it was (reading those arrays) and as it is (reading the key).
const PROBE = `
export function setup(initial, matchRequest) {
	let url = $state(new URL(initial));
	const params = $derived(url.searchParams);
	const keys = (raw) =>
		(raw ?? '')
			.split(',')
			.map((key) => key.trim().toLowerCase())
			.filter((key) => /^[a-z][a-z0-9_]*$/.test(key));
	const lang = $derived(params.get('lang') ?? 'en');
	const selected = $derived(keys(params.get('have')));
	const must = $derived(keys(params.get('must')).filter((key) => selected.includes(key)));
	const noAllergen = $derived(keys(params.get('noAllergen')));
	const cuisine = $derived(params.get('cuisine') ?? '');
	const meal = $derived(params.get('meal') ?? '');
	const diet = $derived(params.get('diet') ?? '');
	const sort = $derived(params.get('sort') ?? '');
	const slack = $derived(selected.length >= 3 ? 1 : 0);
	const input = () => ({ selected, lang, cuisine, meal, diet, sort, noAllergen, must, slack });
	const matchKey = $derived(matchRequest(input()));

	const runs = { keyed: [], arrays: 0 };
	const dispose = $effect.root(() => {
		$effect(() => {
			if (selected.length === 0) return;
			void matchRequest(input());
			runs.arrays++;
		});
		$effect(() => {
			const query = matchKey;
			if (!query) return;
			runs.keyed.push(query);
		});
	});

	return {
		runs,
		navigate(mutate) {
			const next = new URL(url);
			mutate(next);
			url = next;
		},
		dispose
	};
}
`;

function loadProbe() {
	const { code } = compileModule(PROBE, { generate: 'client', filename: 'probe.svelte.js' }).js;
	const body = code
		.replace(/^import .*;$/gm, '')
		.replace('export function setup', 'function setup');
	return new Function('$', `${body}\nreturn setup;`)($);
}

describe('home page match effect', () => {
	it('re-runs only when the /api/match request changes', () => {
		const setup = loadProbe();
		const probe = setup('https://cook-up.example/?have=onion,garlic,tomato&lang=en', matchRequest);
		const { runs } = probe;
		const step = (mutate) => {
			probe.navigate(mutate);
			$.flush();
		};

		$.flush();
		expect(runs.keyed).toHaveLength(1);
		expect(runs.arrays).toBe(1);

		// Search pauses write `?q=`; the request does not change.
		step((u) => u.searchParams.set('q', 'chi'));
		step((u) => u.searchParams.set('q', 'chicken'));
		// The old wiring refetched for each of them — the bug this guards against.
		expect(runs.arrays).toBe(3);
		expect(runs.keyed).toHaveLength(1);

		// Same selection, different order: still the same request.
		step((u) => u.searchParams.set('have', 'tomato,onion,garlic'));
		expect(runs.keyed).toHaveLength(1);

		step((u) => u.searchParams.set('cuisine', 'indian'));
		expect(runs.keyed).toHaveLength(2);

		// Garlic off, then on again (appended at the end of `have`): the second
		// key equals the earlier one, so the response cache answers it.
		step((u) => u.searchParams.set('have', 'tomato,onion'));
		step((u) => u.searchParams.set('have', 'tomato,onion,garlic'));
		expect(runs.keyed).toHaveLength(4);
		expect(runs.keyed[3]).toBe(runs.keyed[1]);

		// Clearing the selection does not fetch.
		step((u) => u.searchParams.delete('have'));
		expect(runs.keyed).toHaveLength(4);

		probe.dispose();
	});
});
