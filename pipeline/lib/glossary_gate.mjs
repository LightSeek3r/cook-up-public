/**
 * Pure validation for the cooking-techniques glossary (src/lib/glossary).
 *
 * Two layers, deliberately separate:
 *   - structural rules (validateStructure, validateContentShape): the data is
 *     well-formed whatever the language, so they also run on English;
 *   - per-language quality rules (validateLangContent): the same shortcuts that
 *     corrupted the recipe translation run (English copied through, text copied
 *     from a sibling language, numbers silently altered) are caught by code, not
 *     by an agent's self-report. Reuses the read-only helpers from
 *     translate_gate.mjs.
 *
 * Every function returns an array of issues `{ lang?, id?, rule, message }`;
 * an empty array means valid. Nothing here touches the filesystem.
 */

import {
	hasLiteralBackslashN,
	hasTargetScript,
	looksUntranslated,
	lengthRatioOk
} from './translate_gate.mjs';
import { SUPPORTED_LANGS } from './langs.mjs';

// Mirrors CATEGORY_IDS in src/lib/glossary/types.ts (plain Node can't import the
// TS module). glossary_gate.test.mjs parses types.ts and asserts the lists match.
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
];

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Ids are URL slugs and object keys: names that would shadow a route or an
// Object.prototype member (content[id] would return a function) are refused.
export const RESERVED_IDS = new Set([
	'admin',
	'all',
	'api',
	'categories',
	'category',
	'constructor',
	'edit',
	'glossary',
	'index',
	'new',
	'null',
	'prototype',
	'search',
	'sitemap',
	'undefined'
]);

export const MAX_RELATED = 6;
export const MAX_SHORT = 160;

/** Languages whose content file must contain every term: all of them, so a new term needs 16 translations before CI passes. */
export const REQUIRE_COMPLETE_LANGS = SUPPORTED_LANGS;

const TEXT_KEYS = ['name', 'short', 'long', 'steps', 'tips', 'aliases', 'diagramAlt'];
const CJK_LANGS = new Set(['zh', 'ja', 'ko']);
// Languages whose cooks write 0,5 not 0.5. The digit-run check cannot tell the two apart, so this pins one convention per language.
export const COMMA_DECIMAL_LANGS = new Set(['es', 'fr', 'de', 'pt', 'it', 'ru', 'vi', 'jv']);
// English unit/hedge words that translators left behind inside otherwise translated prose.
export const ENGLISH_LEFTOVER = /(?<![\p{L}\p{N}])(?:tablespoons?|teaspoons?|cups?|about|inch(?:es)?|ounces?|pounds?)(?![\p{L}\p{N}])/iu;

const isStr = (v) => typeof v === 'string';
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const blank = (v) => !isStr(v) || v.trim() === '';
const list = (v) => (Array.isArray(v) ? v : []);

export const formatIssue = (i) =>
	`${i.lang ? `${i.lang} ` : ''}${i.id ? `${i.id}: ` : ''}[${i.rule}] ${i.message}`;

