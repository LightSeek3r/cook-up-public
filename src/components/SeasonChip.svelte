<script lang="ts">
	import { onMount } from 'svelte';
	import SeasonPicker from './SeasonPicker.svelte';
	import { seasonPrefs } from '$lib/seasonal/prefs.svelte';

	interface Props {
		lang: string;
		t: (key: string) => string;
	}

	let { lang, t }: Props = $props();

	let open = $state(false);

	// Until then the server's defaults show (the world, nothing detected), so
	// SSR and the first client render agree.
	onMount(() => seasonPrefs.hydrate());

	const view = $derived(seasonPrefs.effective);
	const zone = $derived.by(() => {
		if (view === 'world') return t('seasonal.chipWorld');
		const name = t(`seasonal.zone.${view.zone}.name`);
		const named = view.hemi === 's' && view.zone !== 'trop' ? `${name} · ${t('seasonal.hemisphere.south')}` : name;
		return t('seasonal.chip').replace('{zone}', named);
	});
	const source = $derived.by(() => {
		const detected = seasonPrefs.detected;
		if (seasonPrefs.source === 'timezone' && detected?.tz) return t('seasonal.detected').replace('{tz}', detected.tz);
		if (seasonPrefs.source === 'language') return t('seasonal.detectedLanguage');
		return '';
	});
</script>

<button type="button" class="chip" aria-haspopup="dialog" onclick={() => (open = true)}>
	<svg class="globe" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
		<circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6" />
		<path
			d="M3.4 7.4h13.2M3.4 12.6h13.2M10 2.8c-2.4 2.2-3.4 4.6-3.4 7.2s1 5 3.4 7.2c2.4-2.2 3.4-4.6 3.4-7.2s-1-5-3.4-7.2Z"
			fill="none"
			stroke="currentColor"
			stroke-width="1.3"
			stroke-linejoin="round"
		/>
	</svg>
	<span class="text">
		<span class="zone">{zone}</span>
		{#if source}<span class="source">{source}</span>{/if}
	</span>
	<span class="change">{t('seasonal.change')}</span>
</button>

<SeasonPicker {open} {lang} {t} onclose={() => (open = false)} />

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		max-inline-size: 100%;
		min-height: var(--tap);
		padding: 0.3rem 0.4rem 0.3rem 0.65rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		background: var(--sheen);
		color: var(--ink);
		text-align: start;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
		transition: border-color var(--dur-fast) ease;
	}
	:global([dir='rtl']) .chip {
		padding: 0.3rem 0.65rem 0.3rem 0.4rem;
	}
	.chip:hover {
		border-color: var(--primary);
	}
	.globe {
		flex: none;
		width: 1.15rem;
		height: 1.15rem;
		color: var(--primary);
	}
	.text {
		display: grid;
		min-width: 0;
		line-height: 1.2;
	}
	.zone {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.85rem;
		font-weight: 700;
	}
	.source {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
		font-size: 0.74rem;
	}
	.change {
		flex: none;
		padding: 0.2rem 0.6rem;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--primary) 12%, var(--surface));
		color: var(--primary);
		font-size: 0.78rem;
		font-weight: 700;
	}
</style>
