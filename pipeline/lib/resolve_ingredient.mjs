/**
 * Resolving one raw ingredient line to one canonical key.
 *
 * The rule is: build every plausible *reading* of the line, match each against
 * the taxonomy, and keep the most specific hit — not the first hit.
 *
 * That distinction is the whole point of this module. The earlier
 * implementation was a positional fallback chain that tried the line's
 * `[[Cookbook:...]]` wikilink first and stopped as soon as anything matched.
 * The link heuristic itself is sound as far as it goes (unit words like "cup"
 * link to their own glossary pages and always precede the ingredient, so the
 * *last* link is the best single guess), but two assumptions inside that chain
 * were never audited:
 *
 *   1. that an ingredient's name is carried by *one* link. It often isn't:
 *      `½ [[Cookbook:Cup|cup]] [[Cookbook:Tomato|tomato]]
 *      [[Cookbook:Puree|puree]]` spreads "tomato puree" across two, and taking
 *      the last of them returns "puree" while discarding "tomato".
 *   2. that whichever candidate matched first was therefore the right one.
 *
 * Together those mis-keyed thousands of corpus lines — `puree` for tomato
 * puree, `lemon` for lemon juice, `pepper` for black pepper — and did it
 * *silently*, because the wrong answers were real taxonomy entries, so nothing
 * ever landed in `unmatched_ingredients.txt` where a human would have seen it.
 * See the unpublished project notes.
 */

import { matchIngredientDetailed, ancestors, slugify } from './taxonomy.mjs';
import { stripPrepDescriptors } from './prep.mjs';
import { splitIngredientLine } from './measure.mjs';
import { MANUAL_INGREDIENTS } from './manual_ingredients.mjs';

// Reverse index for matching: every manually-authored ingredient's
// `matchPatterns` -> its canonical_key, keyed by the same slugify() matching
// uses everywhere else, so "Baking Soda" / "baking-soda" / "baking soda" all
// resolve the same way.
const MANUAL_MATCH_INDEX = new Map();
for (const [key, entry] of Object.entries(MANUAL_INGREDIENTS)) {
	for (const pattern of entry.matchPatterns) MANUAL_MATCH_INDEX.set(slugify(pattern), key);
}

// Exact-phrase overrides for real corpus text that will never appear as a
// registered OFF synonym verbatim — a product-line qualifier the taxonomy
// simply doesn't track ("all-purpose"), not a different ingredient. Every key
// here was looked up and confirmed absent from the raw taxonomy file first
// (see the unpublished project notes) — same "extend deliberately, never guess" posture as
// stage 03's CATEGORY_OVERRIDES. Deliberately excludes lookalikes that are
// nutritionally too different to alias safely (oyster sauce -> oyster, adobo
// sauce -> anything, cooking spray with any oil) — those stay genuine,
// documented gaps rather than a wrong guess.
export const SYNONYM_OVERRIDES = {
	all_purpose_flour: 'flour',
	white_granulated_sugar: 'sugar',
	maraschino_cherry: 'glace_cherry',
	maraschino_cherries: 'glace_cherry',
	cocoyam: 'taro', // West African/Caribbean name; nutritionally near-identical
	ice_cubes: 'ice',
	chilli_sauce: 'hot_sauce', // British spelling of the already-registered "chili sauce"

	// Added from a frequency ranking of unmatched_ingredients.txt (counts are the
	// corpus lines each recovers). Every target below was confirmed present in the
	// taxonomy first; the *source* phrase is what OFF doesn't register.
	jalapeno: 'jalapeno_pepper', // 13x — OFF has "jalapeño pepper", never the bare noun
	jalapenos: 'jalapeno_pepper',
	red_pepper_flakes: 'red_chili_pepper', // 31x, plus the spellings below
	crushed_red_pepper: 'red_chili_pepper',
	crushed_red_pepper_flakes: 'red_chili_pepper',
	chile_flakes: 'red_chili_pepper', // 7x
	chilli_flakes: 'red_chili_pepper',
	chili_flakes: 'red_chili_pepper',
	red_chilli_flakes: 'red_chili_pepper',
	hamburger_bun: 'bread_roll', // 17x — a soft roll; OFF carries the shape, not the use
	hamburger_buns: 'bread_roll',
	burger_bun: 'bread_roll',
	burger_buns: 'bread_roll',
	hot_dog_bun: 'bread_roll',
	hot_dog_buns: 'bread_roll',
	self_raising_flour: 'flour', // 16x British + 10x US spelling below. Loses the
	self_rising_flour: 'flour', // raising agent, which no taxonomy entry records anyway
	tabasco: 'hot_sauce', // 12x — a brand that has become the generic term
	tabasco_sauce: 'hot_sauce',
	chuck: 'chuck_steak', // 9x — the cut, shortened
	ground_chuck: 'minced_beef', // ground chuck IS minced beef, just a named cut
	currants: 'raisin', // 9x — Zante currants are dried grapes; the corpus itself
	currant: 'raisin', // writes "dried currants (raisins)". NOT blackcurrant (a berry).
	hot_dog: 'sausage', // 6x
	hot_dogs: 'sausage',
	marinara_sauce: 'tomato_sauce', // 5x
	stockfish: 'cod' // 6x — West African name for dried cod
};

