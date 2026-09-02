<script lang="ts">
	interface Props {
		label: string;
		value: number;
		previous?: number | null;
		hint?: string;
	}
	let { label, value, previous = null, hint = '' }: Props = $props();

	const nf = new Intl.NumberFormat();

	// A rise from zero has no meaningful percentage, so it reads as "new" rather
	// than as an infinite increase.
	const delta = $derived.by(() => {
		if (previous === null) return null;
		if (previous === 0) return value === 0 ? null : 'new';
		return Math.round(((value - previous) / previous) * 100);
	});
</script>

<div class="card">
	<p class="label">{label}</p>
	<p class="value">{nf.format(value)}</p>
	<p class="foot">
		{#if delta === 'new'}
			<span class="delta up">new</span>
		{:else if typeof delta === 'number'}
			<span class="delta" class:up={delta > 0} class:down={delta < 0}>
				{delta > 0 ? '+' : ''}{delta}%
			</span>
		{/if}
		{#if hint}<span class="hint">{hint}</span>{/if}
	</p>
</div>

<style>
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-4);
		box-shadow: var(--shadow-1);
	}
	.label {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.value {
		margin: var(--space-1) 0 0;
		font-size: 1.9rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}
	.foot {
		margin: var(--space-2) 0 0;
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: 0.78rem;
	}
	.delta {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
	.up {
		color: var(--grade-a);
	}
	.down {
		color: var(--grade-e);
	}
	.hint {
		color: var(--muted);
	}
</style>
