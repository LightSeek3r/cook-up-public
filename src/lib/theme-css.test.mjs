import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES, THEME_KEY } from '$lib/theme';
import { INGREDIENT_CATEGORIES } from '$lib/config';

/*
 * Dark mode has to be reachable both from `prefers-color-scheme` and from an
 * explicit `[data-theme='dark']`. A media query is a conditional group rule, so it
 * cannot be OR'd with an attribute selector — the declarations have to exist twice.
 *
 * That duplication has already drifted once in this file: when the dark palette was
 * reworked to Wine Cellar, the doodle stroke baked into the background data-URI kept
 * a hand-picked cream from the previous palette instead of following dark --ink.
 * Nothing caught it, because it is decorative and invisible at 5.5% opacity.
 *
 * So the pairing is asserted here rather than trusted to a comment.
 *
 * Why .mjs and not .test.ts, alone among the tests in src/: this has to read
 * app.css as *text*. Vite's SSR pipeline hands back an empty string for a CSS
 * import — `?raw` and `?inline` alike — so the only way to see the real bytes is
 * node:fs, and typing that would mean adding @types/node purely for one file.
 * The generated tsconfig includes src/**\/*.{js,ts,svelte} but not .mjs, so this
 * extension opts out of typechecking while still being picked up by vitest —
 * the same arrangement pipeline/lib/*.test.mjs already uses for node-side tests.
 */

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const themeInit = readFileSync(new URL('../../static/theme-init.js', import.meta.url), 'utf8');

/** Strip comments first — they contain selector-shaped prose. */
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();

function parseDecls(body) {
	const out = new Map();
	for (const part of body.split(';')) {
		const at = part.indexOf(':');
		if (at === -1) continue;
		const prop = part.slice(0, at).trim();
		if (!prop) continue;
		out.set(prop, norm(part.slice(at + 1)));
	}
	return out;
}

/** Flat rule list, with the enclosing @media condition recorded per rule. */
function parseRules(source) {
	const out = [];
	let i = 0;

	function block(media) {
		let buf = '';
		while (i < source.length) {
			const ch = source[i];
			if (ch === '}') {
				i++;
				return;
			}
			if (ch === '{') {
				const selector = norm(buf);
				buf = '';
				i++;
				if (selector.startsWith('@')) {
					block(selector);
				} else {
					let body = '';
					let depth = 1;
					while (i < source.length) {
						if (source[i] === '{') depth++;
						else if (source[i] === '}' && --depth === 0) break;
						body += source[i++];
					}
					i++;
					out.push({ selector, media, decls: parseDecls(body) });
				}
				continue;
			}
			buf += ch;
			i++;
		}
	}

	block(null);
	return out;
}

const rules = parseRules(stripped);

function rule(selector, media = null) {
	const want = norm(selector);
	const found = rules.filter((r) => r.selector === want && r.media === media);
	expect(found.length, `expected exactly one rule for "${want}" (media: ${media})`).toBe(1);
	return found[0];
}

const DARK_MEDIA = '@media (prefers-color-scheme: dark)';
const OS_DARK = ":root:not([data-theme='light'])";
const FORCED_DARK = ":root[data-theme='dark']";

/** Only the palette matters here; ignore anything that isn't a token or color-scheme. */
const paletteOf = (r) =>
	new Map([...r.decls].filter(([p]) => p.startsWith('--') || p === 'color-scheme'));

describe('the CSS parser used by these tests', () => {
	// If the parser silently found nothing, every comparison below would compare
	// empty against empty and pass. Anchor it against known content first.
	it('found a meaningful number of rules', () => {
		expect(rules.length).toBeGreaterThan(30);
	});

	it('read the real stylesheet, not an empty SSR stub', () => {
		expect(css.length).toBeGreaterThan(5000);
		expect(css).toContain('prefers-color-scheme: dark');
	});
});

describe('dark palette: the two copies stay identical', () => {
	it('the :root token set matches between the media query and the forced selector', () => {
		const os = paletteOf(rule(OS_DARK, DARK_MEDIA));
		const forced = paletteOf(rule(FORCED_DARK));
		expect(os.size).toBeGreaterThan(20);
		expect(Object.fromEntries(forced)).toEqual(Object.fromEntries(os));
	});

	it.each(INGREDIENT_CATEGORIES)('the %s category tokens match between both copies', (cat) => {
		const os = paletteOf(rule(`${OS_DARK} [data-cat='${cat}']`, DARK_MEDIA));
		const forced = paletteOf(rule(`${FORCED_DARK} [data-cat='${cat}']`));
		expect(os.size).toBeGreaterThan(0);
		expect(Object.fromEntries(forced)).toEqual(Object.fromEntries(os));
	});

	it('declares color-scheme in both copies, so native controls follow a forced theme', () => {
		expect(paletteOf(rule(OS_DARK, DARK_MEDIA)).get('color-scheme')).toBe('dark');
		expect(paletteOf(rule(FORCED_DARK)).get('color-scheme')).toBe('dark');
	});
});

