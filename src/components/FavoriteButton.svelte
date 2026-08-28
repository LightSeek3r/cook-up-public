<script lang="ts">
	import { hydrateFavorites, isFavorite, toggleFavorite } from '$lib/favorites.svelte';

	interface Props {
		id: number;
		t: (key: string) => string;
	}
	let { id, t }: Props = $props();

	// SSR never reaches here (see hydrateFavorites' own guard), so this only
	// ever runs in the browser, after mount — same pattern ThemeToggle.svelte
	// uses for THEME_KEY.
	$effect(() => {
		hydrateFavorites();
	});

	const favorited = $derived(isFavorite(id));
</script>

<button
	type="button"
	class="heart"
	class:on={favorited}
	aria-pressed={favorited}
	aria-label={favorited ? t('favorite.remove') : t('favorite.add')}
	onclick={() => toggleFavorite(id)}
>
	<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
		<path
			d="M10 16.5 3.6 10.3a4 4 0 0 1 5.5-5.8L10 5.6l.9-1.1a4 4 0 0 1 5.5 5.8Z"
			fill={favorited ? 'currentColor' : 'none'}
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linejoin="round"
		/>
	</svg>
</button>

<style>
	.heart {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--muted);
		box-shadow: var(--shadow-1);
	}
	.heart:hover {
		color: var(--primary);
		border-color: var(--primary);
	}
	.heart.on {
		color: var(--primary);
		border-color: var(--primary);
	}
	.heart svg {
		width: 1.2rem;
		height: 1.2rem;
	}
</style>
