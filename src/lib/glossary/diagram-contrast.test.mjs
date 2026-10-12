import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * The colour pairs the glossary diagrams rely on, measured from the real app.css in
 * every palette that can be live: light, OS dark, and the explicit dark override.
 * .mjs for the same reason as theme-css.test.mjs: app.css has to be read as text,
 * which needs node:fs, and Vite returns an empty string for a CSS import.
 *
 * Drawings sit on --surface-sunken (DiagramFrame's ground) while the legend badges
 * sit on the page, so line-art pairs are checked against both grounds.
 */

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	''
);

/** Declarations of the first rule whose selector line is exactly `selector`, searched from `from`. */
function tokens(selector, from = 0) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp('(^|\\n)\\s*' + escaped + '\\s*\\{', 'g');
	re.lastIndex = from;
	const m = re.exec(css);
	if (!m) throw new Error(`no rule for ${selector}`);
	const start = m.index + m[0].length;
	const body = css.slice(start, css.indexOf('}', start));
	return Object.fromEntries(
		[...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])
	);
}

const darkMedia = css.indexOf('@media (prefers-color-scheme: dark)');

const THEMES = {
	light: tokens(':root'),
	'prefers-dark': tokens(":root:not([data-theme='light'])", darkMedia),
	'data-theme=dark': tokens(":root[data-theme='dark']")
};

function luminance(hex) {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(full.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum] — 4.5 for text, 3 for meaningful graphics */
const REQUIRED = [
	['--on-primary', '--primary', 4.5],
	['--ink', '--surface', 4.5],
	['--accent', '--surface', 3],
	['--ink', '--surface-sunken', 4.5],
	['--accent', '--surface-sunken', 3],
	['--primary', '--surface-sunken', 3],
	['--muted', '--surface-sunken', 3]
];

describe('the token lookup', () => {
	it.each(Object.entries(THEMES))('found real hex values for the %s palette', (_, t) => {
		for (const name of ['--primary', '--on-primary', '--ink', '--accent', '--surface', '--line-strong']) {
			expect(t[name], name).toMatch(/^#[0-9a-f]{3,8}$/i);
		}
	});

	it('read three different blocks, not the light one three times', () => {
		expect(THEMES['prefers-dark']['--surface']).not.toBe(THEMES.light['--surface']);
		expect(THEMES['data-theme=dark']['--surface']).toBe(THEMES['prefers-dark']['--surface']);
	});
});

describe.each(Object.entries(THEMES))('diagram colour pairs in the %s palette', (theme, t) => {
	it.each(REQUIRED)('%s on %s is at least %s:1', (fg, bg, min) => {
		const ratio = contrast(t[fg], t[bg]);
		expect(ratio, `${theme}: ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${ratio.toFixed(4)}:1`).toBeGreaterThanOrEqual(min);
	});

	// Recorded rather than required: --line-strong is a hairline/divider token and
	// misses 3:1 on --surface in both palettes. diagrams.test.ts therefore bans
	// --line and --line-strong from diagram sources. If a palette change ever lifts
	// it over 3:1, this fails as a prompt to drop that ban, not as a regression.
	it('--line-strong on --surface stays under 3:1, so drawings must not depend on it', () => {
		expect(contrast(t['--line-strong'], t['--surface'])).toBeLessThan(3);
	});
});
