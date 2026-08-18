<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { dirFor, resolveLang, t as translator } from '$lib/i18n';
	import { SUPPORTED_LANGS } from '$lib/config';
	import { goto } from '$app/navigation';

	let { children } = $props();

	const lang = $derived(resolveLang($page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));

	// SSR sets <html lang/dir> via hooks.server.ts; keep it correct on client nav.
	$effect(() => {
		document.documentElement.lang = lang;
		document.documentElement.dir = dirFor(lang);
	});

	function switchLang(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		const url = new URL($page.url);
		url.searchParams.set('lang', next);
		goto(url, { keepFocus: true, noScroll: true });
	}
</script>

<div class="page">
	<header>
		<div class="bar">
			<a class="brand" href="/?lang={lang}">
				<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
					<path
						d="M6 17h20a10 10 0 0 1-10 9 10 10 0 0 1-10-9Z"
						fill="currentColor"
						opacity="0.9"
					/>
					<path
						d="M4 17h24M13 11c0-2 3-2 3-4M19 11c0-2 3-2 3-4"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
				<h1>{t('app.title')}</h1>
			</a>
			<select aria-label="Language" value={lang} onchange={switchLang}>
				{#each SUPPORTED_LANGS as code (code)}
					<option value={code}>{code.toUpperCase()}</option>
				{/each}
			</select>
		</div>
		<p class="tagline">{t('app.tagline')}</p>
	</header>

	{@render children?.()}

	<footer class="muted">
		<!-- CC BY-SA 3.0 requires visible attribution once real recipe data lands. -->
		<p>Recipe data: Wikibooks Cookbook (CC BY-SA 3.0) and public-domain sources.</p>
		<p>Nutrition reference: USDA FoodData Central (public domain).</p>
	</footer>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--primary);
		text-decoration: none;
	}
	.mark {
		width: 1.9rem;
		height: 1.9rem;
		flex: none;
	}
	.brand h1 {
		color: var(--ink);
	}
	.bar select {
		min-height: 2.75rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-1);
	}
	.tagline {
		color: var(--muted);
		margin: var(--space-1) 0 var(--space-2);
		font-size: 0.95rem;
	}
	footer {
		margin-top: var(--space-6);
		border-top: 1px solid var(--line);
		padding-top: var(--space-3);
	}
	footer p {
		margin: 0.15rem 0;
	}
</style>
