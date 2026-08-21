/**
 * Theme selection.
 *
 * There are exactly two palettes, light and dark — see the "Dark palette" note
 * in `src/app.css`. The third *setting*, 'auto', is not a third palette: it means
 * "store nothing and let `prefers-color-scheme` decide", which is the default and
 * what every user gets until they explicitly choose otherwise.
 *
 * That asymmetry is why `resolveTheme` whitelists against THEMES rather than
 * THEME_SETTINGS — 'auto' is represented by the *absence* of a stored value, so a
 * literal 'auto' in storage is just as invalid as junk, and both fall back to the
 * default. Same shape as `resolveLang` in `src/lib/i18n/index.ts`.
 */

/** The two real palettes. A stored override must be one of these. */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** What the control can be set to. 'auto' = follow the OS, store nothing. */
export const THEME_SETTINGS = ['light', 'dark', 'auto'] as const;
export type ThemeSetting = (typeof THEME_SETTINGS)[number];

export const DEFAULT_THEME: ThemeSetting = 'auto';

/**
 * localStorage key. Duplicated as a literal in the bootstrap script in
 * `src/app.html`, which runs before any module loads and so cannot import it —
 * `theme-css.test.ts` asserts the two agree.
 */
export const THEME_KEY = 'cookup-theme';

/** Whitelists an untrusted stored value; never returns anything outside THEME_SETTINGS. */
export function resolveTheme(value: string | null | undefined): ThemeSetting {
	return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}
