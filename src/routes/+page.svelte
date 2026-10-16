<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import FilterBar from '$components/FilterBar.svelte';
	import Mosaic from '$components/Mosaic.svelte';
	import IngredientIcon from '$components/IngredientIcon.svelte';
	import ResultCard from '$components/ResultCard.svelte';
	import RecipeHits from '$components/RecipeHits.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import LoadError from '$components/LoadError.svelte';
	import { resolveLang, t as translator } from '$lib/i18n';
	import { MIN_FTS_LENGTH } from '$lib/search';
	import { titleQueryReady } from '$lib/data/search.js';
	import { ALLERGENS } from '$lib/config';
	import { slackFor } from '$lib/match';
	import { matchRequest } from '$lib/matchRequest';
	import {
		afterPaint,
		localMatch,
		localMatchReady,
		prefetchMatchData,
		wantMatchData
	} from '$lib/client/localMatch';
	import { MAX_HAVE } from '$lib/apiParams';
	import { cachedJson } from '$lib/responseCache';
	import { apiUrl } from '$lib/httpCache';
	import { filterTiles } from '$lib/tileSearch';
	import { loadFridge, saveFridge } from '$lib/fridge';
	import type { IngredientTile, MatchResult, RecipeHit } from '$lib/types';

	type MatchResponse = { results?: MatchResult[]; total?: number; haveCount?: number };

	// A non-2xx already rejects in cachedJson; a 2xx carrying {error} must not
	// read as an empty result either.
	function unlessError<T extends { error?: unknown }>(data: T): T {
		if (data.error) throw new Error(String(data.error));
		return data;
	}

	let tiles = $state<IngredientTile[]>([]);
	let results = $state<MatchResult[]>([]);
	// Comes back with the results rather than being read off the URL: the server
	// dedupes `have`, so its count is the authoritative denominator for
	// "uses N of your M".
	let haveCount = $state(0);
	// Matches in total, ignoring paging — the number the UI reports. Previously it
	// showed `results.length`, which capped at the page size and so claimed "50
	// recipes" when 395 matched.
	let total = $state(0);
	let loading = $state(false);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	/** Where the shown results came from: the browser's own match, or /api/match. */
	let resultSource = $state<'' | 'local' | 'server'>('');
	/** Identifies the selection a response belongs to; see `loadMore`. */
	let requestToken = $state('');
	let recipeHits = $state<RecipeHit[]>([]);
	// Failures are their own state, never folded into "nothing found": an outage
	// that reads as "no recipes match" sends the user off changing a correct
	// selection. Each attempt counter is read by its effect, so bumping it re-runs
	// the request (cachedJson does not keep failed responses).
	let tilesLoaded = $state(false);
	let tilesFailed = $state(false);
	let tilesAttempt = $state(0);
	let matchFailed = $state(false);
	let matchAttempt = $state(0);
	let searchFailed = $state(false);
	let searchAttempt = $state(0);
	let debouncedQuery = $state($page.url.searchParams.get('q') ?? '');

	// The URL is the single source of truth: selection is shareable and the app
	// stays completely stateless server-side.
	// Search text is URL state like every other control in the bar, so a search
	// is shareable and survives a reload — it was previously the one exception.
	// Held as local $state rather than derived from the URL so typing stays
	// instant: the URL is written from the *debounced* value, one navigation per
	// pause rather than one per keystroke.
	let query = $state($page.url.searchParams.get('q') ?? '');

	const params = $derived($page.url.searchParams);
	const lang = $derived(resolveLang(params.get('lang')));
	const t = $derived(translator(lang));
	// Canonical keys, not ids: ids are positional in the seed and get renumbered
	// by every corpus rebuild, which silently repointed shared links at different
	// food. Mirrors `parseKeys` in $lib/db, which validates the same shape
	// server-side. A stale numeric link now selects nothing, deliberately — see
	// that function's comment.
	// Capped like the API, which answers 400 past MAX_HAVE: an over-long shared
	// link selects its first MAX_HAVE rather than showing an error.
	const selected = $derived(
		[
			...new Set(
				(params.get('have') ?? '')
					.split(',')
					.map((key) => key.trim().toLowerCase())
					.filter((key) => /^[a-z][a-z0-9_]*$/.test(key))
			)
		].slice(0, MAX_HAVE)
	);
	/** Set when a tap was refused at the cap; cleared by the next change that fits. */
	let atLimit = $state(false);
	const cuisine = $derived(params.get('cuisine') ?? '');
	const meal = $derived(params.get('meal') ?? '');
	const diet = $derived(params.get('diet') ?? '');
	const sort = $derived(params.get('sort') ?? '');
	const noAllergen = $derived(
		(params.get('noAllergen') ?? '')
			.split(',')
			.map((key) => key.trim().toLowerCase())
			.filter((key): key is (typeof ALLERGENS)[number] =>
				(ALLERGENS as readonly string[]).includes(key)
			)
	);
	// How many selections a recipe may leave unused and still count as a
	// near-miss — see slackFor. Below 3 selections this is 0, and "must use"
	// pins are hidden in that case: with no slack every selection is already
	// required, so pinning one would do nothing.
	const slack = $derived(slackFor(selected.length));
	// Canonical keys the user has pinned as "must actually use this", a
	// subset of `selected` — an id outside the current selection could never
	// be satisfied, so it's filtered out here rather than trusted from the URL.
	const must = $derived(
		(params.get('must') ?? '')
			.split(',')
			.map((key) => key.trim().toLowerCase())
			.filter((key) => /^[a-z][a-z0-9_]*$/.test(key) && selected.includes(key))
	);

	const selectedTiles = $derived(tiles.filter((tile) => selected.includes(tile.canonical_key)));

	// The API returns both groups in one ranked list (full matches first, by
	// construction — see `matchRecipes`), so splitting is a partition here rather
	// than a second request. `haveCount || selected.length` covers the first
	// render, before the response lands.
	const exactCount = $derived(haveCount || selected.length);
	const exact = $derived(results.filter((r) => r.matched >= exactCount));
	const almost = $derived(results.filter((r) => r.matched < exactCount));

	// Text for the always-mounted live region; empty before the user picks anything
	// so it never announces on first load.
	const liveStatus = $derived(
		selected.length === 0
			? // Nothing is selected, so this region is otherwise idle — use it to
				// announce recipe-title hits, which nothing announced before. Only in
				// this branch: with a selection live, the match results own the region
				// and two sources would talk over each other.
				recipeHits.length
				? `${recipeHits.length} ${t('results.found')}`
				: ''
			: loading
				? t('results.loading')
				: matchFailed
					? t('error.loadFailed')
					: results.length === 0
						? t('results.empty')
						: `${total} ${t('results.found')}`
	);

	function updateUrl(mutate: (url: URL) => void) {
		const url = new URL($page.url);
		mutate(url);
		return goto(url, { keepFocus: true, noScroll: true, replaceState: true });
	}

	/**
	 * A selection change can unmount the very control that made it: a tray chip,
	 * the whole tray when it empties, a tile from a collapsed group's tail, a
	 * result card that drops out of the list. Focus would then fall to <body>,
	 * losing both keyboard position and context; `keepFocus` can't help, it
	 * preserves focus across the navigation, not across a reactive unmount.
	 * Hand it to `next()` instead, or to the results region.
	 */
	async function keepFocusThrough(
		navigation: Promise<void>,
		next: () => HTMLElement | null = () => null
	) {
		const active = document.activeElement;
		await navigation;
		await tick();
		if (active instanceof HTMLElement && !active.isConnected) {
			(next() ?? document.getElementById('results'))?.focus();
		}
	}

	function toggle(canonicalKey: string, next?: () => HTMLElement | null) {
		wantMatchData(lang);
		const adding = !selected.includes(canonicalKey);
		atLimit = adding && selected.length >= MAX_HAVE;
		if (atLimit) return;
		const nextKeys = adding
			? [...selected, canonicalKey]
			: selected.filter((value) => value !== canonicalKey);
		const navigation = updateUrl((url) => {
			if (nextKeys.length) url.searchParams.set('have', nextKeys.join(','));
			else url.searchParams.delete('have');
			// A pin on an ingredient that just got deselected could never be
			// satisfied (see matchRecipes' mustUse check) — drop it from `must`
			// too rather than leave a dead pin sitting in the URL.
			if (!nextKeys.includes(canonicalKey) && must.includes(canonicalKey)) {
				const nextMust = must.filter((key) => key !== canonicalKey);
				if (nextMust.length) url.searchParams.set('must', nextMust.join(','));
				else url.searchParams.delete('must');
			}
		});
		keepFocusThrough(navigation, next);
	}

	/** Removes a tray chip and moves focus to the chip after it, else the one before. */
	function removeFromTray(canonicalKey: string) {
		const keys = selectedTiles.map((tile) => tile.canonical_key);
		const at = keys.indexOf(canonicalKey);
		const neighbours = [keys[at + 1], keys[at - 1]].filter(Boolean);
		toggle(
			canonicalKey,
			() =>
				neighbours
					.map((key) => document.querySelector<HTMLElement>(`[data-remove="${key}"]`))
					.find(Boolean) ?? document.getElementById('tray-clear')
		);
	}

	let resultsPane = $state<HTMLElement>();
	let trayHeight = $state(0);
	// On the root, not on an element of this page: the fixed bottom bar needs
	// its height as room after the layout's footer, and the desktop card is
	// how far the results pane's scroll padding must reach.
	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--tray-room', `${selected.length ? trayHeight : 0}px`);
		return () => root.style.removeProperty('--tray-room');
	});

	/**
	 * Stacked layout: the plain jump to #results. Two panes: the results are
	 * already on screen beside the mosaic, so bring their pane back to its first
	 * card instead of scrolling the page.
	 */
	function seeResults(event: MouseEvent) {
		if (!matchMedia('(min-width: 64rem)').matches) return;
		event.preventDefault();
		resultsPane?.scrollTo({ top: 0 });
		document.getElementById('results')?.focus({ preventScroll: true });
	}

	function toggleMust(canonicalKey: string) {
		const next = must.includes(canonicalKey)
			? must.filter((key) => key !== canonicalKey)
			: [...must, canonicalKey];
		updateUrl((url) => {
			if (next.length) url.searchParams.set('must', next.join(','));
			else url.searchParams.delete('must');
		});
	}

	function setFilter(key: 'cuisine' | 'meal' | 'diet' | 'sort', value: string) {
		updateUrl((url) => {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		});
	}

	function setAllergens(next: string[]) {
		updateUrl((url) => {
			if (next.length) url.searchParams.set('noAllergen', next.join(','));
			else url.searchParams.delete('noAllergen');
		});
	}

	function clearAll() {
		keepFocusThrough(
			updateUrl((url) => {
				url.searchParams.delete('have');
				url.searchParams.delete('must');
			})
		);
	}

	function pickForMe() {
		// Ceiling: only among already-loaded results (MATCH_PAGE_SIZE per
		// page). Under the default sort every ready-now recipe comes first; under
		// kcal/grade/time some may sit unloaded — fine for a random pick, fetch
		// ids server-side if that ever matters.
		const candidates = exact.filter((recipe) => recipe.missing === 0);
		const pool = candidates.length ? candidates : exact;
		const pick = pool[Math.floor(Math.random() * pool.length)];
		if (pick) goto(`/recipe/${pick.id}?lang=${lang}`);
	}

	let fridgeHydrated = false;

	/**
	 * Restores a locally remembered selection into an otherwise-empty URL on
	 * first load, then keeps that memory in sync with every later selection.
	 * The URL stays the single source of truth (see `selected` above) — the
	 * fridge only ever seeds an *empty* URL, so opening a shared link (which
	 * arrives with `have` already set) replaces the fridge rather than
	 * merging with it.
	 */
	$effect(() => {
		const keys = selected;
		if (!fridgeHydrated) {
			fridgeHydrated = true;
			if (keys.length === 0) {
				const stored = loadFridge();
				if (stored.length) updateUrl((url) => url.searchParams.set('have', stored.join(',')));
				// Saving here would overwrite the just-restored fridge with the
				// empty selection this very run started with.
				return;
			}
		}
		saveFridge(keys);
	});

	// Typing must not fire one request per keystroke against FTS.
	$effect(() => {
		const value = query;
		const timer = setTimeout(() => (debouncedQuery = value), 220);
		return () => clearTimeout(timer);
	});

	// Mirror the settled query into the URL. Kept separate from the debounce
	// above so the navigation is driven by the value that actually settled, and
	// guarded on equality so writing the URL can't re-trigger this effect.
	$effect(() => {
		const value = debouncedQuery.trim();
		if (value === (params.get('q') ?? '')) return;
		updateUrl((url) => {
			if (value) url.searchParams.set('q', value);
			else url.searchParams.delete('q');
		});
	});

	// The cleanup's `stale` flag keeps a slow response for an earlier query from
	// landing on top of a newer one.
	$effect(() => {
		const value = debouncedQuery.trim();
		void searchAttempt;
		searchFailed = false;
		if (!titleQueryReady(value)) {
			recipeHits = [];
			return;
		}
		let stale = false;
		cachedJson<{ recipes?: RecipeHit[]; error?: unknown }>(apiUrl('/api/search', { q: value, lang }))
			.then(unlessError)
			.then((data) => {
				if (!stale) recipeHits = data.recipes ?? [];
			})
			.catch(() => {
				if (stale) return;
				recipeHits = [];
				searchFailed = true;
			});
		return () => (stale = true);
	});

	// Short queries filter the full mosaic here: the route answers them empty,
	// since its trigram index cannot match fewer than 3 characters.
	$effect(() => {
		const value = debouncedQuery.trim();
		const fromServer = value.length >= MIN_FTS_LENGTH;
		const search = new URLSearchParams({ lang });
		if (fromServer) search.set('q', value);
		void tilesAttempt;
		tilesFailed = false;
		let stale = false;
		cachedJson<{ results?: IngredientTile[]; error?: unknown }>(apiUrl('/api/ingredients', search))
			.then(unlessError)
			.then((data) => {
				if (stale) return;
				const found = data.results ?? [];
				tiles = fromServer ? found : filterTiles(found, value);
				tilesLoaded = true;
			})
			.catch(() => {
				if (stale) return;
				tiles = [];
				tilesFailed = true;
			});
		return () => (stale = true);
	});

	// At an idle moment once the mosaic is in, so the download never competes
	// with it on a slow link; a language switch loads that language.
	$effect(() => {
		if (tilesLoaded) prefetchMatchData(lang);
	});

	function matchInput() {
		return { selected, lang, cuisine, meal, diet, sort, noAllergen, must, slack };
	}

	// Keyed on a string so the effect below re-runs only when the request would
	// change: `selected`, `must` and `noAllergen` are fresh arrays after every URL
	// write, the debounced `?q=` included.
	const matchKey = $derived(matchRequest(matchInput()));

	/** The server path, unchanged: /api/match through the response cache. */
	function askServer(query: string) {
		loading = true;
		cachedJson<MatchResponse & { error?: unknown }>(apiUrl('/api/match', query))
			.then(unlessError)
			.then((data) => {
				if (requestToken !== query) return;
				results = data.results ?? [];
				total = data.total ?? 0;
				haveCount = data.haveCount ?? 0;
				resultSource = 'server';
			})
			.catch(() => {
				if (requestToken !== query) return;
				results = [];
				total = 0;
				haveCount = 0;
				matchFailed = true;
			})
			.finally(() => {
				if (requestToken === query) loading = false;
			});
	}

	/** Answers `query` in the browser, or hands it to the server if it cannot. */
	function answerLocally(query: string) {
		if (requestToken !== query) return;
		const local = localMatch(query);
		if (!local) return askServer(query);
		results = local.results;
		total = local.total;
		haveCount = local.haveCount;
		resultSource = 'local';
		loading = false;
	}

	/** Whether the effect below has run since this page mounted. */
	let matchedOnce = false;

	$effect(() => {
		const query = matchKey;
		void matchAttempt;
		const firstRun = !matchedOnce;
		matchedOnce = true;
		matchFailed = false;
		loadMoreFailed = false;
		if (!query) {
			results = [];
			total = 0;
			loading = false;
			return;
		}
		// Anything already in flight for a previous selection must not land on top
		// of this one — see `loadMore`.
		requestToken = query;

		if (!localMatchReady(lang)) return askServer(query);
		// On mount (back from a recipe) there is no tap to show first. Untracked:
		// `results` must not become a dependency, or appending a page in
		// loadMore would re-run this and replace the list with its first page.
		if (firstRun) return untrack(() => answerLocally(query));
		// The answer is a frame away: earlier results stay up until it lands, and
		// with none to keep the skeleton shows, as on the server path.
		if (untrack(() => results.length) === 0) loading = true;
		return afterPaint(() => answerLocally(query));
	});

	/**
	 * Appends the next page. Not an `$effect`: offset must not be a reactive
	 * dependency, or bumping it would re-run the effect above and replace the
	 * accumulated list instead of extending it.
	 *
	 * The token guard is load-bearing. Without it, tapping an ingredient while a
	 * page is in flight appends results for the *previous* selection to the new
	 * one — the list would silently contain recipes that don't match.
	 */
	async function loadMore() {
		const query = matchRequest(matchInput(), results.length);
		const token = requestToken;
		loadingMore = true;
		loadMoreFailed = false;
		try {
			let data: MatchResponse | null = null;
			if (localMatchReady(lang)) {
				await new Promise<void>((resolve) => afterPaint(resolve));
				if (requestToken !== token) return;
				data = localMatch(query);
			}
			data ??= unlessError(
				await cachedJson<MatchResponse & { error?: unknown }>(apiUrl('/api/match', query))
			);
			if (requestToken !== token) return;
			results = [...results, ...(data.results ?? [])];
			total = data.total ?? total;
		} catch {
			// Leave what's already loaded in place; the retry below replaces the button.
			if (requestToken === token) loadMoreFailed = true;
		} finally {
			if (requestToken === token) loadingMore = false;
		}
	}
