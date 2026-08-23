/**
 * Quantity/unit parsing shared across pipeline stages. `VULGAR` and
 * `UNIT_ALIASES` started life in pipeline/prototype/seed_themealdb.mjs, which
 * gets them pre-split from TheMealDB (quantity+unit in one field, ingredient
 * name in another). Real sources hand us one combined string
 * ("⅓ cup (80 ml) milk"), which is what `splitIngredientLine` is for.
 */

export const VULGAR = {
	'¼': 0.25, '½': 0.5, '¾': 0.75, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
	'⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
	'⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

export const UNIT_ALIASES = {
	g: 'g', gr: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l',
	tsp: 'tsp', tspn: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
	tbs: 'tbsp', tbsp: 'tbsp', tblsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
	cup: 'cup', cups: 'cup', oz: 'oz', ounce: 'oz', ounces: 'oz',
	lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
	pinch: 'pinch', pinches: 'pinch', dash: 'dash', dashes: 'dash',
	clove: 'clove', cloves: 'clove', can: 'can', cans: 'can', tin: 'can', tins: 'can',
	sprig: 'sprig', sprigs: 'sprig', handful: 'handful', handfuls: 'handful',
	slice: 'slice', slices: 'slice', bunch: 'bunch', bunches: 'bunch',
	packet: 'packet', pack: 'packet', jar: 'jar', bottle: 'bottle',
	// Size descriptors used as the *only* unit ("1 large egg", "2 medium onions")
	// — verified against the real corpus: 915 ingredient lines match this
	// pattern. Without these, the leading word never becomes a recognized unit,
	// so `rest` never advances past it: `name` comes out as "large egg" instead
	// of "egg" (breaking taxonomy matching whenever the wikilink match fails),
	// a trailing "(150 g)" is never stripped, and — the highest-impact
	// consequence — stage 04's resolveGrams() requires a non-null unit before
	// it will even attempt an FDC portion lookup, so grams could never resolve
	// for any of these 915 lines even though FDC commonly has exactly this
	// portion ("1 large" is a standard USDA egg portion).
	large: 'large', medium: 'medium', small: 'small', whole: 'whole',

	// Containers, counts and lengths the corpus actually uses as the leading unit.
	// Each was taken from a real unmatched line, not guessed: without them the
	// unit word stays in `name` ("punnet blackcurrants", "strands saffron") and no
	// taxonomy match is possible. They mostly won't resolve to FDC grams, which is
	// fine — a null unit couldn't either, and the name now matches.
	piece: 'piece', pieces: 'piece',
	strand: 'strand', strands: 'strand', thread: 'strand', threads: 'strand',
	sheet: 'sheet', sheets: 'sheet',
	package: 'packet', packages: 'packet', packets: 'packet', pkg: 'packet', pkgs: 'packet',
	stick: 'stick', sticks: 'stick',
	bag: 'bag', bags: 'bag', box: 'box', boxes: 'box',
	container: 'container', containers: 'container',
	inch: 'inch', inches: 'inch',
	dl: 'dl', cl: 'cl',
	head: 'head', heads: 'head', stalk: 'stalk', stalks: 'stalk',
	fillet: 'fillet', fillets: 'fillet', rasher: 'rasher', rashers: 'rasher',
	punnet: 'punnet', punnets: 'punnet',
	drop: 'drop', drops: 'drop', cube: 'cube', cubes: 'cube', knob: 'knob',
	quart: 'quart', quarts: 'quart', pint: 'pint', pints: 'pint', pt: 'pint',
	ea: 'each'
};

const VAGUE = /^(to taste|to serve|as needed|as desired|optional|for garnish|for serving)$/;

/**
 * A single combined ingredient line -> { quantity, unit, name }. Only the
 * leading quantity+unit is structured; everything after is free text and is
 * the caller's job to match against a taxonomy. Never fabricates a value —
 * anything that doesn't parse comes back null, same convention as the
 * prototype's `parseMeasure`.
 */
export function splitIngredientLine(line) {
	if (!line) return { quantity: null, unit: null, name: '' };

	let rest = line.trim().replace(/\s+/g, ' ');

	if (VAGUE.test(rest.toLowerCase())) {
		return { quantity: null, unit: null, name: rest };
	}

	let quantity = null;

	// Leading whole/decimal number, optionally a range ("2-3" -> 2, lower bound).
	const whole = rest.match(/^(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*/);
	if (whole && !/^\d+\s*\/\s*\d+/.test(rest)) {
		quantity = Number(whole[1].replace(',', '.'));
		rest = rest.slice(whole[0].length);
	}

	// "a/b" fraction, e.g. "1/2 cup", possibly following a whole number ("1 1/2").
	const fraction = rest.match(/^(\d+)\s*\/\s*(\d+)\s*/);
	if (fraction) {
		quantity = (quantity ?? 0) + Number(fraction[1]) / Number(fraction[2]);
		rest = rest.slice(fraction[0].length);
	} else if (VULGAR[rest[0]] !== undefined) {
		quantity = (quantity ?? 0) + VULGAR[rest[0]];
		rest = rest.slice(1).trim();
	}

	// A parenthetical alt-unit right after the quantity, e.g. "⅓ cup (80 ml) milk"
	// — drop it; the leading unit word is the one we keep. Matches ANY
	// parenthetical in this position, not just a single "(N unit)": the corpus is
	// full of multi-unit conversions the narrower pattern left behind, which then
	// became part of `name` and made a taxonomy match impossible —
	// "(4.4 oz / ⅝ cup)", "(2 ½ cups / 600 g)", "(108 ml / 7.2 US tbsp)".
	rest = rest.replace(/^\([^)]*\)\s*/, '');

	const unitMatch = rest.match(/^([a-z]+)\.?\s*/i);
	const unitWord = unitMatch?.[1]?.toLowerCase();
	const unit = unitWord ? UNIT_ALIASES[unitWord] ?? null : null;
	if (unit) {
		rest = rest.slice(unitMatch[0].length);
		// "2 cloves OF garlic", "1 pinch OF salt" — the connector isn't part of
		// the ingredient name; without stripping it `name` comes out as "of
		// garlic" instead of "garlic", which then fails taxonomy matching for
		// exactly the same reason a trailing prep clause does. Confirmed
		// against the real corpus: ~100+ lines match "<unit> of <ingredient>".
		rest = rest.replace(/^of\s+/i, '');
	}

	// A second parenthetical can also trail the unit word itself, e.g.
	// "1 medium (150 g) onion" or "½ cup (115 g) cold unsalted butter" — drop it too.
	rest = rest.replace(/^\([^)]*\)\s*/, '').trim();

	if (quantity === null && !unit) {
		return { quantity: null, unit: null, name: rest };
	}
	return {
		quantity: quantity === null ? null : Number(quantity.toFixed(4)),
		unit,
		name: rest
	};
}
