<script lang="ts">
	import NutritionPanel from '$components/NutritionPanel.svelte';
	import IngredientIcon from '$components/IngredientIcon.svelte';
	import { t as translator } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = $derived(translator(data.lang));

	interface Translated {
		title: string;
		instructions: string;
		machine: boolean;
	}

	// The server always returns the recipe in its source language; a successful
	// lazy translation overrides it, so the page never blocks on Workers AI.
	let translated = $state<Translated | null>(null);

	const title = $derived(translated?.title ?? data.recipe.title);
	const instructions = $derived(translated?.instructions ?? data.recipe.instructions);
	const machine = $derived(translated ? translated.machine : Boolean(data.recipe.is_machine));

	/**
	 * Sources hand us one blob of prose whose steps are numbered inline, and they
	 * do not agree on where to start — TheMealDB rows begin at "0.". Splitting on
	 * the source's own markers and renumbering from 1 turns that into a method
	 * list you can hold your place in while cooking.
	 */
	function splitSteps(text: string): string[] {
		const normalised = text.replace(/\r\n?/g, '\n').trim();
		if (!normalised) return [];

		const marker = /(?:^|\n|(?<=[.!?])[ \t]+)(?:step[ \t]*)?\d{1,2}[ \t]*[.):][ \t]+/gi;
		const numbered = normalised
			.split(marker)
			.map((step) => step.trim())
			.filter(Boolean);
		// Two segments usually means a stray "2. " inside a sentence, not a list.
		if (numbered.length >= 3) return numbered;

		const lines = normalised
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		return lines.length > 1 ? lines : [normalised];
	}

	const steps = $derived(splitSteps(instructions));

	const tags = $derived(
		[data.recipe.cuisine, data.recipe.meal_type ? t(`meal.${data.recipe.meal_type}`) : null].filter(
			(tag): tag is string => Boolean(tag)
		)
	);

	// Layer-2 i18n: fetch the machine translation only when the page is actually
	// viewed in a language the recipe has not been translated into yet.
	$effect(() => {
		translated = null;
		if (!data.needsTranslation) return;
		fetch(`/api/translate?id=${data.recipe.id}&lang=${data.lang}`)
			.then((response) => response.json())
			.then((result) => {
				if (result?.title) {
					translated = {
						title: result.title,
						instructions: result.instructions,
						machine: Boolean(result.machine)
					};
				}
			})
			.catch(() => {
				/* keep the original-language text */
			});
	});
</script>

