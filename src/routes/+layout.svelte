<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { dirFor, resolveLang, t as translator } from '$lib/i18n';
	import { LANG_ENDONYMS, SUPPORTED_LANGS } from '$lib/config';
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

<a class="skip" href="#main">{t('app.skipToContent')}</a>

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
				<!-- Not an <h1>: every page supplies its own, and the recipe page's
				     title is the real document heading. -->
				<span class="title">{t('app.title')}</span>
			</a>
			<select aria-label={t('app.language')} value={lang} onchange={switchLang}>
				{#each SUPPORTED_LANGS as code (code)}
					<!-- Endonyms, not ISO codes: a Hindi speaker scans for "हिन्दी", not "HI". -->
					<option value={code}>{LANG_ENDONYMS[code]}</option>
				{/each}
			</select>
		</div>
		<p class="tagline">{t('app.tagline')}</p>
	</header>

	<main id="main">
		{@render children?.()}
	</main>

	<footer class="muted">
		<!-- CC BY-SA 3.0 requires visible attribution. Work titles, licence ids and
		     database names stay untranslated; only the framing is localised. -->
		<p>{t('footer.recipeData')}: Wikibooks Cookbook (CC BY-SA 3.0) — {t('footer.andPublicDomain')}</p>
		<p>{t('footer.nutritionRef')}: USDA FoodData Central ({t('footer.publicDomain')})</p>
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
	/* Visually the wordmark, but not a heading — see the markup comment. */
	.brand .title {
		color: var(--ink);
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1.2;
		font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2rem);
	}

	/* Off-screen until focused, then pinned over the header. */
	.skip {
		position: fixed;
		inset-block-start: var(--space-2);
		inset-inline-start: var(--space-2);
		z-index: 20;
		padding: 0.6rem 0.9rem;
		min-height: 2.75rem;
		display: inline-flex;
		align-items: center;
		background: var(--surface);
		color: var(--primary);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		box-shadow: var(--shadow-2);
		font-weight: 600;
		text-decoration: none;
		transform: translateY(-150%);
		transition: transform var(--dur) var(--ease-spring);
	}
	.skip:focus-visible {
		transform: translateY(0);
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
