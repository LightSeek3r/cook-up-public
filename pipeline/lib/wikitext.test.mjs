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

// Real procedure steps from the corpus (page id first) that reached users with
// their markup intact.
describe('stripWikitext on templates the procedure steps use', () => {
	it('expands Module:Temperature to the author value and scale, with no invented conversion', () => {
		expect(stripWikitext('Preheat [[Cookbook:Deep Fat Frying|deep fat fryer]] to {{#invoke:temperature|f|375}} ({{#invoke:temperature|c|190}}).')).toBe(
			'Preheat deep fat fryer to 375 °F (190 °C).'
		); // 106261
		expect(stripWikitext('Preheat [[Cookbook:Oven|oven]] to {{#invoke:Temperature|f|350}}.')).toBe('Preheat oven to 350 °F.'); // 30544
		expect(stripWikitext('Preheat an [[Cookbook:Oven|oven]] to {{#invoke:Temperature|gm|5}}.')).toBe('Preheat an oven to gas mark 5.'); // 114210
	});

	it('leaves a Module:Temperature call it cannot read as written', () => {
		expect(stripWikitext('at {{#invoke:temperature|k|300}}')).toBe('at {{#invoke:temperature|k|300}}');
	});

	it('expands {{convert/N}} to "a × b × c unit" in the author unit', () => {
		expect(stripWikitext('Place in a greased {{convert/3|15|×|10|×|1|in|cm|abbr=on}} [[Cookbook:Baking Pan|baking pan]].')).toBe(
			'Place in a greased 15 × 10 × 1 in baking pan.'
		); // 204705
		expect(stripWikitext('Oil the bottom of a {{convert/3|13|x|9|x|2|in|cm|adj=on}} rectangular metal pan')).toBe(
			'Oil the bottom of a 13 × 9 × 2 in rectangular metal pan'
		); // 27148
	});

	it('does not repeat the unit when the author wrote it after {{convert/N}}', () => {
		expect(stripWikitext('Assemble your lasagna in a {{convert/3|13|x|9|x|2|in|cm|adj=on}} [[Cookbook:Inch|inch]] roasting pan')).toBe(
			'Assemble your lasagna in a 13 × 9 × 2 inch roasting pan'
		); // 8254
	});

	it('keeps an {{efn}} footnote as a parenthetical after the sentence it annotates', () => {
		expect(
			stripWikitext(
				'Arrange olive balls on a tray.{{efn|Stuffed olives can be frozen unfried at this time. Allow frozen olive balls to completely defrost before frying.}} [[Cookbook:Pan Frying|Fry]] them quickly in about ½ inch of canola oil until golden brown.{{efn|It is not important to cook them through because the meat has been cooked already.}}'
			)
		).toBe(
			'Arrange olive balls on a tray. (Stuffed olives can be frozen unfried at this time. Allow frozen olive balls to completely defrost before frying.) Fry them quickly in about ½ inch of canola oil until golden brown. (It is not important to cook them through because the meat has been cooked already.)'
		); // 112947
	});

	it('drops {{Clarify}} and {{How much}} editor notes, closing the gap they leave', () => {
		expect(
			stripWikitext('Reduce this,{{Clarify|reason=How do you cook this until thicker, without cooking the eggs and thus making it impossible to stir in the flour and cheese?}} then add flour and Parmesan cheese.')
		).toBe('Reduce this, then add flour and Parmesan cheese.'); // 21179
		expect(stripWikitext('Add warm water{{How much}} and squeeze the mixture through a sieve.')).toBe('Add warm water and squeeze the mixture through a sieve.'); // 483097
	});

	it('drops a {{Multiple image}} gallery, file names and all', () => {
		expect(
			stripWikitext('[[Cookbook:Sifting|Sift]] in the flour, and mix just until incorporated.{{Multiple image|image1=Making sponge cake at home 08.jpg|image2=Making sponge cake at home 09.jpg|width=150|align=center|image3=Making sponge cake at home 10.jpg}}')
		).toBe('Sift in the flour, and mix just until incorporated.'); // 468882
	});

	it('leaves templates it has no rule for, such as {{fraction}}, as written', () => {
		expect(stripWikitext('{{fraction|1|2}} cup butter')).toBe('{{fraction|1|2}} cup butter');
	});
});

