import { describe, it, expect } from 'vitest';
import {
	stripWikitext,
	parseTemplateParams,
	extractSection,
	extractBullets,
	extractNumbered,
	extractCategories,
	extractCookbookLink,
	extractCookbookLinks
} from './wikitext.mjs';

const RECIPE_SUMMARY = 'Recipe\\s*summary';

describe('stripWikitext', () => {
	it('resolves a piped wikilink to its display text', () => {
		expect(stripWikitext('[[Cookbook:Sugar|sugar]]')).toBe('sugar');
	});

	it('strips the namespace prefix from a non-piped wikilink', () => {
		expect(stripWikitext('[[Cookbook:Sugar]]')).toBe('Sugar');
	});

	it('expands the {{cb|X}} Cookbook-link shorthand to X', () => {
		expect(stripWikitext('{{cb|Sugar}}')).toBe('Sugar');
	});

	it('expands {{convert|N|unit|...}} to "N unit", dropping the conversion target', () => {
		expect(stripWikitext('{{convert|2|cups|ml}}')).toBe('2 cups');
	});

	it('drops a [[File:...]]/[[Image:...]] link entirely, without re-joining the surrounding text', () => {
		// Real, existing behaviour: removing the link leaves both of its
		// neighbouring spaces behind (a double space), not a single joined one.
		expect(stripWikitext('Before [[File:Sugar.jpg|thumb|200px]] after')).toBe('Before  after');
	});

	it('strips bold and italic markup', () => {
		expect(stripWikitext("'''bold''' and ''italic''")).toBe('bold and italic');
	});

	it('strips HTML comments and tags', () => {
		expect(stripWikitext('<!-- note -->text')).toBe('text');
		expect(stripWikitext('<b>text</b>')).toBe('text');
	});

	it('returns "" for null/empty input, and trims surrounding whitespace', () => {
		expect(stripWikitext(null)).toBe('');
		expect(stripWikitext('')).toBe('');
		expect(stripWikitext('  hi  ')).toBe('hi');
	});
});

describe('parseTemplateParams', () => {
	it('parses key=value params from a matching template', () => {
		expect(parseTemplateParams('{{Recipe summary|name=Cake|servings=8}}', RECIPE_SUMMARY)).toEqual({
			name: 'Cake',
			servings: '8'
		});
	});

	it('expands a nested template inside a param value (via stripWikitext on the value)', () => {
		expect(
			parseTemplateParams('{{Recipe summary|name=Cake|time={{convert|30|min}}}}', RECIPE_SUMMARY)
		).toEqual({ name: 'Cake', time: '30 min' });
	});

	it('does not let a pipe inside a nested [[File:...|...]] link split a param', () => {
		// If linkDepth weren't tracked, "|thumb" inside the image link would be
		// mistaken for the next param separator and corrupt everything after it.
		expect(
			parseTemplateParams(
				'{{Recipe summary|name=Cake|image=[[File:X.jpg|thumb]]|servings=8}}',
				RECIPE_SUMMARY
			)
		).toEqual({ name: 'Cake', image: '', servings: '8' });
	});

	it('returns null when the named template is not present', () => {
		expect(parseTemplateParams('no template here', RECIPE_SUMMARY)).toBeNull();
	});

	it('matches the template name case-insensitively with no internal whitespace', () => {
		expect(parseTemplateParams('{{recipe SUMMARY|name=Pie}}', RECIPE_SUMMARY)).toEqual({ name: 'Pie' });
	});

	it('drops a segment with no "=" instead of throwing or corrupting later params', () => {
		expect(
			parseTemplateParams('{{Recipe summary|name=Cake|justaword|servings=8}}', RECIPE_SUMMARY)
		).toEqual({ name: 'Cake', servings: '8' });
	});
});

describe('extractSection', () => {
	const doc = 'intro\n==Ingredients==\nline1\nline2\n==Procedure==\nstepA';

	it('extracts the text between a named heading and the next heading', () => {
		expect(extractSection(doc, ['Ingredients'])).toBe('line1\nline2');
	});

	it('matches heading names case-insensitively and accepts any of several candidates', () => {
		expect(extractSection('==procedure==\nstepA\nstepB', ['Procedure', 'Directions'])).toBe('stepA\nstepB');
	});

	it('extracts to the end of the document when there is no following heading', () => {
		expect(extractSection('==Ingredients==\nline1\nline2', ['Ingredients'])).toBe('line1\nline2');
	});

	it('returns null when none of the candidate headings are present', () => {
		expect(extractSection('==Other==\nx', ['Ingredients'])).toBeNull();
	});

	it('treats a level-3+ subsection as content, not a section boundary', () => {
		// Regression: multi-component recipes (crust/filling/meringue, say) break
		// their ingredient list into "===Filling===" / "===Meringue==="
		// subsections. An earlier version matched any "==...==" -shaped line
		// regardless of how many "=" it had, so the first subsection heading was
		// mistaken for the *next* level-2 heading and silently ended the section
		// right there — confirmed against the real corpus to affect 440/3,824
		// pages, usually dropping the recipe entirely (zero ingredients left).
		const doc = '==Ingredients==\n===Filling===\n*a\n*b\n===Meringue===\n*c\n==Procedure==\n#step';
		expect(extractSection(doc, ['Ingredients'])).toBe('===Filling===\n*a\n*b\n===Meringue===\n*c');
	});
});

