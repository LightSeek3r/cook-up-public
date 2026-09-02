<script lang="ts">
	import type { Slice } from '$lib/admin/stats';

	interface Props {
		/** `key` is the decile index 0-9; missing deciles are filled with zero. */
		buckets: Slice[];
		/** Deciles below this one are drawn muted: their nutrition panel is hidden. */
		threshold: number;
	}
	let { buckets, threshold }: Props = $props();

	const byKey = $derived(new Map(buckets.map((b) => [Number(b.key), b.n])));
	const deciles = $derived(
		Array.from({ length: 10 }, (_, i) => ({ decile: i, n: byKey.get(i) ?? 0 }))
	);
	const max = $derived(Math.max(1, ...deciles.map((d) => d.n)));
	const hidden = $derived(
		deciles.filter((d) => d.decile < threshold).reduce((sum, d) => sum + d.n, 0)
	);
</script>

<div class="chart">
	{#each deciles as d (d.decile)}
		<div class="col" class:below={d.decile < threshold}>
			<span class="n">{d.n || ''}</span>
			<span class="bar" style:height="{(d.n / max) * 100}%"></span>
			<span class="tick">{d.decile * 10}</span>
		</div>
	{/each}
</div>
<p class="note">
	<strong>{hidden}</strong> recipes sit below the {threshold * 10}% mass threshold, so their
	nutrition panel is hidden rather than estimated. The bar just under the line is the cheapest
	one for the pipeline to rescue.
</p>

<style>
	.chart {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: var(--space-1);
		align-items: end;
		height: 170px;
	}
	.col {
		display: grid;
		grid-template-rows: auto 1fr auto;
		align-items: end;
		height: 100%;
		gap: 2px;
		text-align: center;
	}
	.bar {
		display: block;
		width: 100%;
		min-height: 2px;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
		background: var(--primary);
		align-self: end;
	}
	.below .bar {
		background: var(--line-strong);
	}
	.n,
	.tick {
		font-size: 0.68rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.note {
		margin: var(--space-3) 0 0;
		font-size: 0.8rem;
		color: var(--muted);
		line-height: 1.5;
	}
</style>
