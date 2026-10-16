/**
 * Theme selection.
 *
 * There are exactly two palettes, light and dark — see the "Dark palette" note
 * in `src/app.css` — and the control only ever stores one of them. Until the
 * user presses it nothing is stored and `prefers-color-scheme` decides, purely
 * in CSS; that default is the *absence* of a value, not a third setting, so
 * `resolveTheme` answers null for it rather than inventing a palette. Same
 * whitelisting shape as `resolveLang` in `src/lib/i18n/index.ts`.
 */

/** The two real palettes. A stored override must be one of these. */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * localStorage key. Duplicated as a literal in static/theme-init.js, which runs
 * before any module loads and so cannot import it — `theme-css.test.mjs`
 * asserts the two agree.
 */
export const THEME_KEY = 'cookup-theme';

/**
 * Whitelists an untrusted stored or DOM value: a real palette passes through,
 * anything else (absent, junk, a legacy 'auto') is null, meaning "no explicit
 * choice, follow the OS".
 */
export function resolveTheme(value: string | null | undefined): Theme | null {
	return THEMES.includes(value as Theme) ? (value as Theme) : null;
}
