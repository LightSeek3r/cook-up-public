<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import IngredientIcon from '$components/IngredientIcon.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import SeasonChip from '$components/SeasonChip.svelte';
	import ScopeSwitch from '$components/ScopeSwitch.svelte';
	import { MAX_HAVE } from '$lib/apiParams';
	import { WORLD_VIEW, maskOf } from '$lib/data/seasons.js';
	import { loadFridge } from '$lib/fridge';
	import { t as translator } from '$lib/i18n';
	import { formatPeak, viewOf } from '$lib/seasonal';
	import { seasonData } from '$lib/seasonal/data.svelte';
	import { seasonPrefs } from '$lib/seasonal/prefs.svelte';
	import {
		SEASON_GROUPS,
		groupOf,
		homeWith,
		monthGroups,
		monthName,
		nextMonth,
		type SeasonGroup,
		type SeasonPageItem
	} from '$lib/seasonal/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const lang = $derived(data.lang);
	const t = $derived(translator(lang));
	const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

	/** Remembered selection, so a tapped item joins it on the home page. */
	let fridge = $state<string[]>([]);
	let group = $state<'all' | SeasonGroup>('all');

	onMount(() => {
		seasonPrefs.hydrate();
		seasonData.want();
		fridge = loadFridge();
	});

	// The server renders the world view (the only one that does not depend on
	// the reader) from the masks it sends; once seasons.json is in, the page
	// shows the reader's own calendar. Until then, and for good if the file
	// cannot be had, it stays on the world.
	const view = $derived(seasonData.seasons ? viewOf(seasonPrefs.view) : WORLD_VIEW);
	const maskFor = $derived.by(() => {
		const seasons = seasonData.seasons;
		return (item: SeasonPageItem) => (view === WORLD_VIEW || !seasons ? item.world : maskOf(seasons, item.id - 1, view));
	});

	const all = $derived(monthGroups(data.items, maskFor, data.month, lang));
	const present = $derived(
		SEASON_GROUPS.filter((g) => [...all.now, ...all.next].some(({ item }) => groupOf(item.category) === g))
	);
	const options = $derived<('all' | SeasonGroup)[]>(['all', ...present]);
	// A group chosen in another month may have nothing in this one.
	const shown = $derived(group !== 'all' && present.includes(group) ? group : 'all');
	const inGroup = (entry: { item: SeasonPageItem }) => shown === 'all' || groupOf(entry.item.category) === shown;
	const now = $derived(all.now.filter(inGroup));
	const next = $derived(all.next.filter(inGroup));

	const title = $derived(t('seasonal.monthTitle').replace('{month}', monthName(data.month, lang)));
	const nextName = $derived(monthName(nextMonth(data.month), lang));

	function label(item: SeasonPageItem, mask: number) {
		const add = t('seasonal.addToFridge').replace('{name}', item.name);
		const peak = formatPeak(mask, lang);
		return peak ? `${add}. ${t('seasonal.peak').replace('{range}', peak)}` : add;
	}
</script>

<SeoHead
	title="{title} — {t('app.title')}"
	description={t('seasonal.metaDescription').replace('{month}', monthName(data.month, lang))}
	url={page.url}
	{lang}
/>

