import { error } from '@sveltejs/kit';
import { getDiagramInfo, getEntry } from '$lib/glossary/load';
import { resolveLang } from '$lib/i18n';
import { messagesFor } from '$lib/i18n/messages.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const lang = resolveLang(url.searchParams.get('lang'));
	const entry = await getEntry(lang, params.slug);
	if (!entry) error(404, messagesFor(lang)['glossary.notFound']);

	// Related terms render as chips, so only what a chip needs crosses the wire.
	const related = (await Promise.all(entry.related.map((id) => getEntry(lang, id)))).flatMap(
		(other) => (other ? [{ id: other.id, category: other.category, name: other.text.name }] : [])
	);

	const diagramInfo = entry.diagram ? await getDiagramInfo(entry.diagram) : undefined;

	return { lang, entry, related, diagramInfo };
};
