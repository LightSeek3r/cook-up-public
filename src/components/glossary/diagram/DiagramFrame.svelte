<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setDiagramContext } from './context';

	interface Props {
		/** the term's diagramAlt sentence */
		label: string;
		rtl?: boolean;
		/** must equal the diagram's `directional` in diagrams.json (diagrams.test.ts checks) */
		directional?: boolean;
		children: Snippet;
	}

	let { label, rtl = false, directional = false, children }: Props = $props();

	const flipped = $derived(rtl && directional);

	// A getter rather than a snapshot, so Marks follow a later change of `rtl`.
	setDiagramContext({
		get flipped() {
			return flipped;
		}
	});
</script>

<svg
	class="diagram"
	viewBox="0 0 240 160"
	role="img"
	aria-label={label}
	width="100%"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<rect class="ground" width="240" height="160" rx="12" />
	<g transform={flipped ? 'matrix(-1 0 0 1 240 0)' : undefined}>
		{@render children()}
	</g>
</svg>

<style>
	.diagram {
		display: block;
		inline-size: 100%;
		max-inline-size: 28rem;
		block-size: auto;
		aspect-ratio: 3 / 2;
		color: var(--ink);
	}

	.ground {
		fill: var(--surface-sunken);
		stroke: none;
	}

	/*
	 * The shared palette for every drawing (see diagrams/README.md). Colour is set
	 * through `color` so strokes stay currentColor and forced-colors mode can
	 * replace all of it at once; tints are the same colour at low fill-opacity, so
	 * they print as a light grey under the same outline.
	 */
	.diagram :global(.c-accent) {
		color: var(--accent);
	}
	.diagram :global(.c-primary) {
		color: var(--primary);
	}
	.diagram :global(.c-muted) {
		color: var(--muted);
	}
	.diagram :global(.tint) {
		fill: currentColor;
		fill-opacity: 0.18;
	}
	.diagram :global(.solid) {
		fill: currentColor;
	}
	.diagram :global(.fine) {
		stroke-width: 1;
	}
	.diagram :global(.bold) {
		stroke-width: 2.5;
	}
	.diagram :global(.dashed) {
		stroke-dasharray: 2.5 3;
	}

	@media (forced-colors: active) {
		.ground {
			fill: Canvas;
		}
	}
</style>
