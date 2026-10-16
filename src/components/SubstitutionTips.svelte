<script lang="ts">
	import type { SubstitutionTip } from '$lib/types';

	interface Props {
		tips: SubstitutionTip[];
		t: (key: string) => string;
	}

	let { tips, t }: Props = $props();
</script>

{#if tips.length}
	<section class="sheet tips">
		<h2>{t('tips.heading')}</h2>
		<p class="muted">{t('tips.intro')}</p>
		<ul>
			{#each tips as tip (tip.from + ':' + tip.to)}
				<li>
					<span class="swap">
						<span class="from">{tip.fromName}</span>
						<svg class="tip-arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<path
								d="M4 10h12M12 5.5 16.5 10 12 14.5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="to">{tip.toName}</span>
					</span>
					<span class="benefit">{t(`sub.${tip.benefit}`)}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	/* Same raised sheet as the recipe method (recipe/[id]/+page.svelte). */
	.sheet {
		margin-block-start: var(--space-5);
		padding: var(--space-4);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 0 var(--lo),
			0 10px 20px -16px var(--lo-2);
	}
	.tips h2 {
		margin: 0 0 var(--space-1);
		font-size: 1.35rem;
	}
	.tips > p {
		margin: 0;
	}
	ul {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) 0;
		font-size: 0.92rem;
	}
	li + li {
		border-block-start: 1px solid var(--line);
	}
	.swap {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}
	.from {
		color: var(--muted);
	}
	.to {
		font-weight: 700;
	}
	.tip-arrow {
		width: 1.1em;
		height: 1.1em;
		color: var(--primary);
		flex: none;
	}
	/* Same mirroring precedent as .back svg on the recipe page: the arrow
	   must point along the reading direction, not a fixed screen direction. */
	:global([dir='rtl']) .tip-arrow {
		transform: scaleX(-1);
	}
	/* --on-ok-tint is the token measured for text on this 14% accent tint. */
	.benefit {
		padding: 0.1rem 0.6rem;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		color: var(--on-ok-tint);
		font-size: 0.78rem;
		font-weight: 700;
	}

	@media print {
		.sheet {
			box-shadow: none;
			break-inside: avoid;
		}
	}
	@media (forced-colors: active) {
		.benefit {
			border: 1px solid CanvasText;
		}
	}
</style>
