<script lang="ts">
	import { onMount } from 'svelte';
	import IngredientIcon from './IngredientIcon.svelte';
	import SeasonChip from './SeasonChip.svelte';
	import ScopeSwitch from './ScopeSwitch.svelte';
	import { maskOf, WORLD_VIEW } from '$lib/data/seasons.js';
	import { formatPeak, seasonalNow, viewOf } from '$lib/seasonal';
	import { seasonData } from '$lib/seasonal/data.svelte';
	import { seasonPrefs } from '$lib/seasonal/prefs.svelte';
	import { monthName } from '$lib/seasonal/ui';
	import type { IngredientTile } from '$lib/types';

	interface Props {
		/** The full mosaic: the shelf only offers what the board itself can select. */
		tiles: IngredientTile[];
		selected: string[];
		lang: string;
		t: (key: string) => string;
		onToggle: (canonicalKey: string) => void;
	}

	let { tiles, selected, lang, t, onToggle }: Props = $props();

	const LIMIT = 24;
	const uid = $props.id();

	onMount(() => {
		seasonPrefs.hydrate();
		seasonData.want();
	});

	// Tile ids are ingredient ids, and an ingredient's index in seasons.json is id - 1 (core.bin's numbering).
	const byIndex = $derived(new Map(tiles.map((tile) => [tile.id - 1, tile])));
	const view = $derived(viewOf(seasonPrefs.view));
	const month = $derived(seasonData.month);

	function itemsFor(v: number) {
		const seasons = seasonData.seasons;
		if (!seasons || !month || !byIndex.size) return [];
		return seasonalNow(seasons, v, month, { limit: LIMIT, filter: (g) => byIndex.has(g) }).map((g) => ({
			tile: byIndex.get(g) as IngredientTile,
			peak: formatPeak(maskOf(seasons, g, v), lang)
		}));
	}

	const items = $derived(itemsFor(view));
	// Kept on screen while the reader's own climate has nothing this month, so
	// the switch to the world's calendar stays in reach.
	const anywhere = $derived(items.length > 0 || (view !== WORLD_VIEW && itemsFor(WORLD_VIEW).length > 0));
</script>

