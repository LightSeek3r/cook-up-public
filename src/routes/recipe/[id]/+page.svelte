<script lang="ts">
	import { page } from '$app/stores';
	import NutritionPanel from '$components/NutritionPanel.svelte';
	import RecipeHits from '$components/RecipeHits.svelte';
	import SubstitutionTips from '$components/SubstitutionTips.svelte';
	import IngredientIcon from '$components/IngredientIcon.svelte';
	import FavoriteButton from '$components/FavoriteButton.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import { DIFFICULTY_MAX } from '$lib/config';
	import { t as translator } from '$lib/i18n';
	import { splitSteps } from '$lib/steps';
	import { equivalentOf } from '$lib/measure';
	import type { RecipeDetail } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = $derived(translator(data.lang));

	// A compact fact string ("20 min · 4 servings · 320 kcal") rather than a
	// truncated slice of the instructions: it's meaningful in every one of the
	// 10 languages without risking a mid-word cut, and stays true regardless
	// of which fields the source recipe happened to state.
	const seoDescription = $derived(
		[
			data.recipe.total_minutes ? `${data.recipe.total_minutes} ${t('card.minutes')}` : null,
			data.recipe.servings ? `${data.recipe.servings} ${t('recipe.servings')}` : null,
			data.recipe.kcal ? `${Math.round(data.recipe.kcal)} ${t('nutrition.kcal')}` : null
		]
			.filter((part): part is string => Boolean(part))
			.join(' · ') || t('app.tagline')
	);

	const title = $derived(data.recipe.title);
	const machine = $derived(Boolean(data.recipe.is_machine));

	const steps = $derived(splitSteps(data.recipe.instructions));
	const notes = $derived(data.recipe.notes?.split('\n').filter(Boolean) ?? []);

	/** The parenthesised metric/imperial equivalent for one ingredient line, or ''
	 *  when there is nothing honest to add. */
	const equivalent = (ing: RecipeDetail['ingredients'][number]) =>
		equivalentOf(ing.quantity, ing.unit, ing.grams) ?? '';

	// Both go through t(): cuisine was previously rendered raw, so this page showed
	// "middle_eastern" where the filter bar and the search results showed
	// "Middle Eastern" — the keys already existed in all ten locales.
	const tags = $derived(
		[
			data.recipe.cuisine ? t(`cuisine.${data.recipe.cuisine}`) : null,
			data.recipe.meal_type ? t(`meal.${data.recipe.meal_type}`) : null
		].filter((tag): tag is string => Boolean(tag))
	);
</script>

<SeoHead
	title="{title} — {t('app.title')}"
	description={seoDescription}
	url={$page.url}
	lang={data.lang}
	type="article"
/>

