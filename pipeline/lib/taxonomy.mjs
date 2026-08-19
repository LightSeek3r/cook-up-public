/**
 * Parser + matcher for Open Food Facts' ingredient taxonomy
 * (taxonomies/food/ingredients.txt upstream, ODbL). Raw format, confirmed
 * against the real file rather than assumed:
 *
 *   # comment lines, ignored
 *   < en: parent name          (one per parent; a node can have several)
 *   en: primary name, synonym, synonym     (repeated per language)
 *   vegan:en: yes|no|maybe     (property:lang: value)
 *   allergens:en: en:soybeans  (property value is itself a taxonomy key)
 *
 * Entries are separated by blank lines. An entry's canonical key is derived
 * from its first English name, snake_case, matching this project's own
 * `canonical_key` convention (e.g. 'green_onion') rather than OFF's own
 * `en:kebab-case` id style.
 */

function slugify(text) {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // strip diacritics
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

const PROPERTY_LINE = /^([a-z][a-z0-9_]*):([a-z]{2,3}):\s*(.*)$/i;
const NAME_LINE = /^([a-z]{2,3}):\s*(.*)$/i;

/**
 * @param {string} raw
 * @returns {{
 *   byKey: Map<string, {key:string, names:Map<string,string[]>, parents:string[], props:Map<string,Map<string,string>>}>,
 *   synonymIndex: Map<string,string>,
 *   parentsByKey: Map<string,string[]>
 * }}
 */
export function parseTaxonomy(raw) {
	const byKey = new Map();
	const unresolvedParentNames = new Map(); // key -> raw english parent names, resolved after full parse

	for (const rawBlock of raw.split(/\n\s*\n/)) {
		const lines = rawBlock
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith('#'));
		if (lines.length === 0) continue;

		const names = new Map();
		const props = new Map();
		const parentNames = [];

		for (const line of lines) {
			if (line.startsWith('<')) {
				const m = line.slice(1).trim().match(NAME_LINE);
				if (m && m[1].toLowerCase() === 'en') {
					parentNames.push(m[2].split(',')[0].trim());
				}
				continue;
			}
			const prop = line.match(PROPERTY_LINE);
			if (prop) {
				const [, propName, lang, value] = prop;
				if (!props.has(propName)) props.set(propName, new Map());
				props.get(propName).set(lang.toLowerCase(), value.trim());
				continue;
			}
			const name = line.match(NAME_LINE);
			if (name) {
				const [, lang, value] = name;
				const terms = value
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean);
				if (terms.length) names.set(lang.toLowerCase(), terms);
			}
		}

		const enNames = names.get('en');
		if (!enNames || enNames.length === 0) continue; // can't key an entry with no English name

		const key = slugify(enNames[0]);
		if (!key) continue;

		if (byKey.has(key)) {
			// Same primary English name reused (rare); keep the first, note the rest
			// exist as synonyms of it so lookups still succeed.
			continue;
		}
		byKey.set(key, { key, names, parents: [], props });
		if (parentNames.length) unresolvedParentNames.set(key, parentNames);
	}

	const synonymIndex = new Map();
	for (const entry of byKey.values()) {
		for (const terms of entry.names.values()) {
			for (const term of terms) {
				const slug = slugify(term);
				if (slug && !synonymIndex.has(slug)) synonymIndex.set(slug, entry.key);
			}
		}
	}

	const parentsByKey = new Map();
	for (const [key, rawParents] of unresolvedParentNames) {
		const resolved = rawParents.map((name) => synonymIndex.get(slugify(name))).filter(Boolean);
		parentsByKey.set(key, resolved);
		byKey.get(key).parents = resolved;
	}

	return { byKey, synonymIndex, parentsByKey };
}

/** Exact match, then a naive plural strip. Returns a canonical key or null —
 *  never guesses further than that (unmatched lines are the caller's signal
 *  to extend the taxonomy deliberately, not to be fuzzy-matched away). */
export function matchIngredient(text, taxonomy) {
	if (!text) return null;
	const slug = slugify(text);
	if (!slug) return null;
	if (taxonomy.synonymIndex.has(slug)) return taxonomy.synonymIndex.get(slug);
	if (slug.endsWith('s') && taxonomy.synonymIndex.has(slug.slice(0, -1))) {
		return taxonomy.synonymIndex.get(slug.slice(0, -1));
	}
	return null;
}

/** BFS the full reachable ancestor set (self included), cycle-safe. Returns
 *  every node visited — a DAG node routinely has more than one path to the
 *  root (e.g. lentils are both a "vegetable" and a "legume" in OFF's own
 *  hierarchy), so "first hit wins" is order-dependent on parent-list order,
 *  not a real signal. Collect everything and let the caller break ties by
 *  domain priority instead. */
function ancestors(key, taxonomy) {
	const seen = new Set();
	let queue = [key];
	while (queue.length) {
		const next = [];
		for (const k of queue) {
			if (seen.has(k)) continue;
			seen.add(k);
			next.push(...(taxonomy.parentsByKey.get(k) ?? []));
		}
		queue = next;
	}
	return seen;
}

/** Every distinct value hit by walking the full ancestor set against a
 *  curated `Map<canonicalKey, T>` — may be more than one (see `ancestors`). */
export function collectAnchors(key, taxonomy, anchorMap) {
	const hits = new Set();
	for (const k of ancestors(key, taxonomy)) {
		if (anchorMap.has(k)) hits.add(anchorMap.get(k));
	}
	return hits;
}

/** `collectAnchors`, then pick the first value from `priority` that was hit —
 *  domain priority, not ancestor distance, breaks the multi-parent ties. */
export function walkAnchors(key, taxonomy, anchorMap, priority) {
	const hits = collectAnchors(key, taxonomy, anchorMap);
	for (const value of priority) if (hits.has(value)) return value;
	return null;
}

/** Closest-ancestor-wins lookup of a taxonomy property (e.g. `vegan:en`),
 *  since child entries usually don't restate a property their parent has.
 *  Properties are (in practice) single-valued per entry, so nearest-first
 *  is the right rule here, unlike `walkAnchors`. */
export function walkProperty(key, taxonomy, propName, lang = 'en') {
	const seen = new Set();
	let queue = [key];
	while (queue.length) {
		const next = [];
		for (const k of queue) {
			if (seen.has(k)) continue;
			seen.add(k);
			const value = taxonomy.byKey.get(k)?.props.get(propName)?.get(lang);
			if (value !== undefined) return value;
			next.push(...(taxonomy.parentsByKey.get(k) ?? []));
		}
		queue = next;
	}
	return null;
}

export { slugify };
