import { loadDiagram } from '$lib/glossary/diagrams';
import type { PageLoad } from './$types';

// Universal on top of the server load because a component cannot be serialised:
// the drawing is the one piece imported in the browser, as its own small chunk.
export const load: PageLoad = async ({ data }) => {
	const { diagramInfo, ...rest } = data;
	// `drawn` gates the registry lookup: a diagram can be declared in
	// diagrams.json before its component exists, and that must degrade to the
	// plain step list rather than a missing-module error.
	const component =
		diagramInfo?.drawn && rest.entry.diagram ? await loadDiagram(rest.entry.diagram) : undefined;
	return { ...rest, diagram: diagramInfo && component ? { info: diagramInfo, component } : undefined };
};
