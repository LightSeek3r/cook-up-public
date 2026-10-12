import type { Component } from 'svelte';

export interface DiagramProps {
	rtl?: boolean;
	label: string;
}

export type DiagramComponent = Component<DiagramProps>;

// Lazy, so each drawing is its own chunk and only the one a page shows is fetched.
const modules = import.meta.glob<{ default: DiagramComponent }>(
	'/src/components/glossary/diagrams/*.svelte'
);

const loaders = new Map(
	Object.entries(modules).map(([path, load]) => [
		path.slice(path.lastIndexOf('/') + 1, -'.svelte'.length),
		load
	])
);

/** The drawing for a diagrams.json id, or undefined when none is drawn under that id. */
export async function loadDiagram(id: string): Promise<DiagramComponent | undefined> {
	const load = loaders.get(id);
	if (!load) return undefined;
	return (await load()).default;
}
