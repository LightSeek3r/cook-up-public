/**
 * Static data artefacts: the read-only corpus the app serves, as versioned
 * files instead of D1 rows (.claude/plans/phase3-static-data.md).
 *
 * Built from a SQLite database holding exactly what D1 holds: by default the
 * one 06_seed_d1.mjs's statements produce from pipeline/out and the
 * translation backup (`snapshotDb`), so every value went through the same
 * SQL text, column affinity and float parsing as remote D1's own seed. The
 * parity tests then compare the app's SQL against these files on one and the
 * same database.
 *
 * Output, all paths relative to the artefact root:
 *   core.bin               everything /api/match and title search need, source
 *                          titles included (src/lib/data/core.js)
 *   titles/<lang>.json     titles that differ from the source title, per language
 *   names/<lang>.json      ingredient display name per ingredient, and which are the language's own
 *   mosaic/<lang>.json     the /api/ingredients mosaic, results as the API returns them
 *   sitemap.json           every recipe id
 *   r/<id>.json            one recipe page, all languages (src/lib/data/recipe.js)
 *   manifest.json          data version, counts, sha256 and size of every other file
 *
 * The data version is a hash of every file's content. The small files embed
 * it, so a corpus can never be assembled from two builds; r/<id>.json do not,
 * so one changed recipe re-uploads one file on deploy, not 3,478.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { CORE_FORMAT, CORE_MAGIC, CORE_SECTIONS, ELEMENT, NULL_INT, sectionBase } from '../../src/lib/data/core.js';
import { loadCorpus } from '../../src/lib/data/corpus.js';
import { buildMosaic } from '../../src/lib/data/search.js';
import { compareBinary, ftsFold } from '../../src/lib/data/text.js';
import { buildLocalSeed } from '../06_seed_d1.mjs';
import { readBackup } from './i18n_backup.mjs';
import { SUPPORTED_LANGS } from './langs.mjs';
import { ingredientFtsRefresh, readSeedInputs, titleFtsRefresh } from './seed_sql.mjs';
import { sha256 } from '../../scripts/lib/datapack.mjs';

export const ARTEFACT_FORMAT = 1;
const MIGRATIONS = path.resolve(import.meta.dirname, '../../migrations');

/** In-memory SQLite with every migration applied, the schema D1 has. */
export function schemaDb() {
	const db = new DatabaseSync(':memory:');
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
		db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'));
	}
	return db;
}

/**
 * The database 06_seed_d1.mjs would give a local D1, from pipeline/out and
 * the translation backup.
 * @param {{ outDir?: string, backupDir?: string }} [opts]
 */
export async function snapshotDb(opts = {}) {
	const data = await readSeedInputs(opts.outDir);
	const recipeBackup = readBackup('recipe_i18n', opts.backupDir);
	const nameBackup = readBackup('ingredient_i18n', opts.backupDir);
	if (!recipeBackup || !nameBackup) throw new Error('no translation backup: artefacts must carry the translations remote serves');
	const seed = buildLocalSeed(data, { recipe_i18n: recipeBackup.rows, ingredient_i18n: nameBackup.rows });
	const db = schemaDb();
	for (const sql of seed.sql) db.exec(sql);
	return { db, seed, backup: { recipe_i18n: recipeBackup.exported_at, ingredient_i18n: nameBackup.exported_at } };
}

/**
 * A database from plain INSERT statements (a test fixture), with the FTS
 * tables filled the way the seeds fill them.
 * @param {string} sql
 */
export function fixtureDb(sql) {
	const db = schemaDb();
	db.exec(sql);
	for (const s of [...ingredientFtsRefresh(), ...titleFtsRefresh(0)]) db.exec(s.sql);
	return db;
}

const json = (/** @type {unknown} */ value) => Buffer.from(JSON.stringify(value), 'utf8');

/**
 * @param {DatabaseSync} db
 * @param {string} sql
 * @returns {any[]}
 */
const all = (db, sql) => db.prepare(sql).all();

/** @param {(string | null)[]} values */
function vocabulary(values) {
	return [...new Set(values.filter((v) => v !== null))].sort(compareBinary);
}

