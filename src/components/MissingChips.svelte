<script lang="ts">
	interface Props {
		missing: number;
		names?: string[];
		/** Selected ingredients this recipe does NOT use — the mirror of `names`.
		 *  Only ever non-empty for a near-miss in the "almost there" group. */
		unusedNames?: string[];
		t: (key: string) => string;
	}

	let { missing, names = [], unusedNames = [], t }: Props = $props();
</script>

{#if missing === 0}
	<span class="chip ok">
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path
				d="M4 10.5 8 14.5 16 6"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{t('card.canMake')}
	</span>
{:else}
	<span class="chip warn">
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path d="M10 4v7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
			<circle cx="10" cy="15.2" r="1.35" fill="currentColor" />
		</svg>
		{t('card.missing')}: {names.length ? names.join(', ') : missing}
	</span>
{/if}

{#if unusedNames.length}
	<!-- Deliberately neutral, not a warning: an unused ingredient is context for
	     why this recipe sits below the exact matches, not a problem to fix. The
	     slashed-circle icon carries that meaning without relying on colour. -->
	<span class="chip unused">
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<circle
				cx="10"
				cy="10"
				r="6.2"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			/>
			<path d="M5.6 5.6l8.8 8.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
		{t('card.unused')}: {unusedNames.join(', ')}
	</span>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		border-radius: var(--radius-pill);
		padding: 0.2rem 0.6rem;
		font-size: 0.78rem;
		font-weight: 700;
		/* The icon carries the meaning too — never colour alone. */
		border: 1px solid transparent;
	}
	.chip svg {
		width: 0.95em;
		height: 0.95em;
		flex: none;
	}
	/* Text colour is a dedicated on-tint token, not the fill colour: reusing the
	   fill measured 3.61:1 (light) / 3.12:1 (dark) on its own 14% tint, and at
	   12.5px bold this is not WCAG "large text", so 4.5:1 applies. */
	.ok {
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--accent) 35%, transparent);
		color: var(--on-ok-tint);
	}
	.warn {
		background: color-mix(in srgb, var(--grade-d) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--grade-d) 35%, transparent);
		color: var(--on-warn-tint);
	}
	/* `--muted` is already a contrast-verified body-text colour against
	   `--surface` in both themes, so this needs no dedicated on-tint token the
	   way .ok and .warn do — it sits on the plain card surface, not on a tint. */
	.unused {
		background: var(--surface-sunken);
		border-color: var(--line);
		color: var(--muted);
	}
</style>
