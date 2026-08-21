<script lang="ts">
	import IngredientIcon from './IngredientIcon.svelte';
	import type { IngredientTile as Tile } from '$lib/types';

	interface Props {
		tile: Tile;
		selected: boolean;
		/** 0..1 popularity within this category, drives tile weight. */
		weight: number;
		/** Position within the category, used to stagger the reveal. */
		index: number;
		onToggle: (id: number) => void;
	}

	let { tile, selected, weight, index, onToggle }: Props = $props();

	// Popularity is encoded as tile area *and* font weight, never colour alone, so
	// the hierarchy survives greyscale and colour-vision deficiency. Only the top
	// slice of each category goes wide, which is what gives the grid its mosaic
	// texture instead of a uniform waffle.
	const big = $derived(weight > 0.62);
	const bold = $derived(weight > 0.3);
</script>

<button
	type="button"
	class="tile"
	class:selected
	class:big
	class:bold
	aria-pressed={selected}
	style="--i: {Math.min(index, 24)}"
	onclick={() => onToggle(tile.id)}
>
	<span class="art">
		<IngredientIcon canonicalKey={tile.canonical_key} category={tile.category} />
	</span>
	<span class="name">{tile.name}</span>

	<span class="check" aria-hidden="true">
		<svg viewBox="0 0 20 20" fill="none">
			<path
				d="M4.5 10.5 8.5 14.5 15.5 6"
				stroke="currentColor"
				stroke-width="2.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</span>
</button>

<style>
	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		/* Comfortably past the 44px touch target in both axes. */
		min-height: 5.5rem;
		padding: 0.5rem 0.35rem;
		background: var(--cat-tint, var(--surface));
		color: var(--ink);
		border: 1px solid var(--cat-line, var(--line));
		border-radius: var(--radius);
		box-shadow: var(--shadow-1);
		overflow: hidden;
		animation: rise var(--dur) var(--ease-spring) backwards;
		animation-delay: calc(var(--i) * 14ms);
		transition:
			transform var(--dur) var(--ease-spring),
			background var(--dur-fast) ease,
			border-color var(--dur-fast) ease,
			box-shadow var(--dur-fast) ease;
	}
	.tile.big {
		grid-column: span 2;
		min-height: 6.5rem;
	}

	/* A wash of the category hue bleeding up from the base, so a run of tiles in
	   the same family reads as one band of colour rather than nine flat chips. */
	.tile::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 55%;
		background: linear-gradient(to top, var(--cat-ink, var(--muted)), transparent);
		opacity: 0.1;
		pointer-events: none;
		transition: opacity var(--dur) ease;
	}

	.tile:hover {
		border-color: var(--cat-ink, var(--line-strong));
		transform: translateY(-2px);
		box-shadow: var(--shadow-2);
	}
	.tile:hover::after {
		opacity: 0.13;
	}
	/* Tactile press deformation — squish in, spring back on release. */
	.tile:active {
		transform: scale(0.95);
		box-shadow: var(--shadow-press);
		transition-duration: var(--dur-fast);
	}

	.art {
		width: 2.15rem;
		height: 2.15rem;
		color: var(--cat-ink, var(--muted));
		transition:
			transform var(--dur) var(--ease-spring),
			color var(--dur-fast) ease;
	}
	.tile.big .art {
		width: 3rem;
		height: 3rem;
	}
	.tile:hover .art {
		transform: scale(1.12) rotate(-4deg);
	}

	.name {
		font-size: 0.72rem;
		line-height: 1.2;
		text-align: center;
		/* Two lines maximum: a third would push every tile in the row taller. */
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.tile.big .name {
		font-size: 0.82rem;
	}
	.tile.bold .name {
		font-weight: 700;
	}

	.tile.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		box-shadow: var(--shadow-2);
	}
	.tile.selected .art {
		color: var(--on-accent);
	}
	.tile.selected::after {
		opacity: 0;
	}
	.tile.selected .name {
		font-weight: 700;
	}

	.check {
		position: absolute;
		inset-block-start: 0.3rem;
		inset-inline-end: 0.3rem;
		width: 1.05rem;
		height: 1.05rem;
		color: var(--on-accent);
		opacity: 0;
		transform: scale(0.4);
		transition:
			opacity var(--dur-fast) ease,
			transform var(--dur) var(--ease-spring);
	}
	.check svg {
		width: 100%;
		height: 100%;
	}
	.tile.selected .check {
		opacity: 1;
		transform: scale(1);
	}

	/* Forced colours replace --accent with the system background, so the selected
	   fill vanishes and a selected tile would differ from an unselected one only by
	   its checkmark. That checkmark does survive (it is currentColor, and opacity is
	   not overridden), but leaning on a 17px glyph alone is thin — Highlight and
	   HighlightText are the system's own selected pair, so state the fill in terms
	   the OS honours. forced-color-adjust is required for it to stick. */
	@media (forced-colors: active) {
		.tile.selected {
			background: Highlight;
			color: HighlightText;
			border-color: Highlight;
			forced-color-adjust: none;
		}
		.tile.selected .art,
		.tile.selected .check {
			color: HighlightText;
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.96);
		}
	}
</style>