// Preparation forms, not foods. OFF registers each of these as an entry, but
// they have no `<` parent line at all and carry vegan:maybe/vegetarian:maybe —
// they describe what was *done* to an ingredient, not which ingredient it is.
// Matching one is therefore always a mis-read of a longer phrase ("tomato
// purée" read as bare "purée"), and because they genuinely exist in the
// taxonomy that mis-read used to *succeed*, silently. Refusing them makes the
// failure loud: the line lands in unmatched_ingredients.txt instead.
//
// Whole food-group category anchors ("cheese", "meat", "vegetable") are a
// separate and larger problem, deliberately not addressed here — see the
// matching exclusion in lib/generic_ingredients.mjs.
export const PREPARATION_FORMS = new Set([
	'puree', 'paste', 'powder', 'extract', 'concentrate',
	'juice', 'syrup', 'sauce', 'filling', 'dough', 'batter'
]);

/** `matchIngredientDetailed`, but a manually-authored ingredient or exact-phrase
 *  override wins first. Overrides are whole-phrase rules, so their specificity
 *  is just the phrase's own word count. */
export function matchWithOverrides(text, taxonomy) {
	if (!text) return null;
	const slug = slugify(text);
	if (!slug) return null;
	const words = slug.split('_').length;
	const manual = MANUAL_MATCH_INDEX.get(slug);
	if (manual) return { key: manual, words };
	const override = SYNONYM_OVERRIDES[slug];
	if (override) return { key: override, words };
	return matchIngredientDetailed(text, taxonomy);
}

/**
 * Every plausible reading of one ingredient line, ordered most-trustworthy
 * first. The order matters only as a tie-break between equally specific
 * matches: the recipe's own words beat a link target, and a link target beats
 * the whole raw line.
 *
 * The multi-link windows are the reason this exists. "Tomato Puree" is a
 * reading of `[[Tomato]] [[Puree]]` that neither individual link carries. The
 * individual links stay in the list too, so a line whose combined reading isn't
 * in the taxonomy degrades to the best single link ("pumpkin purée" ->
 * `pumpkin`) instead of failing outright.
 */
export function candidateReadings(line, links, split) {
	const readings = [split?.name, stripPrepDescriptors(split?.name ?? '')];

	// The same line with every parenthetical removed. `splitIngredientLine` drops
	// a parenthetical sitting immediately after the quantity or unit, but that
	// leaves two very common shapes behind: an aside at the END ("Pine nuts
	// (optional)" — a line with no quantity at all, so the anchored strippers
	// never run), and one in the MIDDLE ("12 taro (dasheen or callaloo) leaves",
	// where removing it is what makes "taro leaves" a contiguous phrase).
	const bare = withoutParens(line);
	if (bare && bare !== line) {
		const bareSplit = splitIngredientLine(bare);
		readings.push(bareSplit.name, stripPrepDescriptors(bareSplit.name), bare);
	}

	for (let size = links.length; size >= 2; size--) {
		for (let start = 0; start + size <= links.length; start++) {
			readings.push(links.slice(start, start + size).join(' '));
		}
	}
	readings.push(...[...links].reverse()); // units precede the ingredient, so last link first
	readings.push(line, stripPrepDescriptors(line));
	return readings.filter(Boolean);
}

