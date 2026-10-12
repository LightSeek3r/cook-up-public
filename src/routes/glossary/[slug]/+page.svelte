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

<article data-cat={CATEGORY_DATA_CAT[entry.category]}>
	<header>
		<span class="tag">{t(`glossary.cat.${entry.category}`)}</span>
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
		<section aria-labelledby="steps-heading">
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
		gap: 0.3rem;
		min-height: 2.75rem;
		font-weight: 600;
		text-decoration: none;
	}
	.back:hover {
		text-decoration: underline;
	}
	.chev {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
	}
	/* The glyph points toward the inline start; a mirror (not a different path)
	   keeps one drawing correct in both directions. */
	:global([dir='rtl']) .chev {
		transform: scaleX(-1);
	}

	article {
		max-width: 46rem;
	}
	header {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
	}
	header h1 {
		margin: 0;
	}
	header p {
		margin: 0;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.7rem;
		background: var(--cat-tint, var(--surface-sunken));
		color: var(--cat-ink, var(--muted));
		border: 1px solid var(--cat-line, var(--line));
		border-radius: var(--radius-pill);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.short {
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
		gap: var(--space-1);
	}
	.aliases ul,
	.related {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.aliases li {
		padding: 0.1rem 0.6rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		font-size: 0.85rem;
	}

	.prose p {
		margin: 0 0 var(--space-2);
		line-height: 1.65;
	}
	.steps,
	.tips {
		margin: 0;
		padding-inline-start: 1.4rem;
		line-height: 1.6;
	}
	.steps li,
	.tips li {
		margin-bottom: var(--space-1);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0.3rem 0.9rem;
		background: var(--cat-tint, var(--surface));
		color: var(--cat-ink, var(--ink));
		border: 1px solid var(--cat-line, var(--line-strong));
		border-radius: var(--radius-pill);
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
	}
	.chip:hover {
		border-color: var(--cat-ink, var(--primary));
	}
</style>
