<script lang="ts">
	import { THEME_KEY, THEME_SETTINGS, resolveTheme, type ThemeSetting } from '$lib/theme';

	interface Props {
		/** Localised group name, e.g. "Theme". */
		label: string;
		/** Localised name per setting, used as each segment's accessible name. */
		optionLabels: Record<ThemeSetting, string>;
	}

	let { label, optionLabels }: Props = $props();

	/*
	 * The stored choice lives in localStorage, which the server cannot read, so SSR
	 * always renders the default ('auto'). The bootstrap script in app.html has
	 * already written the real value onto <html data-theme> before first paint, so
	 * this only has to catch up to the DOM — after hydration, to avoid asserting a
	 * `checked` state the server didn't render.
	 */
	let setting = $state<ThemeSetting>('auto');

	$effect(() => {
		// Reads the DOM, not reactive state, so this settles once after mount.
		const current = resolveTheme(document.documentElement.dataset.theme);
		setting = current;
		// Also on mount, not just on change: a stored override otherwise leaves the
		// browser chrome showing whichever colour the OS media query matched.
		syncThemeColor(current);
	});

	function choose(next: ThemeSetting) {
		setting = next;
		const root = document.documentElement;

		if (next === 'auto') {
			// 'auto' is the *absence* of an override, in the DOM and in storage alike.
			delete root.dataset.theme;
		} else {
			root.dataset.theme = next;
		}

		// Private-mode Safari and cookie-blocking extensions can throw on access.
		// A theme that fails to persist is a much smaller problem than a crash.
		try {
			if (next === 'auto') localStorage.removeItem(THEME_KEY);
			else localStorage.setItem(THEME_KEY, next);
		} catch {
			/* ignore */
		}

		syncThemeColor(next);
	}

	/**
	 * Keep the browser chrome in step. The two metas in app.html are media-scoped,
	 * which is right for 'auto' and for no-JS, but a forced theme has to override
	 * whichever one the OS would otherwise match — so point both at the same
	 * palette. Each meta carries its own palette colours in data-* so returning to
	 * 'auto' is just putting them back.
	 */
	function syncThemeColor(next: ThemeSetting) {
		const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
		for (const meta of metas) {
			const light = meta.dataset.light;
			const dark = meta.dataset.dark;
			if (!light || !dark) continue;
			if (next === 'light') meta.content = light;
			else if (next === 'dark') meta.content = dark;
			else meta.content = meta.media.includes('dark') ? dark : light;
		}
	}
</script>

<!-- Real radios rather than a hand-rolled role="radiogroup": arrow-key movement,
     roving focus and the checked state all come from the platform. The inputs are
     visually hidden but still focusable, so the ring is drawn on the label via
     :has() instead. -->
<fieldset class="theme">
	<legend class="sr-only">{label}</legend>
	{#each THEME_SETTINGS as value (value)}
		<label class="seg" class:on={setting === value}>
			<input
				class="sr-only"
				type="radio"
				name="cookup-theme"
				{value}
				checked={setting === value}
				onchange={() => choose(value)}
			/>
			<span class="sr-only">{optionLabels[value]}</span>
			{#if value === 'light'}
				<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
					<circle
						cx="10"
						cy="10"
						r="3.5"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linejoin="round"
					/>
					<path
						d="M10 2.2v1.6M10 16.2v1.6M2.2 10h1.6M16.2 10h1.6M4.5 4.5l1.1 1.1M14.4 14.4l1.1 1.1M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
			{:else if value === 'dark'}
				<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
					<path
						d="M15.8 12.4A6.6 6.6 0 0 1 7.6 4.2a6.6 6.6 0 1 0 8.2 8.2Z"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{:else}
				<!-- Half-filled disc: the conventional "follow the system" glyph. -->
				<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
					<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="2.2" />
					<path d="M10 3.5a6.5 6.5 0 0 0 0 13Z" fill="currentColor" />
				</svg>
			{/if}
		</label>
	{/each}
</fieldset>

<style>
	.theme {
		display: flex;
		/* Reset the UA fieldset chrome before restyling as a segmented control. */
		margin: 0;
		padding: 2px;
		gap: 2px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-1);
	}

	.seg {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* 44px total with the fieldset's 2px padding — same touch-target floor as
		   .bar select and the ingredient chips. */
		min-height: 2.5rem;
		min-width: 2.5rem;
		border-radius: calc(var(--radius) - 3px);
		color: var(--muted);
		cursor: pointer;
		transition:
			background var(--dur-fast) ease,
			color var(--dur-fast) ease;
	}
	.seg:hover:not(.on) {
		background: var(--surface-sunken);
		color: var(--ink);
	}
	.seg.on {
		background: var(--primary);
		color: var(--on-primary);
	}

	/* The input is .sr-only, so its own focus ring is invisible — draw it on the
	   label instead, matching the global ring in app.css. */
	.seg:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.seg svg {
		width: 1.15rem;
		height: 1.15rem;
	}

	/* Forced colours flatten --primary, so the checked segment would become
	   indistinguishable. Highlight/HighlightText are the system's own selected
	   pair and survive the substitution. */
	@media (forced-colors: active) {
		.seg.on {
			background: Highlight;
			color: HighlightText;
			forced-color-adjust: none;
		}
		.seg:has(input:focus-visible) {
			outline-color: Highlight;
		}
	}
</style>