describe('stripWikitext on HTML entities', () => {
	it('decodes numeric and named entities to their characters', () => {
		expect(stripWikitext('until they&#8217;re just beginning to get tender.')).toBe('until they’re just beginning to get tender.'); // 11527
		expect(stripWikitext('covering beans by &frac12; inch (1.5 cm). Serve hot.')).toBe('covering beans by ½ inch (1.5 cm). Serve hot.'); // 18871
		expect(stripWikitext('Preheat the oven to 220&#176;C (425&#176;F, gas mark 7).')).toBe('Preheat the oven to 220°C (425°F, gas mark 7).'); // 34185
		expect(stripWikitext('Roll the Aramba&#353;ici from the base of each leaf')).toBe('Roll the Arambašici from the base of each leaf'); // 38515
		expect(stripWikitext('Pour ½&#x2013;¾ cup batter in the middle of the pan')).toBe('Pour ½–¾ cup batter in the middle of the pan'); // 452772
		expect(stripWikitext('Bake for 1 hour at 180&#xB0;C.')).toBe('Bake for 1 hour at 180°C.'); // 461100
		expect(stripWikitext('[[Cookbook:Sautéing|Saut&eacute;]] the onion')).toBe('Sauté the onion'); // 248868
		expect(stripWikitext('Pour into an 8&times;8-inch pan')).toBe('Pour into an 8×8-inch pan'); // 38748
	});

	it('turns a non-breaking space into a plain one', () => {
		expect(stripWikitext('Preheat oven to 350&nbsp;°F (175&nbsp;°C).')).toBe('Preheat oven to 350 °F (175 °C).'); // 23535
		expect(stripWikitext('Roll the dough to ⅛&#160;inch thick.')).toBe('Roll the dough to ⅛ inch thick.');
	});

	it('decodes in one pass, so a decoded "&" never starts another entity', () => {
		expect(stripWikitext('salt &amp; pepper')).toBe('salt & pepper');
		expect(stripWikitext('&amp;frac12; and &amp;lt;b&amp;gt;')).toBe('&frac12; and &lt;b&gt;');
	});

	it('decodes a footnote once, with the text around it', () => {
		expect(stripWikitext('Serve.{{efn|Use salt &amp;amp; pepper.}}')).toBe('Serve. (Use salt &amp; pepper.)');
	});

	it('leaves as written an entity that would become markup, a line break, or is unknown', () => {
		expect(stripWikitext('&lt;b&gt;bold&lt;/b&gt; &#60;i&#62;')).toBe('&lt;b&gt;bold&lt;/b&gt; &#60;i&#62;');
		expect(stripWikitext('a&#92;b &#96;x&#96; &#42;&#42;y')).toBe('a&#92;b &#96;x&#96; &#42;&#42;y');
		expect(stripWikitext('step one&#10;step two')).toBe('step one&#10;step two');
		expect(stripWikitext('&notanentity; &#xD800; &#1114112;')).toBe('&notanentity; &#xD800; &#1114112;');
	});
});