/**
 * @param {unknown} v
 * @param {string} what
 */
function integerOrNull(v, what) {
	if (v === null) return NULL_INT;
	if (!Number.isInteger(v) || /** @type {number} */ (v) <= NULL_INT || /** @type {number} */ (v) > 0x7fffffff) {
		throw new Error(`${what} is ${v}; core.bin stores it as a 32-bit integer`);
	}
	return /** @type {number} */ (v);
}

/**
 * @param {number} value
 * @param {number} max
 * @param {string} what
 */
function bounded(value, max, what) {
	if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`${what} is ${value}, outside 0..${max}`);
	return value;
}

/** Everything the artefacts are made of, read once. @param {DatabaseSync} db */
function readCorpus(db) {
	const ingredients = all(db, 'SELECT id, canonical_key, category, is_staple, recipe_count FROM ingredients ORDER BY id');
	ingredients.forEach((ing, i) => {
		if (ing.id !== i + 1) throw new Error(`ingredient ids must be 1..N in order (the seeds number them so); found ${ing.id} at ${i + 1}`);
	});
	const recipeColumns = all(db, `SELECT name FROM pragma_table_info('recipes') ORDER BY cid`).map((r) => r.name);
	const recipes = all(db, 'SELECT * FROM recipes ORDER BY id');
	return {
		ingredients,
		recipeColumns,
		recipes,
		recipeIngredients: all(
			db,
			`SELECT ri.recipe_id, ri.ingredient_id, ri.raw_text, ri.quantity, ri.unit, ri.grams
			   FROM recipe_ingredients ri ORDER BY ri.recipe_id, ri.ingredient_id`
		),
		genericOf: all(db, 'SELECT generic_id, specific_id FROM ingredient_generic_of ORDER BY generic_id, specific_id'),
		allergens: all(
			db,
			`SELECT ia.ingredient_id, a.key FROM ingredient_allergens ia JOIN allergens a ON a.id = ia.allergen_id
			  ORDER BY ia.ingredient_id, a.key`
		),
		allergenKeys: all(db, 'SELECT key FROM allergens ORDER BY key').map((r) => r.key),
		diets: all(db, 'SELECT recipe_id, diet FROM recipe_diets ORDER BY recipe_id, diet'),
		recipeI18n: all(db, 'SELECT recipe_id, lang, title, instructions, is_machine FROM recipe_i18n ORDER BY recipe_id, lang'),
		ingredientI18n: all(db, 'SELECT ingredient_id, lang, name FROM ingredient_i18n ORDER BY ingredient_id, lang'),
		micronutrients: all(
			db,
			'SELECT recipe_id, nutrient_key, amount, unit, pct_nrv FROM recipe_micronutrient ORDER BY recipe_id, nutrient_key'
		),
		related: all(db, 'SELECT recipe_id, related_ids FROM recipe_related ORDER BY recipe_id')
	};
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => number} key
 * @returns {Map<number, T[]>}
 */
function groupBy(rows, key) {
	const out = new Map();
	for (const row of rows) {
		const k = key(row);
		if (!out.has(k)) out.set(k, []);
		out.get(k).push(row);
	}
	return out;
}

/**
 * core.bin's bytes.
 * @param {Record<string, ArrayLike<number>>} columns by CORE_SECTIONS name
 * @param {object} header everything but `sections`
 */
export function encodeCore(columns, header) {
	/** @type {Record<string, [number, number]>} */
	const sections = {};
	let offset = 0;
	for (const [name, type] of CORE_SECTIONS) {
		const values = columns[name];
		if (!values) throw new Error(`core section ${name} missing`);
		sections[name] = [offset, values.length];
		offset += Math.ceil((values.length * ELEMENT[type].BYTES_PER_ELEMENT) / 8) * 8;
	}
	const headerJson = Buffer.from(JSON.stringify({ ...header, sections }), 'utf8');
	const base = sectionBase(headerJson.length);
	const out = Buffer.alloc(base + offset);
	out.write(CORE_MAGIC, 0, 'latin1');
	out.writeUInt32LE(headerJson.length, 8);
	headerJson.copy(out, 12);
	for (const [name, type] of CORE_SECTIONS) {
		const Typed = ELEMENT[type];
		const typed = Typed.from(columns[name]);
		if (type !== 'f64' && typed.some((v, i) => v !== columns[name][i])) throw new Error(`core section ${name} overflows ${type}`);
		Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).copy(out, base + sections[name][0]);
	}
	return out;
}