</script>

<SeoHead
	title="{t('app.title')} — {t('app.tagline')}"
	description={t('app.tagline')}
	url={$page.url}
	{lang}
/>

<!-- The page's one <h1>: the layout leaves its tagline out on this route. -->
<div class="intro">
	<h1>{t('app.tagline')}</h1>
	<ol class="steps" aria-label={t('home.steps')}>
		{#each ['home.step1', 'home.step2', 'home.step3'] as key, i (key)}
			<li><span class="pip" aria-hidden="true">{i + 1}</span>{t(key)}</li>
		{/each}
	</ol>
</div>

<FilterBar
	{cuisine}
	{meal}
	{diet}
	{sort}
	{query}
	allergens={noAllergen}
	{t}
	onFilter={setFilter}
	onQuery={(value) => (query = value)}
	onAllergens={setAllergens}
/>

<div class="layout">
	<div class="picker">
		<!-- Above the mosaic, not in a dropdown: the search bar has never had a
		     popup, and adding one would mean a whole combobox ARIA surface
		     (aria-expanded / aria-activedescendant / arrow-key handling) that
		     doesn't exist here. Recipe hits navigate; ingredient tiles below still
		     toggle the selection — two behaviours, two visibly separate regions. -->
		{#if searchFailed}
			<LoadError
				message={t('error.loadFailed')}
				retryLabel={t('error.retry')}
				onRetry={() => searchAttempt++}
			/>
		{:else if recipeHits.length}
			<RecipeHits recipes={recipeHits} {lang} {t} />
		{/if}
		{#if tilesFailed}
			<LoadError
				message={t('error.loadFailed')}
				retryLabel={t('error.retry')}
				onRetry={() => tilesAttempt++}
			/>
		{:else}
			<Mosaic {tiles} {selected} {t} onToggle={toggle} loading={!tilesLoaded} />
		{/if}
	</div>

	<section
		class="results"
		id="results"
		tabindex="-1"
		aria-labelledby="results-heading"
		data-source={resultSource || undefined}
	>
		<div class="results-inner" bind:this={resultsPane}>
			<!-- Selection tray: keeps the current basket and the result count in reach
			     however far down the mosaic the user has scrolled. A bottom bar on
			     the stacked layout; on two panes, a card stuck to the top of this
			     scrolling pane, above the results it summarises. -->
			{#if selected.length}
				<div
					class="tray"
					role="region"
					aria-label={t('mosaic.selected')}
					bind:offsetHeight={trayHeight}
				>
					<div class="tray-head">
						<h2 class="tray-title">
							<span class="tray-label">{t('mosaic.selected')}</span>
							<span class="tray-count">{selected.length}</span>
						</h2>
						<button type="button" class="ghost" id="tray-clear" onclick={clearAll}>
							{t('mosaic.clear')}
						</button>
					</div>
					<!-- Mounted with the tray, so the refusal is announced when it appears. -->
					<p class="limit" role="status">
						{atLimit ? t('mosaic.limit').replace('{n}', String(MAX_HAVE)) : ''}
					</p>
					<ul class="chips">
						{#each selectedTiles as tile (tile.id)}
							<li class="chip-wrap">
								<button
									type="button"
									class="chip"
									data-remove={tile.canonical_key}
									onclick={() => removeFromTray(tile.canonical_key)}
								>
									<span class="chip-art">
										<IngredientIcon
											canonicalKey={tile.canonical_key}
											category={tile.category}
											size={24}
										/>
									</span>
									<span class="chip-name">{tile.name}</span>
									<svg class="x" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
										<path
											d="M6 6l8 8M14 6l-8 8"
											stroke="currentColor"
											stroke-width="2.2"
											stroke-linecap="round"
										/>
									</svg>
									<!-- `mosaic.remove`, not `mosaic.clear`: this button removes ONE
									     ingredient, but "Clear all" made it announce as "Tomato Clear
									     all" — and made every chip claim to wipe the selection. -->
									<span class="sr-only">{t('mosaic.remove')}</span>
								</button>
								{#if slack > 0}
									<!-- A sibling of the chip, not nested inside it — two buttons
									     can't nest. Only shown with slack > 0: with no slack every
									     selection is already required, so pinning one is a no-op. -->
									<button
										type="button"
										class="pin"
										class:pinned={must.includes(tile.canonical_key)}
										aria-pressed={must.includes(tile.canonical_key)}
										aria-label={t('mosaic.mustUse').replace('{name}', tile.name)}
										onclick={() => toggleMust(tile.canonical_key)}
									>
										<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
											<circle
												cx="10"
												cy="7"
												r="3.4"
												fill={must.includes(tile.canonical_key) ? 'currentColor' : 'none'}
												stroke="currentColor"
												stroke-width="1.8"
											/>
											<path
												d="M10 10.4V17"
												stroke="currentColor"
												stroke-width="1.8"
												stroke-linecap="round"
											/>
										</svg>
									</button>
								{/if}
							</li>
						{/each}
					</ul>
					<a class="cta" href="#results" onclick={seeResults}>
						{t('results.see')}
						{#if !loading && !matchFailed}<span class="badge">{total}</span>{/if}
					</a>
				</div>
			{/if}

			<div class="results-head">
				<h2 id="results-heading">{t('results.heading')}</h2>
				<div class="results-head-actions">
					{#if selected.length > 0 && !loading && !matchFailed}
						<!-- The true total, not how many rows this page happened to carry. -->
						<span class="pill">{total} {t('results.found')}</span>
					{/if}
					{#if exact.length > 0 && !loading}
						<button type="button" class="ghost" onclick={pickForMe}>
							{t('results.pickForMe')}
						</button>
					{/if}
				</div>
			</div>

			<!-- One always-mounted live region. A role="status" that is created at the
			     same moment its text appears is skipped by most screen readers, so the
			     previous version announced neither loading nor completion. -->
			<div class="sr-only" role="status" aria-live="polite">{liveStatus}</div>

			{#if selected.length === 0}
				<p class="muted state">{t('results.start')}</p>
			{:else if loading}
				<p class="muted state">{t('results.loading')}</p>
				<!-- Skeletons reserve the space the cards will occupy (no layout shift). -->
				{#each [0, 1, 2] as row (row)}
					<div class="skeleton card" aria-hidden="true"></div>
				{/each}
			{:else if matchFailed}
				<!-- Announced through the live region above, hence announce={false}. -->
				<LoadError
					message={t('error.loadFailed')}
					retryLabel={t('error.retry')}
					onRetry={() => matchAttempt++}
					announce={false}
				/>
			{:else if results.length === 0}
				<p class="state"><strong>{t('results.empty')}</strong></p>
				<p class="muted state">{t('results.emptyHint')}</p>
			{:else if almost.length === 0}
				<!-- No near-misses to distinguish from, so the group headings would be
				     noise: one flat list, and card titles stay directly under the h2. -->
				<div class="list">
					{#each exact as recipe (recipe.id)}
						<ResultCard {recipe} {lang} {t} onAdd={toggle} />
					{/each}
				</div>
			{:else}
				{#if exact.length}
					<h3 class="group-heading">
						{t('results.exactHeading')}
						<span class="group-count">{exact.length}</span>
					</h3>
					<div class="list">
						{#each exact as recipe (recipe.id)}
							<ResultCard {recipe} {lang} {t} headingLevel="h4" onAdd={toggle} />
						{/each}
					</div>
				{/if}
				<h3 class="group-heading">
					{t('results.almostHeading')}
					<span class="group-count">{almost.length}</span>
				</h3>
				<p class="muted group-hint">{t('results.almostHint')}</p>
				<div class="list">
					{#each almost as recipe (recipe.id)}
						<ResultCard {recipe} {lang} {t} headingLevel="h4" onAdd={toggle} />
					{/each}
				</div>
			{/if}

			{#if loadMoreFailed}
				<LoadError message={t('error.loadFailed')} retryLabel={t('error.retry')} onRetry={loadMore} />
			{:else if !loading && results.length > 0 && results.length < total}
				<!-- Full matches always sort before near-misses (see matchRecipes), so
				     appending a page can only extend the groups in order, never
				     interleave — the partition above stays correct as the list grows. -->
				<button type="button" class="ghost load-more" onclick={loadMore} disabled={loadingMore}>
					{loadingMore ? t('results.loading') : t('results.loadMore')}
					<span class="load-more-count">{total - results.length}</span>
				</button>
			{/if}
		</div>
	</section>
</div>

<style>
	.intro {
		display: grid;
		gap: var(--space-3);
		margin: var(--space-4) 0 var(--space-5);
	}
	.intro h1 {
		max-inline-size: 26ch;
		font-size: clamp(1.55rem, 1.05rem + 1.9vw, 2.55rem);
		font-weight: 650;
		line-height: 1.1;
		text-wrap: balance;
		font-variation-settings: 'SOFT' 0, 'WONK' 0;
	}
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.steps li {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}
	.pip {
		display: grid;
		place-items: center;
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
		border: 1.5px solid var(--line-strong);
		border-radius: 50%;
		color: var(--ink);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.steps li:first-child .pip {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--on-primary);
	}

	.layout {
		display: grid;
		gap: var(--space-4);
	}
	/* Two panes so the mosaic and its consequences are visible at once; below
	   this width the results live under the mosaic and the tray links to them. */
	@media (min-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 1.6fr) minmax(20rem, 1fr);
			align-items: start;
		}
		/* Stretched to the mosaic's height: a sticky child only sticks while its
		   parent is taller than it, and a start-aligned cell is exactly as tall
		   as the pane, so the pane used to scroll away with the page. */
		.results {
			align-self: stretch;
		}
		.results-inner {
			position: sticky;
			/* Clear of FilterBar's sticky search row. */
			top: 5.5rem;
			max-height: calc(100vh - 7rem);
			overflow-y: auto;
			padding-inline-end: var(--space-1);
			/* 5px = the global 3px ring + its 2px offset. Without it a card scrolled
			   to either edge of this scrollport has its focus ring shaved off by the
			   overflow clip; scroll-padding keeps focus-driven scrolling clear of the
			   same edge, and of the tray card stuck over the top of it. */
			padding-block: 5px;
			scroll-padding-block: calc(var(--tray-room, 0px) + 5px) 5px;
		}
	}
	/* The bottom bar is fixed: without its height as room after the footer it
	   would cover the end of the page. */
	@media (max-width: 63.99rem) {
		:global(.page:has(.tray)) {
			padding-block-end: calc(var(--tray-room, 7rem) + var(--space-4));
		}
	}

	.results-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		/* The heading text length varies a lot by language (German/Arabic run
		   long); wrap rather than force the pill and pick-for-me button to
		   shrink off a 360px screen. */
		flex-wrap: wrap;
	}
	.results-head h2 {
		margin: var(--space-4) 0 var(--space-2);
	}
	.results-head-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.pill {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 12%, var(--surface));
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.6rem;
		font-variant-numeric: tabular-nums;
	}
	.state {
		margin: var(--space-2) 0;
	}

	.group-heading {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: var(--space-4) 0 var(--space-1);
		font-size: 1rem;
	}
	/* Same tabular-nums treatment as .pill, but in --muted rather than --primary:
	   a group size is orientation, not a call to action. */
	.group-count {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.group-hint {
		margin: 0 0 var(--space-2);
		font-size: 0.85rem;
	}

	.load-more {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		/* 44px minimum target, same rule as the tiles and the recipe hits. */
		min-height: 44px;
		margin: var(--space-2) 0 var(--space-4);
	}
	.load-more[disabled] {
		opacity: 0.6;
		cursor: default;
	}
	.load-more-count {
		font-variant-numeric: tabular-nums;
		opacity: 0.75;
	}

	.skeleton {
		height: 4.5rem;
		margin-bottom: var(--space-2);
		background: linear-gradient(
			90deg,
			var(--surface-sunken) 25%,
			var(--surface) 50%,
			var(--surface-sunken) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.4s linear infinite;
	}
	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}

	/* Selection tray */
	.tray {
		z-index: 10;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		background: var(--surface);
		border: 1px solid var(--line-strong);
	}
	.tray-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.tray-title {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: 1.2rem;
	}
	.tray-count {
		display: inline-grid;
		place-items: center;
		min-width: 1.6rem;
		height: 1.6rem;
		padding: 0 0.4rem;
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--on-primary);
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	/* Out of the layout while empty, but never display:none: a live region
	   has to exist before its text changes for the change to be announced. */
	.limit {
		flex-basis: 100%;
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--primary);
	}
	.limit:empty {
		position: absolute;
	}
	.chips {
		display: flex;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chips:empty {
		display: none;
	}
	/* The chip and its must-use pin read as one joined control: remove on the
	   leading half, pin on the trailing one. */
	.chip-wrap {
		display: inline-flex;
		flex: none;
		max-inline-size: 100%;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		min-height: var(--tap);
		padding-inline: 0.3rem 0.65rem;
		/* Transparent, not none: forced colours paint it, and in that mode the
		   border is the only edge a chip has left. */
		border: 1px solid transparent;
		border-radius: var(--radius-chip);
		background: var(--primary);
		color: var(--on-primary);
		font-size: 0.85rem;
		font-weight: 700;
		white-space: nowrap;
		transition: transform var(--dur) var(--ease-out);
	}
	.chip:not(:last-child) {
		border-start-end-radius: 0;
		border-end-end-radius: 0;
	}
	.chip:active {
		transform: scale(0.96);
	}
	.chip-art {
		width: 1.75rem;
		height: 1.75rem;
		padding: 0.2rem;
		flex: none;
		border-radius: 50%;
		background: var(--surface);
	}
	.chip-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip .x {
		flex: none;
		width: 0.8rem;
		height: 0.8rem;
		opacity: 0.85;
	}
	.pin {
		display: grid;
		place-items: center;
		flex: none;
		width: var(--tap);
		height: var(--tap);
		border: 1px solid color-mix(in srgb, var(--primary) 45%, var(--line-strong));
		border-inline-start: 0;
		border-radius: var(--radius-chip);
		border-start-start-radius: 0;
		border-end-start-radius: 0;
		background: var(--surface);
		color: var(--muted);
		transition:
			background var(--dur-fast) ease,
			color var(--dur-fast) ease;
	}
	.pin svg {
		width: 1.05rem;
		height: 1.05rem;
	}
	.pin:hover {
		color: var(--primary);
	}
	/* Steel, not copper: a pinned pin beside a copper chip has to read as a
	   second state, not as more of the chip. */
	.pin.pinned {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.ghost {
		background: none;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		color: var(--muted);
		padding: 0.4rem 0.8rem;
		min-height: var(--tap);
		font-size: 0.8rem;
		font-weight: 600;
	}
	.ghost:hover {
		color: var(--primary);
		border-color: var(--primary);
	}
	/* Polished copper: a highlight across the top, a shade along the bottom. */
	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex: none;
		min-height: var(--tap);
		padding: 0 1.1rem;
		border: 1px solid color-mix(in srgb, var(--primary) 75%, black);
		border-radius: var(--radius-btn);
		background:
			linear-gradient(
				180deg,
				rgb(255 255 255 / 22%) 0,
				rgb(255 255 255 / 0%) 34%,
				rgb(0 0 0 / 0%) 62%,
				rgb(0 0 0 / 14%) 100%
			),
			var(--primary);
		color: var(--on-primary);
		font-weight: 700;
		text-decoration: none;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 38%),
			inset 0 -1px 0 rgb(0 0 0 / 16%),
			0 10px 22px -12px color-mix(in srgb, var(--primary) 90%, transparent);
		transition: transform var(--dur) var(--ease-out);
	}
	.cta:active {
		transform: translateY(1px);
	}
	.badge {
		background: color-mix(in srgb, var(--on-primary) 25%, transparent);
		border-radius: var(--radius-pill);
		padding: 0 0.45rem;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	/* Stacked layout: a bar along the bottom of the screen, chips in one
	   scrolling row above the count, Clear all and the jump to the results. */
	@media (max-width: 63.99rem) {
		.tray {
			position: fixed;
			inset-inline: 0;
			inset-block-end: 0;
			padding: var(--space-2) var(--space-3) max(var(--space-2), env(safe-area-inset-bottom));
			border-inline: 0;
			border-block-end: 0;
			border-start-start-radius: var(--radius-lg);
			border-start-end-radius: var(--radius-lg);
			background: color-mix(in srgb, var(--surface) 94%, transparent);
			backdrop-filter: blur(10px);
			box-shadow:
				inset 0 1px 0 var(--hi),
				0 -10px 28px -14px rgb(0 0 0 / 40%);
		}
		.tray-head {
			flex: 1 1 auto;
		}
		.tray-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.limit {
			order: -2;
		}
		.chips {
			order: -1;
			flex: 1 1 100%;
			overflow-x: auto;
			scrollbar-width: none;
			padding-block: 2px;
			/* Fade the trailing edge so a clipped chip reads as "scroll for more"
			   rather than as a broken layout. `to right` is physical, so it is
			   mirrored for RTL. */
			mask-image: linear-gradient(to right, black calc(100% - 1.75rem), transparent);
		}
		:global([dir='rtl']) .chips {
			mask-image: linear-gradient(to left, black calc(100% - 1.75rem), transparent);
		}
		/* A mask applies to descendant rendering, focus ring included: drop the
		   fade while focus is inside, the keyboard user is already being moved
		   through the row one chip at a time. */
		.chips:focus-within,
		:global([dir='rtl']) .chips:focus-within {
			mask-image: none;
		}
		.chip-wrap {
			max-inline-size: none;
		}
	}
	/* The blur is what makes a 94%-opaque bar legible over the mosaic scrolling
	   under it. Without transparency there is nothing to blur, so go opaque
	   rather than leaving text over unblurred tiles. */
	@media (max-width: 63.99rem) and (prefers-reduced-transparency: reduce) {
		.tray {
			background: var(--surface);
			backdrop-filter: none;
		}
	}

	/* Two panes: a card stuck to the top of the results pane. */
	@media (min-width: 64rem) {
		.tray {
			position: sticky;
			inset-block-start: 0;
			display: grid;
			gap: var(--space-3);
			margin-block-end: var(--space-2);
			padding: var(--space-4);
			border-radius: var(--radius-card);
			box-shadow:
				inset 0 1px 0 var(--hi),
				0 1px 0 var(--lo),
				var(--shadow-2);
		}
		.tray-head {
			justify-content: space-between;
		}
		/* Up to 50 chips: past a few rows they scroll inside the card, so the
		   card never pushes the results out of their own pane. The padding keeps
		   the focus ring of an edge chip clear of the clip. */
		.chips {
			flex-wrap: wrap;
			max-block-size: min(15.75rem, 30dvh);
			overflow-y: auto;
			margin: -5px;
			padding: 5px;
		}
		.cta {
			min-height: 3.25rem;
			font-size: 1.02rem;
		}
	}
</style>
