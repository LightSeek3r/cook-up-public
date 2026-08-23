<script lang="ts">
	import BalanceGrade from './BalanceGrade.svelte';
	import { nutritionVisible } from '$lib/nutrition';
	import type { RecipeHit } from '$lib/types';

	interface Props {
		recipes: RecipeHit[];
		lang: string;
		t: (key: string) => string;
	}

	let { recipes, lang, t }: Props = $props();
</script>

<!-- Only ever rendered when there are hits, so there is no empty state here: an
     "no recipes match" line would fire on every partial word typed on the way to
     a real query, and the mosaic below is already answering the same keystrokes. -->
<section class="hits" aria-labelledby="recipe-hits-heading">
	<h2 id="recipe-hits-heading">
		{t('search.recipeHits')}
		<span class="count">{recipes.length}</span>
	</h2>
	<ul>
		{#each recipes as recipe (recipe.id)}
			<li>
				<a href="/recipe/{recipe.id}?lang={lang}">
					<span class="title">{recipe.title}</span>
					<span class="meta">
						{#if nutritionVisible(recipe.nutrition_coverage)}
							<BalanceGrade grade={recipe.balance_grade} gradeLabel={t('grade.label')} />
						{/if}
						{#if recipe.cuisine}
							<span class="muted">{t(`cuisine.${recipe.cuisine}`)}</span>
						{/if}
						{#if recipe.total_minutes}
							<span class="muted">{recipe.total_minutes} {t('card.minutes')}</span>
						{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	.hits {
		margin-bottom: var(--space-4);
	}
	.hits h2 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: 1rem;
		margin: var(--space-4) 0 var(--space-2);
	}
	.count {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	li + li {
		border-top: 1px solid var(--line);
	}
	a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		/* 44px minimum target, same rule the ingredient tiles follow. */
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		text-decoration: none;
		color: inherit;
		transition: background var(--dur-fast) ease;
	}
	a:hover {
		background: var(--surface-sunken);
	}
	.title {
		font-weight: 600;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: none;
		font-size: 0.8rem;
	}
	/* The row is the link, so the focus ring belongs on the row, not on a
	   text-sized box inside it — and `outline-offset` would clip against the
	   list's `overflow: hidden`, hence the inset. */
	a:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: -3px;
	}
</style>