describe('light and dark define the same tokens', () => {
	// Light is the base, so a token added only to :root silently keeps its light
	// value in dark mode — visible as one stubbornly pale thing in a dark UI.
	it(':root and the dark palette declare the same token names', () => {
		const light = new Set(paletteOf(rule(':root')).keys());
		const dark = new Set(paletteOf(rule(FORCED_DARK)).keys());
		expect([...dark].filter((t) => !light.has(t))).toEqual([]);
		// Tokens that are legitimately theme-invariant: spacing, touch target, radii,
		// motion, fonts.
		const invariant = /^--(space|tap|radius|dur|ease|font)/;
		expect([...light].filter((t) => !dark.has(t) && !invariant.test(t))).toEqual([]);
	});

	it.each(INGREDIENT_CATEGORIES)(
		'the %s category declares the same tokens in both themes',
		(cat) => {
			const light = new Set(paletteOf(rule(`[data-cat='${cat}']`)).keys());
			const dark = new Set(paletteOf(rule(`${FORCED_DARK} [data-cat='${cat}']`)).keys());
			expect(new Set(dark)).toEqual(light);
		}
	);
});

describe('print forces the light palette', () => {
	// The print block restates light by hand to beat the dark selectors, so it is
	// the third copy of the palette, and the one nobody looks at.
	const PRINT = `:root, ${OS_DARK}, ${FORCED_DARK}`;

	it('restates every themed light token with its light value', () => {
		const light = paletteOf(rule(':root'));
		const dark = paletteOf(rule(FORCED_DARK));
		const print = paletteOf(rule(PRINT, '@media print'));
		const themed = [...dark.keys()];
		expect(themed.length).toBeGreaterThan(20);
		expect(Object.fromEntries(themed.map((t) => [t, print.get(t)]))).toEqual(
			Object.fromEntries(themed.map((t) => [t, light.get(t)]))
		);
	});
});

describe('background doodle stroke follows --ink', () => {
	// The stroke colour is baked into a data URI, which cannot read a custom
	// property — the one place a token value is unavoidably written by hand.
	const strokeOf = (r) => {
		const bg = r.decls.get('background');
		expect(bg, `no background on ${r.selector}`).toBeTruthy();
		const m = /stroke='%23([0-9a-f]{6})'/i.exec(bg);
		expect(m, `no doodle stroke in ${r.selector}`).toBeTruthy();
		return `#${m[1].toLowerCase()}`;
	};

	it('light: the stroke equals light --ink', () => {
		const ink = paletteOf(rule(':root')).get('--ink');
		expect(strokeOf(rule('html, body'))).toBe(ink);
	});

	it('dark: the stroke equals dark --ink in both copies', () => {
		const ink = paletteOf(rule(FORCED_DARK)).get('--ink');
		expect(strokeOf(rule(`${OS_DARK}, ${OS_DARK} body`, DARK_MEDIA))).toBe(ink);
		expect(strokeOf(rule(`${FORCED_DARK}, ${FORCED_DARK} body`))).toBe(ink);
	});
});

describe('app.html links the external bootstrap script', () => {
	it('references /theme-init.js', () => {
		expect(html).toContain('<script src="/theme-init.js">');
	});

	// Before the stylesheets document.fonts knows no @font-face rule, so the
	// script would find every face "loaded" and never show the skeleton; in the
	// body it would run after first paint.
	it('links /font-init.js after the stylesheets and still inside <head>', () => {
		const at = html.indexOf('<script src="/font-init.js">');
		expect(at).toBeGreaterThan(html.indexOf('%sveltekit.head%'));
		expect(at).toBeLessThan(html.indexOf('</head>'));
	});
});

describe('font loading states', () => {
	const withDecl = (prop) => rules.filter((r) => r.decls.has(prop));

	it('hides text only under html[data-fonts=loading], so a script-less page stays visible', () => {
		const hiding = withDecl('-webkit-text-fill-color');
		expect(hiding.length).toBeGreaterThan(0);
		for (const r of hiding) expect(r.selector).toContain("html[data-fonts='loading']");
	});

	it('keeps the brand faces out of the stacks while loading, after giving up, and until a late switch', () => {
		const off = rules.filter((r) => r.decls.get('--font-body') === 'var(--font-system)');
		expect(off.map((r) => r.selector)).toEqual([
			"html:is([data-fonts='loading'], [data-fonts='fallback'], [data-fonts='late'])"
		]);
		expect(off[0].decls.get('--font-display')).toBe('var(--font-display-system)');
	});

	it('the swap state reveals body from opacity 0 with an animation', () => {
		const swap = rule("html[data-fonts='swap'] body");
		const name = /^font-reveal\b/.exec(swap.decls.get('animation'));
		expect(name, 'animation font-reveal').toBeTruthy();
		const from = rules.find((r) => r.media === '@keyframes font-reveal' && r.selector === 'from');
		expect(from?.decls.get('opacity')).toBe('0');
	});
});

describe('theme-init.js bootstrap script', () => {
	// It runs before any module loads, so it cannot import THEMES or THEME_KEY and
	// repeats them as literals. If those ever diverge, a stored theme silently stops
	// being applied before first paint and the bug reappears as a flash of the wrong
	// palette — the exact thing the script exists to prevent.
	const script = themeInit;

	it('exists', () => {
		expect(script.length).toBeGreaterThan(0);
	});

	it('uses the same storage key as the module', () => {
		expect(script).toContain(`'${THEME_KEY}'`);
	});

	it('accepts exactly the real palettes and nothing else', () => {
		const accepted = [...script.matchAll(/t === '([a-z]+)'/g)].map((m) => m[1]);
		expect(accepted.sort()).toEqual([...THEMES].sort());
	});

	it('sets data-theme, which is what the CSS selects on', () => {
		expect(script).toContain('dataset.theme');
	});
});
