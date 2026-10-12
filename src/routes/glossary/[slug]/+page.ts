import { error } from '@sveltejs/kit';
import { loadDiagram } from '$lib/glossary/diagrams';
import { getDiagramInfo, getEntry } from '$lib/glossary/load';
import type { GlossaryEntry } from '$lib/glossary/types';
import { resolveLang, t as translator } from '$lib/i18n';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
	const lang = resolveLang(url.searchParams.get('lang'));
	const entry = await getEntry(lang, params.slug);
	if (!entry) error(404, translator(lang)('glossary.notFound'));

	const related = (await Promise.all(entry.related.map((id) => getEntry(lang, id)))).filter(
		(other): other is GlossaryEntry => Boolean(other)
	);

	// `drawn` gates the registry lookup: a diagram can be declared in
	// diagrams.json before its component exists, and that must degrade to the
	// plain step list rather than a missing-module error.
	const info = entry.diagram ? await getDiagramInfo(entry.diagram) : undefined;
	const component = info?.drawn && entry.diagram ? await loadDiagram(entry.diagram) : undefined;

	return { lang, entry, related, diagram: info && component ? { info, component } : undefined };
};
