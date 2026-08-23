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
	}

	let { tiles, selected, t, onToggle }: Props = $props();

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

{#each groups as group (group.category)}
	<section class="group" data-cat={group.category}>
		<div class="head">
			<span class="badge">
				<IngredientIcon canonicalKey="" category={group.category} />
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

{#if groups.length === 0}
	<p class="muted empty">{t('mosaic.noMatch')}</p>
{/if}

<style>
	.group + .group {
		margin-top: var(--space-5);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		/* A hairline in the category hue ties the heading to its tiles. */
		border-block-end: 2px solid var(--cat-line);
		padding-block-end: var(--space-2);
	}
	.badge {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0.28rem;
		flex: none;
		color: var(--cat-ink);
		background: var(--cat-tint);
		border: 1px solid var(--cat-line);
		border-radius: var(--radius-sm);
	}
	.head h2 {
		margin: 0;
		flex: 1;
		font-size: 1.05rem;
	}
	.count {
		font-variant-numeric: tabular-nums;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--cat-ink);
		background: var(--cat-tint);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.55rem;
	}
	.mosaic {
		display: grid;
		/* auto-fill keeps the cell size stable so `span 2` tiles stay predictable. */
		grid-template-columns: repeat(auto-fill, minmax(5.25rem, 1fr));
		gap: var(--space-2);
	}
	.more {
		margin-top: var(--space-2);
		background: none;
		border: 1px dashed var(--cat-line);
		border-radius: var(--radius-pill);
		color: var(--cat-ink);
		padding: 0.45rem 0.9rem;
		min-height: 2.75rem;
		font-size: 0.8rem;
		font-weight: 600;
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
</style>