/**
 * Strings joined by NUL, with each one's start (core.js reads item i as bytes
 * [start[i], start[i + 1] - 1)).
 * @param {string[]} list
 * @param {string} what
 */
function stringBlob(list, what) {
	/** @type {number[]} */
	const start = [];
	/** @type {Buffer[]} */
	const parts = [];
	let at = 0;
	for (const s of list) {
		if (s.includes('\0')) throw new Error(`${what} ${JSON.stringify(s)} contains NUL, the separator in core.bin`);
		const bytes = Buffer.from(s, 'utf8');
		start.push(at);
		parts.push(bytes, Buffer.from([0]));
		at += bytes.length + 1;
	}
	start.push(at);
	// No NUL after the last item, so the blob splits into exactly list.length items.
	return { start, blob: Buffer.concat(parts).subarray(0, Math.max(0, at - 1)) };
}

/**
 * Each list of a CSR layout as gaps: first value from 0, then from its
 * predecessor (the lists are ascending, so every gap is >= 0).
 * @param {number[]} values
 * @param {number[]} start
 */
function deltas(values, start) {
	const out = [];
	for (let i = 0; i + 1 < start.length; i++) {
		let prev = 0;
		for (let j = start[i]; j < start[i + 1]; j++) {
			if (values[j] < prev) throw new Error('CSR list not ascending');
			out.push(values[j] - prev);
			prev = values[j];
		}
	}
	return out;
}

/**
 * Rank of every element under `compare`: dense (equal elements share a rank)
 * or unique (positions in the order, for a comparator that is a total order).
 * @param {number} n
 * @param {(a: number, b: number) => number} compare
 * @param {boolean} dense
 */
function ranks(n, compare, dense) {
	const order = Array.from({ length: n }, (_, i) => i).sort(compare);
	const rank = new Array(n);
	let k = 0;
	order.forEach((r, i) => {
		if (i > 0 && (!dense || compare(order[i - 1], r) !== 0)) k++;
		rank[r] = k;
	});
	return { rank, order };
}

/**
 * @param {ReturnType<typeof readCorpus>} d
 * @param {Map<number, string>} source source-language title per recipe id
 * @param {string} version
 */
