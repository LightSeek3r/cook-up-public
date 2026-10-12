<script lang="ts">
	import { page } from '$app/stores';
	import RecipeHits from '$components/RecipeHits.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import LoadError from '$components/LoadError.svelte';
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
	<p class="muted state">{t('results.loading')}</p>
{:else if ordered.length === 0}
	<p class="muted state">{t('favorites.empty')}</p>
{:else}
	<RecipeHits recipes={ordered} {lang} {t} heading={t('favorites.heading')} />
{/if}

<style>
	.state {
		margin: var(--space-4) 0;
	}
</style>
