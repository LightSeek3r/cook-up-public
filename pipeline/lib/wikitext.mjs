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

/** Text between `== Header ==` (first header whose text matches `names`,
 *  case-insensitive) and the next `==` heading, or end of text. */
export function extractSection(wikitext, names) {
	const lines = wikitext.split('\n');
	const wanted = new Set(names.map((n) => n.toLowerCase()));
	let start = -1;
	let end = lines.length;
	for (let i = 0; i < lines.length; i++) {
		const heading = lines[i].match(/^==\s*(.+?)\s*==\s*$/);
		if (!heading) continue;
		if (start === -1 && wanted.has(heading[1].toLowerCase())) {
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

/** All `[[Category:Name]]` tags anywhere in the page, in appearance order. */
export function extractCategories(wikitext) {
	const out = [];
	const re = /\[\[Category:([^\]|]+)/gi;
	let m;
	while ((m = re.exec(wikitext))) out.push(m[1].trim());
	return out;
}

/** Last `[[Cookbook:Target|...]]` / `{{cb|Target}}` (its template shorthand)
 *  link target in a line, if any. Unit words ("cup", "teaspoon") are linked
 *  to their own Cookbook: glossary pages too, and consistently appear before
 *  the ingredient — so the last link, not the first, is the reliable
 *  ingredient-identity signal. */
export function extractCookbookLink(line) {
	const matches = [...line.matchAll(/\[\[Cookbook:([^\]|]+)|\{\{\s*cb\s*\|([^|}]+)/gi)];
	if (!matches.length) return null;
	const last = matches.at(-1);
	return (last[1] ?? last[2]).trim();
}
