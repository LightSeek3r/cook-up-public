/**
 * Stage 02 — parse raw Wikibooks Cookbook wikitext into a normalised
 * intermediate record.
 *
 * Input:  pipeline/data/wikibooks/*.json
 * Output: pipeline/out/recipes.jsonl
 *
 * Record shape (as documented for this stage, plus two additive fields stage
 * 03 uses and nothing downstream of it needs to know about):
 * {
 *   id, source_url, source_lang, license, attribution,
 *   title, instructions,
 *   difficulty: number | null,       // 1-4 from the infobox, 96.7% coverage
 *   notes: string[],                  // "Notes, tips, and variations" bullets
 *   ingredient_lines: string[],       // raw, unparsed, source language
 *   ingredient_links: string[][],     // parallel array: every [[Cookbook:X]]
 *                                     // target on that line, in order (a name
 *                                     // is often split across several links)
 *   category_tags: string[],          // raw [[Category:...]] tags, diet cross-check only
 *   servings: number | null,
 *   prep_minutes: number | null,
 *   total_minutes: number | null,
 *   cuisine: string | null,
 *   meal_type: string | null
 * }
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	stripWikitext,
	parseTemplateParams,
	extractSection,
	extractSectionWhere,
	extractBullets,
	extractNumbered,
	extractCategories,
	extractCookbookLinks,
	extractImageFiles
} from './lib/wikitext.mjs';

const WIKIBOOKS_DIR = path.resolve('pipeline/data/wikibooks');
const OUT_DIR = path.resolve('pipeline/out');

const INGREDIENT_HEADERS = ['Ingredients'];
const PROCEDURE_HEADERS = ['Procedure', 'Directions', 'Instructions', 'Method'];

/**
 * The "Notes, tips, and variations" section, however this page spells it. Counted
 * across the real corpus: the canonical spelling covers 1,511 pages, with ~23
 * further variants behind it ("Notes, tips and variations" x54, "Variations" x23,
 * "Notes" x22, "Tips" x13, down to "Notes & Tricks" and the typo "variatons").
 * A predicate rather than a name list, because that tail is unbounded.
 *
 * Two exclusions, both deliberate:
 *  - "Conversion notes" (37 pages) is about unit conversions, not cooking advice.
 *  - "Footnotes" (1) is references.
 */
function isNotesHeading(heading) {
	const h = heading.trim().toLowerCase();
	if (h.startsWith('conversion') || h === 'footnotes') return false;
	return /\b(notes?|tips?|tricks?|variations?)\b/.test(h);
}

// Must track src/lib/config.ts's CUISINES — pipeline/ is plain Node ESM and
// can't import the SvelteKit TS module directly.
const CUISINES = new Set([
	'african', 'albanian', 'american', 'australian', 'austrian', 'belgian', 'brazilian',
	'british', 'bulgarian', 'canadian', 'caribbean', 'chinese', 'colombian', 'danish',
	'dutch', 'filipino', 'finnish', 'french', 'german', 'greek', 'hungarian', 'indian',
	'indonesian', 'irish', 'italian', 'japanese', 'korean', 'malaysian', 'mexican',
	'middle_eastern', 'moroccan', 'new_zealand', 'norwegian', 'peruvian', 'polish',
	'romanian', 'russian', 'spanish', 'swedish', 'thai', 'turkish', 'venezuelan',
	'vietnamese'
]);

// Wikibooks tags recipes with their own course categories directly (verified
// against the real corpus: "Recipes for dessert" x333, "Main course recipes"
// x409, "Breakfast recipes" x106, ...) — a far more reliable signal than
// guessing from ingredients. First matching pattern wins; "Appetizer" has no
// dedicated bucket in our 6-value MEAL_TYPES, "side" is the closest fit.
const MEAL_TYPE_TAGS = [
	[/dessert/i, 'dessert'],
	[/breakfast/i, 'breakfast'],
	[/\bsnacks?\b/i, 'snack'],
	[/side dish/i, 'side'],
	[/appetizer|starter/i, 'side'],
	[/main course|dinner/i, 'dinner'],
	[/\blunch\b/i, 'lunch']
];

function deriveMealType(categoryTags) {
	for (const [pattern, mealType] of MEAL_TYPE_TAGS) {
		if (categoryTags.some((tag) => pattern.test(tag))) return mealType;
	}
	return null;
}

