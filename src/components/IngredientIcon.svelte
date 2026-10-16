<script lang="ts">
	import FoodIcon from './FoodIcon.svelte';
	import { iconFor } from '$lib/ingredientIcon';
	import type { IngredientCategory } from '$lib/config';

	interface Props {
		/** An empty key draws the category glyph (the mosaic group badge). */
		canonicalKey: string;
		category: IngredientCategory;
		size?: number;
	}

	let { canonicalKey, category, size }: Props = $props();
</script>

<FoodIcon cp={iconFor(canonicalKey, category)} {size} />