function coreBytes(d, source, version) {
	const R = d.recipes.length;
	const N = d.ingredients.length;
	const recipeIndex = new Map(d.recipes.map((r, i) => [r.id, i]));
	const vocab = {
		cuisine: vocabulary(d.recipes.map((r) => r.cuisine)),
		mealType: vocabulary(d.recipes.map((r) => r.meal_type)),
		grade: vocabulary(d.recipes.map((r) => r.balance_grade)),
		diet: vocabulary(d.diets.map((r) => r.diet)),
		allergen: [...d.allergenKeys].sort(compareBinary),
		category: vocabulary(d.ingredients.map((i) => i.category))
	};
	if (vocab.diet.length > 8) throw new Error('more than 8 diets: dietMask is a u8');
	if (vocab.allergen.length > 16) throw new Error('more than 16 allergens: allergenMask is a u16');
	if (vocab.grade.length > 254) throw new Error('more than 254 grades: match.js sorts a NULL grade as 255');
	/** @param {string[]} list @param {string | null} v */
	const code = (list, v) => (v === null ? 0 : list.indexOf(v) + 1);

	const ingAllergen = new Uint16Array(N);
	for (const a of d.allergens) ingAllergen[a.ingredient_id - 1] |= 1 << vocab.allergen.indexOf(a.key);
	const dietMask = new Uint8Array(R);
	for (const row of d.diets) dietMask[/** @type {number} */ (recipeIndex.get(row.recipe_id))] |= 1 << vocab.diet.indexOf(row.diet);

	const byRecipe = groupBy(d.recipeIngredients, (ri) => ri.recipe_id);
	const recipeIngStart = [0];
	/** @type {number[]} */
	const recipeIng = [];
	const allergenMask = new Uint16Array(R);
	const postings = Array.from({ length: N }, () => /** @type {number[]} */ ([]));
	/** @type {number[]} */
	const nonStaple = [];
	d.recipes.forEach((r, i) => {
		const rows = byRecipe.get(r.id) ?? [];
		for (const ri of rows) {
			const g = ri.ingredient_id - 1;
			recipeIng.push(g);
			postings[g].push(i);
			allergenMask[i] |= ingAllergen[g];
		}
		recipeIngStart.push(recipeIng.length);
		// match.ts's COALESCE(r.non_staple_count, <live count>).
		const count = r.non_staple_count ?? rows.filter((ri) => d.ingredients[ri.ingredient_id - 1].is_staple === 0).length;
		nonStaple.push(bounded(count, 0xffff, `recipe ${r.id} non_staple_count`));
	});
	const postingStart = [0];
	for (const list of postings) postingStart.push(/** @type {number} */ (postingStart.at(-1)) + list.length);

	const specifics = groupBy(d.genericOf, (row) => row.generic_id);
	const specificStart = [0];
	/** @type {number[]} */
	const specific = [];
	for (let g = 0; g < N; g++) {
		for (const row of specifics.get(g + 1) ?? []) specific.push(row.specific_id - 1);
		specificStart.push(specific.length);
	}

	for (const r of d.recipes) {
		if (typeof r.nutrition_coverage !== 'number') throw new Error(`recipe ${r.id} nutrition_coverage is ${r.nutrition_coverage}`);
		if (r.kcal !== null && typeof r.kcal !== 'number') throw new Error(`recipe ${r.id} kcal is ${r.kcal}`);
	}
	const total = d.recipes.map((r) => integerOrNull(r.total_minutes, `recipe ${r.id} total_minutes`));
	const isNull = (/** @type {number} */ v) => (v === NULL_INT ? 1 : 0);
	// The per-recipe parts of match.ts's ORDER BYs, as ranks match.js combines
	// into one sort key per candidate; NULLs sort where SQLite puts them.
	// `(r.total_minutes IS NULL) ASC, r.total_minutes ASC`
	const timeDense = ranks(R, (a, b) => isNull(total[a]) - isNull(total[b]) || total[a] - total[b], true).rank;
	// `r.total_minutes ASC, r.id ASC`, NULL first (NULL_INT is the smallest i32)
	const time = ranks(R, (a, b) => total[a] - total[b] || a - b, false);
	// `(r.nutrition_coverage < 0.7 OR r.kcal IS NULL) ASC, r.kcal ASC`, NULL first
	/** @param {number} i */
	const noKcal = (i) => (d.recipes[i].kcal === null || d.recipes[i].nutrition_coverage < 0.7 ? 1 : 0);
	/** @param {number} i */
	const kcal = (i) => (d.recipes[i].kcal === null ? -Infinity : d.recipes[i].kcal);
	const kcalDense = ranks(R, (a, b) => noKcal(a) - noKcal(b) || kcal(a) - kcal(b) || 0, true).rank;

	// search.ts: `(r.balance_grade IS NULL) ASC, r.total_minutes IS NULL, r.total_minutes ASC, r.id ASC`
	const grade = d.recipes.map((r) => r.balance_grade);
	const byHit = ranks(
		R,
		(a, b) =>
			(grade[a] === null ? 1 : 0) - (grade[b] === null ? 1 : 0) ||
			isNull(total[a]) - isNull(total[b]) ||
			total[a] - total[b] ||
			a - b,
		false
	).order;

	const maxNonStaple = Math.max(0, ...nonStaple);
	// The largest key match.js can build (it counts at most N + 1 levels of
	// "selections used") must stay an exact integer in a double.
	const miss = maxNonStaple + 1;
	const largest = (N + 1) * Math.max(R * miss * R, 256 * miss * R, miss * miss * R);
	if (!(largest < 2 ** 53)) throw new Error(`match sort keys could reach ${largest}, beyond 2^53`);

	const titles = stringBlob(d.recipes.map((r) => source.get(r.id) ?? ''), 'title');
	const keys = stringBlob(d.ingredients.map((i) => i.canonical_key), 'canonical_key');
	const keyOrder = d.ingredients
		.map((_, g) => g)
		.sort((a, b) => compareBinary(d.ingredients[a].canonical_key, d.ingredients[b].canonical_key));

	const columns = {
		recipeId: d.recipes.map((r) => r.id),
		prepMinutes: d.recipes.map((r) => integerOrNull(r.prep_minutes, `recipe ${r.id} prep_minutes`)),
		totalMinutes: total,
		balanceScore: d.recipes.map((r) => integerOrNull(r.balance_score, `recipe ${r.id} balance_score`)),
		kcal: d.recipes.map((r) => (r.kcal === null ? NaN : r.kcal)),
		coverage: d.recipes.map((r) => r.nutrition_coverage),
		nonStaple,
		allergenMask,
		cuisine: d.recipes.map((r) => code(vocab.cuisine, r.cuisine)),
		mealType: d.recipes.map((r) => code(vocab.mealType, r.meal_type)),
		grade: d.recipes.map((r) => code(vocab.grade, r.balance_grade)),
		dietMask,
		servingsAssumed: d.recipes.map((r) => bounded(r.servings_assumed, 0xff, `recipe ${r.id} servings_assumed`)),
		hasTitle: d.recipes.map((r) => (source.has(r.id) ? 1 : 0)),
		titleStart: titles.start,
		titleBlob: titles.blob,
		timeRank: time.rank,
		byTime: time.order,
		timeDense,
		kcalDense,
		byHit,
		recipeIngStart,
		recipeIng: deltas(recipeIng, recipeIngStart),
		isStaple: d.ingredients.map((i) => bounded(i.is_staple, 1, `ingredient ${i.canonical_key} is_staple`)),
		category: d.ingredients.map((i) => code(vocab.category, i.category)),
		recipeCount: d.ingredients.map((i) => i.recipe_count),
		keyStart: keys.start,
		keyBlob: keys.blob,
		keyOrder,
		specificStart,
		specific,
		postingStart,
		posting: deltas(postings.flat(), postingStart)
	};
	const titleText = titles.blob.toString('utf8');
	return encodeCore(columns, {
		format: CORE_FORMAT,
		version,
		recipes: R,
		ingredients: N,
		maxNonStaple,
		titlesFoldByLowerCase: ftsFold(titleText) === titleText.toLowerCase(),
		vocab
	});
}

