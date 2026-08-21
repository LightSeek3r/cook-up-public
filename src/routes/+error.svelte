<script lang="ts">
	import { page } from '$app/stores';
	import SeoHead from '$components/SeoHead.svelte';
	import { resolveLang, t as translator } from '$lib/i18n';

	const lang = $derived(resolveLang($page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));

	const isNotFound = $derived($page.status === 404);
	const heading = $derived(isNotFound ? t('error.notFoundHeading') : t('error.genericHeading'));
	const body = $derived(isNotFound ? t('error.notFoundBody') : t('error.genericBody'));
</script>

<SeoHead title="{t('error.title')} — {t('app.title')}" description={body} url={$page.url} {lang} />

<div class="wrap">
	<p class="code">{$page.status}</p>
	<h1>{heading}</h1>
	<p class="body">{body}</p>
	<a class="cta" href="/?lang={lang}">{t('error.backHome')}</a>
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-2);
		max-width: 32rem;
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
		max-width: 30ch;
	}
	.cta {
		margin-top: var(--space-2);
		display: inline-flex;
		align-items: center;
		background: var(--primary);
		color: var(--on-primary);
		text-decoration: none;
		border-radius: var(--radius-pill);
		padding: 0.6rem 1.4rem;
		min-height: 2.75rem;
		font-weight: 700;
		box-shadow: var(--shadow-2);
	}
	.cta:hover {
		box-shadow: var(--shadow-1);
	}
</style>
