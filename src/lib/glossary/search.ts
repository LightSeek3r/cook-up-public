import { normaliseQuery } from '$lib/search';
import type { CategoryId, GlossarySummary } from './types';

// Only these combining ranges are stripped, never all of \p{M}: Devanagari and
// Bengali vowel signs are marks too, and removing them would make every word
// collapse to its bare consonants.
//   U+0300-036F  Latin/Cyrillic/Greek accents; also what NFKD splits Arabic
//                alef-hamza/madda and Cyrillic yo into, so those fold for free
//   U+064B-065F, U+0670  Arabic harakat and hamza/madda marks
//   U+0640  tatweel
//   U+200C, U+200D  ZWNJ / ZWJ (typed inconsistently in Persian-script and Indic text)
//   U+093C, U+09BC  Devanagari / Bengali nukta, so U+095C (ड़) folds to ड
const STRIP = /[\u0300-\u036F\u064B-\u065F\u0670\u0640\u200C\u200D\u093C\u09BC]/g;

// Letters that survive NFKD unchanged and must be folded by hand. The
// Arabic-script entries are spellings people type interchangeably, each mapped
// to one canonical form.
const TABLE: Record<string, string> = {
	'\u00DF': 'ss', // sharp s
	'\u0111': 'd', // d with stroke
	'\u00F8': 'o', // o with stroke
	'\u00E6': 'ae',
	'\u0153': 'oe',
	'\u0142': 'l', // l with stroke
	'\u0131': 'i', // dotless i
	'\u0671': '\u0627', // alef wasla -> alef
	'\u0649': '\u064A', // alef maksura -> yeh
	'\u06CC': '\u064A', // Farsi/Shahmukhi yeh -> yeh
	'\u06D2': '\u064A', // yeh barree -> yeh
	'\u06A9': '\u0643', // keheh -> kaf
	'\u0629': '\u0647', // teh marbuta -> heh
	'\u06BE': '\u0647', // heh doachashmee (Shahmukhi aspirate marker) -> heh
	'\u06C1': '\u0647', // heh goal -> heh
	'\u06BA': '\u0646' // noon ghunna -> noon
};
const TABLE_RE = new RegExp(`[${Object.keys(TABLE).join('')}]`, 'g');

const KATAKANA = /[\u30A1-\u30F6]/g;

/**
 * Canonical comparison form for glossary text and queries. NFKC after the strip
 * recomposes everything that was not removed (Hangul syllables, kana with
 * dakuten, Indic conjuncts), so only the intended marks disappear.
 */
export function foldText(s: string): string {
	return s
		.normalize('NFKD')
		.replace(STRIP, '')
		.normalize('NFKC')
		.toLowerCase()
		.replace(TABLE_RE, (c) => TABLE[c])
		.replace(KATAKANA, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
		.replace(/\s+/g, ' ')
		.trim();
}

/** Marks stay inside tokens so Indic words are not split at their vowel signs. */
const tokenise = (folded: string): string[] =>
	folded.split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);

interface Doc {
	id: string;
	category: CategoryId;
	name: string;
	nameTokens: string[];
	/** space-joined nameTokens: lets "sous vide" equal "sous-vide" */
	nameNorm: string;
	aliases: string[];
	aliasTokens: string[];
	/** English name, searchable whatever the UI language */
	en: string;
	enTokens: string[];
	short: string;
	shortTokens: string[];
}

export interface GlossaryIndex {
	readonly docs: readonly Doc[];
}

export interface Hit {
	id: string;
	score: number;
}

export function buildIndex(entries: GlossarySummary[]): GlossaryIndex {
	return {
		docs: entries.map((e) => {
			const name = foldText(e.text.name);
			const nameTokens = tokenise(name);
			const aliases = [...(e.text.aliases ?? []), ...e.aliases].map(foldText).filter(Boolean);
			const en = foldText(e.en);
			const short = foldText(e.text.short);
			return {
				id: e.id,
				category: e.category,
				name,
				nameTokens,
				nameNorm: nameTokens.join(' '),
				aliases,
				aliasTokens: aliases.flatMap(tokenise),
				en,
				enTokens: tokenise(en),
				short,
				shortTokens: tokenise(short)
			};
		})
	};
}

// Strictly descending in the order scoreToken tests them, which is what lets it
// return on the first hit.
const TIER = {
	nameExact: 100,
	namePrefix: 80,
	nameWord: 70,
	aliasExact: 65,
	aliasPrefix: 60,
	nameSubstring: 50,
	aliasSubstring: 40,
	enPrefix: 35,
	enSubstring: 30,
	shortWord: 20,
	shortSubstring: 10
} as const;

const startsWithWord = (words: string[], t: string) => words.some((w) => w.startsWith(t));

/** Best tier this single token reaches on the doc, 0 for no match. */
function scoreToken(d: Doc, t: string): number {
	if (d.name === t || d.nameNorm === t) return TIER.nameExact;
	if (d.name.startsWith(t)) return TIER.namePrefix;
	if (startsWithWord(d.nameTokens, t)) return TIER.nameWord;
	if (d.aliases.includes(t)) return TIER.aliasExact;
	if (d.aliases.some((a) => a.startsWith(t)) || startsWithWord(d.aliasTokens, t))
		return TIER.aliasPrefix;
	if (d.name.includes(t)) return TIER.nameSubstring;
	if (d.aliases.some((a) => a.includes(t))) return TIER.aliasSubstring;
	if (d.en.startsWith(t) || startsWithWord(d.enTokens, t)) return TIER.enPrefix;
	if (d.en.includes(t)) return TIER.enSubstring;
	if (startsWithWord(d.shortTokens, t)) return TIER.shortWord;
	if (d.short.includes(t)) return TIER.shortSubstring;
	return 0;
}

/**
 * Multi-token queries are AND: every token must reach some tier. The score is the
 * sum of each token's best tier, plus a whole-phrase bonus so "sous vide" ranks
 * "Sous-vide" above a longer name that merely contains both words.
 */
export function search(index: GlossaryIndex, q: string, opts?: { cat?: CategoryId }): Hit[] {
	const cat = opts?.cat;
	const docs = cat ? index.docs.filter((d) => d.category === cat) : index.docs;
	const tokens = tokenise(foldText(normaliseQuery(q)));

	if (tokens.length === 0) return docs.map((d) => ({ id: d.id, score: 0 }));

	const phrase = tokens.join(' ');
	const scored: { d: Doc; score: number; order: number }[] = [];
	docs.forEach((d, order) => {
		let score = 0;
		for (const t of tokens) {
			const s = scoreToken(d, t);
			if (!s) return;
			score += s;
		}
		if (tokens.length > 1) {
			if (d.nameNorm === phrase) score += TIER.nameExact;
			else if (d.nameNorm.startsWith(phrase)) score += TIER.namePrefix;
		}
		scored.push({ d, score, order });
	});

	return scored
		.sort((a, b) => b.score - a.score || a.d.name.length - b.d.name.length || a.order - b.order)
		.map(({ d, score }) => ({ id: d.id, score }));
}
