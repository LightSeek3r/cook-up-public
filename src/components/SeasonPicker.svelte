<script lang="ts">
	import { tick } from 'svelte';
	import { seasonPrefs } from '$lib/seasonal/prefs.svelte';
	import { PICKER_ZONES, zoneExamples } from '$lib/seasonal/ui';
	import type { Hemi, SeasonView, ZoneId } from '$lib/seasonal/zones';

	interface Props {
		open: boolean;
		lang: string;
		t: (key: string) => string;
		onclose: () => void;
	}

	let { open, lang, t, onclose }: Props = $props();

	const uid = $props.id();
	const HEMIS: readonly Hemi[] = ['n', 's'];
	let dialog = $state<HTMLDialogElement>();
	/** What had focus before opening; focus goes back there on close. */
	let opener: HTMLElement | null = null;

	const current = $derived(seasonPrefs.effective);
	const currentZone = $derived<ZoneId | 'world'>(current === 'world' ? 'world' : current.zone);

	/** The hemisphere a newly picked zone gets: the shown one, else the detected one, else north. */
	const hemi = $derived.by<Hemi>(() => {
		if (current !== 'world') return current.hemi;
		const detected = seasonPrefs.detected?.view;
		return detected && detected !== 'world' ? detected.hemi : 'n';
	});

	$effect(() => {
		const element = dialog;
		if (!element) return;
		if (open && !element.open) {
			opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			element.showModal();
			// The chosen option, rather than the dialog's first control: arrow keys
			// then move through the zones straight away.
			tick().then(() => element.querySelector<HTMLInputElement>('input[name="zone"]:checked')?.focus());
		} else if (!open && element.open) element.close();
	});

	function closed() {
		onclose();
		opener?.focus();
		opener = null;
	}

	function choose(zone: ZoneId | 'world') {
		const view: SeasonView = zone === 'world' ? 'world' : { zone, hemi };
		seasonPrefs.set(view);
	}

	function chooseHemi(next: Hemi) {
		if (current !== 'world') seasonPrefs.set({ zone: current.zone, hemi: next });
	}

	function automatic() {
		seasonPrefs.set(null);
		dialog?.close();
	}

	// A click on the dialog box itself is a click on the backdrop: the content
	// fills the box, so it never receives clicks meant for an option.
	function backdrop(event: MouseEvent) {
		if (event.target === dialog) dialog?.close();
	}
</script>

<dialog
	bind:this={dialog}
	class="climate"
	aria-labelledby="{uid}-title"
	aria-describedby="{uid}-intro"
	onclose={closed}
	onclick={backdrop}