// Wikibooks tags recipes with their own cuisine categories directly too —
// verified against the real corpus (283 distinct raw tags matching
// /recipes$/i; see per-cuisine counts below), far richer than the free-text
// infobox `cuisine=` field alone: verified only 74 of 3099 kept pages even
// have a `cuisine=` value, and only 5 of those literally normalize to one of
// these 19 spellings (the rest are unmapped country/ethnicity free text like
// "Zambian", "Nigerian", "USA", "Southern USA", "Albanian"). Built
// mechanically from CUISINES itself, rather than 19 hand-typed near-duplicate
// regex literals, so a typo'd cuisine key can't silently fail to match
// anything; middle_eastern's underscore becomes a space to match the real tag
// text ("Middle Eastern recipes" x33). Real per-cuisine counts from the
// mechanical patterns alone: indian x154 (+ "South Indian recipes" x10),
// italian x121, african x87, french x68, mexican x50, japanese x38, thai x37,
// middle_eastern x33, chinese x30, spanish x23, german x23, caribbean x17,
// turkish x17, greek x18, vietnamese x14, korean x8, british x7, moroccan x5 —
// all comfortably nonzero and in the same ballpark as a prior audit. A
// handful of real tags don't literally spell out a CUISINES value and need
// an explicit alias, each verified against the real corpus: "United States
// recipes" x130 / "Southern U.S. recipes" x65 / "Southwestern recipes" x51 ->
// american; "English recipes" x45 -> british; "Nigerian recipes" x66 (plus
// "National Nigerian recipes" x39, also matched by the same pattern) ->
// african. First matching pattern wins.
const CUISINE_TAGS = [
	...[...CUISINES].map((cuisine) => [
		new RegExp(`\\b${cuisine.replace(/_/g, ' ')} recipes\\b`, 'i'),
		cuisine
	]),
	[/\bunited states recipes\b|\bsouthern u\.s\. recipes\b|\bsouthwestern recipes\b/i, 'american'],
	[/\benglish recipes\b/i, 'british'],
	[/\bnigerian recipes\b/i, 'african'],

	// Nationality and regional tags folded into the existing 19 buckets. Cuisine
	// was non-null on only 30% of recipes; these recover ~436 more, and the counts
	// below are real (measured on the null-cuisine set before adding them).
	//
	// The rule applied: fold ONLY where the nationality sits unambiguously INSIDE
	// the bucket's own scope. A wider table was measured at ~731 but reached that
	// by folding Brazilian/Peruvian into `spanish` (Brazil is Portuguese-speaking
	// and the cuisines are unrelated) and Austrian into `german`. Those are wrong
	// labels, not approximations, and a wrong origin is worse than none — so the
	// residual stays null. See the skipped list at the end of this comment.

	// african — the bucket already holds Nigerian. Sub-Saharan ethnic and national
	// tags, plus North African nations (geographically unambiguous; `moroccan`
	// keeps its own bucket).
	[/\b(hausa|yoruba|igbo|tiv) recipes\b/i, 'african'],
	[
		/\b(ethiopian|rwandan|liberian|gambian|zambian|ugandan|cameroonian|senegalese|chadian|malawian|kenyan|ghanaian|tanzanian) recipes\b/i,
		'african'
	],
	[/\b(algerian|egyptian|libyan) recipes\b/i, 'african'],

	// american — US regional only. Canadian is deliberately NOT here: it is a
	// different country, and "American" would be a false label rather than a
	// coarse one.
	[/\b(texas|midwestern u\.s\.|tex-mex|californian|louisiana) recipes\b/i, 'american'],

	// british — constituent nations/regions of the UK. Irish is excluded: Ireland
	// is not in the UK, and folding it in mislabels a national cuisine.
	[/\b(scottish|welsh|cornish) recipes\b/i, 'british'],

	// indian — the only South Asian bucket. Sindhi (Indian subcontinent) and the
	// "South Asian" umbrella tag only; Nepali and Sylheti stay null rather than be
	// relabelled as a different country's cuisine.
	[/\b(sindhi|south asian) recipes\b/i, 'indian'],

	// caribbean
	[
		/\b(jamaican|cuban|puerto rican|trinidadian and tobagonian|dominican) recipes\b/i,
		'caribbean'
	],

	// Sub-national and regional tags folded into a bucket that now exists. These
	// cost nothing but a pattern, and each is inside its parent rather than beside
	// it: Sundanese and Javanese ARE Indonesian, Northern Irish IS Irish, Manx and
	// Hawaiian are constituent parts of Britain and the US. "Ghanian" is the
	// corpus's own misspelling of Ghanaian.
	[/\b(sundanese|javanese) recipes\b/i, 'indonesian'],
	[/\bnorthern irish recipes\b/i, 'irish'],
	[/\bmanx recipes\b/i, 'british'],
	[/\bhawaiian recipes\b/i, 'american'],
	[/\bbengali recipes\b/i, 'indian'],
	[/\bpalestinian recipes\b/i, 'middle_eastern'],
	[/\b(somali|zimbabwean|ghanian|togolese|sudanese|cape verdean|efik) recipes\b/i, 'african'],

	// middle_eastern
	[/\b(iranian|israeli|lebanese|jewish yemenite|syrian|iraqi|jordanian) recipes\b/i, 'middle_eastern'],

	// Deliberately NOT folded, for want of a defensible bucket — these keep
	// cuisine null: Indonesian 29, Austrian 25, Filipino 19, Canadian 17,
	// Albanian 14, Australian 14, Malaysian 13, Polish 13, Bulgarian 13,
	// Hungarian 12, Russian 12, Swedish 12, Brazilian 10, Irish 9, Colombian 8,
	// Danish 8, Peruvian 8, New Zealand 8, Finnish 7, Dutch 7, Romanian 6,
	// Venezuelan 6, Norwegian 5, Belgian 5, Argentine 4, Nepali 4, Sylheti 4.
	// Each would need a 20th+ value in CUISINES, which costs a matching key in
	// all ten locale files — a separate decision, not a parser change. Note this
	// is why Goulash Soup still has no cuisine: Hungarian has 12 recipes and no
	// bucket. Broad non-geographic tags (Asian 21, Mediterranean 5, Jewish 7) are
	// excluded on principle: they are not an origin.
	// Also unusable: "Duplicate recipes" 13, "Public domain recipes" 5,
	// "Family heritage recipes" 4 — not origins at all.
];

