<script lang="ts">
	interface Props {
		message: string;
		retryLabel: string;
		onRetry: () => void;
		/**
		 * False where the page already owns an always-mounted live region for this
		 * content (the home results), so the failure is not announced twice.
		 */
		announce?: boolean;
	}

	let { message, retryLabel, onRetry, announce = true }: Props = $props();
</script>

<div class="load-error" role={announce ? 'alert' : undefined}>
	<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
		<circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.7" />
		<path d="M10 5.8v5.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
		<circle cx="10" cy="14" r="1.1" fill="currentColor" />
	</svg>
	<p>{message}</p>
	<button type="button" onclick={onRetry}>{retryLabel}</button>
</div>

<style>
	.load-error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-block: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--line-strong);
		border-inline-start: 4px solid var(--primary);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
	}
	svg {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		flex: none;
		color: var(--primary);
	}
	p {
		flex: 1 1 14rem;
		margin: 0;
	}
	button {
		min-block-size: 2.75rem;
		padding: 0.4rem 1rem;
		border: 1px solid var(--primary);
		border-radius: var(--radius-pill);
		background: none;
		color: var(--primary);
		font-weight: 700;
	}
	button:hover {
		background: var(--primary);
		color: var(--on-primary);
	}
</style>
