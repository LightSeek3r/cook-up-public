/**
 * Batch logic behind the recipe_i18n_* tools: which recipes a language still
 * needs, what a translator is handed, and whether a submitted batch may be
 * merged. Pure over a loaded `Corpus` (loadCorpus is the only part that reads
 * files), so the tests drive it with a hand-made corpus.
 */

import path from 'node:path';
import { readSeedInputs, seedRows } from './seed_sql.mjs';
import { readStore, SOURCE_LANG, srcHash, STORE_DIR } from './recipe_i18n_store.mjs';
import { LEGACY_INSTRUCTION_RULES, formatIssue, validateInstructions, validateTitle, words } from './recipe_i18n_gate.mjs';
import { TARGET_LANGS } from './langs.mjs';

export const DEFAULT_N = { titles: 100, instructions: 15 };
/** One batch is one agent turn's work; anything bigger is several batches. */
export const MAX_BATCH = { titles: 150, instructions: 30 };
const FIELDS = { titles: ['id', 'title', 'keep_source'], instructions: ['id', 'instructions'] };
const CONTEXT_INGREDIENTS = 8;
const FIRST_STEP_CHARS = 160;

/**
 * @typedef {object} Recipe
 * @property {number} id
 * @property {string} title English
 * @property {string} instructions English, one step per line
 * @property {string | null} cuisine
 * @property {string | null} meal
 * @property {string[]} ingredients canonical keys of its non-staple ingredients, recipe order
 */

/**
 * @typedef {object} Corpus
 * @property {Map<number, Recipe>} recipes the recipes the site serves, by id
 * @property {ReturnType<typeof readStore>} store
 */

/**
 * The served recipes (09_build_artefacts.mjs keeps the same ones: seedRows'
 * keptRecipes) with their English text from the store, falling back to
 * pipeline/out for a recipe the store has never seen.
 */
export async function loadCorpus({ outDir = path.resolve('pipeline/out'), storeDir = STORE_DIR } = {}) {
	const data = await readSeedInputs(outDir);
	const { keptRecipes } = seedRows(data);
	const store = readStore(storeDir);
	const staple = new Set(data.ingredients.filter((i) => i.is_staple).map((i) => i.canonical_key));
	const ingredients = new Map();
	for (const ri of data.recipeIngredients) {
		if (staple.has(ri.canonical_key)) continue;
		if (!ingredients.has(ri.recipe_id)) ingredients.set(ri.recipe_id, []);
		ingredients.get(ri.recipe_id).push(ri.canonical_key);
	}
	const enTitles = store.titles[SOURCE_LANG] ?? new Map();
	const enTexts = store.instructions[SOURCE_LANG] ?? new Map();
	const recipes = new Map();
	for (const r of keptRecipes) {
		recipes.set(r.id, {
			id: r.id,
			title: enTitles.get(r.id)?.title ?? r.title,
			instructions: enTexts.get(r.id)?.instructions ?? r.instructions,
			cuisine: r.cuisine ?? null,
			meal: r.meal_type ?? null,
			ingredients: (ingredients.get(r.id) ?? []).slice(0, CONTEXT_INGREDIENTS)
		});
	}
	return { recipes, store };
}

/** Document frequency of every word over `texts`. */
export function docFrequency(texts) {
	const df = new Map();
	for (const t of texts) for (const w of new Set(words(t))) df.set(w, (df.get(w) ?? 0) + 1);
	return df;
}

const vocabCache = new WeakMap();
/** englishLeftovers' word frequencies for `lang`: English recipes, and the language's own instructions. */
export function vocabFor(corpus, lang) {
	let cache = vocabCache.get(corpus);
	if (!cache) {
		cache = { en: docFrequency([...corpus.recipes.values()].map((r) => `${r.title}\n${r.instructions}`)), langs: new Map() };
		vocabCache.set(corpus, cache);
	}
	if (!cache.langs.has(lang)) {
		const texts = corpus.store.instructions[lang] ?? new Map();
		cache.langs.set(lang, docFrequency([...corpus.recipes.keys()].filter((id) => texts.has(id)).map((id) => texts.get(id).instructions)));
	}
	return { en: cache.en, target: cache.langs.get(lang) };
}

