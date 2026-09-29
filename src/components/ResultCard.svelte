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
		/** Heading level for the title. Cards sit directly under the results
		 *  `<h2>` normally, but one level deeper when grouped under an
		 *  "Almost there" `<h3>` — skipping a level breaks screen-reader
		 *  outline navigation. */
		headingLevel?: 'h3' | 'h4';
		/** Adds a missing ingredient straight into the selection when its chip
		 *  is tapped. Omitted where there's no selection to add to. */
		onAdd?: (key: string) => void;
	}

	let { recipe, lang, t, headingLevel = 'h3', onAdd }: Props = $props();

	const showNutrition = $derived(nutritionVisible(recipe.nutrition_coverage));
	const minutes = $derived(recipe.total_minutes ?? recipe.prep_minutes);
	const ready = $derived(recipe.missing === 0);
	const missingNames = $derived(recipe.missing_names?.split(MISSING_NAMES_SEP) ?? []);
	const missingKeys = $derived(recipe.missing_keys?.split(MISSING_NAMES_SEP) ?? []);
	const unusedNames = $derived(recipe.unused_names?.split(MISSING_NAMES_SEP) ?? []);
</script>

<!-- Once `onAdd` is wired, a missing ingredient renders as a <button>
     (MissingChips), which can't nest inside an <a> — so `.meta` is a sibling
     of the link, and the link's ::after stretches over the whole card to keep
     all of it clickable, with `.meta`'s buttons lifted above that overlay. -->
<div class="card result" class:ready>
	<a class="card-link" href="/recipe/{recipe.id}?lang={lang}">
		<div class="head">
			<svelte:element this={headingLevel} class="title">{recipe.title}</svelte:element>
			{#if showNutrition}
				<BalanceGrade grade={recipe.balance_grade} gradeLabel={t('grade.label')} />
			{/if}
		</div>
	</a>

	<div class="meta">
		<MissingChips
			missing={recipe.missing}
			names={missingNames}
			keys={missingKeys}
			{unusedNames}
			{onAdd}
			{t}
		/>
		{#if minutes}
			<span class="muted">{minutes} {t('card.minutes')}</span>
		{/if}
		{#if showNutrition && recipe.kcal}
			<span class="muted">{Math.round(recipe.kcal)} {t('nutrition.kcal')}</span>
		{/if}
	</div>
</div>

<style>
	.result {
		position: relative;
		margin-bottom: var(--space-2);
		transition:
			transform var(--dur) var(--ease-spring),
			box-shadow var(--dur) ease,
			border-color var(--dur-fast) ease;
	}
	.card-link {
		display: block;
		text-decoration: none;
		color: inherit;
	}
	.card-link::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	/* The link's own outline would only ring the title row. */
	.card-link:focus-visible {
		outline: none;
	}
	.result:has(.card-link:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.meta :global(button) {
		position: relative;
		z-index: 1;
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
