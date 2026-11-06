/**
 * Batch check and merge behind pipeline/tools/seasons_apply.mjs. Pure: the
 * tool loads the files, this decides, the tool writes.
 *
 * A batch is a JSON object key -> entry (the shapes of seasons_compile.mjs),
 * or key -> {"seasonal": "<family>"}: a classifier's verdict that the key needs
 * its windows written, recorded for the next triage instead of in a family
 * file. The whole batch is validated together; any problem rejects all of it.
 */

import { AY_FAMILY, FAMILIES, familyIndex, flattenSources } from './seasons_compile.mjs';
import { missingKeys, validateEntry } from './seasons_gate.mjs';

/** Families a seasonal or `like` entry can live in. */
export const WRITER_FAMILIES = FAMILIES.filter((f) => f !== AY_FAMILY);

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isVerdict = (v) => isObject(v) && Object.hasOwn(v, 'seasonal') && Object.keys(v).length === 1;
const writerFamily = (f) => (f && f !== AY_FAMILY ? f : undefined);

/**
 * @param {object} input
 * @param {unknown} input.batch parsed batch file
 * @param {{ canonical_key: string }[]} input.ingredients
 * @param {Record<string, Record<string, object>>} input.sources
 * @param {Map<string, string>} [input.assignments] key -> family from the last triage's todo files
 * @param {Record<string, string>} [input.verdicts] earlier seasonal verdicts, key -> family
 * @param {string} [input.family] --family: where seasonal entries go, overriding the assignment
 * @param {boolean} [input.overwrite] replace entries that are already decided
 * @returns {{ errors: object[], merged: Record<string, Record<string, object>>, placed: Map<string, string>, verdicts: Record<string, string>, recorded: number, remaining: number }}
 */
export function checkBatch({ batch, ingredients, sources, assignments = new Map(), verdicts = {}, family: forced, overwrite = false }) {
	const errors = [];
	const fail = (key, rule, message) => errors.push({ ...(key ? { key } : {}), rule, message });
	const merged = Object.fromEntries(FAMILIES.map((f) => [f, { ...(isObject(sources[f]) ? sources[f] : {}) }]));
	const result = (extra = {}) => ({ errors, merged, placed: new Map(), verdicts, recorded: 0, remaining: 0, ...extra });

	if (!isObject(batch)) {
		fail(undefined, 'batch', 'batch file must be a JSON object of key -> entry');
		return result();
	}
	const keys = Object.keys(batch);
	if (!keys.length) {
		fail(undefined, 'batch', 'batch is empty');
		return result();
	}
	if (forced !== undefined && !WRITER_FAMILIES.includes(forced)) {
		fail(undefined, 'family', `--family must be one of ${WRITER_FAMILIES.join(', ')}`);
		return result();
	}

	const known = new Set(ingredients.map((r) => r.canonical_key));
	const current = familyIndex(sources);
	const entries = new Map();
	const newVerdicts = {};
	for (const key of keys) {
		const value = batch[key];
		if (!known.has(key)) {
			fail(key, 'unknown-key', 'not a canonical_key in ingredients.jsonl: use the exact keys from the batch file');
			continue;
		}
		const existing = current.get(key);
		if (isVerdict(value)) {
			if (existing) fail(key, 'verdict', `already decided in ${existing}.json: a seasonal verdict is only for undecided keys`);
			else if (!WRITER_FAMILIES.includes(value.seasonal)) fail(key, 'family', `"seasonal" must be one of ${WRITER_FAMILIES.join(', ')}`);
			else newVerdicts[key] = value.seasonal;
			continue;
		}
		if (existing && !overwrite) {
			fail(key, 'duplicate-key', `already decided in ${existing}.json; pass --overwrite to replace it`);
			continue;
		}
		if (existing) delete merged[existing][key];
		entries.set(key, value);
	}

	const placed = new Map();
	const likes = [];
	for (const [key, value] of entries) {
		if (isObject(value) && Object.hasOwn(value, 'ay')) placed.set(key, AY_FAMILY);
		else if (isObject(value) && Object.hasOwn(value, 'like') && !Object.hasOwn(value, 'z')) likes.push(key);
		else {
			const family = forced ?? writerFamily(current.get(key)) ?? writerFamily(assignments.get(key)) ?? verdicts[key];
			if (family) placed.set(key, family);
			else fail(key, 'family', `no family assigned to this key: pass --family=<${WRITER_FAMILIES.join('|')}>`);
		}
	}
	// A like sits next to its target unless the key has a family of its own.
	for (const key of likes) {
		const target = batch[key].like;
		const family =
			forced ??
			writerFamily(current.get(key)) ??
			writerFamily(assignments.get(key)) ??
			verdicts[key] ??
			writerFamily(placed.get(target)) ??
			writerFamily(current.get(target)) ??
			WRITER_FAMILIES[0];
		placed.set(key, family);
	}
	for (const [key, family] of placed) merged[family][key] = entries.get(key);

	const flat = flattenSources(merged);
	const lookup = (k) => flat.get(k);
	for (const [key, value] of entries) {
		for (const issue of validateEntry(key, value, { lookup, family: placed.get(key) })) errors.push(issue);
	}
	// Replacing a key can break entries elsewhere that are `like` it.
	for (const [key, entry] of flat) {
		if (placed.has(key) || !isObject(entry) || typeof entry.like !== 'string' || !placed.has(entry.like)) continue;
		for (const issue of validateEntry(key, entry, { lookup })) {
			if (issue.rule === 'like-target') errors.push({ ...issue, message: `${issue.message} (after this batch)` });
		}
	}

	const nextVerdicts = { ...verdicts, ...newVerdicts };
	for (const key of placed.keys()) delete nextVerdicts[key];
	return result({
		placed,
		verdicts: nextVerdicts,
		recorded: Object.keys(newVerdicts).length,
		remaining: missingKeys(ingredients, merged).length
	});
}