function deriveCuisine(categoryTags) {
	for (const [pattern, cuisine] of CUISINE_TAGS) {
		if (categoryTags.some((tag) => pattern.test(tag))) return cuisine;
	}
	return null;
}

/**
 * `Difficulty = N` from the infobox, clamped to the scale the corpus actually
 * uses. Present on 96.7% of parsed pages — by far the highest-coverage field the
 * template offers, and it went unread until now.
 *
 * Observed values: 1 x681, 2 x1497, 3 x1215, 4 x82, 5 x1, 8 x1. The 8 is
 * editor error and the lone 5 is unusable as a distinct rung, so anything above
 * 4 is dropped rather than rendered as a meter the UI has no room for. Returns
 * null when absent, so the 120 pages without one show nothing at all instead of
 * an implied "difficulty 0".
 */
const DIFFICULTY_MAX = 4;
function parseDifficulty(text) {
	if (!text) return null;
	const m = String(text).match(/\d+/);
	if (!m) return null;
	const value = Number(m[0]);
	return value >= 1 && value <= DIFFICULTY_MAX ? value : null;
}

/** "12 muffins" / "1-2" / "4" -> 4 (leading integer, lower bound of a range). */
function parseServings(text) {
	if (!text) return null;
	const m = text.match(/\d+/);
	return m ? Number(m[0]) : null;
}

/** "30 minutes" / "1 hour 30 minutes" -> 90. Single combined field — the
 *  template has no separate prep/total, so this only ever fills total_minutes. */
function parseMinutes(text) {
	if (!text) return null;
	let total = 0;
	let matched = false;
	const hours = text.match(/(\d+(?:\.\d+)?)\s*h(?:ou)?r/i);
	if (hours) {
		total += Number(hours[1]) * 60;
		matched = true;
	}
	const minutes = text.match(/(\d+)\s*min/i);
	if (minutes) {
		total += Number(minutes[1]);
		matched = true;
	}
	return matched ? Math.round(total) : null;
}

