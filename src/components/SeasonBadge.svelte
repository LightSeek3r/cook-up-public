<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { maskOf } from '$lib/data/seasons.js';
	import { resolveLang, t as translator } from '$lib/i18n';
	import { formatPeak, viewOf } from '$lib/seasonal';
	import { seasonData } from '$lib/seasonal/data.svelte';
	import { seasonPrefs } from '$lib/seasonal/prefs.svelte';
	import { badgeState } from '$lib/seasonal/ui';

	interface Props {
		/** The ingredient's id: its index in the season data is id - 1, as everywhere in core.bin. */
		id: number;
		/** `corner` sits on an icon medallion (the parent is the positioning box); `inline` flows with text. */
		placement?: 'corner' | 'inline';
		/** Also mark seasonal items that are out of season (muted), where a list is read item by item. */
		showOut?: boolean;
	}

	let { id, placement = 'corner', showOut = false }: Props = $props();

	const lang = $derived(resolveLang(page.url.searchParams.get('lang')));
	const t = $derived(translator(lang));

	// Never during SSR: the month and the climate are the reader's, so the
	// server and the first client render both draw no mark.
	onMount(() => {
		seasonPrefs.hydrate();
		seasonData.want();
	});

	const view = $derived(viewOf(seasonPrefs.view));
	const state = $derived(badgeState(seasonData.seasons, id - 1, view, seasonData.month));
	const label = $derived.by(() => {
		const seasons = seasonData.seasons;
		if (!state || !seasons) return '';
		const head = t(state === 'in' ? 'seasonal.badge' : 'seasonal.outOfSeason');
		const peak = formatPeak(maskOf(seasons, id - 1, view), lang);
		return peak ? `${head}. ${t('seasonal.peak').replace('{range}', peak)}` : head;
	});
</script>

{#if state === 'in' || (state === 'out' && showOut)}
	<span class="season {placement}" class:out={state === 'out'} role="img" aria-label={label} title={label}>
		<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
			<path
				class="blade"
				d="M13.7 2.3c.6 6.7-2.3 11.1-7.7 11.3-1.1 0-2-.3-2.7-.8C2.9 7.9 6.6 3.1 13.7 2.3Z"
			/>
			<path class="rib" d="M3.1 13.5C5 10 7.6 7.4 11 5.4" />
		</svg>
	</span>
{/if}

<style>
	.season {
		--size: var(--season-size, 1.15rem);
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		background: var(--grade-a);
		color: var(--on-grade);
		/* A --surface ring keeps the mark apart from any tile fill or medallion it overlaps. */
		box-shadow:
			0 0 0 2px var(--surface),
			0 1px 3px 1px var(--lo-2);
		pointer-events: auto;
		animation: sprout var(--dur) var(--ease-spring) backwards;
	}
	.season svg {
		width: 72%;
		height: 72%;
	}
	.blade {
		fill: currentColor;
	}
	.rib {
		fill: none;
		stroke: var(--grade-a);
		stroke-width: 1.1;
		stroke-linecap: round;
	}
	.season.out {
		background: var(--surface);
		color: var(--muted);
		box-shadow:
			inset 0 0 0 1.5px var(--line-strong),
			0 0 0 2px var(--surface);
	}
	.season.out .blade {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.3;
		stroke-linejoin: round;
	}
	.season.out .rib {
		stroke: currentColor;
	}
	.corner {
		position: absolute;
		inset-block-start: -0.2rem;
		inset-inline-start: -0.2rem;
		z-index: 1;
	}
	.inline {
		vertical-align: -0.2em;
		margin-inline-start: 0.35em;
	}
	@keyframes sprout {
		from {
			opacity: 0;
			transform: scale(0.4) rotate(-25deg);
		}
	}
	@media (forced-colors: active) {
		.season {
			forced-color-adjust: none;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
			border: 1px solid CanvasText;
		}
		.rib {
			stroke: Canvas;
		}
		.season.out .rib {
			stroke: CanvasText;
		}
	}
</style>
