#!/usr/bin/env node
// Renders the raster brand assets in static/ from static/favicon.svg and the
// light Atelier tokens in src/app.css: apple-touch-icon.png (180), icon-192.png,
// icon-512.png (maskable) and og-image.png (1200x630). PNGs cannot read a CSS
// token, so rerun this after changing the mark or the palette:
//
//   node scripts/gen-brand-icons.mjs [--extras=<dir>]
//
// --extras also writes cookup-mark.svg (the mark alone, no tile) and
// miniature-512.png (the favicon tile at 512, transparent corners) for reuse
// outside this repo.
//
// Pages are loaded from file:// so the self-hosted fonts and Noto emoji in src/
// resolve; about:blank (page.setContent) is not allowed to read file:// URLs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(ROOT, ...p);
const url = (...p) => pathToFileURL(at(...p)).href;

const css = fs.readFileSync(at('src/app.css'), 'utf8');
/** First declaration of a custom property: the light :root palette comes first. */
const token = (name) => {
	const m = css.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'));
	if (!m) throw new Error(`--${name} not found in src/app.css`);
	return m[1].trim();
};
const T = {
	bg: token('bg'),
	surface: token('surface'),
	ink: token('ink'),
	muted: token('muted'),
	line: token('line-strong'),
	primary: token('primary'),
	tex: token('tex'),
	shadow1: token('shadow-1'),
	shadow2: token('shadow-2')
};

const favicon = fs.readFileSync(at('static/favicon.svg'), 'utf8');
const stop = (cls) => {
	const m = favicon.match(new RegExp(`\\.${cls} \\{ stop-color: (#[0-9a-f]+); \\}`));
	if (!m) throw new Error(`.${cls} stop colour not found in static/favicon.svg`);
	return m[1];
};
const TILE_TOP = stop('top');
const TILE_FOOT = stop('foot');

/** The favicon minus its tile and its dark-scheme block: the light mark alone. */
const bareMark = (viewBox) => {
	const tile = /\s*<rect class="edge"[^>]*\/>/;
	const dark = /\s*@media \(prefers-color-scheme: dark\) \{[^}]*(\}[^}]*)*?\}\s*\}/;
	const defs = /\s*<defs>[\s\S]*?<\/defs>/;
	for (const re of [tile, dark, defs]) if (!re.test(favicon)) throw new Error(`favicon.svg no longer matches ${re}`);
	return favicon
		.replace(tile, '')
		.replace(dark, '')
		.replace(/\s*\.(top|foot|edge) \{[^}]*\}/g, '')
		.replace(defs, '')
		.replace('viewBox="0 0 32 32"', `viewBox="${viewBox}"`);
};

const { title, tagline } = (() => {
	// The bundles are stored with a UTF-8 BOM, which JSON.parse rejects.
	const en = JSON.parse(fs.readFileSync(at('src/lib/i18n/en.json'), 'utf8').replace(/^﻿/, ''));
	return { title: en['app.title'], tagline: en['app.tagline'] };
})();

const FONTS = `
@font-face { font-family: 'Fraunces'; font-weight: 100 900; src: url('${url('src/fonts/fraunces-latin.woff2')}') format('woff2'); }
@font-face { font-family: 'Archivo'; font-weight: 100 900; src: url('${url('src/fonts/archivo-latin.woff2')}') format('woff2'); }`;

const page = (w, h, style, body) => `<!doctype html><meta charset="utf-8"><style>${FONTS}
html, body { margin: 0; padding: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: transparent; }
${style}</style>${body}`;

const MARK = bareMark('0 0 32 32');
const markImg = `data:image/svg+xml,${encodeURIComponent(MARK)}`;

/** Full-bleed inox square with the mark at `scale` of the side (launchers mask it). */
const squareIcon = (size, scale) =>
	page(
		size,
		size,
		`.tile { width: ${size}px; height: ${size}px; display: grid; place-items: center;
		  background: linear-gradient(180deg, ${TILE_TOP}, ${TILE_FOOT}); }
		 img { width: ${Math.round(size * scale)}px; height: ${Math.round(size * scale)}px; display: block; }`,
		`<div class="tile"><img src="${markImg}" alt=""></div>`
	);

/** The favicon itself (rounded tile, transparent corners). */
const roundedIcon = (size) =>
	page(size, size, `img { width: ${size}px; height: ${size}px; display: block; }`, `<img src="${url('static/favicon.svg')}" alt="">`);

