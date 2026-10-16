<script lang="ts">
	import { page } from '$app/stores';
	import SeoHead from '$components/SeoHead.svelte';
	import FoodIcon from '$components/FoodIcon.svelte';
	import { FALLBACK_EMOJI } from '$lib/emoji';
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
	<span class="art"><FoodIcon cp={FALLBACK_EMOJI} size={64} /></span>
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
			<a class={isNotFound ? 'cta' : 'chrome-control secondary'} href="/glossary?lang={lang}">
				{t('glossary.backToList')}
			</a>
		{/if}
		<a
			class={inGlossary || !isNotFound ? 'chrome-control secondary' : 'cta'}
			href="/?lang={lang}"
		>
			{t('error.backHome')}
		</a>
	</div>
</div>

<style>
	/* An empty bowl on a plate, then the status stamped in copper. */
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-2);
		max-inline-size: 34rem;
		margin: var(--space-6) auto;
		padding: var(--space-6) var(--space-5);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 0 var(--lo),
			0 10px 20px -16px var(--lo-2);
	}
	.art {
		display: grid;
		place-items: center;
		width: 5.5rem;
		height: 5.5rem;
		padding: 1rem;
		margin-block-end: var(--space-2);
		border-radius: 50%;
		background: var(--surface-sunken);
		box-shadow:
			inset 0 0 0 1px var(--line-strong),
			inset 0 2px 5px var(--lo);
	}
	.code {
		margin: 0;
		color: var(--primary);
		font-family: var(--font-display);
		font-size: 3.5rem;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	h1 {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.body {
		margin: 0;
		max-inline-size: 34ch;
		color: var(--muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
		margin-block-start: var(--space-3);
	}
	.cta,
	.secondary {
		padding-inline: 1.3rem;
		font-weight: 700;
		text-decoration: none;
	}
	/* Polished copper, the glossary search button's finish. */
	.cta {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--tap);
		border: 1px solid color-mix(in srgb, var(--primary) 75%, black);
		border-radius: var(--radius-btn);
		background:
			linear-gradient(180deg, rgb(255 255 255 / 22%), transparent 34% 66%, rgb(0 0 0 / 14%)),
			var(--primary);
		color: var(--on-primary);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 30%),
			0 8px 18px -12px var(--primary);
		transition: transform var(--dur) var(--ease-out);
	}
	.cta:active {
		transform: translateY(1px);
	}
	@media (forced-colors: active) {
		.cta {
			background: ButtonFace;
			color: ButtonText;
			border-color: ButtonText;
		}
	}
</style>