function markupProblem(s) {
	if (/[<>]/.test(s)) return "contains '<' or '>'";
	if (s.includes('**') || s.includes('__')) return 'contains markdown emphasis markers';
	if (s.includes('`')) return 'contains a backtick';
	if (/^\s*#/m.test(s)) return "a line starts with '#'";
	if (/^\s*[-*]\s/m.test(s)) return 'a line starts with a list marker';
	return null;
}

/** [label, value] for every string in a TermText, array items labelled `steps[2]`. */
function stringFields(text) {
	const out = [];
	for (const key of TEXT_KEYS) {
		const v = text[key];
		if (isStr(v)) out.push([key, v]);
		else if (Array.isArray(v)) v.forEach((s, i) => isStr(s) && out.push([`${key}[${i}]`, s]));
	}
	return out;
}

/** Sorted maximal digit runs: "63 °C" -> ["63"]. Catches 63 vs 36 and 63 vs 65 alike. */
export const digitRuns = (text) => (text.match(/[0-9]+/g) ?? []).sort();

const numbersOf = (t) =>
	digitRuns([t.long, ...list(t.steps), ...list(t.tips)].filter(isStr).join('\n'));

const NON_ASCII_DIGIT = /(?![0-9])\p{Nd}/u;

/**
 * Shape rules for one content entry, identical for every language.
 * `term` / `diagram` are the terms.json / diagrams.json rows (either may be
 * undefined when the reference itself is broken; that is reported elsewhere).
 */
export function validateTextShape({ lang, id, text, term, diagram }) {
	const issues = [];
	const add = (rule, message) => issues.push({ lang, id, rule, message });
	if (!isObject(text)) {
		add('shape', 'entry must be an object');
		return issues;
	}
	for (const key of Object.keys(text)) {
		if (!TEXT_KEYS.includes(key)) add('unknown-field', `unknown field "${key}"`);
	}
	for (const key of ['name', 'short', 'long']) {
		if (blank(text[key])) add('empty', `${key} must be a non-empty string`);
	}
	for (const key of ['steps', 'tips', 'aliases']) {
		const v = text[key];
		if (v === undefined) continue;
		if (!Array.isArray(v) || v.length === 0) {
			add('empty', `${key} must be a non-empty array when present`);
		} else {
			v.forEach((s, i) => blank(s) && add('empty', `${key}[${i}] must be a non-empty string`));
		}
	}
	if (text.diagramAlt !== undefined && blank(text.diagramAlt)) {
		add('empty', 'diagramAlt must be a non-empty string when present');
	}

	for (const [label, value] of stringFields(text)) {
		const markup = markupProblem(value);
		if (markup) add('markup', `${label} ${markup}`);
		if (hasLiteralBackslashN(value)) add('literal-backslash-n', `${label} contains a literal backslash-n`);
	}
	if (isStr(text.short) && [...text.short].length > MAX_SHORT) {
		add('short-length', `short is ${[...text.short].length} chars, limit ${MAX_SHORT}`);
	}

	if (term?.diagram) {
		if (text.diagramAlt === undefined) add('diagram-alt', 'diagramAlt is required for a term with a diagram');
		if (!Array.isArray(text.steps)) {
			add('steps-count', 'steps are required for a term with a diagram');
		} else if (diagram && text.steps.length !== diagram.marks) {
			add('steps-count', `steps has ${text.steps.length} entries, diagram "${diagram.id}" has ${diagram.marks} marks`);
		}
	} else if (term) {
		if (text.diagramAlt !== undefined) {
			add('diagram-alt', 'diagramAlt is only allowed for a term with a diagram');
		}
	}

	if (lang === 'en' && term && isStr(text.name) && text.name !== term.en) {
		add('en-name', `name "${text.name}" must equal terms.json en "${term.en}"`);
	}
	return issues;
}

/** Shape rules over a whole language file, plus keys that are not term ids. */
export function validateContentShape({ lang, terms, diagrams, content }) {
	const issues = [];
	if (!isObject(content)) {
		return [{ lang, rule: 'shape', message: 'content file must be a JSON object keyed by term id' }];
	}
	const termById = new Map(terms.map((t) => [t.id, t]));
	const diagramById = new Map(diagrams.map((d) => [d.id, d]));
	for (const [id, text] of Object.entries(content)) {
		const term = termById.get(id);
		if (!term) {
			issues.push({ lang, id, rule: 'unknown-id', message: 'content key is not a term id in terms.json' });
			continue;
		}
		issues.push(
			...validateTextShape({ lang, id, text, term, diagram: diagramById.get(term.diagram) })
		);
	}
	return issues;
}

/**
 * Language-neutral checks: terms.json, diagrams.json, cross references and the
 * shape of every content file supplied.
 */
export function validateStructure({
	terms,
	diagrams,
	contentByLang = {},
	diagramFileExists = () => true
}) {
	const issues = [];
	const add = (rule, message, id) => issues.push({ ...(id ? { id } : {}), rule, message });
	if (!Array.isArray(terms)) return [{ rule: 'shape', message: 'terms.json must be an array' }];
	if (!Array.isArray(diagrams)) return [{ rule: 'shape', message: 'diagrams.json must be an array' }];

	const diagramIds = new Set();
	for (const d of diagrams) {
		const id = isStr(d?.id) ? d.id : undefined;
		if (!id || !ID_PATTERN.test(id)) {
			add('diagram-id', `diagram id ${JSON.stringify(d?.id)} must be kebab-case`);
			continue;
		}
		if (diagramIds.has(id)) add('diagram-id', `duplicate diagram id "${id}"`);
		diagramIds.add(id);
		if (!Number.isInteger(d.marks) || d.marks < 1) add('diagram-marks', 'marks must be a positive integer', id);
		if (typeof d.directional !== 'boolean') add('diagram-shape', 'directional must be a boolean', id);
		if (typeof d.drawn !== 'boolean') add('diagram-shape', 'drawn must be a boolean', id);
		if (d.drawn === true && !diagramFileExists(id)) {
			add('diagram-file', `drawn:true but no component file for "${id}"`, id);
		}
	}

	const seen = new Set();
	const idList = terms.map((t) => t?.id);
	const idSet = new Set(idList.filter(isStr));
	for (const t of terms) {
		const id = t?.id;
		if (!isStr(id) || !ID_PATTERN.test(id)) {
			add('id-format', `term id ${JSON.stringify(id)} must be kebab-case [a-z0-9-]`);
			continue;
		}
		if (seen.has(id)) add('id-unique', 'duplicate term id', id);
		seen.add(id);
		if (RESERVED_IDS.has(id)) add('id-reserved', 'id is a reserved word', id);
		if (blank(t.en)) add('empty', 'en must be a non-empty string', id);
		else if (markupProblem(t.en)) add('markup', `en ${markupProblem(t.en)}`, id);
		if (!CATEGORY_IDS.includes(t.category)) {
			add('category', `category ${JSON.stringify(t.category)} is not one of the known categories`, id);
		}
		if (!Array.isArray(t.aliases)) {
			add('aliases', 'aliases must be an array', id);
		} else {
			t.aliases.forEach((a, i) => {
				if (blank(a)) add('empty', `aliases[${i}] must be a non-empty string`, id);
				else if (markupProblem(a)) add('markup', `aliases[${i}] ${markupProblem(a)}`, id);
			});
		}
		if (!Array.isArray(t.related)) {
			add('related', 'related must be an array', id);
		} else {
			if (t.related.length > MAX_RELATED) {
				add('related', `related has ${t.related.length} entries, limit ${MAX_RELATED}`, id);
			}
			const relSeen = new Set();
			for (const r of t.related) {
				if (r === id) add('related', 'related must not contain the term itself', id);
				else if (!idSet.has(r)) add('related', `related id ${JSON.stringify(r)} does not exist`, id);
				if (relSeen.has(r)) add('related', `duplicate related id ${JSON.stringify(r)}`, id);
				relSeen.add(r);
			}
		}
		if (t.diagram !== undefined && !diagramIds.has(t.diagram)) {
			add('diagram-ref', `diagram ${JSON.stringify(t.diagram)} is not in diagrams.json`, id);
		}
	}

	for (const [lang, content] of Object.entries(contentByLang)) {
		if (!SUPPORTED_LANGS.includes(lang)) {
			issues.push({ lang, rule: 'unknown-lang', message: 'not a supported language code' });
			continue;
		}
		issues.push(...validateContentShape({ lang, terms, diagrams, content }));
	}
	return issues;
}

const scriptRulesApply = (lang) => hasTargetScript(lang, '') !== undefined;

// Names are short and legitimately looser than prose: a Japanese name may be
// kanji only (燻製), and a Shahmukhi name may lack the pnb-only letters
// hasTargetScript demands of full sentences, so they get a Han/kana or plain
// Arabic-block test instead.
function nameScriptOk(lang, name) {
	if (lang === 'ja') return hasTargetScript('zh', name) || hasTargetScript('ja', name);
	if (lang === 'pnb') return hasTargetScript('ar', name);
	return hasTargetScript(lang, name) !== false;
}

// Chinese prose is routinely a quarter of the English length, so translate_gate's
// 0.2 floor (tuned on recipe instructions) is too tight for CJK.
function longRatioOk(lang, source, translated) {
	if (!CJK_LANGS.has(lang)) return lengthRatioOk(source, translated);
	const ratio = translated.length / Math.max(source.length, 1);
	return ratio >= 0.1 && ratio <= 3;
}

/**
 * Quality rules for one translated language file against English. Only entries
 * present in `content` are checked, so a batch can be validated before it is
 * merged. `allContentByLang` supplies the sibling languages for the
 * copy-from-another-language check.
 */
export function validateLangContent({ lang, terms, en = {}, content, allContentByLang = {} }) {
	if (lang === 'en' || !isObject(content)) return [];
	const termIds = new Set(terms.map((t) => t.id));
	const scripted = scriptRulesApply(lang);
	const issues = [];

	for (const [id, text] of Object.entries(content)) {
		if (!termIds.has(id) || !isObject(text)) continue;
		const add = (rule, message) => issues.push({ lang, id, rule, message });
		const src = en[id];
		if (!isObject(src)) {
			add('missing-english', 'no English source entry to compare against');
			continue;
		}

		if (scripted) {
			if (isStr(text.name) && text.name.trim() && text.name !== src.name && !nameScriptOk(lang, text.name)) {
				add('target-script', `name is not in the ${lang} script`);
			}
			// steps/tips are checked as one block: a single short step full of
			// "°C" would otherwise fail the per-text letter-density test.
			const blocks = {
				short: text.short,
				long: text.long,
				steps: list(text.steps).filter(isStr).join('\n'),
				tips: list(text.tips).filter(isStr).join('\n'),
				diagramAlt: text.diagramAlt
			};
			for (const [label, value] of Object.entries(blocks)) {
				if (isStr(value) && value.trim() && hasTargetScript(lang, value) === false) {
					add('target-script', `${label} is not in the ${lang} script`);
				}
			}
		}

		for (const key of ['short', 'long', 'diagramAlt']) {
			if (isStr(text[key]) && isStr(src[key]) && looksUntranslated(src[key], text[key])) {
				add('copied-from-english', `${key} is identical to the English text`);
			}
		}
		for (const key of ['steps', 'tips']) {
			list(text[key]).forEach((s, i) => {
				const e = list(src[key])[i];
				if (isStr(s) && isStr(e) && looksUntranslated(e, s)) {
					add('copied-from-english', `${key}[${i}] is identical to the English text`);
				}
			});
		}

		for (const [label, value] of stringFields(text)) {
			const m = value.match(NON_ASCII_DIGIT);
			if (m) add('digits', `${label} contains non-Western digit "${m[0]}"; use 0-9`);
		}
		for (const [label, value] of stringFields(text)) {
			if (label === 'name' || label.startsWith('aliases')) continue;
			const word = value.match(ENGLISH_LEFTOVER);
			if (word) add('english-leftover', `${label} still contains the English word "${word[0]}"`);
			const bad = COMMA_DECIMAL_LANGS.has(lang) ? value.match(/[0-9]\.[0-9]/) : value.match(/[0-9],[0-9]/);
			if (bad) {
				add('decimal-separator', `${label} uses "${bad[0]}"; ${lang} writes decimals with ${COMMA_DECIMAL_LANGS.has(lang) ? 'a comma' : 'a point'}`);
			}
		}
		const got = numbersOf(text);
		const want = numbersOf(src);
		if (got.join(',') !== want.join(',')) {
			add('digit-mismatch', `numbers in long/steps/tips are [${got}], English has [${want}]`);
		}

		for (const key of ['steps', 'tips']) {
			const g = list(text[key]).length;
			const e = list(src[key]).length;
			if (g !== e) add(`${key}-count`, `${key} has ${g} entries, English has ${e}`);
		}

		if (isStr(text.long) && isStr(src.long) && !longRatioOk(lang, src.long, text.long)) {
			add('length-ratio', `long is ${text.long.length} chars against ${src.long.length} in English`);
		}

		if (isStr(text.long) && text.long.trim()) {
			for (const [other, otherContent] of Object.entries(allContentByLang)) {
				if (other === lang || other === 'en') continue;
				const o = otherContent?.[id]?.long;
				if (isStr(o) && o.trim() === text.long.trim()) {
					add('copied-from-language', `long is identical to the ${other} text`);
					break;
				}
			}
		}
	}
	return issues;
}

/** Term ids from `terms` that have no entry in `content`, in terms.json order. */
export const missingIds = (terms, content) =>
	terms.filter((t) => !isObject(content) || !Object.hasOwn(content, t.id)).map((t) => t.id);

/** One issue per language that lacks any term. */
export function validateCompleteness({ terms, contentByLang, langs }) {
	const issues = [];
	for (const lang of langs) {
		const missing = missingIds(terms, contentByLang[lang]);
		if (!missing.length) continue;
		const sample = missing.slice(0, 8).join(', ');
		issues.push({
			lang,
			rule: 'incomplete',
			message: `${missing.length} of ${terms.length} term(s) missing: ${sample}${missing.length > 8 ? ', ...' : ''}`
		});
	}
	return issues;
}

/** Structural plus per-language quality over everything supplied. */
export function validateAll({ terms, diagrams, contentByLang = {}, diagramFileExists }) {
	const issues = validateStructure({ terms, diagrams, contentByLang, diagramFileExists });
	if (!Array.isArray(terms)) return issues;
	for (const [lang, content] of Object.entries(contentByLang)) {
		issues.push(
			...validateLangContent({
				lang,
				terms,
				en: contentByLang.en ?? {},
				content,
				allContentByLang: contentByLang
			})
		);
	}
	return issues;
}
