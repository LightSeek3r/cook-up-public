<script lang="ts">
	import type { SubstitutionTip } from '$lib/types';

	interface Props {
		tips: SubstitutionTip[];
		t: (key: string) => string;
	}

	let { tips, t }: Props = $props();
</script>

{#if tips.length}
	<section class="card tips">
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
	.tips {
		margin-top: var(--space-5);
	}
	.tips h2 {
		margin-top: 0;
	}
	ul {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
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
		align-items: center;
		gap: 0.4rem;
	}
	.from {
		color: var(--muted);
	}
	.to {
		font-weight: 600;
	}
	.tip-arrow {
		width: 1.1em;
		height: 1.1em;
		color: var(--muted);
		flex: none;
	}
	/* Same mirroring precedent as .back svg on the recipe page: the arrow
	   must point along the reading direction, not a fixed screen direction. */
	:global([dir='rtl']) .tip-arrow {
		transform: scaleX(-1);
	}
	.benefit {
		color: var(--accent);
		font-size: 0.82rem;
		font-weight: 600;
		white-space: nowrap;
	}
</style>
