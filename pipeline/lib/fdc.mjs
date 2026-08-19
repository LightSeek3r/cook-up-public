/**
 * Loader + matcher for USDA FoodData Central bulk CSV data (Foundation Foods +
 * SR Legacy), confirmed against the real downloaded files rather than assumed:
 *
 *   food.csv          fdc_id, data_type, description, food_category_id, publication_date
 *   food_nutrient.csv id, fdc_id, nutrient_id, amount, ...
 *   food_portion.csv  id, fdc_id, seq_num, amount, measure_unit_id, portion_description, modifier, gram_weight, ...
 *   measure_unit.csv  id, name
 *
 * Foundation Foods' own `food.csv` mixes clean aggregated entries
 * (`data_type = 'foundation_food'`) with raw lab-sample rows (`sample_food`,
 * `market_acquisition`, `sub_sample_food`, `agricultural_acquisition`) — only
 * the aggregated rows are usable per-100g reference values, so callers filter
 * to `foundation_food` / `sr_legacy_food` before this module ever sees a row.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Minimal CSV parser for FDC's `"field","field"` style — handles quoted
 *  commas and escaped `""` inside a field, which a bare `.split(',')` can't. */
export function parseCsv(raw) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < raw.length; i++) {
		const c = raw[i];
		if (inQuotes) {
			if (c === '"' && raw[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				inQuotes = false;
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && raw[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			if (row.length > 1 || row[0] !== '') rows.push(row);
			row = [];
		} else {
			field += c;
		}
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** Parses a CSV file into row objects keyed by its own header line. */
async function loadRows(file) {
	const raw = await readFile(file, 'utf8');
	const [header, ...rows] = parseCsv(raw);
	return rows.map((cols) => Object.fromEntries(header.map((h, i) => [h, cols[i]])));
}

/**
 * Loads both datasets and merges them into one `fdc_id -> food` map, plus a
 * `unit-name-by-id` lookup for interpreting `food_portion.measure_unit_id`.
 * Foundation Foods rows are loaded first so a caller preferring them can just
 * check `data_type` on whatever `food.csv` row it matched against.
 */
export async function loadFdc(dataDir) {
	const dirs = [path.join(dataDir, 'foundation'), path.join(dataDir, 'sr_legacy')];
	const foods = new Map(); // fdc_id -> { fdc_id, description, data_type }
	const nutrientsByFood = new Map(); // fdc_id -> Map<nutrient_id, amount per 100g>
	const portionsByFood = new Map(); // fdc_id -> [{ description, modifier, gram_weight, unit_name }]
	const unitNames = new Map(); // measure_unit_id -> name

	for (const dir of dirs) {
		const [foodRows, nutrientRows, portionRows, unitRows] = await Promise.all([
			loadRows(path.join(dir, 'food.csv')),
			loadRows(path.join(dir, 'food_nutrient.csv')),
			loadRows(path.join(dir, 'food_portion.csv')),
			loadRows(path.join(dir, 'measure_unit.csv'))
		]);

		for (const u of unitRows) unitNames.set(u.id, u.name);

		for (const f of foodRows) {
			if (f.data_type !== 'foundation_food' && f.data_type !== 'sr_legacy_food') continue;
			foods.set(f.fdc_id, { fdc_id: f.fdc_id, description: f.description, data_type: f.data_type });
		}

		for (const n of nutrientRows) {
			if (!foods.has(n.fdc_id)) continue;
			if (!nutrientsByFood.has(n.fdc_id)) nutrientsByFood.set(n.fdc_id, new Map());
			const amount = Number(n.amount);
			if (Number.isFinite(amount)) nutrientsByFood.get(n.fdc_id).set(n.nutrient_id, amount);
		}

		for (const p of portionRows) {
			if (!foods.has(p.fdc_id)) continue;
			const gramWeight = Number(p.gram_weight);
			// `gram_weight` is the mass of `amount` units (e.g. "2.0 tbsp = 35.8 g"),
			// not always 1 — grams-per-single-unit needs the division.
			const amount = Number(p.amount);
			if (!Number.isFinite(gramWeight) || !Number.isFinite(amount) || amount <= 0) continue;
			if (!portionsByFood.has(p.fdc_id)) portionsByFood.set(p.fdc_id, []);
			portionsByFood.get(p.fdc_id).push({
				description: p.portion_description || '',
				modifier: p.modifier || '',
				gram_weight_per_unit: gramWeight / amount,
				unit_name: unitNames.get(p.measure_unit_id) ?? null
			});
		}
	}

	return { foods, nutrientsByFood, portionsByFood };
}

const STOPWORDS = new Set(['raw', 'fresh', 'whole', 'without', 'skin', 'or', 'and', 'not', 'further', 'prepared']);

/** Naive plural strip, same convention the OFF taxonomy matcher already uses
 *  — FDC prefers plural food names ("Potatoes, ...") where our canonical
 *  keys are singular ("potato"), so without this the plural entries are
 *  invisible to the matcher entirely and a stray singular-named product
 *  (e.g. "Potato flour") wins by default. */
function singularize(token) {
	// "-oes" (potatoes, tomatoes, mangoes) needs the "es" stripped, not just
	// "s" — a bare `-1` slice left "potatoes" as "potatoe", which then failed
	// to match "potato" at all, silently hiding every raw-potato FDC entry.
	if (token.length > 4 && token.endsWith('oes')) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
	return token;
}

function tokens(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((t) => t && !STOPWORDS.has(t))
		.map(singularize);
}

/**
 * FDC descriptions are comma-led, most-specific-first ("Milk, whole, 3.25%
 * milkfat" / "Cheese, ricotta, whole milk") — the query's own identity word
 * has to lead the description, not just appear somewhere in it. A bare
 * "every query token is present anywhere" test passed "milk" straight into
 * "Cheese, ricotta, whole milk" on the real data, silently handing plain
 * milk ricotta's nutrition. Two passes: prefix match first (query tokens are
 * the description's leading tokens, in order) tried before the looser
 * anywhere-match fallback.
 */
function scoreCandidates(needle, fdc, { prefixOnly }) {
	let best = null; // { fdc_id, data_type, score }
	for (const food of fdc.foods.values()) {
		const hay = tokens(food.description);
		const matches = prefixOnly
			? needle.every((t, i) => hay[i] === t)
			: needle.every((t) => hay.includes(t));
		if (!matches) continue;
		// Prefer the shortest matching description (least-qualified match),
		// Foundation Foods over SR Legacy, and — deliberately, not just a
		// stopword strip — the plain "raw" form when one exists: recipes call
		// for raw ingredients that then get cooked, and a raw entry is
		// nutritionally the right base reference. Without this, "potato" tied
		// on token count between "Potato flour" and "Potatoes, ... raw" and
		// insertion order alone decided the (wrong) winner.
		const isRaw = /\braw\b/i.test(food.description);
		const score = hay.length - (food.data_type === 'foundation_food' ? 1000 : 0) - (isRaw ? 500 : 0);
		if (!best || score < best.score) best = { fdc_id: food.fdc_id, data_type: food.data_type, score };
	}
	return best;
}

/**
 * Substring/token match against FDC's free-text `description`, Foundation
 * Foods preferred over SR Legacy when both hit. Not fuzzy beyond the prefix
 * vs. anywhere passes above — an unmatched ingredient is a deliberate
 * extension point (`unmatched_fdc.txt`), not something to guess past, same
 * posture as the OFF taxonomy matcher.
 */
export function matchFdc(name, fdc) {
	const needle = tokens(name);
	if (!needle.length) return null;
	return scoreCandidates(needle, fdc, { prefixOnly: true }) ?? scoreCandidates(needle, fdc, { prefixOnly: false });
}