>
	{#if open}
		<div class="sheet">
			<header class="head">
				<h2 id="{uid}-title">{t('seasonal.pickerTitle')}</h2>
				<button type="button" class="close" onclick={() => dialog?.close()}>
					<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
						<path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
					<span class="sr-only">{t('seasonal.done')}</span>
				</button>
			</header>
			<p class="intro" id="{uid}-intro">{t('seasonal.pickerIntro')}</p>

			<fieldset class="zones">
				<legend class="sr-only">{t('seasonal.pickerTitle')}</legend>
				{#each PICKER_ZONES as zone (zone)}
					{@const examples = zoneExamples(zone, lang)}
					<label class="zone" class:world={zone === 'world'} data-zone={zone}>
						<input
							type="radio"
							name="zone"
							value={zone}
							checked={currentZone === zone}
							onchange={() => choose(zone)}
						/>
						<span class="dot" aria-hidden="true"></span>
						<span class="zone-text">
							<span class="zone-name">{t(`seasonal.zone.${zone}.name`)}</span>
							<span class="zone-desc">{t(`seasonal.zone.${zone}.desc`)}</span>
							{#if examples}<span class="zone-examples">{examples}</span>{/if}
						</span>
					</label>
				{/each}
			</fieldset>

			{#if currentZone !== 'world' && currentZone !== 'trop'}
				<fieldset class="hemi">
					<legend>{t('seasonal.hemisphere.label')}</legend>
					<div class="segmented">
						{#each HEMIS as value (value)}
							<label>
								<input
									type="radio"
									name="hemi"
									{value}
									checked={hemi === value}
									onchange={() => chooseHemi(value)}
								/>
								<span>{t(value === 'n' ? 'seasonal.hemisphere.north' : 'seasonal.hemisphere.south')}</span>
							</label>
						{/each}
					</div>
				</fieldset>
			{/if}

			<footer class="foot">
				<button type="button" class="auto" onclick={automatic} disabled={seasonPrefs.source !== 'override'}>
					{t('seasonal.auto')}
				</button>
				<button type="button" class="done" onclick={() => dialog?.close()}>{t('seasonal.done')}</button>
			</footer>
		</div>
	{/if}
</dialog>

<style>
	.climate {
		width: min(36rem, calc(100vw - 2 * var(--space-3)));
		max-height: min(46rem, calc(100dvh - 2 * var(--space-4)));
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		background: var(--surface);
		color: var(--ink);
		box-shadow:
			inset 0 1px 0 var(--hi),
			var(--shadow-2);
		overscroll-behavior: contain;
	}
	.climate[open] {
		animation: rise-in var(--dur) var(--ease-out);
	}
	.climate::backdrop {
		background: rgb(10 12 14 / 55%);
		backdrop-filter: blur(3px);
	}
	.sheet {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5) var(--space-4);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.head h2 {
		margin: 0;
		font-size: 1.45rem;
	}
	.close {
		display: grid;
		place-items: center;
		flex: none;
		width: var(--tap);
		height: var(--tap);
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		background: var(--sheen);
		color: var(--ink);
	}
	.close:hover {
		color: var(--primary);
		border-color: var(--primary);
	}
	.close svg {
		width: 1.1rem;
		height: 1.1rem;
	}
	.intro {
		margin: 0;
		color: var(--muted);
		font-size: 0.92rem;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.zones {
		display: grid;
		gap: var(--space-2);
	}
	@media (min-width: 34rem) {
		.zones {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.zone.world {
			grid-column: 1 / -1;
		}
	}
	.zone {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: var(--space-2);
		min-height: var(--tap);
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--surface);
		cursor: pointer;
		transition:
			border-color var(--dur-fast) ease,
			background var(--dur-fast) ease;
	}
	.zone:hover {
		border-color: var(--primary);
	}
	.zone:has(input:checked) {
		border-color: var(--primary);
		background: color-mix(in srgb, var(--primary) 8%, var(--surface));
		box-shadow: inset 0 0 0 1px var(--primary);
	}
	.zone:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	/* The native radio stays (keyboard, forms, forced colours) but invisible over the card. */
	.zone input,
	.segmented input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.dot {
		width: 1.05rem;
		height: 1.05rem;
		margin-block-start: 0.15rem;
		border: 2px solid var(--line-strong);
		border-radius: 50%;
		background: var(--surface);
		transition:
			border-color var(--dur-fast) ease,
			box-shadow var(--dur-fast) ease;
	}
	.zone:has(input:checked) .dot {
		border-color: var(--primary);
		box-shadow: inset 0 0 0 3px var(--surface), inset 0 0 0 8px var(--primary);
	}
	.zone-text {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}
	.zone-name {
		font-weight: 700;
		font-size: 0.95rem;
	}
	.zone-desc {
		font-size: 0.82rem;
		line-height: 1.35;
	}
	.zone-examples {
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.35;
	}

	.hemi {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.hemi legend {
		float: inline-start;
		margin-inline-end: var(--space-3);
		font-size: 0.85rem;
		font-weight: 700;
		line-height: var(--tap);
	}
	.segmented {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		background: var(--surface-sunken);
		box-shadow: inset 0 1px 2px var(--lo);
	}
	.segmented label {
		position: relative;
		display: grid;
		place-items: center;
		min-height: var(--tap);
		padding: 0 1rem;
		border-radius: var(--radius-pill);
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}
	.segmented label:has(input:checked) {
		background: var(--surface);
		color: var(--ink);
		font-weight: 750;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 3px var(--lo-2);
	}
	.segmented label:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 1px;
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-2);
		padding-block-start: var(--space-3);
		border-block-start: 1px solid var(--line);
	}
	.foot button {
		min-height: var(--tap);
		padding: 0 1.1rem;
		border-radius: var(--radius-btn);
		font-size: 0.9rem;
		font-weight: 700;
	}
	.auto {
		border: 1px solid var(--line-strong);
		background: none;
		color: var(--ink);
	}
	.auto:hover:not(:disabled) {
		color: var(--primary);
		border-color: var(--primary);
	}
	.auto:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.done {
		border: 1px solid color-mix(in srgb, var(--primary) 75%, black);
		background: var(--primary);
		color: var(--on-primary);
	}

	/* Phones: a sheet from the bottom edge, thumb-high. */
	@media (max-width: 33.99rem) {
		.climate {
			width: 100vw;
			max-width: 100vw;
			max-height: 88dvh;
			margin: auto 0 0;
			border-inline: 0;
			border-block-end: 0;
			border-end-start-radius: 0;
			border-end-end-radius: 0;
		}
		.sheet {
			padding: var(--space-4) var(--space-3) max(var(--space-4), env(safe-area-inset-bottom));
		}
	}
	@keyframes rise-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
	}
	@media (forced-colors: active) {
		.zone:has(input:checked) {
			border: 3px solid Highlight;
		}
		.zone:has(input:checked) .dot,
		.segmented label:has(input:checked) {
			forced-color-adjust: none;
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
