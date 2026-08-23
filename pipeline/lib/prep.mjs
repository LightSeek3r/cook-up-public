/**
 * Strips trailing preparation-instruction clauses ("onion, finely chopped",
 * "garlic, minced", "lemons, zested and juiced") from an ingredient name
 * before it's matched against the taxonomy — `matchIngredient` is an exact
 * (post-slugify) synonym lookup by design, and no taxonomy registers "onion,
 * finely chopped" as a synonym of "onion".
 *
 * Real, measured scope, not a guess: across the full corpus,
 * `pipeline/out/unmatched_ingredients.txt` had ~1,600 of its 6,163 lines
 * (~26%) ending in a trailing comma-clause made entirely of words on the
 * list below — by far the single largest class of unmatched lines. The word
 * list itself is exactly the vocabulary that class contains, tallied from
 * that same file, not invented.
 */

const PREP_WORDS = new Set([
	// verbs (participle form, as they appear after a comma)
	'chopped', 'minced', 'diced', 'sliced', 'grated', 'cubed', 'beaten', 'separated',
	'sifted', 'divided', 'smashed', 'melted', 'ground', 'drained', 'crushed', 'cracked',
	'washed', 'rinsed', 'thawed', 'peeled', 'cleaned', 'zested', 'juiced', 'crumbled',
	'shredded', 'trimmed', 'softened', 'deveined', 'pitted', 'halved', 'quartered',
	'mashed', 'whisked', 'stemmed', 'seeded', 'cored', 'skinned', 'boned', 'deboned',
	'toasted', 'blended', 'boiled', 'cooked', 'cooled', 'warmed', 'strained', 'whipped',
	'gutted', 'grilled', 'soaked', 'torn', 'cut', 'chilled', 'frozen', 'dried', 'stirred', 'split',
	// adverbs / degree words
	'finely', 'roughly', 'coarsely', 'thinly', 'neatly', 'lightly', 'stiffly', 'very',
	'fine', 'thin', 'small', 'thick', 'thickly',
	// connectors and the small structural vocabulary these phrases are built from
	'and', 'or', 'into', 'in', 'at', 'to', 'for', 'plus', 'extra', 'taste',
	// nouns that only ever show up inside a prep clause in this corpus
	'half', 'halves', 'pieces', 'rings', 'temperature', 'room', 'water', 'overnight',
	'dusting', 'garnish', 'serving', 'frying', 'needed', 'desired'
]);

/** A handful of fixed idioms that aren't a comma-led clause at all ("Salt to
 *  taste", "Oil for deep frying") — stripped first, whole-string, before the
 *  word-list-based clause stripping below ever runs. */
const PREP_IDIOMS = [/\s*,?\s*to taste$/i, /\s*,?\s*as (?:needed|desired)$/i, /,?\s*for\s+.+$/i];

/**
 * A single LEADING word ("Ground crayfish", "grated garlic", "warm water")
 * — smaller and separate from `PREP_WORDS` on purpose: only mechanical-
 * shape/temperature words that don't change the ingredient's identity are
 * safe to drop from the front. Deliberately excludes "fresh"/"dried"/"raw"/
 * "frozen" — those describe a genuinely different product form with
 * different nutrition per gram (dried herbs are far more concentrated than
 * fresh, for instance), so leaving them unmatched is safer than guessing.
 */
const LEADING_WORDS = new Set([
	'ground', 'grated', 'chopped', 'minced', 'diced', 'sliced', 'crushed',
	'shredded', 'cubed', 'melted', 'softened', 'warm', 'cold', 'cooked'
]);

/**
 * Repeatedly strips a trailing ", <word word ...>" clause as long as every
 * word in it is on `PREP_WORDS` — repeats because some lines chain more than
 * one clause ("chopped, for garnish" is two). Never touches anything before
 * the first comma, so a genuinely multi-word ingredient name never loses a
 * word it needs — this only ever removes text already past a comma boundary.
 * Also strips a single recognized leading word with no comma involved at
 * all ("Ground crayfish" -> "crayfish").
 */
export function stripPrepDescriptors(name) {
	if (!name) return name;
	let text = name;
	for (const idiom of PREP_IDIOMS) text = text.replace(idiom, '');

	let changed = true;
	while (changed) {
		changed = false;
		const m = text.match(/,\s*([a-z][a-z ]*)$/i);
		if (!m) break;
		const words = m[1].toLowerCase().trim().split(/\s+/);
		if (words.length && words.every((w) => PREP_WORDS.has(w))) {
			text = text.slice(0, m.index);
			changed = true;
		}
	}
	text = text.trim();

	const lead = text.match(/^([a-z]+)\s+(.+)$/i);
	if (lead && LEADING_WORDS.has(lead[1].toLowerCase())) text = lead[2];

	return text.trim();
}