/**
 * Languages that get titles/names/mosaic files: every supported language,
 * plus any other the data holds, so a language without its own file is one
 * that has no rows at all (and falls back exactly like the SQL).
 * @param {ReturnType<typeof readCorpus>} d
 */
function languages(d) {
	return [...new Set([...SUPPORTED_LANGS, ...d.recipeI18n.map((r) => r.lang), ...d.ingredientI18n.map((r) => r.lang)])].sort(
		compareBinary
	);
}

/**
 * The small files, for one version string.
 * @param {ReturnType<typeof readCorpus>} d
 * @param {string} version
 * @param {string[]} langs
 */
function smallFiles(d, version, langs) {
	/** @type {Map<string, Buffer>} */
	const files = new Map();
	const sourceLang = new Map(d.recipes.map((r) => [r.id, r.source_lang]));
	const recipeIds = d.recipes.map((r) => r.id);
	const source = new Map(d.recipeI18n.filter((t) => t.lang === sourceLang.get(t.recipe_id)).map((t) => [t.recipe_id, t.title]));
	const core = coreBytes(d, source, version);
	files.set('core.bin', core);

	const byLang = groupBy(d.recipeI18n, (t) => langs.indexOf(t.lang));
	/** @type {Record<string, string>} */
	const titleOverrides = {};
	for (const lang of langs) {
		const differ = (byLang.get(langs.indexOf(lang)) ?? []).filter((t) => t.title !== (source.get(t.recipe_id) ?? null));
		const body = json({ version, lang, ids: differ.map((t) => t.recipe_id), titles: differ.map((t) => t.title) });
		files.set(`titles/${lang}.json`, body);
		titleOverrides[lang] = body.toString('utf8');
	}

	/** @param {string} lang */
	const ownNames = (lang) => {
		/** @type {(string | null)[]} */
		const list = d.ingredients.map(() => null);
		for (const row of d.ingredientI18n) {
			if (row.lang !== lang) continue;
			// \n joins the names in the file (corpus.js NamesFile).
			if (row.name.includes('\n')) throw new Error(`ingredient ${row.ingredient_id} ${lang} name ${JSON.stringify(row.name)} has a line break`);
			list[row.ingredient_id - 1] = row.name;
		}
		return list;
	};
	const en = ownNames('en');
	/** @type {Record<string, string>} */
	const names = {};
	for (const lang of langs) {
		const own = ownNames(lang);
		// COALESCE(t.name, en.name, i.canonical_key)
		const joined = own.map((name, g) => name ?? en[g] ?? d.ingredients[g].canonical_key).join('\n');
		const body = json({
			version,
			lang,
			names: joined,
			own: own.map((name) => (name === null ? '0' : '1')).join(''),
			foldByLowerCase: ftsFold(joined) === joined.toLowerCase()
		});
		files.set(`names/${lang}.json`, body);
		names[lang] = body.toString('utf8');
	}

	const corpus = loadCorpus({ core, titles: titleOverrides, names });
	for (const lang of langs) files.set(`mosaic/${lang}.json`, json({ version, lang, results: buildMosaic(corpus, lang) }));
	files.set('sitemap.json', json({ version, ids: recipeIds }));
	return files;
}

