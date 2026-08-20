<script lang="ts">
	import BalanceGrade from './BalanceGrade.svelte';
	import MissingChips from './MissingChips.svelte';
	import { nutritionVisible } from '$lib/nutrition';
	import { MISSING_NAMES_SEP } from '$lib/config';
	import type { MatchResult } from '$lib/types';

	interface Props {
		recipe: MatchResult;
		lang: string;
		t: (key: string) => string;
	}

	let { recipe, lang, t }: Props = $props();

	const showNutrition = $derived(nutritionVisible(recipe.nutrition_coverage));
	const minutes = $derived(recipe.total_minutes ?? recipe.prep_minutes);
	const ready = $derived(recipe.missing === 0);
	const missingNames = $derived(recipe.missing_names?.split(MISSING_NAMES_SEP) ?? []);
</script>

<a class="card result" class:ready href="/recipe/{recipe.id}?lang={lang}">
	<div class="head">
		<h3 class="title">{recipe.title}</h3>
		{#if showNutrition}
			<BalanceGrade grade={recipe.balance_grade} gradeLabel={t('grade.label')} />
		{/if}
	</div>

	<div class="meta">
		<MissingChips missing={recipe.missing} names={missingNames} {t} />
		{#if minutes}
			<span class="muted">{minutes} {t('card.minutes')}</span>
		{/if}
		{#if showNutrition && recipe.kcal}
			<span class="muted">{Math.round(recipe.kcal)} {t('nutrition.kcal')}</span>
		{/if}
	</div>
</a>

<style>
	.result {
		display: block;
		text-decoration: none;
		color: inherit;
		margin-bottom: var(--space-2);
		transition:
			transform var(--dur) var(--ease-spring),
			box-shadow var(--dur) ease,
			border-color var(--dur-fast) ease;
	}
	.result:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-2);
		border-color: var(--line-strong);
	}
	.result:active {
		transform: scale(0.99);
		transition-duration: var(--dur-fast);
	}
	/* Recipes needing nothing extra are the whole point of the app — mark them
	   structurally, not just with a chip that scrolls past. */
	.result.ready {
		border-inline-start: 4px solid var(--accent);
	}
	.head {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.title {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
</style>
