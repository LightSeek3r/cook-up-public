<script lang="ts">
	interface Props {
		missing: number;
		names?: string[];
		/** canonical_keys aligned 1:1 with `names` (both are a GROUP_CONCAT of
		 *  the same rows in the same pass — see MatchResult.missing_keys). Lets
		 *  a tap add the ingredient straight into the selection, since `names`
		 *  is display text and can't round-trip back into `have`. */
		keys?: string[];
		/** Present only where there's a selection to add to. Missing
		 *  ingredients render as plain text, exactly as before, when absent. */
		onAdd?: (key: string) => void;
		/** Selected ingredients this recipe does NOT use — the mirror of `names`.
		 *  Only ever non-empty for a near-miss in the "almost there" group. */
		unusedNames?: string[];
		t: (key: string) => string;
	}

	let { missing, names = [], keys = [], onAdd, unusedNames = [], t }: Props = $props();

	// Defensive on the length check even though the two lists are produced in
	// lockstep server-side: a mismatch would misalign name <-> key pairs, so
	// fall back to the plain-text chip rather than risk adding the wrong thing.
	const tappable = $derived(Boolean(onAdd) && keys.length === names.length && keys.length > 0);
</script>

{#if missing === 0}
	<span class="chip ok">
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path
				d="M4.5 10.5 8.5 14.5 15.5 6"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{t('card.canMake')}
	</span>
{:else if tappable}
	<span class="chip-label">{t('card.missing')}</span>
	<!-- Dashed: "not in your kitchen yet". Each one adds itself on tap. -->
	{#each names as name, i (keys[i])}
		<button
			type="button"
			class="chip add"
			onclick={() => onAdd?.(keys[i])}
			aria-label={t('results.addIngredient').replace('{name}', name)}
		>
			<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
				<path d="M10 5v10M5 10h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
			</svg>
			{name}
		</button>
	{/each}
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
			<circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8" />
			<path d="M5.6 5.6l8.8 8.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</svg>
		{t('card.unused')}: {unusedNames.join(', ')}
	</span>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		max-width: 100%;
		border: 1px solid transparent;
		border-radius: var(--radius-chip);
		font-size: 0.82rem;
		font-weight: 700;
		/* The icon carries the meaning too — never colour alone. */
	}
	.chip svg {
		width: 1rem;
		height: 1rem;
		flex: none;
	}
	.chip-label {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}
	:global(:is(:lang(ar), :lang(pnb), :lang(hi), :lang(bn), :lang(zh), :lang(ja), :lang(ko)))
		.chip-label {
		letter-spacing: 0;
		font-size: 0.78rem;
	}
	/* Text colour is a dedicated on-tint token, not the fill colour: reusing the
	   fill measured 3.61:1 (light) / 3.12:1 (dark) on its own 14% tint, and at
	   12.5px bold this is not WCAG "large text", so 4.5:1 applies. */
	.ok {
		min-height: 2rem;
		padding: 0.2rem 0.7rem;
		padding-inline-start: 0.5rem;
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
		color: var(--on-ok-tint);
	}
	.warn {
		padding: 0.2rem 0.6rem;
		background: color-mix(in srgb, var(--grade-d) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--grade-d) 35%, transparent);
		color: var(--on-warn-tint);
	}
	.add {
		min-height: var(--tap);
		padding-inline: 0.5rem 0.8rem;
		border: 1.5px dashed color-mix(in srgb, var(--primary) 65%, var(--line-strong));
		background: var(--surface);
		color: var(--ink);
		text-align: start;
		cursor: pointer;
		transition:
			transform var(--dur) var(--ease-spring),
			background var(--dur-fast) ease;
	}
	.add svg {
		color: var(--primary);
	}
	.add:hover {
		border-style: solid;
		background: color-mix(in srgb, var(--primary) 9%, var(--surface));
	}
	.add:active {
		transform: scale(0.95);
		transition-duration: var(--dur-fast);
	}
	/* `--muted` is already a contrast-verified body-text colour against
	   `--surface-sunken` in both themes, so this needs no dedicated on-tint token
	   the way .warn does. Its own line: it explains the whole card. */
	.unused {
		flex-basis: 100%;
		padding: 0.2rem 0.6rem;
		border-color: var(--line);
		background: var(--surface-sunken);
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 600;
	}
</style>