describe('stripWikitext on footnotes and links', () => {
	it('drops a <ref> citation: a template, a bare URL, a link, or a source that is not a sentence', () => {
		expect(
			stripWikitext(
				'Mix until smooth.<ref>{{Cite web |last=Nigeria |first=Guardian |date=2024-01-28 |title=How To Make White Agidi (Eko) Recipe |url=https://guardian.ng/life/how-to-make-white-agidi-eko-recipe/ |access-date=2026-06-03}}</ref> If desired, add a little sugar to taste.'
			)
		).toBe('Mix until smooth. If desired, add a little sugar to taste.'); // 483757
		expect(stripWikitext('it will turn smooth and creamy.<ref>https://www.loveandlemons.com/homemade-peanut-butter-recipe/ - retrieved 2024-12-03</ref>')).toBe(
			'it will turn smooth and creamy.'
		); // 8632
		expect(stripWikitext('Cover the opening with kitchen thread.<ref>Alton Brown shows how to truss a turkey here: http://www.foodnetwork.com/videos/how-to-truss-a-turkey/27751.html</ref>')).toBe(
			'Cover the opening with kitchen thread.'
		); // 127433
		expect(stripWikitext('serve with cranberry sauce.<ref>The Brown Derby Cookbook [Doubleday & Company:Garden City NY] 1949 (p. 183)</ref>')).toBe('serve with cranberry sauce.'); // 147614
		expect(
			stripWikitext("not through the stem.<ref>[[w:en:Mastering the Art of French Cooking|''Mastering the Art of French Cooking.'' by Julia Child ''et al''.]]</ref> Squeeze out the juice")
		).toBe('not through the stem. Squeeze out the juice'); // 5077
	});

	it('keeps a <ref> written as advice for the cook, as a parenthetical', () => {
		expect(stripWikitext('Serve with Turkish bread.<ref>A crisp baguette is a good substitute.</ref>')).toBe('Serve with Turkish bread. (A crisp baguette is a good substitute.)'); // 129301
		expect(stripWikitext("Pour into new sterilized ½-pint preserving jars<ref>''Always check well for chips or cracks and discard if found.''</ref> leaving ¼-inch of space at the top.")).toBe(
			'Pour into new sterilized ½-pint preserving jars (Always check well for chips or cracks and discard if found.) leaving ¼-inch of space at the top.'
		); // 129369
	});

	it('removes a named, self-closing <ref /> as before', () => {
		expect(stripWikitext('Cook in oven for 5 minutes.<ref name="bbcgoodfood" />')).toBe('Cook in oven for 5 minutes.');
	});

	it('drops a parenthetical that holds nothing but an external link, and keeps an inline link label', () => {
		expect(stripWikitext('Use the quick pressure release ([https://www.youtube.com/watch?v=-hDonz_VPL0 see how]).')).toBe('Use the quick pressure release.'); // 415603
		expect(stripWikitext('measure it with a [http://www.consumersearch.com/digital-thermometers digital meat thermometer].')).toBe('measure it with a digital meat thermometer.');
		expect(stripWikitext('known as Jeerkasala [http://ml.wikipedia.org/wiki/Jeerakasala] is used.')).toBe('known as Jeerkasala is used.');
	});

	it('drops a [[File:]] link whose caption holds links of its own, closing brackets included', () => {
		expect(
			stripWikitext('which you can remove at the end.[[Image:BeansHamPot.jpg|thumb|339x339px|Cooked [[Cookbook:Bean|Beans]] and [[Cookbook:Ham|ham]] bone]]')
		).toBe('which you can remove at the end.'); // 28881
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

	it('keeps the text after a template that spans several lines of a step', () => {
		// 483139: the page's infobox was pasted into the middle of step 3, so the
		// step's second sentence follows the template's closing braces two lines down.
		const section = [
			'# Blend or grind dried pepper and fry it with chopped onions in a pot or pan.{{Recipe summary',
			'| Category = Bean recipies',
			'| Difficulty = 1',
			'}} Cook in palm oil and allow it to fry slowly until it becomes dark, thick, and smoky.',
			'# Add salt and seasoning cubes if desired.'
		].join('\n');
		expect(extractNumbered(section).map(stripWikitext)).toEqual([
			'Blend or grind dried pepper and fry it with chopped onions in a pot or pan. Cook in palm oil and allow it to fry slowly until it becomes dark, thick, and smoky.',
			'Add salt and seasoning cubes if desired.'
		]);
	});

	it('does not let a template that never closes swallow the steps after it', () => {
		expect(extractNumbered('# one {{broken\nprose\n# two')).toEqual(['one {{broken', 'two']);
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