/** The other languages' text of one recipe, for the copied-from-language rules. */
function othersOf(corpus, kind, lang, id) {
	const field = kind === 'titles' ? 'title' : 'instructions';
	const out = {};
	for (const [other, rows] of Object.entries(corpus.store[kind])) {
		if (other === lang || other === SOURCE_LANG) continue;
		const row = rows.get(id);
		if (row) out[other] = row[field];
	}
	return out;
}

/**
 * Gate issues of one stored or submitted entry. `blocking` are the ones that
 * make it pending; `advisory` the full-gate issues of an imported
 * instructions row, which was accepted under the legacy rules.
 */
export function entryIssues({ corpus, kind, lang, id, entry, others = othersOf(corpus, kind, lang, id) }) {
	const recipe = /** @type {Recipe} */ (corpus.recipes.get(id));
	let issues;
	if (kind === 'titles') {
		issues = validateTitle({ lang, source: recipe.title, title: entry.title, keep: entry.keep ?? null, vocab: vocabFor(corpus, lang), others });
		if (entry.keep && entry.title !== recipe.title) issues.push({ rule: 'keep-source', message: 'kept as English, but differs from the English title' });
	} else {
		issues = validateInstructions({ lang, source: recipe.instructions, text: entry.instructions, others });
	}
	const source = kind === 'titles' ? recipe.title : recipe.instructions;
	if (entry.src !== undefined && entry.src !== srcHash(source)) issues.push({ rule: 'stale', message: 'the English text changed since this was translated' });
	const legacy = kind === 'instructions' && entry.origin === 'backup';
	return {
		blocking: legacy ? issues.filter((i) => LEGACY_INSTRUCTION_RULES.has(i.rule) || i.rule === 'stale') : issues,
		advisory: legacy ? issues.filter((i) => !LEGACY_INSTRUCTION_RULES.has(i.rule) && i.rule !== 'stale') : []
	};
}

/**
 * Every served recipe's state in `lang`, in id order:
 * `{ id, entry, missing, blocking, advisory }`.
 */
export function coverage(corpus, kind, lang) {
	const rows = corpus.store[kind][lang] ?? new Map();
	const out = [];
	for (const id of [...corpus.recipes.keys()].sort((a, b) => a - b)) {
		const entry = rows.get(id);
		if (!entry) out.push({ id, entry: null, missing: true, blocking: [], advisory: [] });
		else out.push({ id, entry, missing: false, ...entryIssues({ corpus, kind, lang, id, entry }) });
	}
	return out;
}

export const ORIGINS = ['any', 'batch', 'backup'];

/** Deterministic PRNG (mulberry32), so a sample can be drawn again from its seed. */
function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * What a translator (or, with `review`, a reviewer) is handed next: pending
 * recipes (missing first, then invalid or stale ones), or for a review the
 * valid entries no reviewer has passed yet, of one `origin` ("batch": applied
 * through the gate, "backup": imported, "any"). `ids` restricts the choice.
 * A review with `ids` hands those out even when reviewed already: that is
 * how a reviewed entry is re-opened. `sample` (review only) hands out instead `sample` of those entries drawn at
 * random from `seed`, in id order: the same store and seed give the same rows.
 */
