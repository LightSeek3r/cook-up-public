<script lang="ts">
	import type { Slice } from '$lib/admin/stats';

	interface Props {
		items: Slice[];
		/** Denominator for the bar width. Defaults to the largest value present. */
		total?: number | null;
		/** Show each value as a percentage of `total` instead of a raw count. */
		asPercent?: boolean;
		empty?: string;
	}
	let { items, total = null, asPercent = false, empty = 'Nothing yet.' }: Props = $props();

	const nf = new Intl.NumberFormat();
	const scale = $derived(total ?? Math.max(1, ...items.map((i) => i.n)));
	const width = (n: number) => `${Math.max(1.5, (n / scale) * 100)}%`;
</script>

{#if items.length === 0}
	<p class="empty">{empty}</p>
{:else}
	<ul>
		{#each items as item (item.key)}
			<li>
				<span class="key" title={item.key}>{item.key}</span>
				<span class="track"><span class="bar" style:width={width(item.n)}></span></span>
				<span class="n">
					{asPercent ? `${Math.round((item.n / scale) * 100)}%` : nf.format(item.n)}
				</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 8rem) 1fr auto;
		align-items: center;
		gap: var(--space-3);
		font-size: 0.85rem;
	}
	.key {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink);
	}
	.track {
		background: var(--surface-sunken);
		border-radius: var(--radius-pill);
		height: 8px;
		overflow: hidden;
	}
	.bar {
		display: block;
		height: 100%;
		border-radius: var(--radius-pill);
		background: var(--primary);
	}
	.n {
		font-variant-numeric: tabular-nums;
		color: var(--muted);
		min-width: 3.5ch;
		text-align: right;
	}
	.empty {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
</style>
