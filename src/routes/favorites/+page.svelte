<script lang="ts">
	import { page } from '$app/stores';
	import RecipeHits from '$components/RecipeHits.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import LoadError from '$components/LoadError.svelte';
	import FoodIcon from '$components/FoodIcon.svelte';
	import { FALLBACK_EMOJI } from '$lib/emoji';
	import { resolveLang, t as translator } from '$lib/i18n';
	import { favoriteIds, hydrateFavorites } from '$lib/favorites.svelte';
	import { apiUrl } from '$lib/httpCache';
	import type { RecipeHit } from '$lib/types';

	const lang = $derived(resolveLang($page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));

	let hits = $state<RecipeHit[]>([]);
	let loaded = $state(false);
	// Separate from an empty list: "no favorites yet" over a failed request
	// would tell the user their saved recipes are gone.
	let failed = $state(false);
	let attempt = $state(0);

	function retry() {
		loaded = false;
		attempt++;
	}

	$effect(() => {
		hydrateFavorites();
	});

	// WHERE id IN (...) makes no ordering promise, and the server has no way
	// to know the client's favoriting order anyway — re-sort here instead.
	const ordered = $derived(
		favoriteIds
			.map((id) => hits.find((hit) => hit.id === id))
			.filter((hit): hit is RecipeHit => Boolean(hit))
	);

	$effect(() => {
		const ids = favoriteIds;
		void attempt;
		failed = false;
		if (ids.length === 0) {
			hits = [];
			loaded = true;
			return;
		}
		let stale = false;
		// Ascending, like the API's own canonical form, so the request hits its cache key.
		const sorted = [...ids].sort((a, b) => a - b);
		fetch(apiUrl('/api/recipes', { ids: sorted.join(','), lang }))
			.then(async (response) => {
				const data = await response.json().catch(() => ({}));
				if (!response.ok || data.error) throw new Error(String(response.status));
				return data;
			})
			.then((data) => {
				if (!stale) hits = data.recipes ?? [];
			})
			.catch(() => {
				if (!stale) failed = true;
			})
			.finally(() => {
				if (!stale) loaded = true;
			});
		return () => (stale = true);
	});
</script>

<SeoHead
	title="{t('favorites.heading')} — {t('app.title')}"
	description={t('favorites.heading')}
	url={$page.url}
	{lang}
	noindex
/>

<h1 class="sr-only">{t('favorites.heading')}</h1>

{#if failed}
	<LoadError message={t('error.loadFailed')} retryLabel={t('error.retry')} onRetry={retry} />
{:else if !loaded}
	<p class="muted loading">{t('results.loading')}</p>
	<div class="skeleton" aria-hidden="true">
		{#each { length: Math.min(Math.max(favoriteIds.length, 1), 4) } as _, i (i)}
			<span class="row"><span class="dot"></span><span class="bar"></span></span>
		{/each}
	</div>
{:else if ordered.length === 0}
	<div class="empty">
		<span class="empty-art"><FoodIcon cp={FALLBACK_EMOJI} size={56} /></span>
		<p class="empty-title">{t('favorites.empty')}</p>
		<a class="chrome-control home" href="/?lang={lang}">{t('error.backHome')}</a>
	</div>
{:else}
	<RecipeHits recipes={ordered} {lang} {t} heading={t('favorites.heading')} />
{/if}

<style>
	.loading {
		margin: var(--space-4) 0 var(--space-2);
	}
	/* The shape of the list about to arrive, one row per saved recipe. */
	.skeleton {
		display: grid;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
	}
	.row + .row {
		border-top: 1px solid var(--line);
	}
	.dot,
	.bar {
		background: var(--surface-sunken);
		animation: pulse 1.2s ease-in-out infinite alternate;
	}
	.dot {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-sm);
	}
	.bar {
		width: min(20rem, 60%);
		height: 0.85rem;
		border-radius: var(--radius-pill);
	}
	@keyframes pulse {
		to {
			opacity: 0.45;
		}
	}

	.empty {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		margin: var(--space-5) 0;
		padding: var(--space-6) var(--space-4);
		border: 1.5px dashed var(--line-strong);
		border-radius: var(--radius-card);
		text-align: center;
	}
	.empty-art {
		display: grid;
		place-items: center;
		width: 4.5rem;
		height: 4.5rem;
		padding: 0.8rem;
		border-radius: 50%;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--line-strong),
			0 1px 0 var(--hi);
	}
	.empty-title {
		margin: 0;
		max-width: 34ch;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
	}
	.home {
		padding-inline: 1.1rem;
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
	}
</style>
