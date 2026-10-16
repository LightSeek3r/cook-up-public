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
		<path d="M10 3 18 17H2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
		<path d="M10 8v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		<circle cx="10" cy="14.6" r="1.1" fill="currentColor" />
	</svg>
	<p>{message}</p>
	<button type="button" class="chrome-control" onclick={onRetry}>{retryLabel}</button>
</div>

<style>
	/* A warning banner: the red runs down the start edge and tints the ground
	   only faintly, so the message itself stays plain --ink. */
	.load-error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-block: var(--space-2);
		padding: var(--space-3) var(--space-4);
		padding-inline-start: var(--space-3);
		border: 1px solid color-mix(in srgb, var(--grade-e) 40%, var(--line-strong));
		border-inline-start: 4px solid var(--grade-e);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--grade-e) 7%, var(--surface));
		color: var(--ink);
		font-size: 0.92rem;
	}
	svg {
		inline-size: 1.35rem;
		block-size: 1.35rem;
		flex: none;
		color: var(--grade-e);
	}
	p {
		flex: 1 1 14rem;
		margin: 0;
	}
	button {
		padding-inline: 1rem;
		font-size: 0.85rem;
		font-weight: 700;
	}
</style>
