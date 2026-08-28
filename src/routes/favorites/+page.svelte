<script lang="ts">
	import { page } from '$app/stores';
	import RecipeHits from '$components/RecipeHits.svelte';
	import SeoHead from '$components/SeoHead.svelte';
	import { resolveLang, t as translator } from '$lib/i18n';
	import { favoriteIds, hydrateFavorites } from '$lib/favorites.svelte';
	import type { RecipeHit } from '$lib/types';

	const lang = $derived(resolveLang($page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));

	let hits = $state<RecipeHit[]>([]);
	let loaded = $state(false);

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
		if (ids.length === 0) {
			hits = [];
			loaded = true;
			return;
		}
		fetch(`/api/recipes?${new URLSearchParams({ ids: ids.join(','), lang })}`)
			.then((response) => response.json())
			.then((data) => (hits = data.recipes ?? []))
			.catch(() => (hits = []))
			.finally(() => (loaded = true));
	});
</script>

<SeoHead
	title="{t('favorites.heading')} — {t('app.title')}"
	description={t('favorites.heading')}
	url={$page.url}
	{lang}
/>

<h1 class="sr-only">{t('favorites.heading')}</h1>

{#if !loaded}
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
