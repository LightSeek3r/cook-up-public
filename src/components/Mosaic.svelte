<script lang="ts">
	import IngredientTile from './IngredientTile.svelte';
	import IngredientIcon from './IngredientIcon.svelte';
	import { INGREDIENT_CATEGORIES } from '$lib/config';
	import type { IngredientTile as Tile } from '$lib/types';

	interface Props {
		tiles: Tile[];
		selected: string[];
		t: (key: string) => string;
		onToggle: (canonicalKey: string) => void;
		/** First load still in flight: nothing to show yet, but not "no match" either. */
		loading?: boolean;
	}

	let { tiles, selected, t, onToggle, loading = false }: Props = $props();

	/**
	 * The full mosaic is ~900 tiles. Rendering it flat is an undifferentiated wall
	 * nobody can scan, so each category shows its most-used ingredients first and
	 * the tail is opt-in. Anything already selected is always visible, otherwise
	 * collapsing would hide the user's own choices.
	 */
	const COLLAPSED = 18;

	let expanded = $state<Record<string, boolean>>({});

	const groups = $derived(
		INGREDIENT_CATEGORIES.map((category) => {
			const all = tiles.filter((tile) => tile.category === category);
			const isOpen = expanded[category] ?? false;
			const visible = isOpen
				? all
				: [
						...all.slice(0, COLLAPSED),
						...all.slice(COLLAPSED).filter((tile) => selected.includes(tile.canonical_key))
					];
			// Weight is relative to the category, not the whole mosaic: otherwise
			// Onion would be the only large tile on the page and every other
			// section would render as a flat grid.
			const peak = Math.max(1, ...all.map((tile) => tile.recipe_count));
			return { category, all, visible, isOpen, peak, hidden: all.length - visible.length };
		}).filter((group) => group.all.length > 0)
	);
</script>

{#if loading || groups.length}
	<div class="board">
		{#if loading}
			<!-- Two collapsed groups' worth of placeholders: taller than any phone
			     viewport, so the results and footer below already sit off-screen and
			     do not jump when the real tiles replace these. -->
			{#each [0, 1] as group (group)}
				<div class="group placeholder" aria-hidden="true">
					<span class="skeleton bar"></span>
					<div class="mosaic">
						{#each Array(COLLAPSED) as _, i (i)}
							<span class="skeleton cell"></span>
						{/each}
					</div>
				</div>
			{/each}
		{/if}

		{#each groups as group (group.category)}
			<section class="group" data-cat={group.category}>
				<div class="head">
					<span class="badge">
						<IngredientIcon canonicalKey="" category={group.category} size={24} />
					</span>
					<h2>{t(`category.${group.category}`)}</h2>
					<span class="count">{group.all.length}</span>
				</div>

				<div class="mosaic" id="mosaic-{group.category}">
					{#each group.visible as tile, index (tile.id)}
						<IngredientTile
							{tile}
							{index}
							selected={selected.includes(tile.canonical_key)}
							weight={tile.recipe_count / group.peak}
							{onToggle}
						/>
					{/each}
				</div>

				{#if group.hidden > 0 || group.isOpen}
					<button
						type="button"
						class="more"
						aria-expanded={group.isOpen}
						aria-controls="mosaic-{group.category}"
						onclick={() => (expanded = { ...expanded, [group.category]: !group.isOpen })}
					>
						{group.isOpen ? t('mosaic.showLess') : `${t('mosaic.showAll')} (${group.all.length})`}
					</button>
				{/if}
			</section>
		{/each}
	</div>
{:else}
	<p class="muted empty">{t('mosaic.noMatch')}</p>
{/if}

<style>
	/* The wooden board behind the grid, drawn in CSS: plank seams every 4.5rem
	   and two layers of fine slanted grain, black/white alpha over --board so the
	   same drawing works on the light and the dark wood. Everything that carries
	   text sits on a solid plate above it. */
	.board {
		position: relative;
		isolation: isolate;
		display: grid;
		gap: var(--space-5);
		padding: var(--space-5);
		margin-block-end: 5px;
		background-color: var(--board);
		border: 1px solid var(--board-edge);
		border-radius: var(--radius-lg);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 25%),
			inset 0 0 0 1px rgb(255 255 255 / 6%),
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
			repeating-linear-gradient(
				176deg,
				rgb(0 0 0 / 4.5%) 0 1px,
				transparent 1px 6px,
				rgb(255 255 255 / 5%) 6px 7px,
				transparent 7px 13px
			),
			repeating-linear-gradient(183deg, transparent 0 21px, rgb(0 0 0 / 5%) 21px 23px, transparent 23px 47px);
		pointer-events: none;
	}

	.group {
		display: grid;
		gap: var(--space-3);
	}
	/* A label plate screwed to the board: solid, so the heading never sits on
	   the grain. */
	.head {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		justify-self: start;
		max-inline-size: 100%;
		padding: 0.3rem;
		padding-inline-end: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 2px var(--lo-2);
	}
	.badge {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0.25rem;
		flex: none;
		background: var(--cat-tint);
		border-radius: var(--radius-sm);
	}
	.head h2 {
		margin: 0;
		font-size: 1.05rem;
		overflow-wrap: anywhere;
	}
	.count {
		flex: none;
		font-variant-numeric: tabular-nums;
		font-size: 0.75rem;
		font-weight: 800;
		color: var(--cat-ink);
		background: var(--cat-tint);
		border-radius: var(--radius-pill);
		padding: 0.05rem 0.5rem;
	}
	.mosaic {
		display: grid;
		/* auto-fill keeps the cell size stable so `span 2` tiles stay predictable. */
		grid-template-columns: repeat(auto-fill, minmax(5.6rem, 1fr));
		gap: var(--space-2);
	}
	.more {
		justify-self: start;
		min-height: var(--tap);
		padding: 0 0.95rem;
		background: var(--surface);
		border: 1px dashed var(--cat-ink);
		border-radius: var(--radius-chip);
		color: var(--cat-ink);
		font-size: 0.85rem;
		font-weight: 700;
		transition:
			background var(--dur-fast) ease,
			border-color var(--dur-fast) ease;
	}
	.more:hover {
		background: var(--cat-tint);
		border-style: solid;
	}
	.empty {
		margin: var(--space-5) 0;
	}

	.skeleton {
		display: block;
		border-radius: var(--radius-tile);
		background: var(--surface-sunken);
		opacity: 0.7;
	}
	.bar {
		inline-size: 10rem;
		block-size: 2.7rem;
	}
	/* Same floor as IngredientTile, so the reserved height matches the real grid. */
	.cell {
		min-block-size: 6rem;
	}

	@media (max-width: 600px) {
		.board {
			padding: var(--space-3);
			margin-inline: calc(-1 * var(--space-1));
		}
		.mosaic {
			grid-template-columns: repeat(auto-fill, minmax(4.6rem, 1fr));
		}
	}

	@media (forced-colors: active) {
		.board::before {
			display: none;
		}
	}
</style>