function parseRecipePage({ pageid, title, wikitext, url }) {
	const summary = parseTemplateParams(wikitext, 'Recipe\\s*summary') ?? {};

	const ingredientsSection = extractSection(wikitext, INGREDIENT_HEADERS);
	const ingredientLines = extractBullets(ingredientsSection).map(stripWikitext).filter(Boolean);
	if (ingredientLines.length === 0) return null;

	// Link targets come from the section's own wikitext (pre-strip), not the
	// already-stripped display lines.
	const rawIngredientLines = extractBullets(ingredientsSection);
	const ingredientLinks = rawIngredientLines.map(extractCookbookLinks);

	const procedureSection = extractSection(wikitext, PROCEDURE_HEADERS);
	const steps = extractNumbered(procedureSection).map(stripWikitext).filter(Boolean);
	if (steps.length === 0) return null;
	const instructions = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');

	// Notes / tips / variations — the practical half of a recipe page that was
	// being discarded (substitutions, yield caveats, make-ahead advice). Present on
	// 42% of the corpus under at least fifteen different spellings of the same
	// heading, hence NOTES_HEADERS rather than one exact name.
	//
	// Kept as its own field and NEVER fed to ingredient parsing:
	// `extractSection`'s exclusion of these bullets is what stops a "Variations"
	// line ("...fry 1 carrot with the onions") being read as a required
	// ingredient. Displaying them and parsing them are different concerns.
	const notesSection = extractSectionWhere(wikitext, isNotesHeading);
	const notes = extractBullets(notesSection).map(stripWikitext).filter(Boolean);

	const categoryTags = extractCategories(wikitext);
	const rawCuisine = summary.cuisine?.toLowerCase().trim().replace(/[^a-z]+/g, '_');

	return {
		id: pageid,
		source_url: url,
		source_lang: 'en',
		license: 'CC-BY-SA-3.0',
		attribution: `Wikibooks — ${title}`,
		title: (summary.name || title).replace(/^Cookbook:/, ''),
		instructions,
		ingredient_lines: ingredientLines,
		ingredient_links: ingredientLinks,
		category_tags: categoryTags,
		servings: parseServings(summary.servings || summary.yield),
		prep_minutes: null,
		total_minutes: parseMinutes(summary.time),
		// Free text in the source template ("Zambian", "French/European", ...)
		// only means something if it's one of our fixed, filterable values —
		// anything else is dropped rather than shipped as an unfilterable,
		// unlocalized label. An explicit, valid infobox value is a stated
		// authorial claim and wins outright; category tags (CUISINE_TAGS,
		// above) are the fallback signal used only when the infobox gave us
		// nothing usable, not a replacement for it.
		cuisine: rawCuisine && CUISINES.has(rawCuisine) ? rawCuisine : deriveCuisine(categoryTags),
		meal_type: deriveMealType(categoryTags),
		difficulty: parseDifficulty(summary.difficulty),
		notes,
		// Filenames only. Stage 08 resolves each to a URL plus its author and
		// licence via the MediaWiki API — none of which can be derived offline.
		image_files: extractImageFiles(wikitext)
	};
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true });
	const files = (await readdir(WIKIBOOKS_DIR)).filter((f) => f.endsWith('.json'));
	console.log(`02_parse: ${files.length} pages on disk`);

	let kept = 0;
	let droppedNoIngredients = 0;
	let droppedNoProcedure = 0;
	const lines = [];

	for (const file of files) {
		const page = JSON.parse(await readFile(path.join(WIKIBOOKS_DIR, file), 'utf8'));
		const ingredientsSection = extractSection(page.wikitext, INGREDIENT_HEADERS);
		const procedureSection = extractSection(page.wikitext, PROCEDURE_HEADERS);
		const hasIngredients = extractBullets(ingredientsSection).length > 0;
		const hasProcedure = extractNumbered(procedureSection).length > 0;

		if (!hasIngredients) {
			droppedNoIngredients++;
			continue;
		}
		if (!hasProcedure) {
			droppedNoProcedure++;
			continue;
		}

		const record = parseRecipePage(page);
		if (!record) continue;
		lines.push(JSON.stringify(record));
		kept++;
	}

	await writeFile(path.join(OUT_DIR, 'recipes.jsonl'), lines.join('\n') + '\n');
	console.log(
		`02_parse: kept ${kept}, dropped ${droppedNoIngredients} (no ingredients), ${droppedNoProcedure} (no procedure)`
	);
}

await main();
