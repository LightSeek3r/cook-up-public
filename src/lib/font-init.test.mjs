import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * static/font-init.js runs before any module (see app.html), so it is tested
 * here as text, run against a fake document, like theme-init.js is in
 * theme-css.test.mjs. .mjs for the same reason as that file: node:fs.
 */

const source = readFileSync(new URL('../../static/font-init.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	''
);

function boot({ lang = 'en', api = true, cachedInMemory = false } = {}) {
	const dataset = {};
	const docListeners = new Map();
	const loads = [];
	const pending = [];
	const frames = [];
	const timers = [];
	let loaded = cachedInMemory;

	const fonts = {
		load(font, text) {
			loads.push([font, text]);
			return new Promise((resolve, reject) => pending.push({ resolve, reject }));
		},
		check: () => loaded
	};
	const document = {
		documentElement: { dataset, lang },
		fonts: api ? fonts : undefined,
		addEventListener: (type, fn) => docListeners.set(type, fn)
	};

	new Function('document', 'window', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', source)(
		document,
		{ Promise },
		(fn) => frames.push(fn),
		(fn, ms) => timers.push({ fn, ms, live: true }) - 1,
		(id) => {
			if (timers[id]) timers[id].live = false;
		}
	);

	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
	return {
		dataset,
		loads,
		timers,
		/** Runs this frame's requestAnimationFrame callbacks, i.e. a frame gets drawn. */
		frame() {
			for (const fn of frames.splice(0)) fn();
		},
		async fontsArrive() {
			loaded = true;
			for (const p of pending) p.resolve([]);
			await flush();
		},
		landWithoutCallback() {
			loaded = true;
		},
		async fontsFail() {
			for (const p of pending) p.reject(new Error('network'));
			await flush();
		},
		expire() {
			for (const t of timers.filter((t) => t.live)) {
				t.live = false;
				t.fn();
			}
		},
		focus: () => docListeners.get('focusin')?.()
	};
}

describe('font-init.js', () => {
	it('does nothing without the Font Loading API, so the page is simply visible', () => {
		expect(boot({ api: false }).dataset.fonts).toBeUndefined();
	});

	it('never hides anything when the faces are already in memory', () => {
		const page = boot({ cachedInMemory: true });
		expect(page.dataset.fonts).toBeUndefined();
	});

	it('shows the skeleton while the faces load', () => {
		expect(boot().dataset.fonts).toBe('loading');
	});

	it('switches straight to ready when the faces land before the first frame', async () => {
		const page = boot();
		await page.fontsArrive();
		expect(page.dataset.fonts).toBe('ready');
	});

	it('after a drawn frame, reveals through swap and stays there (each change restyles everything)', async () => {
		const page = boot();
		page.frame();
		await page.fontsArrive();
		expect(page.dataset.fonts).toBe('swap');
		page.frame();
		page.expire();
		expect(page.dataset.fonts).toBe('swap');
	});

	it('gives up 1.5 s after the first frame, and marks the faces late when they do arrive', async () => {
		const page = boot();
		page.frame();
		expect(page.timers.map((t) => t.ms)).toEqual([1500]);
		page.expire();
		expect(page.dataset.fonts).toBe('fallback');
		await page.fontsArrive();
		expect(page.dataset.fonts).toBe('late');
	});

	it('at the timeout, reveals rather than gives up when the faces are in but their callback is still queued', () => {
		const page = boot();
		page.frame();
		page.landWithoutCallback();
		page.expire();
		expect(page.dataset.fonts).toBe('swap');
	});

	it('starts no timeout until a frame is drawn (a background tab draws none)', () => {
		expect(boot().timers).toEqual([]);
	});

	it('falls back when a face fails to load', async () => {
		const page = boot();
		page.frame();
		await page.fontsFail();
		expect(page.dataset.fonts).toBe('fallback');
	});

	it('stops waiting when keyboard focus arrives', () => {
		const page = boot();
		page.frame();
		page.focus();
		expect(page.dataset.fonts).toBe('fallback');
	});

	it('ignores the timeout once the faces have been revealed', async () => {
		const page = boot();
		page.frame();
		await page.fontsArrive();
		page.expire();
		expect(page.dataset.fonts).toBe('swap');
	});

	it.each([
		['en', ' '],
		['ar', ' '],
		['pnb', ' '],
		['vi', ' ạ']
	])('waits for both families with the subsets %s needs', (lang, text) => {
		expect(boot({ lang }).loads).toEqual([
			['1em Archivo', text],
			['1em Fraunces', text]
		]);
	});
});

describe('font-init.js agrees with app.css', () => {
	const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
		family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
		display: /font-display:\s*([a-z]+)/.exec(body)?.[1],
		file: /url\('\.\/fonts\/([^']+)'\)/.exec(body)?.[1],
		ranges: [...(/unicode-range:([^;]+)/.exec(body)?.[1] ?? '').matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)].map(
			([, a, b]) => [parseInt(a, 16), parseInt(b ?? a, 16)]
		)
	}));
	const covers = (face, ch) => face.ranges.some(([a, b]) => ch >= a && ch <= b);

	it('found the six faces', () => {
		expect(faces.map((f) => f.file)).toHaveLength(6);
	});

	it.each(['Archivo', 'Fraunces'])('%s: latin is declared last, so it wins where ranges overlap', (family) => {
		// The face declared last is tried first. Latin-first ordering made the
		// French œ (U+0153) download latin-ext, which latin already covers.
		const files = faces.filter((f) => f.family === family).map((f) => f.file);
		expect(files.at(-1)).toMatch(/-latin\.woff2$/);
		const tried = faces.filter((f) => f.family === family).reverse();
		expect(tried.find((f) => covers(f, 0x153))?.file).toMatch(/-latin\.woff2$/);
	});

	it('the vietnamese sample character selects the vietnamese subset of each family', () => {
		for (const family of ['Archivo', 'Fraunces']) {
			const tried = faces.filter((f) => f.family === family).reverse();
			expect(tried.find((f) => covers(f, 0x1ea1))?.file).toMatch(/-vietnamese\.woff2$/);
			expect(tried.find((f) => covers(f, 0x20))?.file).toMatch(/-latin\.woff2$/);
		}
	});

	it('the awaited faces are swap, never optional (Chrome holds first paint for a preloaded optional face)', () => {
		for (const f of faces.filter((f) => /-(latin|vietnamese)\.woff2$/.test(f.file))) {
			expect(f.display, f.file).toBe('swap');
		}
	});

	it('only the never-awaited latin-ext faces stay optional', () => {
		for (const f of faces.filter((f) => /-latin-ext\.woff2$/.test(f.file))) {
			expect(f.display, f.file).toBe('optional');
		}
	});
});