/**
 * r/<id>.json bodies.
 * @param {ReturnType<typeof readCorpus>} d
 */
function recipeFiles(d) {
	const ingById = d.ingredients;
	const ingredients = groupBy(d.recipeIngredients, (ri) => ri.recipe_id);
	const texts = groupBy(d.recipeI18n, (t) => t.recipe_id);
	const micros = groupBy(d.micronutrients, (m) => m.recipe_id);
	const related = new Map(d.related.map((r) => [r.recipe_id, JSON.parse(r.related_ids)]));
	/** @type {Map<string, Buffer>} */
	const files = new Map();
	for (const r of d.recipes) {
		const recipe = Object.fromEntries(d.recipeColumns.map((c) => [c, r[c]]));
		const i18n = Object.fromEntries(
			(texts.get(r.id) ?? []).map((t) => [t.lang, { title: t.title, instructions: t.instructions, is_machine: t.is_machine }])
		);
		// The page's `ORDER BY i.is_staple, i.category`, ties in primary-key
		// (ingredient id) order, which is the order the page's plan reads them.
		const rows = (ingredients.get(r.id) ?? [])
			.map((ri) => ({ ri, ing: ingById[ri.ingredient_id - 1] }))
			.sort((a, b) => a.ing.is_staple - b.ing.is_staple || compareBinary(a.ing.category, b.ing.category) || a.ing.id - b.ing.id)
			.map(({ ri, ing }) => ({
				id: ing.id,
				canonical_key: ing.canonical_key,
				category: ing.category,
				raw_text: ri.raw_text,
				quantity: ri.quantity,
				unit: ri.unit,
				grams: ri.grams
			}));
		const body = {
			recipe,
			i18n,
			ingredients: rows,
			micronutrients: (micros.get(r.id) ?? []).map((m) => ({
				nutrient_key: m.nutrient_key,
				amount: m.amount,
				unit: m.unit,
				pct_nrv: m.pct_nrv
			})),
			related: related.get(r.id) ?? []
		};
		files.set(`r/${r.id}.json`, json(body));
	}
	return files;
}

/** @param {Map<string, Buffer>} files */
function contentVersion(files) {
	const hash = createHash('sha256');
	for (const p of [...files.keys()].sort(compareBinary)) hash.update(`${p}\0${sha256(/** @type {Buffer} */ (files.get(p)))}\n`);
	return hash.digest('hex').slice(0, 16);
}

