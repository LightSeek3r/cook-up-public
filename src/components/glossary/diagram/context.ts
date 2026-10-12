import { getContext, setContext } from 'svelte';

export const DIAGRAM_CONTEXT = Symbol('glossary-diagram');

export interface DiagramContext {
	/** true while the drawing is mirrored for an RTL reader; marks counter-flip their digit */
	readonly flipped: boolean;
}

export function setDiagramContext(ctx: DiagramContext): void {
	setContext(DIAGRAM_CONTEXT, ctx);
}

export function getDiagramContext(): DiagramContext | undefined {
	return getContext<DiagramContext | undefined>(DIAGRAM_CONTEXT);
}