const withoutParens = (text) =>
	(text ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Is reading `a` a better answer than the incumbent `b`?
 *
 * Real taxonomy position decides first: a node sitting *below* the other in
 * OFF's DAG is unambiguously the more precise reading, whatever the two
 * phrasings looked like. Phrase length alone gets this backwards often enough
 * to matter — `ghee` (one word) is more specific than `oil_and_fat` (three),
 * and an exact-phrase override deliberately maps a long phrase onto a *coarser*
 * key ("white granulated sugar" -> `sugar`), so scoring that by its phrase
 * would let it outrank the `granulated_sugar` it should lose to.
 *
 * Only for keys with no ancestor relationship does the longest matched phrase
 * win — the ordinary dictionary rule, and what separates `tomato_puree` from a
 * bare `puree` that isn't even a food. Equal on both counts keeps the
 * incumbent, so `candidateReadings`' trust order is the final tie-break.
 */
export function beats(a, b, taxonomy) {
	if (a.key === b.key) return false;
	if (ancestors(a.key, taxonomy).has(b.key)) return true;
	if (ancestors(b.key, taxonomy).has(a.key)) return false;
	return a.words > b.words;
}

/**
 * Whole food groups. Not answers: "1 packet taco seasoning" resolving to
 * `coating` or "2 cups grated Velveeta cheese" to `cheese` is worse than no
 * match, because it puts an unbuyable abstraction in the shopping list. Same
 * exclusion, and the same reasoning, as lib/generic_ingredients.mjs rule 1.
 */
const CATEGORY_ANCHORS = new Set([
	'alcohol', 'berries', 'cereal', 'cheese', 'coating', 'dough', 'fish', 'fruit',
	'herb', 'legume', 'meat', 'mixed_spices', 'nut', 'oil_and_fat', 'poultry', 'salad',
	'sauce', 'spice', 'vegetable', 'seed', 'flour', 'milk', 'animal', 'food', 'condiment',
	'drink', 'beverage', 'sweetener', 'starch', 'fat', 'protein', 'leaf', 'flavouring', 'crust'
]);

/**
 * How many leading words the approximate step may discard. Measured, not chosen:
 * at 1 it recovers 653 previously-unmatched lines, at 2 it recovers 812, at 3 it
 * recovers 896 — and the quality falls off a cliff between 2 and 3. Real output
 * at 3+, all of which this cap excludes:
 *
 *   "A flame-resistant towel tied into a roll with twine and soaked in oil" -> oil
 *   "...smoked ham hock or smoked turkey, depending how big just for flavor" -> flavouring
 *   "5 fishballs, cut in circles and fried with 1 tbsp vegetable oil"        -> oil
 *   "3 pounds chuck roast or ground beef, cubed or formed into meatballs"    -> meatball
 */
const MAX_DROPPED_WORDS = 2;

/**
 * Last resort: the longest sub-phrase that still ENDS at the name's final word.
 *
 * For lines whose ingredient is real and present in the taxonomy, but carries a
 * qualifier the taxonomy doesn't record — "castor sugar", "panko bread crumbs",
 * "pickling salt", "puréed tomato", "Cara Cara orange". Dropping leading words
 * finds the food; the suffix anchor is what stops it from being fuzzy matching.
 *
 * The anchor matters enormously, and it is not a stylistic preference. English
 * noun phrases put the head noun last, so a sub-phrase that keeps the final word
 * is a *generalisation* of the ingredient while one taken from the middle is a
 * different ingredient entirely. Unanchored, this same search recovers 2,077
 * lines instead of 812 — and produces "Raw groundnuts" -> `apples` (via a variety
 * named "Raw"), "Spinach and Ricotta Filling" -> `spinach` (a section heading,
 * not an ingredient) and "curry leaves" -> `curry`. Anchoring eliminates all
 * three by construction rather than by blacklist.
 *
 * Still approximate, and confined to this one clearly-labelled function on
 * purpose: everything above it in this module is exact. Note in particular that
 * a dropped "dried"/"fresh" is right about identity and wrong about nutrition
 * per gram — which is why lib/prep.mjs deliberately refuses to strip those, and
 * why they are handled here instead, where the approximation is declared.
 */
function suffixSubphrase(name, taxonomy) {
	const words = (name ?? '').replace(/[.,;:]+$/, '').split(/\s+/).filter(Boolean);
	let best = null;
	for (let dropped = 1; dropped <= Math.min(MAX_DROPPED_WORDS, words.length - 1); dropped++) {
		const hit = matchWithOverrides(words.slice(dropped).join(' '), taxonomy);
		if (!hit || PREPARATION_FORMS.has(hit.key) || CATEGORY_ANCHORS.has(hit.key)) continue;
		if (!best || beats(hit, best, taxonomy)) best = hit;
	}
	return best;
}

/** The best canonical key any reading of the line resolves to, or null. */
export function resolveKey(line, links, split, taxonomy) {
	let best = null;
	const readings = candidateReadings(line, links, split);
	for (const reading of readings) {
		const hit = matchWithOverrides(reading, taxonomy);
		if (!hit || PREPARATION_FORMS.has(hit.key)) continue;
		if (!best || beats(hit, best, taxonomy)) best = hit;
	}
	if (best) return best.key;

	// Nothing matched exactly. Only now try the approximate step, and only on the
	// readings that represent the line's own words — never on a link target,
	// which is a page title and has no qualifier to strip.
	for (const reading of [split?.name, withoutParens(split?.name), withoutParens(line)]) {
		const hit = suffixSubphrase(reading, taxonomy);
		if (hit && (!best || beats(hit, best, taxonomy))) best = hit;
	}
	return best?.key ?? null;
}
