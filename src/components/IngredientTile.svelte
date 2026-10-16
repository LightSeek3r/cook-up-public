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
		onToggle: (canonicalKey: string) => void;
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
	onclick={() => onToggle(tile.canonical_key)}
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
		gap: 0.35rem;
		/* Comfortably past the 44px touch target in both axes. */
		min-height: 6rem;
		padding: 0.6rem 0.4rem 0.5rem;
		background: var(--cat-tint, var(--surface));
		color: var(--ink);
		border: 1px solid var(--cat-line, var(--line));
		border-radius: var(--radius-tile);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 2px 0 rgb(0 0 0 / 14%),
			0 6px 10px -6px rgb(0 0 0 / 45%);
		animation: rise var(--dur) var(--ease-out) backwards;
		animation-delay: calc(var(--i) * 14ms);
		transition:
			transform var(--dur) var(--ease-out),
			background var(--dur-fast) ease,
			border-color var(--dur-fast) ease,
			box-shadow var(--dur-fast) ease;
	}
	.tile.big {
		grid-column: span 2;
		min-height: 6.75rem;
	}
	.tile:hover {
		border-color: var(--cat-ink, var(--line-strong));
		transform: translateY(-1px);
	}
	.tile:active {
		transform: translateY(1px) scale(0.97);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 0 rgb(0 0 0 / 14%);
		transition-duration: var(--dur-fast);
	}
	/* The ring sits on a --surface halo: the board's wood and the copper of a
	   selected tile both fail against --focus, the halo does not. */
	.tile:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 8px var(--surface);
	}

	/* Colour emoji cannot follow currentColor, so they sit on a --surface
	   medallion that keeps them legible on every tile fill, selected included. */
	.art {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0.4rem;
		flex: none;
		border-radius: 50%;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--cat-line, var(--line)),
			inset 0 2px 4px var(--lo),
			0 1px 0 var(--hi);
		transition: transform var(--dur) var(--ease-spring);
	}
	.tile.big .art {
		width: 3.5rem;
		height: 3.5rem;
		padding: 0.5rem;
	}
	.tile:hover .art {
		transform: scale(1.08);
	}

	.name {
		font-size: 0.8rem;
		font-weight: 600;
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
		font-size: 0.88rem;
	}
	.tile.bold .name {
		font-weight: 700;
	}

	.tile.selected {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--on-primary);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 25%),
			0 2px 0 rgb(0 0 0 / 20%),
			0 8px 14px -8px rgb(0 0 0 / 50%);
	}
	.tile.selected .art {
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--on-primary) 45%, transparent),
			0 1px 0 rgb(0 0 0 / 15%);
	}
	.tile.selected .name {
		font-weight: 750;
	}

	.check {
		position: absolute;
		inset-block-start: 0.35rem;
		inset-inline-end: 0.35rem;
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 50%;
		background: var(--on-primary);
		color: var(--primary);
		opacity: 0;
		transform: scale(0.5);
		transition:
			opacity var(--dur-fast) ease,
			transform var(--dur) var(--ease-spring);
	}
	.check svg {
		width: 0.85rem;
		height: 0.85rem;
	}
	.tile.selected .check {
		opacity: 1;
		transform: none;
	}

	/* Forced colours drop the copper fill, which would leave the check as the
	   only sign of selection. Highlight/HighlightText are the system's own
	   selected pair; forced-color-adjust is what makes them stick. */
	@media (forced-colors: active) {
		.tile.selected {
			forced-color-adjust: none;
			background: Highlight;
			color: HighlightText;
			border-color: Highlight;
			outline: 2px solid CanvasText;
			outline-offset: 2px;
		}
		.tile.selected .check {
			background: HighlightText;
			color: Highlight;
		}
		.tile:focus-visible {
			outline-color: Highlight;
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.97);
		}
	}
</style>
