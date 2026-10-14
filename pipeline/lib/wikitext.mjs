/**
 * Minimal wikitext handling for Wikibooks Cookbook pages — just enough to
 * pull structured data out of a fairly disciplined corpus (one infobox
 * template, two headed list sections, trailing category tags). Not a
 * general-purpose wikitext parser.
 */

/** Stands in for removed markup until the spaces around it are tidied. */
const REMOVED = '\u0000';

/** Index of the `}}` closing the `{{` at `open`, or -1 when it never closes. */
function closingBraces(text, open) {
	let depth = 0;
	for (let i = open; i < text.length - 1; i++) {
		const two = text.slice(i, i + 2);
		if (two === '{{') {
			depth++;
			i++;
		} else if (two === '}}') {
			if (--depth === 0) return i;
			i++;
		}
	}
	return -1;
}

/** Splits a template's inner text on the pipes that are not inside a nested {{ }} or [[ ]]. */
function splitTemplateArgs(inner) {
	const parts = [];
	let depth = 0;
	let part = '';
	for (let i = 0; i < inner.length; i++) {
		const two = inner.slice(i, i + 2);
		if (two === '{{' || two === '[[') {
			depth++;
			part += two;
			i++;
		} else if ((two === '}}' || two === ']]') && depth > 0) {
			depth--;
			part += two;
			i++;
		} else if (inner[i] === '|' && depth === 0) {
			parts.push(part);
			part = '';
		} else part += inner[i];
	}
	parts.push(part);
	return parts;
}

const isNamedArg = (arg) => /^\s*[a-z][\w-]*\s*=/i.test(arg);

/** Maintenance, layout and infobox templates: nothing in them belongs in a recipe's text. */
const DROPPED_TEMPLATES = new Set(['clarify', 'how much', 'multiple image', 'recipe summary']);

const TEMPERATURE_SCALES = { f: (n) => `${n} °F`, c: (n) => `${n} °C`, gm: (n) => `gas mark ${n}` };

/**
 * The text a template stands for, REMOVED for one that is dropped, or
 * undefined to leave it as written (stripWikitext's regexes handle {{cb}} and
 * {{convert}}; anything unknown stays visible rather than being guessed at).
 * Module:Temperature and {{convert/N}} render a conversion on Wikibooks; only
 * the author's own value and unit are kept, as {{convert}} already is.
 */
