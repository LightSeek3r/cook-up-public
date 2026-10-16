<script lang="ts">
	import { emojiUrl, type EmojiKey } from '$lib/emoji';

	interface Props {
		cp: EmojiKey;
		/** Intrinsic size hint in px; CSS still fills the container. */
		size?: number;
	}

	let { cp, size = 32 }: Props = $props();
</script>

<!-- Purely decorative: every use sits next to a visible text label. -->
<img
	class="food-icon"
	src={emojiUrl(cp)}
	alt=""
	aria-hidden="true"
	width={size}
	height={size}
	loading="lazy"
	decoding="async"
	draggable="false"
/>

<style>
	.food-icon {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		user-select: none;
		pointer-events: none;
	}
</style>
