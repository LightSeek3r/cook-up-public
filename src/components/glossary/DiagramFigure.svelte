<script lang="ts">
	import type { DiagramComponent } from '$lib/glossary/diagrams';

	interface Props {
		/** from loadDiagram(); undefined while not drawn, which leaves just the steps */
		component?: DiagramComponent;
		/** the term's diagramAlt */
		label: string;
		/** one per numbered mark, in mark order */
		steps: string[];
		caption: string;
		/** DiagramInfo.directional */
		directional: boolean;
		rtl: boolean;
	}

	let { component, label, steps, caption, directional, rtl }: Props = $props();
</script>

{#if component}
	{@const Diagram = component}
	<figure class="diagram-figure">
		<Diagram {label} rtl={rtl && directional} />
		<figcaption>
			<p class="caption">{caption}</p>
			<ol class="legend">
				{#each steps as step, i (i)}
					<li>
						<span class="badge" aria-hidden="true">{i + 1}</span>
						<span class="text">{step}</span>
					</li>
				{/each}
			</ol>
		</figcaption>
	</figure>
{:else}
	<ol class="plain">
		{#each steps as step, i (i)}
			<li>{step}</li>
		{/each}
	</ol>
{/if}

<style>
	.diagram-figure {
		margin: 0;
		display: grid;
		gap: var(--space-3);
		max-inline-size: 40rem;
	}

	figcaption {
		display: grid;
		gap: var(--space-2);
	}

	.caption {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}

	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}

	.legend li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}

	/* Same pair as the drawing's Mark, so each step reads as "this number". */
	.badge {
		flex: none;
		display: inline-grid;
		place-items: center;
		inline-size: 1.6rem;
		block-size: 1.6rem;
		border-radius: 50%;
		/* Transparent on screen; forced-colors mode paints it, which is what keeps the
		   badge visible once the OS drops its background. */
		border: 1px solid transparent;
		background: var(--primary);
		color: var(--on-primary);
		/* Not inherited: under :lang(pnb) the surrounding Nastaliq face would draw
		   these Western digits in a different style from the drawing's marks. */
		font-family: var(--font-body);
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.text {
		min-inline-size: 0;
		padding-block-start: 0.15rem;
		overflow-wrap: anywhere;
	}

	.plain {
		margin: 0;
		padding-inline-start: 1.5rem;
		display: grid;
		gap: var(--space-2);
	}
</style>
