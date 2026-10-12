export const CATEGORY_IDS = [
	'knife-cuts',
	'dry-heat',
	'moist-heat',
	'prep-mixing',
	'sauces-emulsions',
	'dough-bread',
	'pastry-sweets',
	'modernist',
	'preservation',
	'fermentation',
	'meat-fish'
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

/** Language-neutral half of a term, from terms.json. `id` is the immutable URL slug. */
export interface TermMeta {
	id: string;
	/** English name; must equal content/en.json[id].name */
	en: string;
	category: CategoryId;
	/** Original-language terms and synonyms ("sauter", "chiffonade") searched in every UI language */
	aliases: string[];
	/** Other term ids, at most 6, never self */
	related: string[];
	/** Id in diagrams.json; its component lives in src/components/glossary/diagrams/<id>.svelte */
	diagram?: string;
}

/** Per-language half of a term, from content/<lang>.json. Plain text only. */
export interface TermText {
	name: string;
	/** one sentence, at most 160 chars */
	short: string;
	/** 1-3 paragraphs separated by a blank line (two "\n" characters in the JSON string) */
	long: string;
	/** one entry per diagram mark when the term has a diagram */
	steps?: string[];
	tips?: string[];
	/** local-language synonyms, e.g. es "saltear" */
	aliases?: string[];
	/** one full sentence describing the drawing; present iff the term has a diagram */
	diagramAlt?: string;
}

export type GlossaryEntry = TermMeta & { text: TermText };

/** What the list page renders and searches; the long text, steps and tips stay on the server. */
export type GlossarySummary = Pick<TermMeta, 'id' | 'en' | 'category' | 'aliases' | 'diagram'> & {
	text: Pick<TermText, 'name' | 'short' | 'aliases'>;
};

export interface DiagramInfo {
	id: string;
	/** number of numbered marks drawn, equals steps.length of every term using it */
	marks: number;
	/** true when left-to-right order or arrows mean something, so RTL mirrors it */
	directional: boolean;
	/** false while the component is not yet drawn */
	drawn: boolean;
}
