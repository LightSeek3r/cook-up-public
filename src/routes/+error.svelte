<script lang="ts">
	import { page } from '$app/stores';
	import SeoHead from '$components/SeoHead.svelte';
	import { resolveLang, t as translator } from '$lib/i18n';

	const lang = $derived(resolveLang($page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));

	const isNotFound = $derived($page.status === 404);
	const inGlossary = $derived($page.url.pathname.startsWith('/glossary'));
	// The database is out of its daily quota or briefly down: a state to wait
	// out, so it reads "try again in a moment", not "something broke". The code
	// is the signal (handleError sets it; the SSR status can still read 500).
	const isUnavailable = $derived($page.error?.code === 'unavailable' || $page.status === 503);

	const heading = $derived(
		isNotFound
			? inGlossary
				? t('glossary.notFound')
				: t('error.notFoundHeading')
			: isUnavailable
				? t('error.unavailableHeading')
				: t('error.genericHeading')
	);
	const body = $derived(
		isNotFound ? t('error.notFoundBody') : isUnavailable ? t('error.loadFailed') : t('error.genericBody')
	);
</script>

<SeoHead
	title="{t('error.title')} — {t('app.title')}"
	description={body}
	url={$page.url}
	{lang}
	noindex
/>

<div class="wrap">
	{#if !isUnavailable}
		<p class="code">{$page.status}</p>
	{/if}
	<h1>{heading}</h1>
	<p class="body">{body}</p>
	<div class="actions">
		{#if !isNotFound}
			<!-- A full reload, not a client navigation: the failed load has to run again. -->
			<a class="cta" href={$page.url.href} data-sveltekit-reload>{t('error.retry')}</a>
		{/if}
		{#if inGlossary}
			<a class="cta" class:secondary={!isNotFound} href="/glossary?lang={lang}">
				{t('glossary.backToList')}
			</a>
		{/if}
		<a class="cta" class:secondary={inGlossary || !isNotFound} href="/?lang={lang}">
			{t('error.backHome')}
		</a>
	</div>
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-2);
		max-inline-size: 32rem;
		margin: var(--space-6) auto;
		padding: var(--space-5);
	}
	.code {
		font-family: var(--font-display);
		font-size: 3.5rem;
		font-weight: 700;
		color: var(--primary);
		line-height: 1;
		margin: 0;
	}
	h1 {
		margin: 0;
	}
	.body {
		color: var(--muted);
		max-inline-size: 30ch;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
		margin-block-start: var(--space-2);
	}
	.cta {
		display: inline-flex;
		align-items: center;
		background: var(--primary);
		color: var(--on-primary);
		text-decoration: none;
		border: 1px solid var(--primary);
		border-radius: var(--radius-pill);
		padding: 0.6rem 1.4rem;
		min-block-size: 2.75rem;
		font-weight: 700;
		box-shadow: var(--shadow-2);
	}
	.cta:hover {
		box-shadow: var(--shadow-1);
	}
	.cta.secondary {
		background: var(--surface);
		color: var(--primary);
		box-shadow: var(--shadow-1);
	}
</style>
