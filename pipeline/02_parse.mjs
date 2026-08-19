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
 *   ingredient_lines: string[],       // raw, unparsed, source language
 *   ingredient_links: (string|null)[],// parallel array: [[Cookbook:X]] target, if any
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
	extractBullets,
	extractNumbered,
	extractCategories,
	extractCookbookLink
} from './lib/wikitext.mjs';

const WIKIBOOKS_DIR = path.resolve('pipeline/data/wikibooks');
const OUT_DIR = path.resolve('pipeline/out');

const INGREDIENT_HEADERS = ['Ingredients'];
const PROCEDURE_HEADERS = ['Procedure', 'Directions', 'Instructions', 'Method'];

// Must track src/lib/config.ts's CUISINES — pipeline/ is plain Node ESM and
// can't import the SvelteKit TS module directly.
const CUISINES = new Set([
	'african', 'american', 'british', 'caribbean', 'chinese', 'french', 'german',
	'greek', 'indian', 'italian', 'japanese', 'korean', 'mexican', 'middle_eastern',
	'moroccan', 'spanish', 'thai', 'turkish', 'vietnamese'
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
	const ingredientLinks = rawIngredientLines.map(extractCookbookLink);

	const procedureSection = extractSection(wikitext, PROCEDURE_HEADERS);
	const steps = extractNumbered(procedureSection).map(stripWikitext).filter(Boolean);
	if (steps.length === 0) return null;
	const instructions = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');

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
		// unlocalized label.
		cuisine: rawCuisine && CUISINES.has(rawCuisine) ? rawCuisine : null,
		meal_type: deriveMealType(categoryTags)
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
