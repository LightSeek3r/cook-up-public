import type { Lang } from '$lib/config';
import terms from './terms.json';
import diagrams from './diagrams.json';
import type { DiagramInfo, GlossaryEntry, TermMeta, TermText } from './types';

type Content = Record<string, TermText>;

const TERMS = terms as TermMeta[];
const DIAGRAMS = diagrams as DiagramInfo[];

// Lazy: each content/<lang>.json becomes its own chunk, fetched only for the
// requested language (plus en, the per-term fallback).
const CONTENT = import.meta.glob<Content>('./content/*.json', { import: 'default' });

/** `lang` is already whitelisted by `resolveLang`, so the key can't be attacker-shaped. */
async function loadContent(lang: Lang): Promise<Content> {
	const load = CONTENT[`./content/${lang}.json`];
	return load ? await load() : {};
}

/**
 * Whole-TermText fallback per term, never field-by-field: a half-translated
 * entry (French name over English steps) would be worse than a clean English one.
 * Terms with no English text are dropped, since en is the reference every
 * other language is validated against.
 */
export function mergeEntries(
	metas: TermMeta[],
	en: Content,
	local: Content,
	lang: Lang
): GlossaryEntry[] {
	const entries: GlossaryEntry[] = [];
	for (const meta of metas) {
		const fallback = en[meta.id];
		if (!fallback) continue;
		entries.push({ ...meta, text: local[meta.id] ?? fallback });
	}
	const collator = new Intl.Collator(lang);
	const order = new Map(entries.map((e, i) => [e.id, i]));
	return entries.sort(
		(a, b) => collator.compare(a.text.name, b.text.name) || order.get(a.id)! - order.get(b.id)!
	);
}

// The promise is cached, not the array, so concurrent first requests share one load.
const cache = new Map<Lang, Promise<GlossaryEntry[]>>();

export function loadGlossary(lang: Lang): Promise<GlossaryEntry[]> {
	let hit = cache.get(lang);
	if (!hit) {
		hit = Promise.all([loadContent('en'), lang === 'en' ? undefined : loadContent(lang)]).then(
			([en, local]) => mergeEntries(TERMS, en, local ?? en, lang)
		);
		cache.set(lang, hit);
		hit.catch(() => cache.delete(lang));
	}
	return hit;
}

export async function getEntry(lang: Lang, id: string): Promise<GlossaryEntry | undefined> {
	// deliberate: linear scan, switch to a per-lang Map if the glossary grows past ~500 terms
	return (await loadGlossary(lang)).find((e) => e.id === id);
}

export function getTermIds(): string[] {
	return TERMS.map((t) => t.id);
}

export async function getDiagramInfo(id: string): Promise<DiagramInfo | undefined> {
	return DIAGRAMS.find((d) => d.id === id);
}
