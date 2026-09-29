<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import FilterBar from '$components/FilterBar.svelte';
	import Mosaic from '$components/Mosaic.svelte';
	import IngredientIcon from '$components/IngredientIcon.svelte';
	import ResultCard from '$components/ResultCard.svelte';
	import RecipeHits from '$components/RecipeHits.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import { resolveLang, t as translator } from '$lib/i18n';
	import { MIN_FTS_LENGTH } from '$lib/search';
	import { ALLERGENS } from '$lib/config';
	import { slackFor } from '$lib/match';
	import { loadFridge, saveFridge } from '$lib/fridge';
	import type { IngredientTile, MatchResult, RecipeHit } from '$lib/types';

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
	/** Identifies the selection a response belongs to; see `loadMore`. */
	let requestToken = $state('');
	let recipeHits = $state<RecipeHit[]>([]);
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
	const selected = $derived(
		(params.get('have') ?? '')
			.split(',')
			.map((key) => key.trim().toLowerCase())
			.filter((key) => /^[a-z][a-z0-9_]*$/.test(key))
	);
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
				: results.length === 0
					? t('results.empty')
					: `${total} ${t('results.found')}`
	);

	function updateUrl(mutate: (url: URL) => void) {
		const url = new URL($page.url);
		mutate(url);
		goto(url, { keepFocus: true, noScroll: true, replaceState: true });
	}

	/**
	 * The tray is gated on `selected.length`, so emptying it deletes the element
	 * the user was focused on and drops focus to <body> — losing both keyboard
	 * position and context. `keepFocus` can't help: it preserves focus across the
	 * navigation, not across a reactive unmount. Hand focus to the results region.
	 */
	function handOffFocusIfTrayCloses(nextLength: number) {
		if (nextLength > 0) return;
		requestAnimationFrame(() => document.getElementById('results')?.focus());
	}

	function toggle(canonicalKey: string) {
		const next = selected.includes(canonicalKey)
			? selected.filter((value) => value !== canonicalKey)
			: [...selected, canonicalKey];
		handOffFocusIfTrayCloses(next.length);
		updateUrl((url) => {
			if (next.length) url.searchParams.set('have', next.join(','));
			else url.searchParams.delete('have');
			// A pin on an ingredient that just got deselected could never be
			// satisfied (see matchRecipes' mustUse check) — drop it from `must`
			// too rather than leave a dead pin sitting in the URL.
			if (!next.includes(canonicalKey) && must.includes(canonicalKey)) {
				const nextMust = must.filter((key) => key !== canonicalKey);
				if (nextMust.length) url.searchParams.set('must', nextMust.join(','));
				else url.searchParams.delete('must');
			}
		});
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
		handOffFocusIfTrayCloses(0);
		updateUrl((url) => {
			url.searchParams.delete('have');
			url.searchParams.delete('must');
		});
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

	$effect(() => {
		const value = debouncedQuery.trim();
		if (value.length < MIN_FTS_LENGTH) {
			recipeHits = [];
			return;
		}
		fetch(`/api/search?${new URLSearchParams({ q: value, lang })}`)
			.then((response) => response.json())
			.then((data) => (recipeHits = data.recipes ?? []))
			.catch(() => (recipeHits = []));
	});

	$effect(() => {
		const search = new URLSearchParams({ lang });
		if (debouncedQuery.trim()) search.set('q', debouncedQuery.trim());
		fetch(`/api/ingredients?${search}`)
			.then((response) => response.json())
			.then((data) => (tiles = data.results ?? []))
			.catch(() => (tiles = []));
	});

	/** The query for one page of matches. Reading the reactive values here is what
	 *  registers them as dependencies of the effect below. */
	function matchQuery(offset: number) {
		const search = new URLSearchParams({ have: selected.join(','), lang });
		if (cuisine) search.set('cuisine', cuisine);
		if (meal) search.set('meal', meal);
		if (diet) search.set('diet', diet);
		if (sort) search.set('sort', sort);
		if (noAllergen.length) search.set('noAllergen', noAllergen.join(','));
		// Only meaningful once `slack` lets a recipe skip part of the
		// selection — see MatchParams.mustUse — so there's nothing to send
		// when slack is 0, matching the API route's own guard.
		if (must.length && slack > 0) search.set('must', must.join(','));
		if (offset) search.set('offset', String(offset));
		return search.toString();
	}

	$effect(() => {
		if (selected.length === 0) {
			results = [];
			total = 0;
			loading = false;
			return;
		}
		const query = matchQuery(0);
		// Anything already in flight for a previous selection must not land on top
		// of this one — see `loadMore`.
		requestToken = query;

		loading = true;
		fetch(`/api/match?${query}`)
			.then((response) => response.json())
			.then((data) => {
				if (requestToken !== query) return;
				results = data.results ?? [];
				total = data.total ?? 0;
				haveCount = data.haveCount ?? 0;
			})
			.catch(() => {
				if (requestToken !== query) return;
				results = [];
				total = 0;
				haveCount = 0;
			})
			.finally(() => {
				if (requestToken === query) loading = false;
			});
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
		const query = matchQuery(results.length);
		const token = requestToken;
		loadingMore = true;
		try {
			const data = await (await fetch(`/api/match?${query}`)).json();
			if (requestToken !== token) return;
			results = [...results, ...(data.results ?? [])];
			total = data.total ?? total;
		} catch {
			// Leave what's already loaded in place; the button stays available.
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
		{#if recipeHits.length}
			<RecipeHits recipes={recipeHits} {lang} {t} />
		{/if}
		<Mosaic {tiles} {selected} {t} onToggle={toggle} />
	</div>

	<section class="results" id="results" tabindex="-1" aria-labelledby="results-heading">
		<div class="results-inner">
			<div class="results-head">
				<h2 id="results-heading">{t('results.heading')}</h2>
				<div class="results-head-actions">
					{#if selected.length > 0 && !loading}
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

			{#if !loading && results.length > 0 && results.length < total}
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

{#if selected.length}
	<div class="tray" role="region" aria-label={t('mosaic.selected')}>
		<div class="tray-inner">
			<div class="chips">
				{#each selectedTiles as tile (tile.id)}
					<span class="chip-wrap">
						<button type="button" class="chip" onclick={() => toggle(tile.canonical_key)}>
							<span class="chip-art">
								<IngredientIcon canonicalKey={tile.canonical_key} category={tile.category} />
							</span>
							{tile.name}
							<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
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
									<circle cx="10" cy="7" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8" />
									<path d="M10 10.4V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
								</svg>
							</button>
						{/if}
					</span>
				{/each}
			</div>
			<div class="tray-actions">
				<button type="button" class="ghost" onclick={clearAll}>{t('mosaic.clear')}</button>
				<a class="cta" href="#results">
					{t('results.see')}
					{#if !loading}<span class="badge">{total}</span>{/if}
				</a>
			</div>
		</div>
	</div>
{/if}

<style>
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
		.results-inner {
			position: sticky;
			top: 5.5rem;
			max-height: calc(100vh - 7rem);
			overflow-y: auto;
			padding-inline-end: var(--space-1);
			/* 5px = the global 3px ring + its 2px offset. Without it a card scrolled
			   to either edge of this scrollport has its focus ring shaved off by the
			   overflow clip; scroll-padding keeps focus-driven scrolling clear of the
			   same edge rather than parking the card flush against it. */
			padding-block: 5px;
			scroll-padding-block: 5px;
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

	/* Selection tray: keeps the current basket and the result count reachable
	   however far down the mosaic the user has scrolled. */
	.tray {
		position: fixed;
		inset-inline: 0;
		bottom: 0;
		z-index: 10;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		backdrop-filter: blur(10px);
		border-top: 1px solid var(--line);
		box-shadow: var(--shadow-2);
		padding: var(--space-2) var(--space-3) max(var(--space-2), env(safe-area-inset-bottom));
	}
	/* The blur is what makes a 92%-opaque tray legible over the mosaic scrolling
	   under it. Without transparency there is nothing to blur, so go fully opaque
	   rather than leaving text over unblurred tiles. */
	@media (prefers-reduced-transparency: reduce) {
		.tray {
			background: var(--surface);
			backdrop-filter: none;
		}
	}
	.tray-inner {
		max-width: 78rem;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.chips {
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
		flex: 1;
		scrollbar-width: thin;
		padding-block: 2px;
		/* Fade the trailing edge so a clipped chip reads as "scroll for more"
		   rather than as a broken layout. `to right` is physical, so it must be
		   mirrored for RTL — otherwise it dims the *leading* edge in Arabic and
		   inverts the affordance. (Same approach as .back svg on the recipe page.) */
		mask-image: linear-gradient(to right, black calc(100% - 1.5rem), transparent);
	}
	:global([dir='rtl']) .chips {
		mask-image: linear-gradient(to left, black calc(100% - 1.5rem), transparent);
	}
	/* A mask applies to descendant rendering, focus ring included — so a chip
	   scrolled near the trailing edge got a half-faded ring, on the one control
	   that is the only way to undo a selection on mobile. Drop the fade entirely
	   while focus is inside: the affordance is for pointer users scanning the row,
	   and a keyboard user is already being moved through it one chip at a time. */
	.chips:focus-within,
	:global([dir='rtl']) .chips:focus-within {
		mask-image: none;
	}
	/* One flex item per ingredient in `.chips`' scroll row — was the `.chip`
	   button itself before the pin toggle needed a sibling slot beside it. */
	.chip-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		flex: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
		background: var(--accent);
		color: var(--on-accent);
		border: none;
		border-radius: var(--radius-pill);
		padding: 0.35rem 0.7rem;
		font-size: 0.8rem;
		font-weight: 600;
		/* 44px: these are the only way to undo a selection on mobile, and they
		   live in a horizontal scroll container — the worst place to be undersized. */
		min-height: 2.75rem;
		transition: transform var(--dur) var(--ease-spring);
	}
	.chip:active {
		transform: scale(0.94);
	}
	.chip svg {
		width: 0.85em;
		height: 0.85em;
		opacity: 0.85;
	}
	.chip-art {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
	}

	/* Compact rather than the chip's 44px: this is a secondary toggle beside
	   the primary "remove" control, not the only way to do something. */
	.pin {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.9rem;
		height: 1.9rem;
		flex: none;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--muted);
		transition:
			transform var(--dur) var(--ease-spring),
			background var(--dur-fast) ease,
			color var(--dur-fast) ease;
	}
	.pin svg {
		width: 0.9rem;
		height: 0.9rem;
	}
	.pin:hover {
		border-color: var(--primary);
		color: var(--primary);
	}
	.pin:active {
		transform: scale(0.9);
	}
	.pin.pinned {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--on-primary);
	}

	.tray-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: none;
	}
	.ghost {
		background: none;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		color: var(--muted);
		padding: 0.4rem 0.8rem;
		min-height: 2.75rem;
		font-size: 0.8rem;
	}
	.ghost:hover {
		color: var(--primary);
		border-color: var(--primary);
	}
	.cta {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--primary);
		color: var(--on-primary);
		text-decoration: none;
		border-radius: var(--radius-pill);
		padding: 0.5rem 1rem;
		min-height: 2.75rem;
		font-weight: 700;
		box-shadow: var(--shadow-2);
		transition: transform var(--dur) var(--ease-spring);
	}
	.cta:active {
		transform: scale(0.96);
	}
	.badge {
		background: color-mix(in srgb, var(--on-primary) 25%, transparent);
		border-radius: var(--radius-pill);
		padding: 0 0.4rem;
		font-variant-numeric: tabular-nums;
	}
	/* On the two-pane layout the results are already on screen. */
	@media (min-width: 64rem) {
		.cta {
			display: none;
		}
	}
</style>