export function nextBatch({ corpus, kind, lang, n, review = false, ids = null, origin = 'any', sample = null, seed = 0 }) {
	if (!ORIGINS.includes(origin)) throw new Error(`origin must be one of ${ORIGINS.join(', ')}`);
	if ((origin !== 'any' || sample !== null) && !review) throw new Error('origin and sample choose entries to review: they need review');
	const wanted = ids ? new Set(ids) : null;
	const states = coverage(corpus, kind, lang).filter((s) => !wanted || wanted.has(s.id));
	let pick = review
		? states.filter((s) => !s.missing && !s.blocking.length && (wanted || !s.entry.reviewed) && (origin === 'any' || s.entry.origin === origin))
		: [...states.filter((s) => s.missing), ...states.filter((s) => !s.missing && s.blocking.length)];
	const pending = states.filter((s) => s.missing || s.blocking.length).length;
	const remaining = pick.length;
	let size = n;
	if (sample !== null) {
		const rnd = seeded(seed);
		const pool = [...pick];
		for (let i = 0; i < Math.min(sample, pool.length); i++) {
			const j = i + Math.floor(rnd() * (pool.length - i));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		pick = pool.slice(0, sample).sort((a, b) => a.id - b.id);
		size = sample;
	}
	return { rows: pick.slice(0, size).map((s) => batchRow(corpus, kind, s)), remaining, pending };
}

/**
 * Per-origin review counts of one language's valid entries: applied through
 * the gate and awaiting review, applied and reviewed, imported and accepted
 * as they are (a review turns an imported entry into a batch one).
 * @param {ReturnType<typeof coverage>} states
 */
export function reviewCounts(states) {
	const valid = states.filter((s) => !s.missing && !s.blocking.length);
	return {
		batchAwaiting: valid.filter((s) => s.entry.origin === 'batch' && !s.entry.reviewed).length,
		batchReviewed: valid.filter((s) => s.entry.origin === 'batch' && s.entry.reviewed).length,
		backup: valid.filter((s) => s.entry.origin === 'backup' && !s.entry.reviewed).length
	};
}

function firstStep(instructions) {
	const line = instructions.split('\n').find((l) => l.trim()) ?? '';
	const step = line.trim().replace(/^\d+\.\s*/, '');
	return step.length > FIRST_STEP_CHARS ? `${step.slice(0, FIRST_STEP_CHARS - 1)}…` : step;
}

/** One row of a batch file: the English source, context, and what exists. */
function batchRow(corpus, kind, state) {
	const r = /** @type {Recipe} */ (corpus.recipes.get(state.id));
	const row =
		kind === 'titles'
			? { id: r.id, en: r.title, cuisine: r.cuisine, meal: r.meal, ingredients: r.ingredients, first_step: firstStep(r.instructions) }
			: { id: r.id, en_title: r.title, lines: r.instructions.split('\n').filter((l) => l.trim()).length, en: r.instructions };
	if (state.entry) row.current = kind === 'titles' ? state.entry.title : state.entry.instructions;
	if (state.entry?.keep) row.kept_as_english = state.entry.keep;
	const issues = [...state.blocking, ...state.advisory];
	if (issues.length) row.previous_issues = issues.map(formatIssue);
	return row;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates a whole submitted batch. Any problem rejects everything:
 * `errors` non-empty means nothing may be written. `entries` are the store
 * rows to merge, by recipe id.
 *
 * A first pass may write a recipe the language lacks or whose entry is
 * pending; replacing a valid one needs `overwrite`. A review (`review`) may
 * only touch existing entries, marks them reviewed, holds them to the full
 * gate, and is the only way to keep a title as it is in English
 * (`keep_source`: the reason).
 */
export function checkBatch({ corpus, kind, lang, batch, review = false, overwrite = false }) {
	const errors = [];
	const entries = new Map();
	const fail = (id, rule, message) => errors.push({ id, rule, message });
	if (!TARGET_LANGS.includes(lang)) {
		fail(undefined, 'lang', `"${lang}" is not a target language (${TARGET_LANGS.join(' ')})`);
		return { errors, entries };
	}
	if (!Array.isArray(batch) || batch.length === 0) {
		fail(undefined, 'batch', 'batch file must be a non-empty JSON array');
		return { errors, entries };
	}
	if (batch.length > MAX_BATCH[kind]) {
		fail(undefined, 'batch', `${batch.length} rows; one batch holds at most ${MAX_BATCH[kind]} ${kind}`);
		return { errors, entries };
	}
	const existing = corpus.store[kind][lang] ?? new Map();
	const field = kind === 'titles' ? 'title' : 'instructions';
	const seen = new Set();
	for (const [index, row] of batch.entries()) {
		if (!isObject(row) || !Number.isInteger(row.id)) {
			fail(undefined, 'batch', `row ${index} must be an object with an integer "id"`);
			continue;
		}
		const { id } = row;
		if (seen.has(id)) {
			fail(id, 'duplicate-id', 'id appears more than once in the batch');
			continue;
		}
		seen.add(id);
		const recipe = corpus.recipes.get(id);
		if (!recipe) {
			fail(id, 'unknown-id', 'not a served recipe; use the exact ids from recipe_i18n_next_batch');
			continue;
		}
		const extra = Object.keys(row).filter((k) => !FIELDS[kind].includes(k));
		if (extra.length) {
			fail(id, 'unknown-field', `unknown field(s): ${extra.join(', ')}`);
			continue;
		}
		const current = existing.get(id);
		if (review && !current) {
			fail(id, 'not-translated', `no ${lang} ${kind} entry to review; translate it first (without --review)`);
			continue;
		}
		if (!review && current && !overwrite && !entryIssues({ corpus, kind, lang, id, entry: current }).blocking.length) {
			fail(id, 'already-present', `already translated and valid for ${lang}; a change goes through --review (or --overwrite)`);
			continue;
		}
		let keep = null;
		if (row.keep_source !== undefined) {
			if (!review) {
				fail(id, 'keep-source', 'only a review (--review) may keep a title as it is in English');
				continue;
			}
			if (typeof row.keep_source !== 'string' || row.keep_source.trim().length < 3) {
				fail(id, 'keep-source', 'keep_source must be the reason, as a short sentence');
				continue;
			}
			if (row.title !== recipe.title) {
				fail(id, 'keep-source', 'keep_source is only for a title kept exactly as the English one');
				continue;
			}
			keep = row.keep_source.trim();
		}
		const source = kind === 'titles' ? recipe.title : recipe.instructions;
		const entry =
			kind === 'titles'
				? { title: row.title, src: srcHash(source), origin: 'batch', reviewed: review, ...(keep ? { keep } : {}) }
				: { instructions: row.instructions, is_machine: 1, src: srcHash(source), origin: 'batch', reviewed: review };
		if (typeof row[field] !== 'string') {
			fail(id, 'empty', `${field} must be a string`);
			continue;
		}
		const others = othersOf(corpus, kind, lang, id);
		for (const i of entryIssues({ corpus, kind, lang, id, entry, others }).blocking) fail(id, i.rule, i.message);
		entries.set(id, entry);
	}
	if (errors.length) entries.clear();
	return { errors, entries };
}

/** The language's rows with `entries` merged in. */
export function mergeEntries(existing, entries) {
	const merged = new Map(existing);
	for (const [id, entry] of entries) merged.set(id, entry);
	return merged;
}

const STOP = new Set(['and', 'with', 'the', 'of', 'a', 'in', 'on', 'for', 'or', 'to', 'style', 'ii', 'iii', 'i']);

/**
 * The recurring words of the English titles (Soup, Salad, Cake...) with the
 * language's current titles that contain them, so translators and reviewers
 * keep one term per word across thousands of titles.
 */
export function recurringTerms(corpus, lang, { top = 40, examples = 12 } = {}) {
	const titles = corpus.store.titles[lang] ?? new Map();
	const byWord = new Map();
	for (const r of [...corpus.recipes.values()].sort((a, b) => a.id - b.id)) {
		for (const w of new Set(words(r.title))) {
			if (STOP.has(w) || w.length < 3) continue;
			if (!byWord.has(w)) byWord.set(w, []);
			byWord.get(w).push(r);
		}
	}
	return [...byWord]
		.sort(([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : 1))
		.slice(0, top)
		.map(([word, list]) => ({
			word,
			english_titles: list.length,
			translated: list
				.filter((r) => titles.has(r.id))
				.slice(0, examples)
				.map((r) => ({ id: r.id, en: r.title, title: titles.get(r.id).title }))
		}));
}
