<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import FilterBar from '$components/FilterBar.svelte';
	import Mosaic from '$components/Mosaic.svelte';
	import IngredientIcon from '$components/IngredientIcon.svelte';
	import ResultCard from '$components/ResultCard.svelte';
	import { resolveLang, t as translator } from '$lib/i18n';
	import type { IngredientTile, MatchResult } from '$lib/types';

	let tiles = $state<IngredientTile[]>([]);
	let results = $state<MatchResult[]>([]);
	let loading = $state(false);
	let query = $state('');
	let debouncedQuery = $state('');

	// The URL is the single source of truth: selection is shareable and the app
	// stays completely stateless server-side.
	const params = $derived($page.url.searchParams);
	const lang = $derived(resolveLang(params.get('lang')));
	const t = $derived(translator(lang));
	const selected = $derived(
		(params.get('have') ?? '')
			.split(',')
			.map(Number)
			.filter((n) => Number.isInteger(n) && n > 0)
	);
	const cuisine = $derived(params.get('cuisine') ?? '');
	const meal = $derived(params.get('meal') ?? '');
	const diet = $derived(params.get('diet') ?? '');
	const sort = $derived(params.get('sort') ?? '');

	const selectedTiles = $derived(tiles.filter((tile) => selected.includes(tile.id)));

	// Text for the always-mounted live region; empty before the user picks anything
	// so it never announces on first load.
	const liveStatus = $derived(
		selected.length === 0
			? ''
			: loading
				? t('results.loading')
				: results.length === 0
					? t('results.empty')
					: `${results.length} ${t('results.found')}`
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

	function toggle(id: number) {
		const next = selected.includes(id)
			? selected.filter((value) => value !== id)
			: [...selected, id];
		handOffFocusIfTrayCloses(next.length);
		updateUrl((url) => {
			if (next.length) url.searchParams.set('have', next.join(','));
			else url.searchParams.delete('have');
		});
	}

	function setFilter(key: 'cuisine' | 'meal' | 'diet' | 'sort', value: string) {
		updateUrl((url) => {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		});
	}

	function clearAll() {
		handOffFocusIfTrayCloses(0);
		updateUrl((url) => url.searchParams.delete('have'));
	}

	// Typing must not fire one request per keystroke against FTS.
	$effect(() => {
		const value = query;
		const timer = setTimeout(() => (debouncedQuery = value), 220);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const search = new URLSearchParams({ lang });
		if (debouncedQuery.trim()) search.set('q', debouncedQuery.trim());
		fetch(`/api/ingredients?${search}`)
			.then((response) => response.json())
			.then((data) => (tiles = data.results ?? []))
			.catch(() => (tiles = []));
	});

	$effect(() => {
		if (selected.length === 0) {
			results = [];
			loading = false;
			return;
		}
		const search = new URLSearchParams({ have: selected.join(','), lang });
		if (cuisine) search.set('cuisine', cuisine);
		if (meal) search.set('meal', meal);
		if (diet) search.set('diet', diet);
		if (sort) search.set('sort', sort);

		loading = true;
		fetch(`/api/match?${search}`)
			.then((response) => response.json())
			.then((data) => (results = data.results ?? []))
			.catch(() => (results = []))
			.finally(() => (loading = false));
	});
</script>

<FilterBar
	{cuisine}
	{meal}
	{diet}
	{sort}
	{query}
	{t}
	onFilter={setFilter}
	onQuery={(value) => (query = value)}
/>

<div class="layout">
	<div class="picker">
		<Mosaic {tiles} {selected} {t} onToggle={toggle} />
	</div>

	<section class="results" id="results" tabindex="-1" aria-labelledby="results-heading">
		<div class="results-inner">
			<div class="results-head">
				<h2 id="results-heading">{t('results.heading')}</h2>
				{#if selected.length > 0 && !loading}
					<span class="pill">{results.length} {t('results.found')}</span>
				{/if}
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
			{:else}
				<div class="list">
					{#each results as recipe (recipe.id)}
						<ResultCard {recipe} {lang} {t} />
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>

{#if selected.length}
	<div class="tray" role="region" aria-label={t('mosaic.selected')}>
		<div class="tray-inner">
			<div class="chips">
				{#each selectedTiles as tile (tile.id)}
					<button type="button" class="chip" onclick={() => toggle(tile.id)}>
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
				{/each}
			</div>
			<div class="tray-actions">
				<button type="button" class="ghost" onclick={clearAll}>{t('mosaic.clear')}</button>
				<a class="cta" href="#results">
					{t('results.see')}
					{#if !loading}<span class="badge">{results.length}</span>{/if}
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
		}
	}

	.results-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.results-head h2 {
		margin: var(--space-4) 0 var(--space-2);
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
