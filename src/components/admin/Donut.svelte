<script lang="ts">
	import type { Slice } from '$lib/admin/stats';

	interface Props {
		items: Slice[];
		/** Slices beyond this are folded into a single "other" wedge. */
		maxSlices?: number;
		label: string;
	}
	let { items, maxSlices = 6, label }: Props = $props();

	const R = 58;
	const CIRC = 2 * Math.PI * R;

	// Theme tokens rather than literals, so the donut re-colours with the theme.
	const PALETTE = [
		'var(--primary)',
		'var(--accent)',
		'var(--grade-b)',
		'var(--grade-c)',
		'var(--grade-d)',
		'var(--grade-a)',
		'var(--line-strong)'
	];

	const folded = $derived.by(() => {
		if (items.length <= maxSlices) return items;
		const head = items.slice(0, maxSlices);
		const rest = items.slice(maxSlices).reduce((sum, i) => sum + i.n, 0);
		return rest > 0 ? [...head, { key: 'other', n: rest }] : head;
	});

	const total = $derived(folded.reduce((sum, i) => sum + i.n, 0));

	const segments = $derived.by(() => {
		let acc = 0;
		return folded.map((item, idx) => {
			const len = total ? (item.n / total) * CIRC : 0;
			const seg = {
				...item,
				len,
				offset: -acc,
				colour: PALETTE[idx % PALETTE.length],
				pct: total ? Math.round((item.n / total) * 100) : 0
			};
			acc += len;
			return seg;
		});
	});
</script>

{#if total === 0}
	<p class="empty">Nothing yet.</p>
{:else}
	<div class="wrap">
		<svg viewBox="0 0 140 140" role="img" aria-label={label}>
			<g transform="rotate(-90 70 70)">
				{#each segments as seg (seg.key)}
					<circle
						cx="70"
						cy="70"
						r={R}
						fill="none"
						stroke={seg.colour}
						stroke-width="18"
						stroke-dasharray="{seg.len} {CIRC - seg.len}"
						stroke-dashoffset={seg.offset}
					/>
				{/each}
			</g>
			<text x="70" y="66" text-anchor="middle" class="total">{total}</text>
			<text x="70" y="82" text-anchor="middle" class="unit">views</text>
		</svg>
		<ul>
			{#each segments as seg (seg.key)}
				<li>
					<i style:background={seg.colour}></i>
					<span class="key">{seg.key}</span>
					<span class="pct">{seg.pct}%</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.wrap {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	svg {
		width: 140px;
		height: 140px;
		flex: none;
	}
	.total {
		font-size: 22px;
		font-weight: 700;
		fill: var(--ink);
	}
	.unit {
		font-size: 10px;
		fill: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
		font-size: 0.82rem;
		min-width: 8rem;
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	i {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		flex: none;
	}
	.key {
		flex: 1;
	}
	.pct {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.empty {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
</style>
