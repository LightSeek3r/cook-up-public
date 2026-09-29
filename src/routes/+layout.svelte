<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { dirFor, resolveLang, t as translator } from '$lib/i18n';
	import { LANG_ENDONYMS, SUPPORTED_LANGS } from '$lib/config';
	import { afterNavigate, goto } from '$app/navigation';
	import ThemeToggle from '$components/ThemeToggle.svelte';
	import { favoriteIds, hydrateFavorites } from '$lib/favorites.svelte';

	let { children } = $props();

	const lang = $derived(resolveLang($page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));

	// SSR sets <html lang/dir> via hooks.server.ts; keep it correct on client nav.
	$effect(() => {
		document.documentElement.lang = lang;
		document.documentElement.dir = dirFor(lang);
	});

	// `afterNavigate` fires on first load *and* on every client-side navigation,
	// which is what turns this into a page-view counter rather than the
	// once-per-session ping it replaced. sessionStorage (not a cookie) is what
	// still separates a "visit" from a "view": it clears when the tab closes, so
	// only the first view of a session carries `new=1`. Everything is written to
	// our own D1 by /api/track — no third party is contacted, by the browser or
	// by the Worker.
	const VISIT_KEY = 'cookup_visited';

	onMount(hydrateFavorites);

	afterNavigate(({ to }) => {
		const path = to?.url.pathname ?? location.pathname;

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

<a class="skip no-print" href="#main">{t('app.skipToContent')}</a>

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
			<!-- Wrapper, not two more flex children: .bar is space-between with the
			     brand at one end, so a third direct child would spread them apart. -->
			<div class="controls no-print">
				<a class="favorites-link" href="/favorites?lang={lang}" aria-label={t('favorites.heading')}>
					<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
						<path
							d="M10 16.5 3.6 10.3a4 4 0 0 1 5.5-5.8L10 5.6l.9-1.1a4 4 0 0 1 5.5 5.8Z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linejoin="round"
						/>
					</svg>
					{#if favoriteIds.length}<span class="count">{favoriteIds.length}</span>{/if}
				</a>
				<ThemeToggle
					label={t('app.theme')}
					optionLabels={{
						light: t('app.themeLight'),
						dark: t('app.themeDark'),
						auto: t('app.themeAuto')
					}}
				/>
				<select aria-label={t('app.language')} value={lang} onchange={switchLang}>
					{#each SUPPORTED_LANGS as code (code)}
						<!-- Endonyms, not ISO codes: a Hindi speaker scans for "हिन्दी", not "HI". -->
						<option value={code}>{LANG_ENDONYMS[code]}</option>
					{/each}
				</select>
			</div>
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
		<div class="credits">
			<p>
				{createdByPre}<a href="https://unit42.fr" target="_blank" rel="noopener noreferrer">unit42.fr</a
				>{createdByPost}
			</p>
			<a class="report no-print" href={reportHref}>{t('footer.reportIssue')}</a>
		</div>
	</footer>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		/* Two controls in a narrow header: let them wrap rather than squeeze the
		   brand on small screens. */
		flex-wrap: wrap;
		justify-content: flex-end;
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
	.favorites-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 2.75rem;
		padding: 0 0.5rem;
		color: var(--muted);
	}
	.favorites-link:hover {
		color: var(--primary);
	}
	.favorites-link svg {
		width: 1.2rem;
		height: 1.2rem;
	}
	.favorites-link .count {
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
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
	.credits {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.report {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0 0.9rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		font-weight: 600;
		text-decoration: none;
	}
	.report:hover {
		color: var(--primary);
		border-color: var(--primary);
	}
</style>
