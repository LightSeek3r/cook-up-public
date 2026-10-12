<script lang="ts">
	import { getDiagramContext } from './context';

	interface Props {
		x: number;
		y: number;
		/** 1-9; the same number the legend shows for this step */
		n: number;
	}

	let { x, y, n }: Props = $props();

	const ctx = getDiagramContext();

	// Inside a mirrored frame the digit would read backwards; flipping it locally
	// again cancels that out, and the circle is symmetric so nothing else moves.
	const transform = $derived(`translate(${x} ${y})${ctx?.flipped ? ' scale(-1 1)' : ''}`);
</script>

<g class="mark" {transform}>
	<circle class="halo" r="10" />
	<circle class="disc" r="8" />
	<text class="digit" dy="0.36em" text-anchor="middle">{n}</text>
</g>

<style>
	.halo {
		fill: var(--surface-sunken);
		stroke: none;
	}
	.disc {
		fill: var(--primary);
		stroke: none;
	}
	.digit {
		fill: var(--on-primary);
		stroke: none;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	@media (forced-colors: active) {
		.halo {
			fill: Canvas;
		}
		.disc {
			fill: Canvas;
			stroke: CanvasText;
			stroke-width: 1.5;
		}
		.digit {
			fill: CanvasText;
		}
	}
</style>
