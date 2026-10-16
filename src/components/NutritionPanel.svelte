<script lang="ts">
	import BalanceGrade from './BalanceGrade.svelte';
	import { splitHighlights, nutritionVisible } from '$lib/nutrition';
	import type { RecipeDetail } from '$lib/types';

	interface Props {
		recipe: RecipeDetail;
		t: (key: string) => string;
		/** Needed for Intl list/number formatting, not just for t(). */
		lang: string;
	}

	let { recipe, t, lang }: Props = $props();

	const visible = $derived(nutritionVisible(recipe.nutrition_coverage));
	const highlights = $derived(splitHighlights(recipe.micronutrients));

	// `key` is stable and drives both the i18n lookup and the {#each} key; `label`
	// used to be a hardcoded English string doing double duty as the each-key,
	// which would have made list identity locale-dependent once translated.
	const macros = $derived(
		[
			{ key: 'kcal', value: recipe.kcal, unit: '' },
			{ key: 'protein', value: recipe.protein_g, unit: 'g' },
			{ key: 'fat', value: recipe.fat_g, unit: 'g' },
			{ key: 'satFat', value: recipe.sat_fat_g, unit: 'g' },
			{ key: 'carbs', value: recipe.carb_g, unit: 'g' },
			{ key: 'sugars', value: recipe.sugar_g, unit: 'g' },
			{ key: 'fibre', value: recipe.fiber_g, unit: 'g' },
			{ key: 'sodium', value: recipe.sodium_mg, unit: 'mg' }
		].filter((macro) => macro.value != null)
	);

	/** Micronutrient keys come from the DB as slugs (`vitamin_c`); never show those raw. */
	const microLabel = (key: string) => t(`nutrient.${key}`);

	/** Locale-aware list joining, rather than a hardcoded Latin ", ". */
	const listFormat = $derived(
		new Intl.ListFormat(lang, { style: 'short', type: 'conjunction' })
	);
</script>

<section class="sheet nutrition">
	<div class="head">
		<h2>{t('nutrition.heading')}</h2>
		{#if visible}
			<span class="stamp">
				<BalanceGrade
					grade={recipe.balance_grade}
					score={recipe.balance_score}
					showScore
					gradeLabel={t('grade.label')}
				/>
			</span>
		{/if}
	</div>

	{#if !visible}
		<p class="muted">{t('nutrition.unavailable')} — {t('nutrition.lowCoverage')}</p>
	{:else}
		<p class="muted">{t('nutrition.perServing')} · {t('nutrition.estimated')}</p>

		<dl>
			{#each macros as macro (macro.key)}
				<div class:lead={macro.key === 'kcal'}>
					<dt>{t(`nutrition.${macro.key}`)}</dt>
					<dd>
						{Math.round(macro.value ?? 0)}{#if macro.unit}<span class="unit">{macro.unit}</span>{/if}
					</dd>
				</div>
			{/each}
		</dl>

		{#if highlights.high.length}
			<p class="highlights">
				<strong>{t('nutrition.highIn')}:</strong>
				{listFormat.format(highlights.high.map((m) => microLabel(m.nutrient_key)))}
			</p>
		{/if}
		{#if highlights.source.length}
			<p class="highlights">
				<strong>{t('nutrition.sourceOf')}:</strong>
				{listFormat.format(highlights.source.map((m) => microLabel(m.nutrient_key)))}
			</p>
		{/if}

		<details class="explain">
			<summary>{t('grade.label')}</summary>
			<p class="muted">{t('grade.explain')}</p>
			{#if recipe.micronutrients.length}
				<table>
					<caption class="sr-only">{t('nutrition.micronutrients')}</caption>
					<thead>
						<tr>
							<th scope="col">{t('nutrition.nutrient')}</th>
							<th scope="col">{t('nutrition.amount')}</th>
							<th scope="col">{t('nutrition.pctNrv')}</th>
						</tr>
					</thead>
					<tbody>
						{#each recipe.micronutrients as micro (micro.nutrient_key)}
							<tr>
								<th scope="row">{microLabel(micro.nutrient_key)}</th>
								<td>{micro.amount}{micro.unit}</td>
								<td>{micro.pct_nrv != null ? `${Math.round(micro.pct_nrv)}%` : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</details>
	{/if}
</section>

<style>
	/* Same raised sheet as the recipe method (recipe/[id]/+page.svelte). */
	.sheet {
		display: grid;
		gap: var(--space-3);
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
	.sheet > * {
		margin: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.head h2 {
		margin: 0;
		font-size: 1.35rem;
	}
	/* The grade as a larger stamp here, where it heads the numbers it sums up.
	   span.grade outranks BalanceGrade's own single-class rule. */
	.stamp :global(span.grade) {
		height: 2.6rem;
		padding: 0 0.8rem;
		font-size: 1.3rem;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2);
	}
	@media (min-width: 36rem) {
		dl {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	/* Each figure in a small recessed well. */
	dl div {
		min-width: 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		box-shadow: inset 0 1px 2px var(--lo);
	}
	dl .lead {
		background: color-mix(in srgb, var(--primary) 8%, var(--surface));
		border-color: color-mix(in srgb, var(--primary) 45%, var(--line-strong));
	}
	dt {
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	dd {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 700;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}
	.unit {
		margin-inline-start: 0.1rem;
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 600;
	}

	.highlights {
		font-size: 0.92rem;
	}

	.explain summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		width: fit-content;
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}
	.explain summary::-webkit-details-marker {
		display: none;
	}
	/* A chevron that turns down when open; it points along the reading
	   direction while closed. */
	.explain summary::before {
		content: '';
		flex: none;
		width: 0.5rem;
		height: 0.5rem;
		border-inline-end: 2px solid var(--primary);
		border-block-end: 2px solid var(--primary);
		transform: rotate(-45deg);
		transition: transform var(--dur) var(--ease-out);
	}
	:global([dir='rtl']) .explain summary::before {
		transform: rotate(45deg);
	}
	.explain[open] summary::before {
		transform: rotate(45deg);
	}
	:global([dir='rtl']) .explain[open] summary::before {
		transform: rotate(-45deg);
	}
	.explain > p {
		margin: 0 0 var(--space-2);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		padding: 0.35rem 0;
		text-align: start;
	}
	thead th {
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 600;
	}
	tbody th {
		font-weight: 600;
	}
	tbody tr {
		border-block-start: 1px solid var(--line);
	}
	td + td,
	th + th {
		text-align: end;
	}

	@media print {
		.sheet {
			box-shadow: none;
			break-inside: avoid;
		}
		dl div {
			box-shadow: none;
		}
	}
</style>
