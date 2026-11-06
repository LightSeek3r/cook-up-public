<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SeoHead from '$components/SeoHead.svelte';
	import { resolveLang, t as translator } from '$lib/i18n';
	import { currentMonth } from '$lib/seasonal';
	import { monthName } from '$lib/seasonal/ui';

	const lang = $derived(resolveLang(page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));
	const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

	// "This month" is the reader's month, which the server cannot know (and must
	// not guess: pages are cached as a function of their URL). It renders the
	// twelve months as plain links; the browser goes on to its own month.
	onMount(() => {
		goto(`/seasonal/${currentMonth()}?lang=${lang}`, { replaceState: true });
	});
</script>

<SeoHead title="{t('seasonal.title')} — {t('app.title')}" description={t('seasonal.intro')} url={page.url} {lang} />

<article class="landing">
	<h1>{t('seasonal.title')}</h1>
	<p class="muted">{t('seasonal.intro')}</p>
	<nav aria-label={t('seasonal.month.aria')}>
		<ol>
			{#each MONTHS as m (m)}
				<li><a href="/seasonal/{m}?lang={lang}">{monthName(m, lang)}</a></li>
			{/each}
		</ol>
	</nav>
</article>

<style>
	.landing {
		display: grid;
		gap: var(--space-3);
		margin-block: var(--space-4);
	}
	ol {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	a {
		display: grid;
		place-items: center;
		min-height: var(--tap);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--sheen);
		color: var(--ink);
		font-weight: 650;
		text-decoration: none;
	}
	a:hover {
		border-color: var(--primary);
		color: var(--primary);
	}
</style>
