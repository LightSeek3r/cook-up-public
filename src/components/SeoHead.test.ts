import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SeoHead from './SeoHead.svelte';
import { SUPPORTED_LANGS, type Lang } from '$lib/config';

function head(path: string, lang: Lang, noindex = false) {
	return render(SeoHead, {
		props: { title: 'T', description: 'D', url: new URL(`https://cook.example${path}`), lang, noindex }
	}).head;
}

const links = (html: string, rel: string) =>
	[...html.matchAll(new RegExp(`<link rel="${rel}"([^>]*)>`, 'g'))].map((m) => ({
		hreflang: m[1].match(/hreflang="([^"]+)"/)?.[1],
		href: m[1].match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&')
	}));

describe('SeoHead', () => {
	it('keeps ?lang in the canonical, and drops every filter parameter', () => {
		const html = head('/glossary?lang=fr&q=sous&cat=modernist', 'fr');
		expect(links(html, 'canonical')).toEqual([
			{ hreflang: undefined, href: 'https://cook.example/glossary?lang=fr' }
		]);
		expect(html).toContain('property="og:url" content="https://cook.example/glossary?lang=fr"');
	});

	it('gives English, the default, the bare URL', () => {
		expect(links(head('/recipe/488?lang=en&x=1', 'en'), 'canonical')[0].href).toBe(
			'https://cook.example/recipe/488'
		);
	});

	it('lists one alternate per language plus x-default, all on the same path', () => {
		const alternates = links(head('/?have=onion&lang=ar', 'ar'), 'alternate');
		expect(alternates).toHaveLength(SUPPORTED_LANGS.length + 1);
		expect(alternates).toContainEqual({ hreflang: 'x-default', href: 'https://cook.example/' });
		expect(alternates).toContainEqual({ hreflang: 'en', href: 'https://cook.example/' });
		expect(alternates).toContainEqual({ hreflang: 'ar', href: 'https://cook.example/?lang=ar' });
		expect(alternates).toContainEqual({ hreflang: 'pa-Arab', href: 'https://cook.example/?lang=pnb' });
		expect(alternates).toContainEqual({ hreflang: 'zh-Hans', href: 'https://cook.example/?lang=zh' });
		expect(new Set(alternates.map((a) => a.hreflang)).size).toBe(alternates.length);
	});

	it('marks noindex pages and gives them no canonical or alternates', () => {
		const html = head('/favorites?lang=de', 'de', true);
		expect(html).toContain('<meta name="robots" content="noindex"');
		expect(links(html, 'canonical')).toEqual([]);
		expect(links(html, 'alternate')).toEqual([]);
	});
});
