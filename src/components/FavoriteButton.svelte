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
		display: inline-grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		flex: none;
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		background: var(--sheen);
		color: var(--muted);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
		transition:
			transform var(--dur) var(--ease-spring),
			color var(--dur-fast) ease,
			border-color var(--dur-fast) ease;
	}
	.heart:hover {
		color: var(--primary);
		border-color: var(--primary);
	}
	.heart:active {
		transform: scale(0.9);
		transition-duration: var(--dur-fast);
	}
	.heart.on {
		color: var(--primary);
		border-color: color-mix(in srgb, var(--primary) 55%, var(--line-strong));
		background: color-mix(in srgb, var(--primary) 9%, var(--surface));
		box-shadow: var(--shadow-press);
	}
	.heart svg {
		width: 1.25rem;
		height: 1.25rem;
	}
	.heart:focus-visible {
		border-radius: 50%;
	}
</style>