const OG_W = 1200;
const OG_H = 630;
const EMOJI = ['1f345', '1f9c5', '1f955', '1f357'];
const og = page(
	OG_W,
	OG_H,
	`.card { width: ${OG_W}px; height: ${OG_H}px; box-sizing: border-box; display: flex; align-items: center;
	   gap: 72px; padding: 0 104px;
	   background: ${T.tex}, linear-gradient(180deg, #f6f7f7 0%, ${T.bg} 46%, #d9dde1 100%); }
	 .badge { flex: none; width: 232px; height: 232px; border-radius: ${Math.round((232 * 7) / 32)}px;
	   box-shadow: ${T.shadow2}; }
	 .badge img { display: block; width: 232px; height: 232px; }
	 h1 { font-family: 'Fraunces', serif; font-weight: 650; font-size: 112px; line-height: 1; letter-spacing: -0.02em;
	   margin: 0 0 22px; color: ${T.ink}; }
	 p { font-family: 'Archivo', system-ui, sans-serif; font-size: 36px; line-height: 1.35; margin: 0; color: ${T.muted};
	   max-width: 660px; }
	 .rule { width: 72px; height: 5px; border-radius: 3px; background: ${T.primary}; margin: 0 0 26px; }
	 .row { display: flex; gap: 18px; margin-top: 40px; }
	 .medal { width: 78px; height: 78px; border-radius: 50%; display: grid; place-items: center;
	   background: ${T.surface}; border: 1px solid ${T.line}; box-shadow: ${T.shadow1}; }
	 .medal img { width: 50px; height: 50px; display: block; }`,
	`<div class="card">
	  <div class="badge"><img src="${url('static/favicon.svg')}" alt=""></div>
	  <div>
	    <div class="rule"></div>
	    <h1>${title}</h1>
	    <p>${tagline.replace('. ', '.<br>')}</p>
	    <div class="row">${EMOJI.map((e) => `<div class="medal"><img src="${url(`src/lib/emoji/${e}.svg`)}" alt=""></div>`).join('')}</div>
	  </div>
	</div>`
);

// sharp is optional (it only arrives through wrangler's miniflare): without it
// the PNGs are written exactly as Chromium encoded them.
let sharp = null;
try {
	sharp = (await import('sharp')).default;
} catch {
	console.warn('  sharp not available: writing unoptimised PNGs');
}
const optimise = async (buf, { palette }) => {
	if (!sharp) return buf;
	// The brushed grain is noise: lossless, og-image is ~240 KB. Quality 85 keeps
	// it ~125 KB with no visible banding; 65 already dithers the rim and emoji.
	const png = palette
		? { palette: true, colours: 256, dither: 0.8, quality: 85, effort: 10, compressionLevel: 9 }
		: { compressionLevel: 9, adaptiveFiltering: true };
	return sharp(buf).png(png).toBuffer();
};

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cookup-brand-'));
const browser = await chromium.launch();
const shoot = async (html, w, h, file, { palette = false } = {}) => {
	const htmlFile = path.join(tmp, `${path.basename(file)}.html`);
	fs.writeFileSync(htmlFile, html);
	const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'light' });
	await p.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
	await p.evaluate(() => document.fonts.ready);
	const broken = await p.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
	if (broken.length) throw new Error(`images failed to load in ${file}: ${broken.join(', ')}`);
	const buf = await optimise(await p.screenshot({ omitBackground: true }), { palette });
	await p.close();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, buf);
	console.log(`  wrote ${path.relative(ROOT, file)}  ${w}x${h}  ${buf.length} bytes`);
};

try {
	// iOS and maskable launchers cut their own shape, so these two are full-bleed.
	// The mark's furthest point (a steam cap) is 13.4 of 32 units from the centre:
	// at 0.875 it sits at 187 px of 512, inside the 205 px maskable safe circle.
	await shoot(squareIcon(180, 0.875), 180, 180, at('static/apple-touch-icon.png'));
	await shoot(roundedIcon(192), 192, 192, at('static/icon-192.png'));
	await shoot(squareIcon(512, 0.875), 512, 512, at('static/icon-512.png'));
	await shoot(og, OG_W, OG_H, at('static/og-image.png'), { palette: true });
	if (args.extras) {
		const dir = path.resolve(args.extras);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'cookup-mark.svg'), bareMark('2 2 28 28'));
		console.log(`  wrote ${path.join(dir, 'cookup-mark.svg')}`);
		await shoot(roundedIcon(512), 512, 512, path.join(dir, 'miniature-512.png'));
	}
} finally {
	await browser.close();
	fs.rmSync(tmp, { recursive: true, force: true });
}
