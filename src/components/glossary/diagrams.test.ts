import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import diagramsJson from '$lib/glossary/diagrams.json';
import { loadDiagram, type DiagramComponent } from '$lib/glossary/diagrams';
import type { DiagramInfo } from '$lib/glossary/types';

const diagrams = diagramsJson as DiagramInfo[];

// ?raw, because the rules below are about what is written in the files, not what renders.
const sources = import.meta.glob<string>('/src/components/glossary/diagram*/*.svelte', {
	query: '?raw',
	import: 'default',
	eager: true
});
const components = import.meta.glob<{ default: DiagramComponent }>(
	'/src/components/glossary/diagrams/*.svelte',
	{ eager: true }
);

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.svelte'.length);
const drawnIds = Object.keys(components).map(basename).sort();
const sourceOf = (id: string) => sources[`/src/components/glossary/diagrams/${id}.svelte`];

/** The template only: the component's own <script> and <style> blocks removed. */
const markupOf = (src: string) =>
	src.replace(/<script\b[^>]*>[\s\S]*?<\/script>/, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/, '');

describe('diagram sources', () => {
	it('found the primitives and the drawings', () => {
		const files = Object.keys(sources).map(basename);
		expect(files).toEqual(expect.arrayContaining(['DiagramFrame', 'Mark', 'Arrow', 'sous-vide']));
	});

	describe.each(Object.entries(sources))('%s', (path, src) => {
		const markup = markupOf(src);

		it('uses theme tokens only: no hex, rgb() or hsl() colour literals', () => {
			expect(src).not.toMatch(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
			expect(src).not.toMatch(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i);
		});

		it('sets fill and stroke attributes only to none, currentColor, a token or a local url', () => {
			for (const [, value] of markup.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)) {
				expect(value).toMatch(/^(?:none|currentColor|var\(--[\w-]+\)|url\(#[^)]*\))$/);
			}
		});

		it('does not draw meaning in --line or --line-strong (under 3:1 on the surface)', () => {
			expect(src).not.toMatch(/var\(--line(?:-strong)?\)/);
		});

		it('is text-free apart from the digit inside Mark', () => {
			const texts = [...markup.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
			if (path.endsWith('/Mark.svelte')) expect(texts).toEqual(['{n}']);
			else expect(texts).toEqual([]);
			expect(markup).not.toMatch(/<(?:tspan|textPath|foreignObject)\b/);
		});

		it('loads nothing external and runs no script inside the drawing', () => {
			expect(markup).not.toMatch(/<(?:script|image|img|iframe|use)\b/i);
			for (const [, value] of markup.matchAll(/\b(?:xlink:)?href="([^"]*)"/g)) {
				expect(value.startsWith('#')).toBe(true);
			}
			for (const [, value] of src.matchAll(/url\(([^)]*)\)/g)) {
				expect(value.startsWith('#')).toBe(true);
			}
			expect(markup).not.toMatch(/\son\w+=/);
		});

		it('has no animation (none in v1)', () => {
			expect(src).not.toMatch(/<(?:animate|animateTransform|animateMotion|set)\b|@keyframes|\banimation\s*:|\btransition\s*:/);
		});
	});
});

describe('diagrams.json and the drawn components agree', () => {
	it('is a list of well-formed entries with unique ids', () => {
		const ids = diagrams.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const d of diagrams) {
			expect(d.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(Number.isInteger(d.marks) && d.marks >= 1 && d.marks <= 9, d.id).toBe(true);
			expect(typeof d.directional, d.id).toBe('boolean');
			expect(typeof d.drawn, d.id).toBe('boolean');
		}
	});

	it('every drawn: true entry has a component file', () => {
		const missing = diagrams.filter((d) => d.drawn && !drawnIds.includes(d.id)).map((d) => d.id);
		expect(missing).toEqual([]);
	});

	it.each(drawnIds)('%s has a diagrams.json entry marked drawn: true', (id) => {
		expect(diagrams.find((d) => d.id === id)?.drawn).toBe(true);
	});

	it.each(drawnIds)('%s passes the same directional flag to DiagramFrame as diagrams.json', (id) => {
		const entry = diagrams.find((d) => d.id === id);
		const declared = /<DiagramFrame\b[^>]*\bdirectional=\{true\}/.test(sourceOf(id));
		expect(declared).toBe(entry?.directional ?? false);
	});
});

describe.each(drawnIds)('the rendered %s drawing', (id) => {
	const Diagram = components[`/src/components/glossary/diagrams/${id}.svelte`].default;
	const entry = diagrams.find((d) => d.id === id);
	const ltr = render(Diagram, { props: { label: 'Alt sentence', rtl: false } }).body;
	const rtl = render(Diagram, { props: { label: 'Alt sentence', rtl: true } }).body;

	it('is one labelled image', () => {
		expect(ltr.match(/<svg\b/g)).toHaveLength(1);
		expect(ltr).toMatch(/<svg[^>]*\brole="img"/);
		expect(ltr).toMatch(/<svg[^>]*\baria-label="Alt sentence"/);
	});

	it('numbers its marks 1..marks, in order, with Western digits only', () => {
		const digits = [...ltr.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].trim());
		expect(digits).toEqual(Array.from({ length: entry?.marks ?? 0 }, (_, i) => String(i + 1)));
	});

	it('mirrors under RTL exactly when it is directional, keeping digits readable', () => {
		const mirror = 'matrix(-1 0 0 1 240 0)';
		expect(ltr).not.toContain(mirror);
		expect(ltr).not.toContain('scale(-1 1)');
		if (entry?.directional) {
			expect(rtl).toContain(mirror);
			expect(rtl.match(/translate\([^)]*\) scale\(-1 1\)/g)).toHaveLength(entry.marks);
		} else {
			expect(rtl).toBe(ltr);
		}
	});

	it('gives every element id a reference that resolves inside the same drawing', () => {
		const ids = [...ltr.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const [, ref] of ltr.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(ref);
	});
});

describe('loadDiagram', () => {
	it('resolves a drawn component by id', async () => {
		expect(typeof (await loadDiagram('sous-vide'))).toBe('function');
		expect(typeof (await loadDiagram('spherification'))).toBe('function');
	});

	it('returns undefined for an unknown id', async () => {
		expect(await loadDiagram('nope')).toBeUndefined();
		expect(await loadDiagram('../diagram/Mark')).toBeUndefined();
	});
});
