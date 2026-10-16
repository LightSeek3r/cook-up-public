<script lang="ts">
	import BalanceGrade from './BalanceGrade.svelte';
	import FavoriteButton from './FavoriteButton.svelte';
	import FoodIcon from './FoodIcon.svelte';
	import MissingChips from './MissingChips.svelte';
	import { nutritionVisible } from '$lib/nutrition';
	import { MISSING_NAMES_SEP } from '$lib/config';
	import { FALLBACK_EMOJI } from '$lib/emoji';
	import { cuisineIcon, mealIcon } from '$lib/icons';
	import { iconFor } from '$lib/ingredientIcon';
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

	const split = (value: string | null | undefined) => value?.split(MISSING_NAMES_SEP) ?? [];

	const showNutrition = $derived(nutritionVisible(recipe.nutrition_coverage));
	const minutes = $derived(recipe.total_minutes ?? recipe.prep_minutes);
	const ready = $derived(recipe.missing === 0);
	const missingNames = $derived(split(recipe.missing_names));
	const missingKeys = $derived(split(recipe.missing_keys));
	const unusedNames = $derived(split(recipe.unused_names));
	const usedNames = $derived(split(recipe.used_names));
	const usedKeys = $derived(split(recipe.used_keys));
	// Same defence as MissingChips: a misaligned pair would label one
	// ingredient's icon with another's name.
	const uses = $derived(
		usedKeys.length === usedNames.length
			? usedKeys.map((key, i) => ({ key, name: usedNames[i] }))
			: []
	);

	// Half the corpus has no cuisine; the meal glyph is the next best picture of
	// the dish, the generic bowl the last.
	const thumb = $derived(
		recipe.cuisine
			? cuisineIcon(recipe.cuisine)
			: recipe.meal_type
				? mealIcon(recipe.meal_type)
				: FALLBACK_EMOJI
	);
	const tag = $derived(
		[
			recipe.cuisine && t(`cuisine.${recipe.cuisine}`),
			recipe.meal_type && t(`meal.${recipe.meal_type}`)
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<!-- One link per card, on the title: its ::after stretches over the whole card
     so all of it stays clickable, and the buttons inside (favourite, add a
     missing ingredient) are lifted above that overlay. -->
<article class="card result" class:is-ready={ready}>
	<div class="thumb" aria-hidden="true">
		<FoodIcon cp={thumb} size={40} />
	</div>

	<div class="main">
		{#if tag}
			<p class="tag">
				{#if recipe.meal_type}
					<span class="tag-icon"><FoodIcon cp={mealIcon(recipe.meal_type)} size={18} /></span>
				{/if}
				<span>{tag}</span>
			</p>
		{/if}
		<svelte:element this={headingLevel} class="title">
			<a class="card-link" href="/recipe/{recipe.id}?lang={lang}">{recipe.title}</a>
		</svelte:element>
		{#if minutes || (showNutrition && recipe.kcal)}
			<p class="meta">
				{#if minutes}
					<span>
						<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<circle cx="10" cy="10" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6" />
							<path
								d="M10 6.6V10l2.4 1.6"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
							/>
						</svg>
						{minutes} {t('card.minutes')}
					</span>
				{/if}
				{#if showNutrition && recipe.kcal}
					<span>
						<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<path
								d="M11 2.6c.5 2.4-.5 3.9-2 5.4-1.6 1.6-3.5 3-3.5 5.7a4.5 4.5 0 0 0 9 0c0-1.8-.8-3.2-1.8-4.3-.3 1.1-1 1.8-1.8 1.9.8-2.9-.3-6.6-1.3-8.7Z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linejoin="round"
							/>
						</svg>
						{Math.round(recipe.kcal)} {t('nutrition.kcal')}
					</span>
				{/if}
			</p>
		{/if}
	</div>

	<div class="side">
		{#if showNutrition}
			<BalanceGrade grade={recipe.balance_grade} gradeLabel={t('grade.label')} />
		{/if}
		<FavoriteButton id={recipe.id} {t} />
	</div>

	<div class="foot">
		<div class="status">
			<MissingChips
				missing={recipe.missing}
				names={missingNames}
				keys={missingKeys}
				{unusedNames}
				{onAdd}
				{t}
			/>
		</div>
		{#if uses.length}
			<p class="uses">
				<span class="uses-label">{t('card.uses')}</span>
				<span class="sr-only">{uses.map((use) => use.name).join(', ')}</span>
				{#each uses as use (use.key)}
					<span class="use" title={use.name} aria-hidden="true">
						<FoodIcon cp={iconFor(use.key, 'other')} size={22} />
					</span>
				{/each}
			</p>
		{/if}
	</div>
</article>

<style>
	.result {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'thumb main side'
			'foot foot foot';
		gap: var(--space-3);
		margin-bottom: var(--space-2);
		border-radius: var(--radius-card);
		transition:
			transform var(--dur) var(--ease-out),
			box-shadow var(--dur) ease,
			border-color var(--dur-fast) ease;
	}
	.result:hover {
		transform: translateY(-1px);
		box-shadow: var(--shadow-2);
		border-color: var(--line-strong);
	}
	.result:active {
		transform: scale(0.99);
		transition-duration: var(--dur-fast);
	}
	/* Recipes needing nothing extra are the whole point of the app: mark them
	   structurally, not just with a chip that scrolls past. */
	.result.is-ready::before {
		content: '';
		position: absolute;
		inset-block: var(--space-4);
		inset-inline-start: -1px;
		width: 4px;
		border-start-end-radius: 4px;
		border-end-end-radius: 4px;
		background: var(--accent);
	}
	.thumb {
		grid-area: thumb;
		display: grid;
		place-items: center;
		width: 3.4rem;
		height: 3.4rem;
		padding: 0.55rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--primary) 11%, var(--surface));
		box-shadow: inset 0 1px 0 var(--hi);
	}
	.main {
		grid-area: main;
		min-width: 0;
	}
	.tag {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0;
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 600;
	}
	.tag-icon {
		flex: none;
		width: 1.1rem;
		height: 1.1rem;
	}
	.title {
		margin: 0.15rem 0 0.3rem;
		font-family: var(--font-display);
		font-size: 1.12rem;
		font-weight: 700;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.card-link {
		color: var(--ink);
		text-decoration: none;
	}
	.card-link::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.result:hover .card-link {
		text-decoration: underline;
		text-decoration-thickness: 1px;
	}
	/* The link's own outline would only ring the title. */
	.card-link:focus-visible {
		outline: none;
	}
	.result:has(.card-link:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.9rem;
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}
	.meta > span {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.meta svg {
		width: 1rem;
		height: 1rem;
		flex: none;
	}
	.side {
		grid-area: side;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.side :global(button),
	.foot :global(button) {
		position: relative;
		z-index: 1;
	}
	.foot {
		grid-area: foot;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		padding-block-start: var(--space-3);
		border-block-start: 1px solid var(--line);
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.uses {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem;
		margin: 0;
	}
	.uses-label {
		margin-inline-end: 0.4rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}
	:global(:is(:lang(ar), :lang(pnb), :lang(hi), :lang(bn), :lang(zh), :lang(ja), :lang(ko)))
		.uses-label {
		letter-spacing: 0;
		font-size: 0.78rem;
	}
	.use {
		display: grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0.3rem;
		margin-inline-start: -0.4rem;
		border-radius: 50%;
		background: var(--surface-sunken);
		box-shadow: 0 0 0 2px var(--surface);
	}
	.uses-label + .sr-only + .use {
		margin-inline-start: 0;
	}

	@media (forced-colors: active) {
		/* The accent bar is a background, which forced colours paint over. */
		.result.is-ready::before {
			background: CanvasText;
			forced-color-adjust: none;
		}
	}
</style>