function expandTemplate(inner, prev, after) {
	const [rawName, ...args] = splitTemplateArgs(inner);
	const name = rawName.trim().replace(/\s+/g, ' ').toLowerCase();
	if (DROPPED_TEMPLATES.has(name)) return REMOVED;
	if (name === '#invoke:temperature') {
		const [scale, value] = args.map((a) => a.trim());
		const render = TEMPERATURE_SCALES[scale?.toLowerCase()];
		return render && /^\d+(?:\.\d+)?$/.test(value ?? '') ? render(value) : undefined;
	}
	const dims = name.match(/^convert\/(\d)$/);
	if (dims) {
		const n = Number(dims[1]);
		const pos = args.filter((a) => !isNamedArg(a)).map((a) => a.trim());
		const values = Array.from({ length: n }, (_, i) => pos[2 * i]);
		const separators = Array.from({ length: n - 1 }, (_, i) => pos[2 * i + 1]);
		const unit = pos[2 * n - 1];
		if (!unit || values.some((v) => !/^\d+(?:\.\d+)?$/.test(v ?? '')) || separators.some((s) => !/^(?:x|×|by)$/i.test(s ?? ''))) return undefined;
		// Authors wrote "{{convert/3|13|x|9|x|2|in|cm}} [[Cookbook:Inch|inch]] pan": their own unit word follows, so the template gives only the numbers.
		const unitFollows = unit === 'in' && /^\s*(?:\[\[[^\]|]*\|)?inch(?:es)?\b/i.test(after);
		return values.join(' × ') + (unitFollows ? '' : ` ${unit}`);
	}
	if (name === 'efn') {
		const note = cleanWikitext(args.find((a) => !isNamedArg(a)) ?? '');
		return note ? parenthetical(note, prev) : REMOVED;
	}
	return undefined;
}

/** A footnote kept in the text, as ` (note)`, without doubling a space already before it. */
const parenthetical = (note, prev) => `${!prev || /\s$/.test(prev) ? '' : ' '}(${note})`;

/**
 * Whether a <ref> footnote is advice for the cook rather than a citation.
 * Authors put both in refs: "A crisp baguette is a good substitute." and
 * "Always check well for chips or cracks and discard if found." sit beside
 * {{Cite web}} templates, bare URLs and "The Brown Derby Cookbook [...] 1949
 * (p. 183)". Advice is written as sentences; a citation carries a URL or a
 * template, is nothing but a link, or does not end like a sentence.
 */
function isAdviceFootnote(raw) {
	const body = raw.trim().replace(/'+$/, '');
	if (!body || /https?:\/\/|\{\{|\[http/i.test(body) || /^\[\[[^\]]*\]\]$/.test(body)) return false;
	return /[.!?]$/.test(body);
}

/** Every top-level template of `text` passed through expandTemplate; an unclosed one stays as written. */
function expandTemplates(text) {
	let out = '';
	let i = 0;
	for (let open = text.indexOf('{{'); open !== -1; open = text.indexOf('{{', i)) {
		const close = closingBraces(text, open);
		if (close === -1) break;
		out += text.slice(i, open);
		const raw = text.slice(open, close + 2);
		i = close + 2;
		out += expandTemplate(raw.slice(2, -2), out, text.slice(i)) ?? raw;
	}
	return out + text.slice(i);
}

/** Drops [[File:...]]/[[Image:...]] links, including any [[links]] nested in their caption. */
function dropFileLinks(text) {
	const start = /\[\[\s*(?:File|Image):/gi;
	let out = '';
	let i = 0;
	for (let m = start.exec(text); m; m = start.exec(text)) {
		let depth = 0;
		let end = -1;
		for (let j = m.index; j < text.length - 1; j++) {
			const two = text.slice(j, j + 2);
			if (two === '[[') {
				depth++;
				j++;
			} else if (two === ']]') {
				j++;
				if (--depth === 0) {
					end = j + 1;
					break;
				}
			}
		}
		if (end === -1) break;
		out += text.slice(i, m.index);
		i = end;
		start.lastIndex = end;
	}
	return out + text.slice(i);
}

/** One space where removed markup sat between two words, none before punctuation or at an edge. */
function closeGaps(text) {
	return text.replace(/ *(?:\u0000 *)+/g, (gap, offset) => {
		const next = text[offset + gap.length];
		return gap.includes(' ') && next !== undefined && !/[.,;:!?)]/.test(next) && offset > 0 ? ' ' : '';
	});
}

const NAMED_ENTITIES = {
	amp: '&', quot: '"', apos: "'", nbsp: ' ', deg: '°', times: '×', divide: '÷', middot: '·', hellip: '…',
	frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔',
	ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
	aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å', aelig: 'æ', ccedil: 'ç',
	eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
	ntilde: 'ñ', oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø',
	uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yacute: 'ý', szlig: 'ß',
	Aacute: 'Á', Eacute: 'É', Oacute: 'Ó', Uacute: 'Ú', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', Ntilde: 'Ñ', Ccedil: 'Ç'
};

/**
 * Characters an entity must not turn into: the translation gate refuses
 * '<' '>' (HTML), '\' and '`' '*' '_' (markdown), and a control character
 * would add a line break, i.e. a step. Such an entity stays as written.
 */
const UNSAFE_DECODED = /[<>\\`*_\u0000-\u001f\u007f-\u009f]/;

/**
 * HTML entities (&frac12; &#8217; &#xB0;...) as the characters they stand
 * for, non-breaking spaces as plain ones. One pass over the text, so "&amp;lt;"
 * is the literal text "&lt;" and never a '<'. An unknown name, an invalid code
 * point or an UNSAFE_DECODED character stays as written.
 */
function decodeEntities(text) {
	return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]*));/gi, (entity, dec, hex, name) => {
		let ch;
		if (name !== undefined) ch = Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : undefined;
		else {
			const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
			if (cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) ch = cp === 0xa0 ? ' ' : String.fromCodePoint(cp);
		}
		return ch === undefined || UNSAFE_DECODED.test(ch) ? entity : ch;
	});
}

/** Resolves [[X|Y]] -> Y, [[X]] -> X (namespace prefix stripped), drops
 *  [[File:...]]/[[Image:...]], keeps a <ref> footnote as a parenthetical when
 *  it is advice and drops it when it is a citation (isAdviceFootnote), expands
 *  the templates Cookbook recipes use inline ({{cb|X}} — a shorthand
 *  Cookbook: link — {{convert|N|from|to|...}} and {{convert/N}} —
 *  unit-conversion displays — Module:Temperature, and {{efn}} footnotes, kept
 *  as a parenthetical), drops the maintenance/gallery/infobox templates in
 *  DROPPED_TEMPLATES, reduces an external link to its label (and drops a
 *  parenthetical holding nothing but one), strips '' / ''' emphasis, HTML
 *  tags and comments, and finally decodes HTML entities (decodeEntities). */
export function stripWikitext(text) {
	if (!text) return '';
	return decodeEntities(cleanWikitext(text)).trim();
}

/** stripWikitext without the entity decoding, which must run once, on the finished text. */
function cleanWikitext(text) {
	const withoutRefs = text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<ref\b[^>]*\/>/gi, '')
		.replace(/<ref\b[^>]*>([\s\S]*?)<\/ref\s*>/gi, (_, body, offset, s) =>
			isAdviceFootnote(body) ? parenthetical(cleanWikitext(body), s[offset - 1] ?? '') : REMOVED
		);
	const withoutExternalLinks = expandTemplates(dropFileLinks(withoutRefs))
		.replace(/\s*\(\s*\[https?:\/\/[^\]]*\]\s*\)/g, '')
		.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
		.replace(/\[https?:\/\/[^\s\]]+\]/g, REMOVED);
	return closeGaps(withoutExternalLinks)
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

const countOf = (line, token) => line.split(token).length - 1;

/**
 * The section's lines, a list item whose template is still open at the end of
 * its line joined with the lines that close it. Without this the item stops at
 * the line break and whatever follows the closing braces is lost (a page with
 * its whole infobox pasted mid-step lost the rest of that step). Joining stops
 * at the next list item or heading, and is undone if the template never
 * closes, so one stray `{{` cannot swallow the items after it.
 */
function listLines(sectionText) {
	const lines = sectionText.split('\n');
	const out = [];
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		let j = i;
		if (/^[#*]/.test(line)) {
			while (countOf(line, '{{') > countOf(line, '}}') && j + 1 < lines.length && !/^[#*=]/.test(lines[j + 1])) line += ` ${lines[++j]}`;
		}
		if (countOf(line, '{{') > countOf(line, '}}')) out.push(lines[i]);
		else {
			out.push(line);
			i = j;
		}
	}
	return out;
}

/** `* line` bullets (any nesting depth of leading `*`), in order. */
export function extractBullets(sectionText) {
	if (!sectionText) return [];
	return listLines(sectionText)
		.map((line) => line.match(/^\*+\s*(.+)$/))
		.filter(Boolean)
		.map((m) => m[1].trim());
}

/** `# line` numbered steps (any nesting depth of leading `#`), in order. */
export function extractNumbered(sectionText) {
	if (!sectionText) return [];
	return listLines(sectionText)
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