{#if anywhere}
	<section class="shelf" aria-labelledby="{uid}-title">
		<div class="head">
			<div class="title-block">
				<p class="eyebrow">{monthName(month, lang)}</p>
				<h2 id="{uid}-title">
					<svg class="leaf" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path d="M13.7 2.3c.6 6.7-2.3 11.1-7.7 11.3-1.1 0-2-.3-2.7-.8C2.9 7.9 6.6 3.1 13.7 2.3Z" />
						<path class="rib" d="M3.1 13.5C5 10 7.6 7.4 11 5.4" />
					</svg>
					{t('seasonal.now')}
				</h2>
				<p class="hint">{t('seasonal.nowHint')}</p>
			</div>
			<div class="controls">
				<ScopeSwitch {t} />
				<SeasonChip {lang} {t} />
			</div>
		</div>

		{#if items.length}
			<ul class="rail">
				{#each items as { tile, peak } (tile.id)}
					{@const on = selected.includes(tile.canonical_key)}
					<li data-cat={tile.category}>
						<button type="button" class="item" class:on aria-pressed={on} onclick={() => onToggle(tile.canonical_key)}>
							<span class="art">
								<IngredientIcon canonicalKey={tile.canonical_key} category={tile.category} size={32} />
							</span>
							<span class="name">{tile.name}</span>
							{#if peak}<span class="peak">{peak}</span>{/if}
							<span class="plus" aria-hidden="true">
								<svg viewBox="0 0 20 20" fill="none">
									{#if on}
										<path d="M5 10.5 8.5 14 15 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
									{:else}
										<path d="M10 5v10M5 10h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
									{/if}
								</svg>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty muted">{t('seasonal.empty')}</p>
		{/if}

		<div class="foot">
			<p class="typical">{t('seasonal.typical')}</p>
			<a class="more" href="/seasonal/{month}?lang={lang}">{t('seasonal.seeAll')}</a>
		</div>
	</section>
{/if}

<style>
	/* A steel shelf with a wooden ledge, between the search and the board: the
	   same materials as the header and the mosaic below it. */
	.shelf {
		position: relative;
		display: grid;
		gap: var(--space-3);
		margin-block-end: var(--space-4);
		padding: var(--space-4) var(--space-4) 0;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		background: var(--tex), var(--sheen);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 2px var(--lo-2);
		overflow: hidden;
		animation: shelf-in 320ms var(--ease-out) backwards;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.title-block {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.eyebrow {
		margin: 0;
		color: var(--primary);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.eyebrow:is(:lang(ar), :lang(pnb), :lang(hi), :lang(bn), :lang(zh), :lang(ja), :lang(ko)) {
		letter-spacing: 0;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		font-size: 1.35rem;
	}
	.leaf {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		fill: var(--grade-a);
	}
	.leaf .rib {
		fill: none;
		stroke: var(--surface);
		stroke-width: 1.1;
		stroke-linecap: round;
	}
	.hint {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	/* One scrolling row on every width, snapping item by item. The padding
	   keeps focus rings and the lift on hover clear of the clip. */
	.rail {
		display: flex;
		gap: var(--space-2);
		margin: 0 calc(-1 * var(--space-4));
		padding: 6px var(--space-4) var(--space-3);
		list-style: none;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scroll-snap-type: x mandatory;
		scroll-padding-inline: var(--space-4);
		scrollbar-width: thin;
		mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
	}
	:global([dir='rtl']) .rail {
		mask-image: linear-gradient(to left, black calc(100% - 2rem), transparent);
	}
	.rail:focus-within,
	:global([dir='rtl']) .rail:focus-within {
		mask-image: none;
	}
	.rail li {
		flex: none;
		scroll-snap-align: start;
	}
	.item {
		position: relative;
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 0.3rem;
		width: 6.6rem;
		min-height: 7.4rem;
		padding: 0.7rem 0.4rem 0.6rem;
		border: 1px solid var(--cat-line, var(--line));
		border-radius: var(--radius-tile);
		background: var(--cat-tint, var(--surface));
		color: var(--ink);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 2px 0 rgb(0 0 0 / 12%),
			0 6px 10px -6px rgb(0 0 0 / 40%);
		transition:
			transform var(--dur) var(--ease-out),
			border-color var(--dur-fast) ease,
			background var(--dur-fast) ease;
	}
	.item:hover {
		border-color: var(--cat-ink, var(--line-strong));
		transform: translateY(-2px);
	}
	.item:active {
		transform: translateY(1px) scale(0.97);
	}
	.item.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.art {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0.4rem;
		border-radius: 50%;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--cat-line, var(--line)),
			inset 0 2px 4px var(--lo);
	}
	.name {
		font-size: 0.8rem;
		font-weight: 700;
		line-height: 1.2;
		text-align: center;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.peak {
		color: var(--cat-ink, var(--muted));
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
	}
	.item.on .peak {
		color: inherit;
		opacity: 0.85;
	}
	.plus {
		position: absolute;
		inset-block-start: 0.3rem;
		inset-inline-end: 0.3rem;
		display: grid;
		place-items: center;
		width: 1.3rem;
		height: 1.3rem;
		border-radius: 50%;
		background: var(--surface);
		color: var(--cat-ink, var(--primary));
		box-shadow: inset 0 0 0 1px var(--cat-line, var(--line));
	}
	.item.on .plus {
		background: var(--on-accent);
		color: var(--accent);
		box-shadow: none;
	}
	.plus svg {
		width: 0.8rem;
		height: 0.8rem;
	}
	.empty {
		margin: 0;
		padding-block-end: var(--space-3);
	}

	/* The ledge: a strip of the board's wood the items stand on. */
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
		margin: 0 calc(-1 * var(--space-4));
		padding: 0.35rem var(--space-4);
		background-color: var(--board);
		border-block-start: 1px solid var(--board-edge);
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 22%);
	}
	.typical {
		margin: 0;
		color: color-mix(in srgb, var(--ink) 80%, var(--board));
		font-size: 0.75rem;
		font-style: italic;
	}
	.more {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		color: var(--ink);
		font-size: 0.82rem;
		font-weight: 700;
		text-decoration: underline;
		text-decoration-thickness: 1px;
	}
	.more:hover {
		color: var(--primary);
	}
	@media (max-width: 600px) {
		.shelf {
			padding: var(--space-3) var(--space-3) 0;
			margin-inline: calc(-1 * var(--space-1));
		}
		.rail,
		.foot {
			margin-inline: calc(-1 * var(--space-3));
			padding-inline: var(--space-3);
		}
		.item {
			width: 6rem;
		}
	}
	@keyframes shelf-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	@media (forced-colors: active) {
		.item.on {
			forced-color-adjust: none;
			background: Highlight;
			color: HighlightText;
		}
		.rail {
			mask-image: none;
		}
	}
</style>