<article>
	<div class="toolbar no-print">
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
		<div class="toolbar-actions">
			<FavoriteButton id={data.recipe.id} {t} />
			<button type="button" class="print-btn" onclick={() => window.print()}>
				<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
					<path
						d="M10 2.8v9.4m0 0-3.2-3.2M10 12.2l3.2-3.2M4.4 14v1.8c0 .66.54 1.2 1.2 1.2h8.8c.66 0 1.2-.54 1.2-1.2V14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{t('recipe.downloadPdf')}
			</button>
		</div>
	</div>

	<header class="hero">
		{#if data.recipe.image_url}
			<!-- width/height come from the API so the box is reserved before the image
			     arrives (no layout shift). `loading="eager"` because this is the page's
			     lead image and above the fold — lazy-loading it would only delay it.
			     `no-referrer` keeps the visitor's page out of Wikimedia's logs, which
			     is the privacy cost of hotlinking rather than mirroring. -->
			<img
				class="photo"
				src={data.recipe.image_url}
				width={data.recipe.image_width}
				height={data.recipe.image_height}
				alt={title}
				loading="eager"
				decoding="async"
				referrerpolicy="no-referrer"
			/>
		{/if}
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
			{#if data.recipe.difficulty}
				<li>
					<!-- A filled/empty pip meter rather than a bare number: "3" means
					     nothing without its scale, and the scale is only 1-4. The
					     accessible name carries the same information as text, since the
					     pips are decorative shapes. -->
					<span
						class="pips"
						role="img"
						aria-label="{t('recipe.difficulty')}: {data.recipe.difficulty}/{DIFFICULTY_MAX}"
					>
						{#each Array(DIFFICULTY_MAX) as _, i (i)}
							<span class="pip" class:on={i < data.recipe.difficulty}></span>
						{/each}
					</span>
					<span>{t('recipe.difficulty')}</span>
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
						<!-- Was <abbr title>, which abbreviates nothing and is mouse-hover-only:
						     the caveat was invisible to keyboard and touch users. Now visible text. -->
						<em class="assumed">({t('recipe.assumed')})</em>
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
					<span><strong>{Math.round(data.recipe.kcal)}</strong> {t('nutrition.kcal')}</span>
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
						<span>
							{data.lang === data.recipe.source_lang && ingredient.raw_text
								? ingredient.raw_text
								: ingredient.name}
							<!-- The other measuring system, and a real weight where the pipeline
							     resolved one. Rendered as a quiet suffix rather than replacing the
							     source's own wording, which stays authoritative. Silent when there
							     is nothing honest to add — see `equivalentOf`. -->
							{#if equivalent(ingredient)}
								<span class="equiv">({equivalent(ingredient)})</span>
							{/if}
						</span>
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

	<!-- Source-language only, and deliberately so. These bullets are untranslated
	     free text that recipe_i18n does not carry; showing English tips inside an
	     Arabic page would be worse than omitting them. Same rule already applied
	     to ingredient `raw_text` above. -->
	{#if notes.length && data.lang === data.recipe.source_lang}
		<section class="card notes">
			<h2>{t('recipe.notes')}</h2>
			<ul>
				{#each notes as note, index (index)}
					<li>{note}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<NutritionPanel recipe={data.recipe} {t} lang={data.lang} />

	<SubstitutionTips tips={data.tips} {t} />

	{#if data.related.length}
		<div class="no-print">
			<RecipeHits recipes={data.related} lang={data.lang} {t} heading={t('recipe.related')} />
		</div>
	{/if}

	<!-- Per-image credit, separate from the recipe-text credit below. Not optional:
	     most of these files are share-alike (CC BY-SA / CC BY), which requires
	     naming the author and the licence and linking the file page. The footer's
	     CC-BY-SA-3.0 line covers the Wikibooks *prose* only — a photo has its own
	     author and frequently a different licence. Author is omitted when the file
	     states none (CC0 / public domain, which require no attribution). -->
	{#if data.recipe.image_url && data.recipe.image_licence}
		<p class="muted source">
			{t('recipe.photo')}:
			{#if data.recipe.image_page}
				<a href={data.recipe.image_page} rel="noopener noreferrer nofollow" target="_blank">
					{data.recipe.image_author ?? t('recipe.photoUnknownAuthor')}
				</a>
			{:else}
				{data.recipe.image_author ?? t('recipe.photoUnknownAuthor')}
			{/if}
			— {data.recipe.image_licence}, {t('recipe.viaCommons')}
		</p>
	{/if}

	<p class="muted source">
		{t('recipe.source')}:
		<a href={data.recipe.source_url} rel="noopener noreferrer nofollow" target="_blank">
			{data.recipe.attribution ?? data.recipe.source_url}
		</a>
		— {data.recipe.license}
	</p>
</article>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
		color: var(--muted);
		/* 44px — the only back affordance on the page. */
		min-height: 2.75rem;
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

	.print-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--muted);
		font-size: 0.85rem;
		font-weight: 600;
		box-shadow: var(--shadow-1);
	}
	.print-btn:hover {
		color: var(--primary);
		border-color: var(--primary);
	}
	.print-btn svg {
		width: 1.1em;
		height: 1.1em;
	}

	/* Flatten this page's own hero gradients for print ("no gradients") and
	   keep each logical block from splitting across a page break. Chrome hiding
	   (.no-print) and the global light-palette/doodle override live in app.css. */
	@media print {
		.hero {
			background: var(--surface) !important;
			box-shadow: none;
		}
		.hero,
		.panel,
		.method li,
		.ingredients li,
		.notes {
			break-inside: avoid;
		}
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

	/* Difficulty pips. Sized and spaced to read as a meter at a glance, and
	   deliberately not colour-only: filled vs empty differs in fill AND in border
	   weight, so the level survives greyscale and forced-colors. */
	.pips {
		display: inline-flex;
		gap: 0.2rem;
		align-items: center;
	}
	.pip {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		border: 1.5px solid var(--line-strong);
	}
	.pip.on {
		background: var(--primary);
		border-color: var(--primary);
	}
	@media (forced-colors: active) {
		.pip {
			border-color: CanvasText;
		}
		.pip.on {
			background: CanvasText;
			border-color: CanvasText;
		}
	}

	/* Quieter than the ingredient name it follows: this is a convenience, and it
	   must not compete with the source's own wording. */
	/* Full-bleed inside the hero card, above the eyebrow. aspect-ratio comes from
	   the stored dimensions via the width/height attributes, so the box is reserved
	   and nothing shifts when the image lands. */
	.photo {
		display: block;
		width: 100%;
		height: auto;
		max-height: 22rem;
		object-fit: cover;
		border-radius: var(--radius) var(--radius) 0 0;
		margin: calc(-1 * var(--space-5)) calc(-1 * var(--space-5)) var(--space-4);
		width: calc(100% + 2 * var(--space-5));
		background: var(--surface-sunken);
	}

	.equiv {
		color: var(--muted);
		font-size: 0.85em;
		white-space: nowrap;
	}

	.notes {
		margin-top: var(--space-5);
	}
	.notes h2 {
		margin: 0 0 var(--space-3);
		font-size: 1.05rem;
	}
	.notes ul {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: var(--space-2);
	}
	.notes li {
		font-size: 0.92rem;
		line-height: 1.55;
	}
	.assumed {
		font-size: 0.8rem;
		font-style: italic;
		color: var(--muted);
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
