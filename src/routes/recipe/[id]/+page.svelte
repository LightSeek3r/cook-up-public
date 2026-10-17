<script lang="ts">
	import { page } from '$app/stores';
	import NutritionPanel from '$components/NutritionPanel.svelte';
	import RecipeHits from '$components/RecipeHits.svelte';
	import SubstitutionTips from '$components/SubstitutionTips.svelte';
	import IngredientIcon from '$components/IngredientIcon.svelte';
	import FavoriteButton from '$components/FavoriteButton.svelte';
	import BalanceGrade from '$components/BalanceGrade.svelte';
	import FoodIcon from '$components/FoodIcon.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import { DIFFICULTY_MAX } from '$lib/config';
	import { FALLBACK_EMOJI } from '$lib/emoji';
	import { cuisineIcon, mealIcon } from '$lib/icons';
	import { t as translator } from '$lib/i18n';
	import { nutritionVisible } from '$lib/nutrition';
	import { splitSteps } from '$lib/steps';
	import { amountOf, equivalentOf } from '$lib/measure';
	import { numberFormatter, unitLabeler } from '$lib/ingredientAmount';
	import { toMetricText } from '$lib/metricText';
	import { commonsSrcset } from '$lib/photo';
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
	const srcset = $derived(
		data.recipe.image_url ? commonsSrcset(data.recipe.image_url, data.recipe.image_width) : undefined
	);
	const machine = $derived(Boolean(data.recipe.is_machine));

	// The recipes keep their source's US/imperial units (a translation must not change
	// a number), so the method is shown in metric here, in every language.
	const steps = $derived(
		splitSteps(data.recipe.instructions).map((step) => toMetricText(step, data.lang))
	);
	const notes = $derived(
		data.recipe.notes
			?.split('\n')
			.filter(Boolean)
			.map((note) => toMetricText(note, data.lang)) ?? []
	);

	type Ingredient = RecipeDetail['ingredients'][number];

	/** The source's own wording is only shown in the language it was written in. */
	const ownWording = (ing: Ingredient) => data.lang === data.recipe.source_lang && ing.raw_text;

	/** The parenthesised metric/imperial equivalent after the source's wording, or ''
	 *  when there is nothing honest to add. */
	const equivalent = (ing: Ingredient) =>
		equivalentOf(ing.quantity, ing.unit, ing.grams, ing.raw_text) ?? '';

	// A translated page has only the canonical name, so its amount is rebuilt from the
	// structured fields, in metric.
	const amount = $derived.by(() => {
		const format = numberFormatter(data.lang);
		const label = unitLabeler(data.lang, t);
		return (ing: Ingredient) =>
			amountOf(ing.quantity, ing.unit, ing.grams, ing.raw_text, format, label);
	});

	// Both go through t(): cuisine was previously rendered raw, so this page showed
	// "middle_eastern" where the filter bar and the search results showed
	// "Middle Eastern" — the keys already existed in all ten locales.
	const tags = $derived(
		[
			data.recipe.cuisine
				? { key: 'cuisine', label: t(`cuisine.${data.recipe.cuisine}`), icon: cuisineIcon(data.recipe.cuisine) }
				: null,
			data.recipe.meal_type
				? { key: 'meal', label: t(`meal.${data.recipe.meal_type}`), icon: mealIcon(data.recipe.meal_type) }
				: null
		].filter((tag) => tag !== null)
	);
	// Most recipes have no photo: the frame then shows the dish on the board,
	// the same glyph the result card used to get the visitor here.
	const dishIcon = $derived(tags[0]?.icon ?? FALLBACK_EMOJI);
	const grade = $derived(
		nutritionVisible(data.recipe.nutrition_coverage) ? data.recipe.balance_grade : null
	);
</script>

<SeoHead
	title="{title} — {t('app.title')}"
	description={seoDescription}
	url={$page.url}
	lang={data.lang}
	type="article"
/>

