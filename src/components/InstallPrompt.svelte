<script lang="ts">
	import { onMount } from 'svelte';
	import { installState } from '$lib/install.svelte';
	import {
		INSTALL_DELAY_MS,
		INSTALL_DISMISSED_KEY,
		dismissedRecently,
		isIosSafari
	} from '$lib/install';

	interface Props {
		title: string;
		/** Why install, shown with the Install button. */
		body: string;
		/** How to install by hand, shown on iOS Safari. */
		iosHint: string;
		action: string;
		dismissLabel: string;
	}

	let { title, body, iosHint, action, dismissLabel }: Props = $props();

	let eligible = $state(false); // not installed, not recently closed
	let waited = $state(false); // INSTALL_DELAY_MS on the page
	let ios = $state(false);
	let closed = $state(false);

	const offer = $derived(installState.offer);
	const visible = $derived(
		eligible &&
			waited &&
			!closed &&
			!installState.installed &&
			(offer !== null || ios)
	);

	onMount(() => {
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		let recent = false;
		try {
			recent = dismissedRecently(localStorage.getItem(INSTALL_DISMISSED_KEY), Date.now());
		} catch {
			// Storage can be blocked; the banner then shows once per page load at worst.
		}
		ios = isIosSafari(navigator);
		eligible = !standalone && !recent;

		const timer = setTimeout(() => (waited = true), INSTALL_DELAY_MS);
		return () => clearTimeout(timer);
	});

	function remember() {
		closed = true;
		try {
			localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
		} catch {
			/* ignore */
		}
	}

	async function install() {
		const event = installState.offer;
		if (!event) return;
		// An offer is single-use whatever the answer.
		installState.offer = null;
		closed = true;
		try {
			await event.prompt();
			const { outcome } = await event.userChoice;
			if (outcome === 'dismissed') remember();
		} catch {
			/* the browser withdrew the offer */
		}
	}
</script>

{#if visible}
	<aside class="install no-print" aria-label={title}>
		<div class="text">
			<strong>{title}</strong>
			<p>
				{#if offer}
					{body}
				{:else}
					<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
						<path
							d="M10 12.5V3m0 0L6.8 6.2M10 3l3.2 3.2M5.5 9H4.8A1.3 1.3 0 0 0 3.5 10.3v5.4A1.3 1.3 0 0 0 4.8 17h10.4a1.3 1.3 0 0 0 1.3-1.3v-5.4A1.3 1.3 0 0 0 15.2 9h-.7"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{iosHint}
				{/if}
			</p>
		</div>
		<div class="actions">
			{#if offer}
				<button type="button" class="primary" onclick={install}>{action}</button>
			{/if}
			<button type="button" class="later" onclick={remember}>{dismissLabel}</button>
		</div>
	</aside>
{/if}

<style>
	.install {
		position: fixed;
		inset-inline: max(var(--space-3), env(safe-area-inset-left));
		bottom: max(var(--space-3), env(safe-area-inset-bottom));
		z-index: 30;
		max-width: 34rem;
		margin-inline: auto;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--surface);
		color: var(--ink);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
	}

	.text {
		flex: 1 1 14rem;
		min-width: 0;
	}

	strong {
		display: block;
		font-family: var(--font-display);
	}

	p {
		margin: var(--space-1) 0 0;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	p svg {
		width: 1.1em;
		height: 1.1em;
		vertical-align: -0.2em;
		margin-inline-end: 0.25em;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-inline-start: auto;
	}

	button {
		min-height: var(--tap);
		padding-inline: var(--space-4);
		border-radius: var(--radius-btn);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.primary {
		background: var(--primary);
		color: var(--on-primary);
		border: 1px solid var(--primary);
	}

	.later {
		background: transparent;
		color: var(--ink);
		border: 1px solid var(--line-strong);
	}

	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.install {
			animation: rise var(--dur) var(--ease-out);
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(0.75rem);
		}
	}
</style>
