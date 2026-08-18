<script lang="ts">
	import BalanceGrade from './BalanceGrade.svelte';
	import { splitHighlights, nutritionVisible } from '$lib/nutrition';
	import { GRADE } from '$lib/config';
	import type { RecipeDetail } from '$lib/types';

	interface Props {
		recipe: RecipeDetail;
		t: (key: string) => string;
	}

	let { recipe, t }: Props = $props();

	const visible = $derived(nutritionVisible(recipe.nutrition_coverage));
	const highlights = $derived(splitHighlights(recipe.micronutrients));

	const macros = $derived(
		[
			{ label: 'kcal', value: recipe.kcal, unit: '' },
			{ label: 'Protein', value: recipe.protein_g, unit: 'g' },
			{ label: 'Fat', value: recipe.fat_g, unit: 'g' },
			{ label: 'Saturates', value: recipe.sat_fat_g, unit: 'g' },
			{ label: 'Carbs', value: recipe.carb_g, unit: 'g' },
			{ label: 'Sugars', value: recipe.sugar_g, unit: 'g' },
			{ label: 'Fibre', value: recipe.fiber_g, unit: 'g' },
			{ label: 'Sodium', value: recipe.sodium_mg, unit: 'mg' }
		].filter((macro) => macro.value != null)
	);
</script>

<section class="card">
	<div class="head">
		<h2>{t('nutrition.heading')}</h2>
		{#if visible}
			<BalanceGrade grade={recipe.balance_grade} score={recipe.balance_score} showScore />
		{/if}
	</div>

	{#if !visible}
		<p class="muted">{t('nutrition.unavailable')} — {t('nutrition.lowCoverage')}</p>
	{:else}
		<p class="muted">{t('nutrition.perServing')} · {t('nutrition.estimated')}</p>

		<dl>
			{#each macros as macro (macro.label)}
				<div>
					<dt>{macro.label}</dt>
					<dd>{Math.round(macro.value ?? 0)}{macro.unit}</dd>
				</div>
			{/each}
		</dl>

		{#if highlights.high.length}
			<p><strong>{t('nutrition.highIn')}:</strong> {highlights.high.map((m) => m.nutrient_key).join(', ')}</p>
		{/if}
		{#if highlights.source.length}
			<p><strong>{t('nutrition.sourceOf')}:</strong> {highlights.source.map((m) => m.nutrient_key).join(', ')}</p>
		{/if}

		<details>
			<summary>{GRADE.label}</summary>
			<p class="muted">{t('grade.explain')}</p>
			<table>
				<tbody>
					{#each recipe.micronutrients as micro (micro.nutrient_key)}
						<tr>
							<td>{micro.nutrient_key}</td>
							<td>{micro.amount}{micro.unit}</td>
							<td>{micro.pct_nrv != null ? `${Math.round(micro.pct_nrv)}% NRV` : ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
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