<svelte:head>
	{#if data.recipe.image_url}
		<!-- The hero photo is the page's LCP element and the one third-party host:
		     open that connection while the HTML is still arriving. -->
		<link rel="preconnect" href="https://upload.wikimedia.org" />
	{/if}
</svelte:head>

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
			<button type="button" class="chrome-control print-btn" onclick={() => window.print()}>
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

	<header class="hero" class:has-photo={Boolean(data.recipe.image_url)}>
		{#if data.recipe.image_url}
			<!-- width/height come from the API so the box is reserved before the image
			     arrives (no layout shift). Eager with high priority because this is the
			     page's lead image and LCP element, above the fold. `sizes` follows the
			     hero's photo column: the viewport on phones, at most ~40rem once the
			     hero splits into photo and text. `no-referrer` keeps the visitor's page out of
			     Wikimedia's logs, which is the privacy cost of hotlinking rather than
			     mirroring. -->
			<div class="photo">
				<img
					src={data.recipe.image_url}
					{srcset}
					sizes={srcset ? '(min-width: 52rem) 40rem, 100vw' : undefined}
					width={data.recipe.image_width}
					height={data.recipe.image_height}
					alt={title}
					loading="eager"
					fetchpriority="high"
					decoding="async"
					referrerpolicy="no-referrer"
				/>
			</div>
		{:else}
			<div class="photo board no-print" aria-hidden="true">
				<span class="dish"><FoodIcon cp={dishIcon} size={96} /></span>
			</div>
		{/if}
		<div class="hero-body">
			{#if tags.length}
				<p class="eyebrow">
					{#each tags as tag, i (tag.key)}
						{#if i > 0}<span class="sep" aria-hidden="true">·</span>{/if}
						<span class="eyebrow-tag">
							<span class="eyebrow-icon"><FoodIcon cp={tag.icon} size={20} /></span>
							{tag.label}
						</span>
					{/each}
				</p>
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
				{#if grade}
					<li class="stat-grade">
						<BalanceGrade {grade} gradeLabel={t('grade.label')} />
						<span aria-hidden="true">{t('grade.label')}</span>
					</li>
				{/if}
			</ul>
		</div>
	</header>

	<div class="cols">
		<section class="panel ingredients-panel">
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
						<span class="ing-text">
							{#if ownWording(ingredient)}
								{ingredient.raw_text}
								<!-- The other measuring system, and a real weight for a container.
								     Rendered as a quiet suffix rather than replacing the source's own
								     wording, which stays authoritative. Silent when there is nothing
								     honest to add — see `equivalentOf`. -->
								{#if equivalent(ingredient)}
									<span class="equiv">({equivalent(ingredient)})</span>
								{/if}
							{:else}
								{@const measured = amount(ingredient)}
								{#if measured.lead}{measured.lead}{' '}{/if}{ingredient.name}
								{#if measured.note}
									<span class="equiv">({measured.note})</span>
								{/if}
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="method sheet">
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
		<section class="sheet notes">
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
		gap: 0.35rem;
		/* 44px: the only back affordance on the page. */
		min-height: var(--tap);
		padding-inline-end: var(--space-2);
		color: var(--ink);
		font-size: 0.92rem;
		font-weight: 700;
		text-decoration: none;
	}
	.back:hover {
		color: var(--primary);
	}
	.back svg {
		width: 1.15rem;
		height: 1.15rem;
		color: var(--primary);
	}
	/* The chevron points back along the reading direction in both scripts. */
	:global([dir='rtl']) .back svg {
		transform: scaleX(-1);
	}

	.print-btn {
		gap: 0.45rem;
		padding-inline: 0.95rem;
		font-size: 0.85rem;
		font-weight: 700;
	}
	.print-btn svg {
		width: 1.1rem;
		height: 1.1rem;
	}

	/* A sheet of the worktop: solid surface, steel edge, the same 1px bevel as
	   the chrome so it reads as lying on the brushed ground. */
	.hero,
	.sheet {
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 0 var(--lo),
			0 10px 20px -16px var(--lo-2);
	}

	/* Photo (or the board standing in for one) beside the title on wide screens,
	   above it on phones. */
	.hero {
		display: grid;
		overflow: hidden;
		margin: var(--space-3) 0 var(--space-5);
	}
	@media (min-width: 52rem) {
		.hero {
			grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		}
	}

	.photo {
		position: relative;
		aspect-ratio: 4 / 3;
		min-height: 13rem;
		background: var(--surface-sunken);
	}
	/* object-fit inside a frame of its own ratio: the frame is reserved before
	   the image lands, whatever its stored dimensions. */
	.photo > img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	@media (min-width: 52rem) {
		.photo {
			aspect-ratio: auto;
			min-height: 22rem;
		}
	}

	/* No photo: the dish on the wooden board, drawn the way the home page's
	   board is (plank seams and slanted grain in black/white alpha over
	   --board), shallower on phones so the title stays on the first screen. */
	.board {
		display: grid;
		place-items: center;
		isolation: isolate;
		aspect-ratio: 16 / 7;
		min-height: 9rem;
		background-color: var(--board);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 25%),
			inset 0 -1px 0 var(--board-edge);
	}
	.board::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background-image:
			repeating-linear-gradient(
				180deg,
				transparent 0 calc(4.5rem - 2px),
				rgb(0 0 0 / 20%) calc(4.5rem - 2px) calc(4.5rem - 1px),
				rgb(255 255 255 / 12%) calc(4.5rem - 1px) 4.5rem
			),
			repeating-linear-gradient(
				176deg,
				rgb(0 0 0 / 4.5%) 0 1px,
				transparent 1px 6px,
				rgb(255 255 255 / 5%) 6px 7px,
				transparent 7px 13px
			),
			repeating-linear-gradient(183deg, transparent 0 21px, rgb(0 0 0 / 5%) 21px 23px, transparent 23px 47px);
		pointer-events: none;
	}
	@media (min-width: 52rem) {
		.board {
			aspect-ratio: auto;
		}
	}
	/* A plate on the board, the same --surface medallion the tiles use. */
	.dish {
		display: grid;
		place-items: center;
		width: clamp(6rem, 4rem + 9vw, 10rem);
		aspect-ratio: 1;
		/* Not a percentage: padding resolves against the board's width. */
		padding: clamp(1.1rem, 0.7rem + 1.6vw, 1.8rem);
		border-radius: 50%;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--line-strong),
			inset 0 -6px 12px -6px var(--lo-2),
			0 2px 0 var(--board-edge),
			0 18px 26px -14px rgb(0 0 0 / 55%);
	}

	.hero-body {
		display: grid;
		align-content: center;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-5);
	}
	@media (max-width: 30rem) {
		.hero-body {
			padding: var(--space-4);
		}
	}

	.eyebrow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		color: var(--primary);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	/* Tracking pulls joined scripts apart (Arabic, Shahmukhi) and breaks the
	   Devanagari and Bengali headline; caps tracking is a Latin habit. */
	.eyebrow:is(:lang(ar), :lang(pnb), :lang(hi), :lang(bn)) {
		letter-spacing: 0;
	}
	.eyebrow-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.eyebrow-icon {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0.2rem;
		flex: none;
		border-radius: 50%;
		background: var(--surface-sunken);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.sep {
		color: var(--muted);
	}

	.hero h1 {
		margin: 0;
		font-size: clamp(2rem, 1.3rem + 2.6vw, 3.25rem);
		line-height: 1.05;
		overflow-wrap: anywhere;
	}

	/* The numbers as an at-a-glance strip, each over a hairline rule. */
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: var(--space-3);
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
	}
	.stats li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.15rem 0.45rem;
		padding-block-start: var(--space-2);
		border-block-start: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.85rem;
	}
	.stats strong {
		font-family: var(--font-display);
		font-size: 1.2rem;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.stats svg {
		width: 1.3rem;
		height: 1.3rem;
		flex: none;
		color: var(--primary);
	}
	.stats .mt svg {
		color: var(--muted);
	}
	.stats .stat-grade {
		grid-column: 1 / -1;
		gap: var(--space-2);
	}
	.assumed {
		grid-column: 1 / -1;
		font-size: 0.8rem;
		font-style: italic;
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
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		border: 1.5px solid var(--muted);
	}
	.pip.on {
		background: var(--primary);
		border-color: var(--primary);
	}

	.cols {
		display: grid;
		gap: var(--space-5);
		margin-bottom: var(--space-5);
	}
	@media (min-width: 52rem) {
		.cols {
			grid-template-columns: minmax(16rem, 1fr) minmax(0, 1.8fr);
			align-items: start;
		}
		.ingredients-panel {
			position: sticky;
			top: var(--space-4);
		}
	}

	/* Sunk into the worktop, where the method sheet is raised from it. */
	.panel {
		padding: var(--space-4);
		background: var(--surface-sunken);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		box-shadow: inset 0 1px 3px var(--lo);
	}
	.panel h2,
	.method h2,
	.notes h2 {
		margin: 0 0 var(--space-2);
		font-size: 1.35rem;
	}

	.ingredients {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ingredients li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-block: 0.5rem;
		font-size: 0.95rem;
	}
	.ingredients li + li {
		border-block-start: 1px solid var(--line);
	}
	/* The same medallion as the home tiles, ringed in the category's line. */
	.art {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0.32rem;
		flex: none;
		border-radius: 50%;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--cat-line, var(--line-strong)),
			0 1px 0 var(--hi);
	}
	.ing-text {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	/* Quieter than the ingredient name it follows: this is a convenience, and it
	   must not compete with the source's own wording. */
	.equiv {
		color: var(--muted);
		font-size: 0.85em;
		white-space: nowrap;
	}

	.method {
		padding: var(--space-4) var(--space-5);
	}
	.method ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.method li {
		display: grid;
		grid-template-columns: 2.3rem minmax(0, 1fr);
		gap: var(--space-3);
		align-items: start;
		padding-block: var(--space-3);
	}
	.method li + li {
		border-block-start: 1px solid var(--line);
	}
	/* A stamped steel pip per step. Body face, not the display serif: under
	   :lang(pnb) or the system fallback the numbers stay Western and even. */
	.num {
		display: grid;
		place-items: center;
		width: 2.3rem;
		height: 2.3rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		background: var(--sheen);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
		color: var(--ink);
		font-family: var(--font-body);
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.method p {
		margin: 0;
		max-width: 62ch;
		/* Optical alignment of the first line with the middle of the pip. */
		padding-block-start: 0.3rem;
		line-height: 1.7;
	}

	.notes {
		margin-top: var(--space-5);
		padding: var(--space-4);
	}
	.notes ul {
		margin: 0;
		padding-inline-start: 1.1rem;
		display: grid;
		gap: var(--space-2);
	}
	.notes li {
		font-size: 0.92rem;
		line-height: 1.55;
	}
	.notes li::marker {
		color: var(--primary);
	}

	.source {
		margin-top: var(--space-5);
		overflow-wrap: anywhere;
	}
	.source + .source {
		margin-top: var(--space-1);
	}

	@media (forced-colors: active) {
		.pip {
			border-color: CanvasText;
		}
		.pip.on {
			background: CanvasText;
			border-color: CanvasText;
		}
		.board::before {
			display: none;
		}
		.num {
			background: Canvas;
		}
	}

	/* Print: flat (no gradients, no bevels), one column, and each logical block
	   kept off a page break. Chrome hiding (.no-print, which also drops the
	   empty board) and the global light-palette override live in app.css. */
	@media print {
		.hero,
		.sheet,
		.panel {
			background: var(--surface) !important;
			box-shadow: none;
		}
		.hero {
			display: block;
		}
		.photo {
			aspect-ratio: auto;
			min-height: 0;
			height: 18rem;
		}
		.hero-body {
			padding: var(--space-4);
		}
		.cols {
			display: block;
		}
		.ingredients-panel {
			position: static;
			margin-bottom: var(--space-4);
		}
		.num {
			background: none;
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
</style>