describe('extractBullets / extractNumbered', () => {
	it('extracts "*" bullets in order, collapsing any nesting depth, and skips non-bullet lines', () => {
		expect(extractBullets('* a\n** nested b\nprose\n*c')).toEqual(['a', 'nested b', 'c']);
	});

	it('returns [] for null/empty section text', () => {
		expect(extractBullets(null)).toEqual([]);
		expect(extractBullets('')).toEqual([]);
	});

	it('extracts "#" numbered steps in order, collapsing any nesting depth', () => {
		expect(extractNumbered('# one\n## nested two\nprose\n#three')).toEqual(['one', 'nested two', 'three']);
	});
});

describe('extractCategories', () => {
	it('extracts every [[Category:X]] tag in appearance order, dropping a sort-key pipe', () => {
		expect(extractCategories('[[Category:Desserts]] text [[Category:Vegan|sort]]')).toEqual([
			'Desserts',
			'Vegan'
		]);
	});

	it('returns [] when there are no category tags', () => {
		expect(extractCategories('no categories here')).toEqual([]);
	});
});

describe('extractCookbookLink', () => {
	it('extracts a single [[Cookbook:X|display]] link target', () => {
		expect(extractCookbookLink('2 [[Cookbook:Cups|cups]] flour')).toBe('Cups');
	});

	it('returns the LAST link when a unit link precedes the ingredient link (the phase-2 fix)', () => {
		// Unit words ("cup") are wikilinked to their own Cookbook glossary pages
		// too, and consistently appear before the ingredient — the first link
		// used to be taken and returned the unit instead of the ingredient.
		expect(extractCookbookLink('1 [[Cookbook:Cups|cup]] of [[Cookbook:Sugar|sugar]]')).toBe('Sugar');
	});

	it('recognizes the {{cb|X}} shorthand template as a link too', () => {
		expect(extractCookbookLink('1 cup {{cb|Flour}}')).toBe('Flour');
	});

	it('takes the last link across mixed [[Cookbook:...]] and {{cb|...}} syntax, in either order', () => {
		expect(extractCookbookLink('[[Cookbook:Cups|cup]] {{cb|Flour}}')).toBe('Flour');
		expect(extractCookbookLink('{{cb|Cups}} [[Cookbook:Flour|flour]]')).toBe('Flour');
	});

	it('returns null when the line has no Cookbook link at all', () => {
		expect(extractCookbookLink('no links here')).toBeNull();
	});
});

describe('extractCookbookLinks', () => {
	it('returns every link target in source order', () => {
		// The case last-link-wins cannot express: "tomato puree" is spread over
		// two links, and returning only "Puree" discards "Tomato" — which is how
		// Goulash Soup ended up keyed to a preparation form instead of a food.
		expect(
			extractCookbookLinks(
				'½ [[Cookbook:Cup|cup]] [[Cookbook:Tomato|tomato]] [[Cookbook:Puree|puree]]'
			)
		).toEqual(['Cup', 'Tomato', 'Puree']);
	});

	it('collects mixed [[Cookbook:...]] and {{cb|...}} syntax in order', () => {
		expect(extractCookbookLinks('[[Cookbook:Cups|cup]] {{cb|Flour}}')).toEqual(['Cups', 'Flour']);
		expect(extractCookbookLinks('{{cb|Cups}} [[Cookbook:Flour|flour]]')).toEqual(['Cups', 'Flour']);
	});

	it('returns an empty array for no links, empty string, or null', () => {
		expect(extractCookbookLinks('no links here')).toEqual([]);
		expect(extractCookbookLinks('')).toEqual([]);
		expect(extractCookbookLinks(null)).toEqual([]);
	});

	it('agrees with extractCookbookLink on the last element', () => {
		const line = '1 [[Cookbook:Cups|cup]] of [[Cookbook:Sugar|sugar]]';
		expect(extractCookbookLinks(line).at(-1)).toBe(extractCookbookLink(line));
	});
});