/**
 * Every artefact file and the manifest, from one database. Deterministic: the
 * same database gives byte-identical files and the same version.
 * @param {DatabaseSync} db
 * @param {{ source?: Record<string, unknown> }} [opts] provenance recorded in the manifest
 */
export function buildArtefacts(db, opts = {}) {
	const d = readCorpus(db);
	const langs = languages(d);
	const recipes = recipeFiles(d);
	const version = contentVersion(new Map([...smallFiles(d, '', langs), ...recipes]));
	const files = new Map([...smallFiles(d, version, langs), ...recipes]);

	const perLang = (/** @type {{ lang: string }[]} */ rows) => {
		/** @type {Record<string, number>} */
		const out = {};
		for (const lang of langs) out[lang] = 0;
		for (const r of rows) out[r.lang]++;
		return out;
	};
	const overrides = Object.fromEntries(
		langs.map((lang) => [lang, JSON.parse(/** @type {Buffer} */ (files.get(`titles/${lang}.json`)).toString('utf8')).ids.length])
	);
	const manifest = {
		format: ARTEFACT_FORMAT,
		version,
		langs,
		counts: {
			recipes: d.recipes.length,
			ingredients: d.ingredients.length,
			recipe_ingredients: d.recipeIngredients.length,
			recipe_i18n: perLang(d.recipeI18n),
			ingredient_i18n: perLang(d.ingredientI18n),
			title_overrides: overrides
		},
		source: opts.source ?? {},
		files: [...files.keys()].sort(compareBinary).map((p) => {
			const body = /** @type {Buffer} */ (files.get(p));
			return { path: p, bytes: body.length, sha256: sha256(body) };
		})
	};
	files.set('manifest.json', Buffer.from(manifestJson(manifest), 'utf8'));
	return { version, files, manifest };
}

/**
 * Indented for reading, but one line per file entry: 3,500 entries of five
 * lines each would more than double the file.
 * @param {{ files: object[] }} manifest
 */
function manifestJson(manifest) {
	const { files, ...rest } = manifest;
	const head = JSON.stringify(rest, null, '\t').slice(0, -2);
	return `${head},\n\t"files": [\n${files.map((f) => `\t\t${JSON.stringify(f)}`).join(',\n')}\n\t]\n}\n`;
}

/**
 * Size budgets, checked whenever artefacts are built or installed. Ceilings,
 * not targets: well above today's sizes (README, data section) and well under
 * the platform limits they protect (20,000 asset files and 25 MiB per file on
 * the free plan; the Worker's own parse time for the bundled files).
 */
export const BUDGETS = {
	coreGzip: 256 * 1024,
	titlesLangGzip: 96 * 1024,
	namesLangGzip: 24 * 1024,
	mosaicLangGzip: 32 * 1024,
	recipeRaw: 1024 * 1024,
	files: 12_000,
	totalRaw: 160 * 1024 * 1024
};

/**
 * Problems with the files against BUDGETS (empty when within budget).
 * @param {Map<string, Buffer>} files
 */
export function checkBudgets(files, budgets = BUDGETS) {
	const problems = [];
	const gz = (/** @type {Buffer} */ b) => gzipSync(b, { level: 9 }).length;
	let total = 0;
	for (const [p, body] of files) {
		total += body.length;
		/** @param {number} size @param {number} max @param {string} what */
		const over = (size, max, what) => {
			if (size > max) problems.push(`${p}: ${what} ${size} bytes, budget ${max}`);
		};
		if (p === 'core.bin') over(gz(body), budgets.coreGzip, 'gzip');
		else if (p.startsWith('titles/')) over(gz(body), budgets.titlesLangGzip, 'gzip');
		else if (p.startsWith('names/')) over(gz(body), budgets.namesLangGzip, 'gzip');
		else if (p.startsWith('mosaic/')) over(gz(body), budgets.mosaicLangGzip, 'gzip');
		else if (p.startsWith('r/')) over(body.length, budgets.recipeRaw, 'raw');
	}
	if (files.size > budgets.files) problems.push(`${files.size} files, budget ${budgets.files}`);
	if (total > budgets.totalRaw) problems.push(`${total} bytes in total, budget ${budgets.totalRaw}`);
	return problems;
}
