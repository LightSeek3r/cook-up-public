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

<section class="card">
	<div class="head">
		<h2>{t('nutrition.heading')}</h2>
		{#if visible}
			<BalanceGrade
				grade={recipe.balance_grade}
				score={recipe.balance_score}
				showScore
				gradeLabel={t('grade.label')}
			/>
		{/if}
	</div>

	{#if !visible}
		<p class="muted">{t('nutrition.unavailable')} — {t('nutrition.lowCoverage')}</p>
	{:else}
		<p class="muted">{t('nutrition.perServing')} · {t('nutrition.estimated')}</p>

		<dl>
			{#each macros as macro (macro.key)}
				<div>
					<dt>{t(`nutrition.${macro.key}`)}</dt>
					<dd>{Math.round(macro.value ?? 0)}{macro.unit}</dd>
				</div>
			{/each}
		</dl>

		{#if highlights.high.length}
			<p>
				<strong>{t('nutrition.highIn')}:</strong>
				{listFormat.format(highlights.high.map((m) => microLabel(m.nutrient_key)))}
			</p>
		{/if}
		{#if highlights.source.length}
			<p>
				<strong>{t('nutrition.sourceOf')}:</strong>
				{listFormat.format(highlights.source.map((m) => microLabel(m.nutrient_key)))}
			</p>
		{/if}

		<details>
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
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.head h2 {
		margin: 0;
	}
	dl {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.35rem var(--space-2);
		margin: 0.75rem 0;
	}
	@media (min-width: 30rem) {
		dl {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	dl div {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.35rem 0.5rem;
	}
	dt {
		font-size: 0.75rem;
		color: var(--muted);
	}
	dd {
		margin: 0;
		font-weight: 600;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	td {
		border-top: 1px solid var(--line);
		padding: 0.25rem 0;
	}
</style>
