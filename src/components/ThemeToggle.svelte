<script lang="ts">
	import { THEME_KEY, resolveTheme, type Theme } from '$lib/theme';

	interface Props {
		/** Localised "Switch to dark theme", the name while light is showing. */
		toDarkLabel: string;
		/** Localised "Switch to light theme", the name while dark is showing. */
		toLightLabel: string;
	}

	let { toDarkLabel, toLightLabel }: Props = $props();

	/*
	 * The effective theme is the stored choice (already on <html data-theme>,
	 * written by static/theme-init.js before first paint) or else the OS
	 * preference — both client-side only, so SSR renders the light-mode label and
	 * this catches up after hydration. The icon does not wait for it: CSS below
	 * picks it from the same two sources.
	 */
	let theme = $state<Theme>('light');
	const label = $derived(theme === 'dark' ? toLightLabel : toDarkLabel);

	$effect(() => {
		// Reads the DOM, not reactive state, so this settles once after mount.
		const root = document.documentElement;
		const osDark = matchMedia('(prefers-color-scheme: dark)');
		const chosen = resolveTheme(root.dataset.theme);
		theme = chosen ?? (osDark.matches ? 'dark' : 'light');
		// Also on mount, not just on press: a stored choice otherwise leaves the
		// browser chrome showing whichever colour the OS media query matched.
		syncThemeColor(chosen);

		// Until the first press the CSS follows the OS live; keep the name in step.
		const follow = (event: MediaQueryListEvent) => {
			if (!resolveTheme(root.dataset.theme)) theme = event.matches ? 'dark' : 'light';
		};
		osDark.addEventListener('change', follow);
		return () => osDark.removeEventListener('change', follow);
	});

	function toggle() {
		const next: Theme = theme === 'dark' ? 'light' : 'dark';
		theme = next;
		document.documentElement.dataset.theme = next;

		// Private-mode Safari and cookie-blocking extensions can throw on access.
		// A theme that fails to persist is a much smaller problem than a crash.
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			/* ignore */
		}

		syncThemeColor(next);
	}

	/**
	 * Keep the browser chrome in step. The two metas in app.html are media-scoped,
	 * which is right while no choice is stored and with no JavaScript, but a chosen
	 * theme has to override whichever one the OS would otherwise match — so point
	 * both at the same palette. Each meta carries both colours in data-*, so the
	 * media-scoped state can be restored from them.
	 */
	function syncThemeColor(chosen: Theme | null) {
		const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
		for (const meta of metas) {
			const light = meta.dataset.light;
			const dark = meta.dataset.dark;
			if (!light || !dark) continue;
			if (chosen === 'light') meta.content = light;
			else if (chosen === 'dark') meta.content = dark;
			else meta.content = meta.media.includes('dark') ? dark : light;
		}
	}
</script>

<!-- One button, no "system" option: the icon is the theme a press switches to. -->
<button type="button" class="chrome-control theme-btn" aria-label={label} title={label} onclick={toggle}>
	<svg class="i-moon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
		<path
			d="M15.8 12.6A6.5 6.5 0 0 1 7.4 4.2a6.5 6.5 0 1 0 8.4 8.4Z"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linejoin="round"
		/>
	</svg>
	<svg class="i-sun" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
		<circle cx="10" cy="10" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7" />
		<path
			d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
		/>
	</svg>
</button>

<style>
	.theme-btn {
		flex: none;
		width: var(--tap);
		padding: 0;
	}
	.theme-btn svg {
		width: 1.3rem;
		height: 1.3rem;
	}

	/* The same two sources as the dark palette in app.css (a chosen theme, else
	   the OS), so the icon is right from first paint, before hydration. */
	.i-sun {
		display: none;
	}
	:global(:root[data-theme='dark']) .i-sun {
		display: block;
	}
	:global(:root[data-theme='dark']) .i-moon {
		display: none;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .i-sun {
			display: block;
		}
		:global(:root:not([data-theme='light'])) .i-moon {
			display: none;
		}
	}
</style>
