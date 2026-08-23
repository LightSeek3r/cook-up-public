/**
 * Minimal wikitext handling for Wikibooks Cookbook pages — just enough to
 * pull structured data out of a fairly disciplined corpus (one infobox
 * template, two headed list sections, trailing category tags). Not a
 * general-purpose wikitext parser.
 */

/** Resolves [[X|Y]] -> Y, [[X]] -> X (namespace prefix stripped), drops
 *  [[File:...]]/[[Image:...]], expands the two templates Cookbook recipes
 *  actually use inline ({{cb|X}} — a shorthand Cookbook: link — and
 *  {{convert|N|from|to|...}} — a unit-conversion display), strips '' / '''
 *  emphasis and HTML comments. */
export function stripWikitext(text) {
	if (!text) return '';
	return text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\[\[\s*(?:File|Image):[^\]]*\]\]/gi, '')
		.replace(/\{\{\s*cb\s*\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '$1')
		.replace(/\{\{\s*convert\s*\|([^|}]+)\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '$1 $2')
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, (_, target) => target.replace(/^[^:]+:/, ''))
		.replace(/'''([^']*)'''/g, '$1')
		.replace(/''([^']*)''/g, '$1')
		.replace(/<[^>]+>/g, '')
		.trim();
}

/**
 * Extracts {{TemplateName | key = value | ... }} params. Depth-tracks [[ ]]
 * and {{ }} so a pipe inside a wikilink (e.g. "[[File:X|280px]]") doesn't get
 * mistaken for a param separator. `namePattern` matches the template name
 * with internal whitespace collapsed (case-insensitive).
 */
export function parseTemplateParams(wikitext, namePattern) {
	const nameRe = new RegExp(`\\{\\{\\s*${namePattern}\\s*(?:\\||\\}\\})`, 'i');
	const start = wikitext.search(nameRe);
	if (start === -1) return null;

	const openLen = wikitext.slice(start).match(nameRe)[0].length;
	let i = start + openLen;
	let depth = 1; // we're already inside the outer {{ }}
	let linkDepth = 0;
	let segment = '';
	const segments = [];

	for (; i < wikitext.length && depth > 0; i++) {
		const two = wikitext.slice(i, i + 2);
		if (two === '{{') {
			depth++;
			segment += two;
			i++;
			continue;
		}
		if (two === '}}') {
			depth--;
			if (depth === 0) break;
			segment += two;
			i++;
			continue;
		}
		if (two === '[[') {
			linkDepth++;
			segment += two;
			i++;
			continue;
		}
		if (two === ']]') {
			linkDepth = Math.max(0, linkDepth - 1);
			segment += two;
			i++;
			continue;
		}
		if (wikitext[i] === '|' && depth === 1 && linkDepth === 0) {
			segments.push(segment);
			segment = '';
			continue;
		}
		segment += wikitext[i];
	}
	segments.push(segment);

	const params = {};
	for (const raw of segments) {
		const eq = raw.indexOf('=');
		if (eq === -1) continue;
		const key = raw.slice(0, eq).trim().toLowerCase();
		const value = stripWikitext(raw.slice(eq + 1).trim());
		if (key) params[key] = value;
	}
	return params;
}

/** Text between `== Header ==` (first level-2 header whose text matches
 *  `names`, case-insensitive) and the next heading at level <= 2, or end of
 *  text. A level-3+ subsection (`=== Filling ===`, common in multi-component
 *  recipes — a crust/filling/meringue breakdown, say) is content *within*
 *  the section, not a boundary: matched here only to be skipped, never
 *  mistaken for the terminator. An earlier version matched any `==...==`-
 *  shaped line regardless of how many `=` it actually had, so the first
 *  subsection heading silently ended the section right there — usually
 *  leaving zero bullets/steps and dropping the whole recipe (confirmed
 *  against the real corpus: 440/3,824 pages have a subsection inside
 *  `==Ingredients==` alone). */
export function extractSection(wikitext, names) {
	const wanted = new Set(names.map((n) => n.toLowerCase()));
	return extractSectionWhere(wikitext, (heading) => wanted.has(heading.toLowerCase()));
}

/**
 * `extractSection`, but the heading is chosen by predicate instead of by an exact
 * name list — for sections whose title the corpus spells many different ways.
 * "Notes, tips, and variations" alone appears under two dozen spellings
 * (word-order swaps, `&` for "and", casing, and outright typos like
 * "variatons"), which an exact-match list can only ever chase after the fact.
 */
export function extractSectionWhere(wikitext, matches) {
	const lines = wikitext.split('\n');
	let start = -1;
	let end = lines.length;
	for (let i = 0; i < lines.length; i++) {
		const heading = lines[i].match(/^(=+)\s*(.+?)\s*=+\s*$/);
		if (!heading || heading[1].length > 2) continue;
		if (start === -1 && heading[1].length === 2 && matches(heading[2])) {
			start = i + 1;
			continue;
		}
		if (start !== -1) {
			end = i;
			break;
		}
	}
	if (start === -1) return null;
	return lines.slice(start, end).join('\n');
}

/** `* line` bullets (any nesting depth of leading `*`), in order. */
export function extractBullets(sectionText) {
	if (!sectionText) return [];
	return sectionText
		.split('\n')
		.map((line) => line.match(/^\*+\s*(.+)$/))
		.filter(Boolean)
		.map((m) => m[1].trim());
}

/** `# line` numbered steps (any nesting depth of leading `#`), in order. */
export function extractNumbered(sectionText) {
	if (!sectionText) return [];
	return sectionText
		.split('\n')
		.map((line) => line.match(/^#+\s*(.+)$/))
		.filter(Boolean)
		.map((m) => m[1].trim());
}

/**
 * Every `[[File:...]]` / `[[Image:...]]` filename on the page, in appearance
 * order, deduped — the infobox's lead image first, since it appears first.
 *
 * Read from the RAW wikitext on purpose. The infobox does carry an `image=`
 * parameter, but `parseTemplateParams` runs every value through
 * `stripWikitext`, which deletes File/Image links outright — so
 * `summary.image` has always come back as the empty string. The data was
 * fetched, parsed, and destroyed one line later.
 *
 * Returns bare filenames without the namespace prefix, since that is what the
 * MediaWiki imageinfo API wants prefixed back on as `File:`.
 */
export function extractImageFiles(wikitext) {
	if (!wikitext) return [];
	const out = [];
	const seen = new Set();
	for (const m of wikitext.matchAll(/\[\[\s*(?:File|Image)\s*:\s*([^\]|]+)/gi)) {
		const name = m[1].trim().replace(/_/g, ' ');
		// Only still-image formats: the corpus also links a .webm and an .ogv.
		if (!/\.(jpe?g|png|gif|webp)$/i.test(name)) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
	}
	return out;
}

/** All `[[Category:Name]]` tags anywhere in the page, in appearance order. */
export function extractCategories(wikitext) {
	const out = [];
	const re = /\[\[Category:([^\]|]+)/gi;
	let m;
	while ((m = re.exec(wikitext))) out.push(m[1].trim());
	return out;
}

/** Every `[[Cookbook:Target|...]]` / `{{cb|Target}}` (its template shorthand)
 *  link target in a line, in source order. An ingredient's name is routinely
 *  split across several links — `½ [[Cookbook:Cup|cup]] [[Cookbook:Tomato|
 *  tomato]] [[Cookbook:Puree|puree]]` — so no individual link is the
 *  ingredient's identity on its own, and picking any single one of them
 *  discards part of the name. Callers score the readings they can build from
 *  the whole list instead. */
export function extractCookbookLinks(line) {
	if (!line) return [];
	return [...line.matchAll(/\[\[Cookbook:([^\]|]+)|\{\{\s*cb\s*\|([^|}]+)/gi)]
		.map((m) => (m[1] ?? m[2]).trim())
		.filter(Boolean);
}

/** The last of `extractCookbookLinks`, or null. Unit words ("cup",
 *  "teaspoon") link to their own Cookbook: glossary pages too and
 *  consistently appear *before* the ingredient, so of the individual links
 *  the last one is the best single guess. Retained for callers that want one
 *  string, but note what it costs: on `[[cup]] [[tomato]] [[puree]]` it
 *  returns "Puree" and silently drops "Tomato". Ingredient matching therefore
 *  uses the full list — see `candidateReadings` in stage 03. */
export function extractCookbookLink(line) {
	return extractCookbookLinks(line).at(-1) ?? null;
}
