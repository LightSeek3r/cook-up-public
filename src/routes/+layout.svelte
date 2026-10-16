<script lang="ts">
	import '../app.css';
	import archivoLatin from '../fonts/archivo-latin.woff2?url';
	import archivoVietnamese from '../fonts/archivo-vietnamese.woff2?url';
	import frauncesLatin from '../fonts/fraunces-latin.woff2?url';
	import frauncesVietnamese from '../fonts/fraunces-vietnamese.woff2?url';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { dirFor, resolveLang, t as translator } from '$lib/i18n';
	import { LANG_ENDONYMS, SUPPORTED_LANGS } from '$lib/config';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import ThemeToggle from '$components/ThemeToggle.svelte';
	import { favoriteIds, hydrateFavorites } from '$lib/favorites.svelte';
	import { shouldTrack } from '$lib/analytics';

	let { children } = $props();

	const lang = $derived(resolveLang($page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));
	const inGlossary = $derived($page.url.pathname.startsWith('/glossary'));
	const inFavorites = $derived($page.url.pathname.startsWith('/favorites'));
	const isHome = $derived($page.route.id === '/');
	// ISO 639-3 'pnb' has no two-letter code of its own; PA is Punjabi's.
	const langCode = $derived(lang === 'pnb' ? 'PA' : lang.toUpperCase());

	// SSR sets <html lang/dir> via hooks.server.ts; keep it correct on client nav.
	$effect(() => {
		document.documentElement.lang = lang;
		document.documentElement.dir = dirFor(lang);
	});

	// `afterNavigate` fires on first load *and* on every client-side navigation,
	// which is what turns this into a page-view counter rather than the
	// once-per-session ping it replaced; `shouldTrack` drops the URL-only
	// navigations that are not views. sessionStorage (not a cookie) is what
	// still separates a "visit" from a "view": it clears when the tab closes, so
	// only the first view of a session carries `new=1`. Everything is written to
	// our own D1 by /api/track — no third party is contacted, by the browser or
	// by the Worker.
	const VISIT_KEY = 'cookup_visited';

	onMount(hydrateFavorites);

	// A page view that gave up on the fonts (static/font-init.js) keeps the
	// system ones; once they have arrived they switch in on the next click, where
	// the re-flow falls inside the input window layout-shift scoring ignores.
	// Not on popstate: browser back/forward is not an input to the page.
	beforeNavigate(({ type, willUnload }) => {
		const root = document.documentElement;
		if (root.dataset.fonts === 'late' && !willUnload && type !== 'popstate') {
			root.dataset.fonts = 'ready';
		}
	});

	afterNavigate(({ from, to }) => {
		const target = to?.url ?? new URL(location.href);
		if (!shouldTrack(from?.url ?? null, target)) return;
		const path = target.pathname;

		let isNewVisit = false;
		try {
			isNewVisit = !sessionStorage.getItem(VISIT_KEY);
			if (isNewVisit) sessionStorage.setItem(VISIT_KEY, '1');
		} catch {
			// Storage can be blocked outright; a view still counts, just never as new.
		}

		const params = new URLSearchParams({ path, lang });
		if (isNewVisit) {
			params.set('new', '1');
			// Only the host is kept server-side, and only when it is not our own.
			if (document.referrer) params.set('ref', document.referrer);
		}

		fetch(`/api/track?${params}`, { method: 'POST' }).catch(() => {});
	});

	// Template, not a "Created by" prefix: hi/ja/ko/bn/pnb put the name first.
	const [createdByPre, createdByPost] = $derived(t('footer.createdBy').split('{link}'));

	// The page URL rides along so a report arrives pointing at the recipe/search it's about.
	const reportHref = $derived(
		`mailto:n.opal@unit42.fr?subject=${encodeURIComponent(
			`${t('app.title')} — ${t('footer.reportIssue')}`
		)}&body=${encodeURIComponent(`${$page.url.href}\n\n`)}`
	);

	function switchLang(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		const url = new URL($page.url);
		url.searchParams.set('lang', next);
		goto(url, { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<!-- Exactly the faces static/font-init.js waits for: the latin subsets, which
	     every language renders digits and punctuation in, and vietnamese for vi.
	     Same hashed URLs app.css's @font-face rules resolve to; crossorigin
	     because fonts are always fetched in CORS mode, and a preload without it
	     would be a second, wasted request. fetchpriority low: at the default
	     priority these 100 KB took the slow-4G bandwidth from the stylesheets
	     and the two init scripts, which hold first paint, and pushed it back
	     ~0.5 s; low starts them early and still lets those go first. -->
	<link rel="preload" href={archivoLatin} as="font" type="font/woff2" crossorigin="anonymous" fetchpriority="low" />
	<link rel="preload" href={frauncesLatin} as="font" type="font/woff2" crossorigin="anonymous" fetchpriority="low" />
	{#if lang === 'vi'}
		<link rel="preload" href={archivoVietnamese} as="font" type="font/woff2" crossorigin="anonymous" fetchpriority="low" />
		<link rel="preload" href={frauncesVietnamese} as="font" type="font/woff2" crossorigin="anonymous" fetchpriority="low" />
	{/if}
</svelte:head>

<a class="skip no-print" href="#main">{t('app.skipToContent')}</a>

<div class="page">
	<header>
		<div class="bar chrome">
			<a class="brand" href="/?lang={lang}">
				<!-- Same geometry as static/favicon.svg. The rim and glint mix the
				     copper towards white, so they read as a highlight in both themes. -->
				<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
					<path
						d="M13 12c-1.5-1.5-1.5-2.5 0-4s1.5-2.5 0-4M19 12c-1.5-1.5-1.5-2.5 0-4s1.5-2.5 0-4"
						fill="none"
						style="stroke: var(--ink)"
						stroke-width="2"
						stroke-linecap="round"
					/>
					<path
						d="M6 18h20a10 9 0 0 1-20 0ZM12 26h8v1a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1Z"
						fill="currentColor"
					/>
					<rect
						x="4"
						y="14"
						width="24"
						height="3"
						rx="1.5"
						style="fill: color-mix(in srgb, currentColor 72%, #fff)"
					/>
					<path
						d="M9 21a8 7 0 0 0 4 4.5"
						fill="none"
						style="stroke: color-mix(in srgb, currentColor 72%, #fff)"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
				<!-- Not an <h1>: every page supplies its own, and the recipe page's
				     title is the real document heading. -->
				<span class="title">{t('app.title')}</span>
			</a>
			<!-- Wrapper, not more flex children: .bar is space-between with the
			     brand at one end, so further direct children would spread apart. -->
			<div class="controls no-print">
				<nav class="nav">
					<a class="nav-link" href="/glossary?lang={lang}" aria-current={inGlossary ? 'page' : undefined}>
						<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<path
								d="M10 5.2C8.6 4 6.4 3.6 3.5 3.8v10.9c2.9-.2 5.1.2 6.5 1.4 1.4-1.2 3.6-1.6 6.5-1.4V3.8c-2.9-.2-5.1.2-6.5 1.4ZM10 5.2v10.9"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linejoin="round"
								stroke-linecap="round"
							/>
						</svg>
						<span class="nav-text">{t('nav.glossary')}</span>
					</a>
					<a
						class="nav-link"
						href="/favorites?lang={lang}"
						aria-current={inFavorites ? 'page' : undefined}
					>
						<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<path
								d="M10 16.5 3.6 10.3a4 4 0 0 1 5.5-5.8L10 5.6l.9-1.1a4 4 0 0 1 5.5 5.8Z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="nav-text">{t('favorites.heading')}</span>
						{#if favoriteIds.length}<span class="count">{favoriteIds.length}</span>{/if}
					</a>
				</nav>
				<div class="tools">
					<ThemeToggle toDarkLabel={t('app.themeToDark')} toLightLabel={t('app.themeToLight')} />
					<!-- The real select, transparent over a globe and the language code:
					     native picker and keyboard, full endonyms in its list, compact
					     face. The code is aria-hidden; the select's own name and value
					     ("Language, English") are what a screen reader hears. -->
					<div class="chrome-control lang">
						<svg class="lang-globe" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<g
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="10" cy="10" r="7.2" />
								<path
									d="M2.8 10h14.4M10 2.8c2 2 3 4.4 3 7.2s-1 5.2-3 7.2c-2-2-3-4.4-3-7.2s1-5.2 3-7.2Z"
								/>
							</g>
						</svg>
						<span class="lang-code" aria-hidden="true">{langCode}</span>
						<svg class="lang-chev" viewBox="0 0 10 6" aria-hidden="true" focusable="false">
							<path
								d="m1 1 4 4 4-4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<select aria-label={t('app.language')} value={lang} onchange={switchLang}>
							{#each SUPPORTED_LANGS as code (code)}
								<!-- Endonyms, not ISO codes: a Hindi speaker scans for "हिन्दी", not "HI". -->
								<option value={code} lang={code}>{LANG_ENDONYMS[code]}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</div>
		<!-- The home page carries the tagline as its own <h1>: one h1 per page. -->
		{#if !isHome}<p class="tagline">{t('app.tagline')}</p>{/if}
	</header>

	<main id="main">
		{@render children?.()}
	</main>

	<footer class="muted">
		<!-- CC BY-SA 3.0 requires visible attribution. Work titles, licence ids and
		     database names stay untranslated; only the framing is localised. -->
		<p>{t('footer.recipeData')}: Wikibooks Cookbook (CC BY-SA 3.0) — {t('footer.andPublicDomain')}</p>
		<p>{t('footer.nutritionRef')}: USDA FoodData Central ({t('footer.publicDomain')})</p>
		<!-- Apache-2.0 attribution for the food icons; full terms in NOTICE. -->
		<p>
			<a href="https://github.com/googlefonts/noto-emoji" target="_blank" rel="noopener noreferrer"
				>{t('footer.emoji')}</a
			>
		</p>
		<div class="credits">
			<p>
				{createdByPre}<a href="https://unit42.fr" target="_blank" rel="noopener noreferrer">unit42.fr</a
				>{createdByPost}
			</p>
			<a class="chrome-control report no-print" href={reportHref}>{t('footer.reportIssue')}</a>
		</div>
	</footer>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-3) var(--space-4);
	}
	.controls,
	.nav,
	.tools {
		display: flex;
		align-items: center;
	}
	.controls {
		flex: none;
		gap: var(--space-2);
	}
	.nav {
		gap: var(--space-1);
	}
	.tools {
		position: relative;
		gap: var(--space-2);
		margin-inline-start: var(--space-2);
		padding-inline-start: var(--space-4);
	}
	/* A hairline between where you go and how you see it. */
	.tools::before {
		content: '';
		position: absolute;
		inset-block: 0.6rem;
		inset-inline-start: 0;
		border-inline-start: 1px solid var(--line-strong);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--tap);
		min-width: 0;
		color: var(--primary);
		text-decoration: none;
	}
	.mark {
		width: 2.1rem;
		height: 2.1rem;
		flex: none;
	}
	/* Visually the wordmark, but not a heading — see the markup comment. */
	.brand .title {
		color: var(--ink);
		font-family: var(--font-display);
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1;
		font-size: 1.65rem;
		white-space: nowrap;
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
		/* Far enough up that --shadow-2's throw stays off-screen too. */
		transform: translateY(-200%);
		transition: transform var(--dur) var(--ease-spring);
	}
	.skip:focus-visible {
		transform: translateY(0);
	}
	.lang {
		flex: none;
		gap: 0.25rem;
		min-width: 4.5rem;
		padding: 0 0.5rem;
	}
	.lang-globe {
		width: 1.15rem;
		height: 1.15rem;
	}
	.lang-code {
		font-family: var(--font-system);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		line-height: 1;
	}
	.lang-chev {
		width: 0.6rem;
		height: 0.4rem;
		opacity: 0.7;
	}
	/* The real control: invisible, but it takes the click, the keyboard and the
	   native picker. 16px keeps iOS from zooming the page when it opens. */
	.lang select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: inherit;
		opacity: 0;
		cursor: pointer;
		font-size: 16px;
	}
	/* System font for the endonyms: in Archivo, "Tiếng Việt" alone made every
	   page download the Vietnamese subset. The select itself too, not only its
	   options: Chrome resolves the option list's fonts from the select. */
	.bar select,
	.bar option {
		font-family: var(--font-system);
	}
	.lang option {
		background: var(--surface);
		color: var(--ink);
	}
	.nav-link {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: var(--tap);
		padding: 0 0.75rem;
		border-radius: var(--radius-btn);
		color: var(--ink);
		font-weight: 600;
		font-size: 0.92rem;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background-color var(--dur-fast) ease,
			color var(--dur-fast) ease;
	}
	.nav-link svg {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		color: var(--primary);
	}
	.nav-link:hover,
	.nav-link[aria-current='page'] {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--primary);
	}
	.nav-link .count {
		min-width: 1.4rem;
		padding: 0 0.35rem;
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--on-primary);
		font-size: 0.75rem;
		font-weight: 800;
		line-height: 1.4rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	/* Below 760px the full header no longer fits one row, so the links become
	   44px icons: the words stay for screen readers, the count rides on the
	   heart. */
	@media (max-width: 760px) {
		.nav-text {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.nav-link {
			justify-content: center;
			width: var(--tap);
			padding: 0;
		}
		.nav-link .count {
			position: absolute;
			inset-block-start: 0.15rem;
			inset-inline-end: 0.05rem;
			min-width: 1.05rem;
			padding: 0 0.25rem;
			font-size: 0.65rem;
			line-height: 1.05rem;
			box-shadow: 0 0 0 2px var(--surface);
		}
	}

	/* One row at 360-390px: brand, the two icon links, the toggle and the
	   language. */
	@media (max-width: 600px) {
		.bar {
			gap: var(--space-2);
			padding: var(--space-2);
		}
		.brand .title {
			font-size: 1.3rem;
		}
		.mark {
			width: 1.9rem;
			height: 1.9rem;
		}
		.controls,
		.nav,
		.tools {
			gap: 0.15rem;
		}
		.tools {
			margin-inline-start: 0.15rem;
			padding-inline-start: 0;
		}
		.tools::before {
			display: none;
		}
	}
	/* Small phones: the brand gives up a little so the row still fits. */
	@media (max-width: 380px) {
		.brand {
			gap: 0.3rem;
		}
		.brand .title {
			font-size: 1.15rem;
		}
		.mark {
			width: 1.6rem;
			height: 1.6rem;
		}
		.lang {
			min-width: 4rem;
			padding: 0 0.4rem;
		}
	}
	@media (forced-colors: active) {
		.nav-link .count {
			forced-color-adjust: none;
			background: Highlight;
			color: HighlightText;
		}
	}
	.tagline {
		color: var(--muted);
		margin: var(--space-3) 0 var(--space-2);
		font-size: 0.95rem;
	}
	/* The credits under a steel rule: a 1px shade with its light edge below,
	   the same bevel as the chrome. */
	footer {
		display: grid;
		gap: 0.2rem;
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--line-strong);
		box-shadow: inset 0 1px 0 var(--hi);
		font-size: 0.85rem;
	}
	footer p {
		margin: 0;
	}
	footer a:not(.report) {
		overflow-wrap: anywhere;
	}
	.credits {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.report {
		padding-inline: 1rem;
		font-size: 0.85rem;
		font-weight: 700;
		text-decoration: none;
	}
	@media print {
		footer {
			box-shadow: none;
		}
	}
</style>
