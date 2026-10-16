<script lang="ts">
	import { page } from '$app/stores';
	import DiagramFigure from '$components/glossary/DiagramFigure.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import { CATEGORY_DATA_CAT } from '$lib/glossary/categories';
	import { dirFor, t as translator } from '$lib/i18n';

	let { data } = $props();

	const lang = $derived(data.lang);
	const t = $derived(translator(lang));
	const entry = $derived(data.entry);
	const text = $derived(entry.text);

	const paragraphs = $derived(text.long.split(/\n\s*\n/).filter((part) => part.trim()));

	// The neutral aliases are English/French search keys: shown as "also known as"
	// only in English, where they are the reader's own words. Other languages list
	// just their own aliases, never the neutral ones.
	const aliases = $derived.by(() => {
		const fold = (s: string) => s.toLowerCase().replace(/[\s-]+/g, ' ');
		const seen = new Set([fold(text.name)]);
		const pool = lang === 'en' ? entry.aliases : (text.aliases ?? []);
		return pool.filter((alias) => {
			const key = fold(alias);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});

	const steps = $derived(text.steps ?? []);
	const tips = $derived(text.tips ?? []);
</script>

<SeoHead
	title="{text.name} — {t('glossary.heading')} — {t('app.title')}"
	description={text.short}
	url={$page.url}
	{lang}
	type="article"
/>

<nav class="crumbs no-print" aria-label={t('glossary.heading')}>
	<a class="back" href="/glossary?lang={lang}">
		<svg class="chev" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path
				d="M12 4.5 6.5 10l5.5 5.5"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{t('glossary.backToList')}
	</a>
</nav>

<article
	class="sheet"
	class:has-steps={steps.length > 0}
	data-cat={CATEGORY_DATA_CAT[entry.category]}
>
	<header>
		<p class="eyebrow">{t(`glossary.cat.${entry.category}`)}</p>
		<h1>{text.name}</h1>
		{#if lang !== 'en' && entry.en !== text.name}
			<p class="en-name">
				<span class="label">{t('glossary.englishName')}:</span>
				<span lang="en" dir="ltr">{entry.en}</span>
			</p>
		{/if}
		<p class="short">{text.short}</p>
		{#if aliases.length}
			<div class="aliases">
				<span class="label">{t('glossary.alsoKnownAs')}:</span>
				<ul>
					{#each aliases as alias (alias)}
						<li><bdi>{alias}</bdi></li>
					{/each}
				</ul>
			</div>
		{/if}
	</header>

	<div class="prose">
		{#each paragraphs as paragraph, i (i)}
			<p>{paragraph}</p>
		{/each}
	</div>

	{#if steps.length}
		<section class="steps-section" aria-labelledby="steps-heading">
			<h2 id="steps-heading">{t('glossary.steps')}</h2>
			{#if data.diagram}
				<DiagramFigure
					component={data.diagram.component}
					label={text.diagramAlt ?? text.name}
					{steps}
					caption={t('glossary.diagramCaption')}
					directional={data.diagram.info.directional}
					rtl={dirFor(lang) === 'rtl'}
				/>
			{:else}
				<ol class="steps">
					{#each steps as step, i (i)}
						<li>{step}</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	{#if tips.length}
		<section aria-labelledby="tips-heading">
			<h2 id="tips-heading">{t('glossary.tips')}</h2>
			<ul class="tips">
				{#each tips as tip, i (i)}
					<li>{tip}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.related.length}
		<section aria-labelledby="related-heading" class="no-print">
			<h2 id="related-heading">{t('glossary.related')}</h2>
			<ul class="related">
				{#each data.related as other (other.id)}
					<li>
						<a
							class="chip"
							data-cat={CATEGORY_DATA_CAT[other.category]}
							href="/glossary/{other.id}?lang={lang}"
						>
							{other.name}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</article>

<style>
	.crumbs {
		margin: var(--space-2) 0;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
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
	.chev {
		width: 1.15rem;
		height: 1.15rem;
		flex: none;
		color: var(--primary);
	}
	/* The glyph points toward the inline start; a mirror (not a different path)
	   keeps one drawing correct in both directions. */
	:global([dir='rtl']) .chev {
		transform: scaleX(-1);
	}

	/* One raised sheet on the worktop, the same as the recipe method. */
	.sheet {
		display: grid;
		gap: var(--space-4);
		max-width: 48rem;
		padding: var(--space-5);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 0 var(--lo),
			0 10px 20px -16px var(--lo-2);
	}
	@media (max-width: 30rem) {
		.sheet {
			padding: var(--space-4);
		}
	}
	/* Wide screens: the reading on the start side, the steps (and their
	   drawing) beside it, held in view while the text scrolls. */
	@media (min-width: 64rem) {
		.sheet.has-steps {
			max-width: none;
			grid-template-columns: minmax(0, 1fr) minmax(20rem, 30rem);
			column-gap: var(--space-6);
			align-items: start;
		}
		.has-steps > header {
			grid-column: 1 / -1;
		}
		.has-steps > :not(header, .steps-section) {
			grid-column: 1;
		}
		.has-steps > .steps-section {
			grid-column: 2;
			grid-row: 2 / span 3;
			position: sticky;
			top: var(--space-4);
		}
	}
	.sheet section h2 {
		margin: 0 0 var(--space-2);
		font-size: 1.25rem;
	}

	header {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding-block-end: var(--space-4);
		border-block-end: 1px solid var(--line);
	}
	header h1 {
		margin: 0;
		font-size: clamp(2rem, 1.4rem + 2vw, 2.75rem);
		line-height: 1.05;
		overflow-wrap: anywhere;
	}
	header p {
		margin: 0;
	}
	.eyebrow {
		color: var(--cat-ink, var(--primary));
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	/* Tracking pulls joined scripts apart (Arabic, Shahmukhi) and breaks the
	   Devanagari and Bengali headline; caps tracking is a Latin habit. */
	.eyebrow:is(:lang(ar), :lang(pnb), :lang(hi), :lang(bn)) {
		letter-spacing: 0;
	}
	.short {
		max-width: 52ch;
		font-size: 1.1rem;
	}
	.en-name,
	.label {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.aliases {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}
	.aliases ul,
	.related {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.aliases li {
		padding: 0.1rem 0.6rem;
		background: var(--cat-tint, var(--surface-sunken));
		color: var(--cat-ink, var(--ink));
		border-radius: var(--radius-pill);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.prose p {
		margin: 0 0 var(--space-3);
		max-width: 65ch;
		line-height: 1.7;
	}
	.prose p:last-child {
		margin-bottom: 0;
	}
	.steps,
	.tips {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding-inline-start: 1.4rem;
		line-height: 1.6;
	}
	.steps li::marker,
	.tips li::marker {
		color: var(--cat-ink, var(--primary));
		font-weight: 800;
	}

	/* Related terms: the glossary index's switches, as plain links. */
	.chip {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding-inline: 0.7rem 0.85rem;
		border: 1px solid var(--line-strong);
		border-inline-start: 3px solid var(--cat-ink, var(--line-strong));
		border-radius: var(--radius-chip);
		background: var(--sheen);
		color: var(--ink);
		font-size: 0.88rem;
		font-weight: 600;
		text-decoration: none;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
		transition: transform var(--dur) var(--ease-out);
	}
	.chip:hover {
		border-color: var(--primary);
		border-inline-start-color: var(--cat-ink, var(--primary));
		color: var(--primary);
	}
	.chip:active {
		transform: scale(0.96);
	}

	@media (forced-colors: active) {
		.chip {
			background: ButtonFace;
		}
	}
	@media print {
		.sheet {
			box-shadow: none;
		}
	}
</style>