<article>
	<a class="back" href="/?lang={data.lang}">
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path
				d="M12 4 6 10l6 6"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{t('recipe.back')}
	</a>

	<header class="hero">
		{#if tags.length}
			<p class="eyebrow">{tags.join(' · ')}</p>
		{/if}
		<h1>{title}</h1>

		<ul class="stats">
			{#if data.recipe.total_minutes}
				<li>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4ZM12 7.6V12l3 2"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<span><strong>{data.recipe.total_minutes}</strong> {t('card.minutes')}</span>
				</li>
			{/if}
			{#if data.recipe.servings}
				<li>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M3.6 12.4h16.8a8.4 8.4 0 0 1-16.8 0ZM2.4 12.4h19.2M12 5.6V8.4M9.6 7l2.4-1.4L14.4 7"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<span><strong>{data.recipe.servings}</strong> {t('recipe.servings')}</span>
					{#if data.recipe.servings_assumed}
						<abbr title={t('recipe.assumed')}>?</abbr>
					{/if}
				</li>
			{/if}
			{#if data.recipe.kcal}
				<li>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M13.4 2.6c.6 3-.6 4.8-2.4 6.6-2 2-4.4 3.8-4.4 7.2a6.4 6.4 0 0 0 12.8 0c0-2.2-1-4-2.2-5.4-.4 1.4-1.2 2.2-2.2 2.4 1-3.6-.4-8.2-1.6-10.8Z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<span><strong>{Math.round(data.recipe.kcal)}</strong> kcal</span>
				</li>
			{/if}
			{#if machine}
				<li class="mt">
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M3.6 7.2h8.4M7.8 4.8v2.4c0 3.6-1.8 6-4.2 7.2M8.4 10.8c0 3 2.4 4.8 5.4 5.4M13.2 19.2l3.6-9.6 3.6 9.6M14.6 16.2h4.4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<span>{t('recipe.autoTranslated')}</span>
				</li>
			{/if}
		</ul>
	</header>

	<div class="cols">
		<section class="panel">
			<h2>{t('recipe.ingredients')}</h2>
			<ul class="ingredients">
				{#each data.recipe.ingredients as ingredient (ingredient.id)}
					<li data-cat={ingredient.category}>
						<span class="art">
							<IngredientIcon
								canonicalKey={ingredient.canonical_key}
								category={ingredient.category}
							/>
						</span>
						<span>{ingredient.raw_text ?? ingredient.name}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="method">
			<h2>{t('recipe.instructions')}</h2>
			<ol>
				{#each steps as step, index (index)}
					<li>
						<span class="num" aria-hidden="true">{index + 1}</span>
						<p>{step}</p>
					</li>
				{/each}
			</ol>
		</section>
	</div>

	<NutritionPanel recipe={data.recipe} {t} />

	<p class="muted source">
		{t('recipe.source')}:
		<a href={data.recipe.source_url} rel="noopener noreferrer nofollow" target="_blank">
			{data.recipe.attribution ?? data.recipe.source_url}
		</a>
		— {data.recipe.license}
	</p>
</article>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
		color: var(--muted);
		min-height: 2.5rem;
	}
	.back:hover {
		color: var(--primary);
	}
	.back svg {
		width: 1.1em;
		height: 1.1em;
	}
	/* The chevron points back along the reading direction in both scripts. */
	:global([dir='rtl']) .back svg {
		transform: scaleX(-1);
	}

	/* Editorial opener: the title carries the page and the numbers sit under it as
	   an at-a-glance strip rather than another paragraph of grey text. */
	.hero {
		position: relative;
		overflow: hidden;
		margin: var(--space-2) 0 var(--space-5);
		padding: var(--space-5);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(
				30rem 16rem at 12% -6rem,
				color-mix(in srgb, var(--primary) 16%, transparent),
				transparent 70%
			),
			radial-gradient(
				24rem 14rem at 92% 120%,
				color-mix(in srgb, var(--accent) 14%, transparent),
				transparent 70%
			),
			var(--surface);
		box-shadow: var(--shadow-1);
	}
	.eyebrow {
		margin: 0 0 var(--space-2);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--primary);
	}
	.hero h1 {
		font-size: clamp(1.8rem, 1.1rem + 3vw, 3rem);
		max-width: 18ch;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		list-style: none;
		margin: var(--space-4) 0 0;
		padding: 0;
	}
	.stats li {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.stats strong {
		font-family: var(--font-display);
		font-size: 1.15rem;
		color: var(--ink);
	}
	.stats svg {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--primary);
	}
	.stats .mt svg {
		color: var(--muted);
	}
	.stats abbr {
		font-size: 0.7rem;
		font-weight: 700;
		width: 1.1rem;
		height: 1.1rem;
		display: grid;
		place-items: center;
		border-radius: var(--radius-pill);
		background: var(--surface-sunken);
		border: 1px solid var(--line-strong);
		cursor: help;
		text-decoration: none;
	}

	.cols {
		display: grid;
		gap: var(--space-5);
		margin-bottom: var(--space-5);
	}
	@media (min-width: 52rem) {
		.cols {
			grid-template-columns: minmax(15rem, 1fr) minmax(0, 1.9fr);
			align-items: start;
		}
		.panel {
			position: sticky;
			top: var(--space-4);
		}
	}

	.panel {
		background: var(--surface-sunken);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
	}
	.panel h2,
	.method h2 {
		margin-top: 0;
	}

	.ingredients {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ingredients li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) 0;
		font-size: 0.92rem;
	}
	.ingredients li + li {
		border-block-start: 1px solid var(--line);
	}
	.art {
		width: 1.75rem;
		height: 1.75rem;
		flex: none;
		color: var(--cat-ink, var(--muted));
	}

	.method ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.method li {
		display: grid;
		grid-template-columns: 2.5rem 1fr;
		gap: var(--space-3);
		align-items: start;
		padding-block: var(--space-3);
	}
	.method li + li {
		border-block-start: 1px solid var(--line);
	}
	.num {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1;
		color: var(--primary);
		/* Optical alignment with the first line of the step text. */
		padding-block-start: 0.1rem;
		font-variant-numeric: tabular-nums;
	}
	.method p {
		margin: 0;
		max-width: 62ch;
		line-height: 1.7;
	}

	.source {
		margin-top: var(--space-5);
	}
</style>
