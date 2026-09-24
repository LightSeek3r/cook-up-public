<script lang="ts">
	import { ICONS, iconFor } from '$lib/ingredientIcon';
	import type { IngredientCategory } from '$lib/config';

	interface Props {
		canonicalKey: string;
		category: IngredientCategory;
	}

	let { canonicalKey, category }: Props = $props();

	const art = $derived(ICONS[iconFor(canonicalKey, category)]);
</script>

<!-- Purely decorative: the ingredient name is always rendered beside it. -->
<svg
	class="icon"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if art.fill}
		<path d={art.fill} fill="currentColor" fill-opacity="0.22" />
	{/if}
	{#if 'line' in art && art.line}
		<path d={art.line} />
	{/if}
</svg>

<style>
	.icon {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