{#snippet tiles(entries: { item: SeasonPageItem; mask: number }[], upcoming: boolean)}
	<ul class="grid" class:upcoming>
		{#each entries as { item, mask } (item.id)}
			{@const held = fridge.includes(item.canonical_key)}
			<li data-cat={item.category}>
				<a class="tile" class:held href={homeWith(item.canonical_key, lang, fridge, MAX_HAVE)} aria-label={label(item, mask)}>
					<span class="art">
						<IngredientIcon canonicalKey={item.canonical_key} category={item.category} size={40} />
					</span>
					<span class="name">{item.name}</span>
					<span class="peak">{formatPeak(mask, lang)}</span>
					<span class="mark" aria-hidden="true">
						<svg viewBox="0 0 20 20" fill="none">
							{#if held}
								<path d="M5 10.5 8.5 14 15 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
							{:else}
								<path d="M10 5v10M5 10h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
							{/if}
						</svg>
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<article class="seasonal">
	<header class="masthead">
		<p class="eyebrow">
			<svg class="leaf" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
				<path d="M13.7 2.3c.6 6.7-2.3 11.1-7.7 11.3-1.1 0-2-.3-2.7-.8C2.9 7.9 6.6 3.1 13.7 2.3Z" />
				<path class="rib" d="M3.1 13.5C5 10 7.6 7.4 11 5.4" />
			</svg>
			{t('seasonal.title')}
		</p>
		<h1>{title}</h1>
		<p class="intro">{t('seasonal.intro')}</p>
		<div class="controls">
			<ScopeSwitch {t} />
			<SeasonChip {lang} {t} />
		</div>
	</header>

	<nav class="months" aria-label={t('seasonal.month.aria')}>
		<ol>
			{#each MONTHS as m (m)}
				<li>
					<a
						href="/seasonal/{m}?lang={lang}"
						aria-current={m === data.month ? 'page' : undefined}
						class:today={m === seasonData.month}
						data-sveltekit-noscroll
					>
						<span aria-hidden="true">{monthName(m, lang, 'short')}</span>
						<span class="sr-only">{monthName(m, lang)}{m === seasonData.month ? ` (${t('seasonal.thisMonth')})` : ''}</span>
					</a>
				</li>
			{/each}
		</ol>
	</nav>

	{#if present.length > 1}
		<div class="cats" role="group" aria-label={t('seasonal.category.label')}>
			{#each options as value (value)}
				<button type="button" class="cat" aria-pressed={shown === value} onclick={() => (group = value)}>
					{t(`seasonal.category.${value}`)}
				</button>
			{/each}
		</div>
	{/if}

	<div class="board">
		{#if now.length === 0 && next.length === 0}
			<p class="empty">{t('seasonal.empty')}</p>
		{:else}
			{#if now.length}
				<section aria-labelledby="peaking">
					<h2 id="peaking" class="plate">
						{t('seasonal.peaking')}
						<span class="count">{now.length}</span>
					</h2>
					{@render tiles(now, false)}
				</section>
			{/if}
			{#if next.length}
				<section aria-labelledby="coming">
					<h2 id="coming" class="plate">
						{t('seasonal.next')}
						<span class="sub">{nextName}</span>
						<span class="count">{next.length}</span>
					</h2>
					{@render tiles(next, true)}
				</section>
			{/if}
		{/if}
	</div>

	<p class="typical muted">{t('seasonal.typical')}</p>
</article>

<style>
	.seasonal {
		display: grid;
		gap: var(--space-4);
		margin-block: var(--space-3) var(--space-5);
	}
	.masthead {
		display: grid;
		gap: var(--space-2);
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		color: var(--primary);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.eyebrow:is(:lang(ar), :lang(pnb), :lang(hi), :lang(bn), :lang(zh), :lang(ja), :lang(ko)) {
		letter-spacing: 0;
	}
	.leaf {
		width: 1.1rem;
		height: 1.1rem;
		fill: var(--grade-a);
	}
	.leaf .rib {
		fill: none;
		stroke: var(--surface);
		stroke-width: 1.1;
		stroke-linecap: round;
	}
	h1 {
		font-size: clamp(1.9rem, 1.2rem + 2.6vw, 3.1rem);
		line-height: 1.05;
		text-wrap: balance;
	}
	.intro {
		max-inline-size: 60ch;
		margin: 0;
		color: var(--muted);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-block-start: var(--space-1);
	}

	/* Twelve stamped tabs: one row that scrolls on phones, a full strip on wider screens. */
	.months ol {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(3.4rem, 1fr);
		gap: 4px;
		margin: 0;
		padding: 4px;
		list-style: none;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		background: var(--tex), var(--sheen);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 2px var(--lo-2);
	}
	.months li {
		scroll-snap-align: start;
	}
	.months a {
		position: relative;
		display: grid;
		place-items: center;
		min-height: var(--tap);
		padding: 0 0.4rem;
		border-radius: calc(var(--radius-lg) - 5px);
		color: var(--ink);
		font-size: 0.88rem;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
		transition: background var(--dur-fast) ease;
	}
	.months a:hover {
		background: color-mix(in srgb, var(--primary) 9%, transparent);
		color: var(--primary);
	}
	.months a[aria-current='page'] {
		background: var(--primary);
		color: var(--on-primary);
		font-weight: 800;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 25%),
			0 2px 6px -2px color-mix(in srgb, var(--primary) 70%, transparent);
	}
	/* The reader's month: a green pip under the name, set only after hydration. */
	.months a.today::after {
		content: '';
		position: absolute;
		inset-block-end: 0.3rem;
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 50%;
		background: var(--grade-a);
		box-shadow: 0 0 0 2px var(--surface);
	}

	.cats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.cat {
		min-height: var(--tap);
		padding: 0 1rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		background: var(--sheen);
		color: var(--ink);
		font-size: 0.88rem;
		font-weight: 600;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
	}
	.cat:hover {
		border-color: var(--primary);
	}
	.cat[aria-pressed='true'] {
		background: color-mix(in srgb, var(--primary) 13%, var(--surface));
		border-color: var(--primary);
		box-shadow: var(--shadow-press);
		font-weight: 750;
	}

	/* The home page's cutting board, drawn the same way. */
	.board {
		position: relative;
		isolation: isolate;
		display: grid;
		gap: var(--space-5);
		padding: var(--space-5);
		background-color: var(--board);
		border: 1px solid var(--board-edge);
		border-radius: var(--radius-lg);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 25%),
			0 5px 0 var(--board-edge),
			0 20px 28px -20px rgb(0 0 0 / 55%);
	}
	.board::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background-image:
			repeating-linear-gradient(
				180deg,
				transparent 0 calc(4.5rem - 2px),
				rgb(0 0 0 / 20%) calc(4.5rem - 2px) calc(4.5rem - 1px),
				rgb(255 255 255 / 12%) calc(4.5rem - 1px) 4.5rem
			),
			repeating-linear-gradient(176deg, rgb(0 0 0 / 4.5%) 0 1px, transparent 1px 6px, rgb(255 255 255 / 5%) 6px 7px, transparent 7px 13px);
		pointer-events: none;
	}
	section {
		display: grid;
		gap: var(--space-3);
	}
	.plate {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		justify-self: start;
		max-inline-size: 100%;
		margin: 0;
		padding: 0.35rem 0.6rem 0.35rem 0.8rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-size: 1.1rem;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 2px var(--lo-2);
	}
	.sub {
		color: var(--muted);
		font-family: var(--font-body);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.count {
		padding: 0.05rem 0.5rem;
		border-radius: var(--radius-pill);
		background: var(--surface-sunken);
		color: var(--muted);
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.25rem, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tile {
		position: relative;
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 0.3rem;
		height: 100%;
		min-height: 8rem;
		padding: 0.8rem 0.45rem 0.65rem;
		border: 1px solid var(--cat-line, var(--line));
		border-radius: var(--radius-tile);
		background: var(--cat-tint, var(--surface));
		color: var(--ink);
		text-decoration: none;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 2px 0 rgb(0 0 0 / 14%),
			0 6px 10px -6px rgb(0 0 0 / 45%);
		transition:
			transform var(--dur) var(--ease-out),
			border-color var(--dur-fast) ease;
	}
	.tile:hover {
		border-color: var(--cat-ink, var(--line-strong));
		transform: translateY(-2px);
	}
	.tile:active {
		transform: translateY(1px) scale(0.97);
	}
	.tile:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
		box-shadow: 0 0 0 2px var(--surface);
	}
	.upcoming .tile {
		border-style: dashed;
		background: color-mix(in srgb, var(--cat-tint, var(--surface)) 70%, var(--surface));
	}
	.art {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		padding: 0.5rem;
		border-radius: 50%;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--cat-line, var(--line)),
			inset 0 2px 4px var(--lo),
			0 1px 0 var(--hi);
	}
	.name {
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1.2;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.peak {
		color: var(--cat-ink, var(--muted));
		font-size: 0.72rem;
		font-weight: 600;
		text-align: center;
	}
	.mark {
		position: absolute;
		inset-block-start: 0.35rem;
		inset-inline-end: 0.35rem;
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 50%;
		background: var(--surface);
		color: var(--cat-ink, var(--primary));
		box-shadow: inset 0 0 0 1px var(--cat-line, var(--line));
	}
	.held .mark {
		background: var(--accent);
		color: var(--on-accent);
		box-shadow: none;
	}
	.mark svg {
		width: 0.8rem;
		height: 0.8rem;
	}
	.empty {
		margin: 0;
		padding: var(--space-4);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		text-align: center;
		font-weight: 600;
	}
	.typical {
		margin: 0;
		font-style: italic;
	}

	@media (min-width: 48rem) {
		.months ol {
			overflow: visible;
		}
	}
	@media (max-width: 600px) {
		.board {
			padding: var(--space-3);
			margin-inline: calc(-1 * var(--space-1));
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(6.1rem, 1fr));
		}
	}
	@media (forced-colors: active) {
		.board::before {
			display: none;
		}
		.months a[aria-current='page'],
		.cat[aria-pressed='true'] {
			forced-color-adjust: none;
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
