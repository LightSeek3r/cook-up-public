/**
 * Filesystem side of the seasons tools: reading ingredients.jsonl and the
 * family files, writing them back canonically, and the writer-agent work
 * files under pipeline/out/seasons. Decisions live in seasons_compile.mjs,
 * seasons_gate.mjs and seasons_triage.mjs, which stay pure.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AY_FAMILY, FAMILIES, serializeFamily } from './seasons_compile.mjs';

export const SEASONS_DIR = fileURLToPath(new URL('../seasons', import.meta.url));
export const INGREDIENTS_FILE = fileURLToPath(new URL('../out/ingredients.jsonl', import.meta.url));
export const WORK_DIR = fileURLToPath(new URL('../out/seasons', import.meta.url));
/** Writer-agent verdicts "seasonal, family f" for keys that still need their windows written. */
export const VERDICTS_FILE = path.join(WORK_DIR, 'verdicts.json');

/** Rows of ingredients.jsonl in file order, which is core.bin's ingredient order (id = line number). */
export function loadIngredients(file = INGREDIENTS_FILE) {
	if (!existsSync(file)) throw new Error(`${file} not found: run the pipeline (or data:fetch) first`);
	return readFileSync(file, 'utf8')
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l));
}

export function readJson(file, fallback) {
	if (!existsSync(file)) return fallback;
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		throw new Error(`${file}: invalid JSON (${err.message})`, { cause: err });
	}
}

/**
 * Every *.json in the seasons dir (unknown names included, so the gate can
 * report them) as `{ sources: { family: entries }, raw: { family: text } }`.
 * Families without a file read as empty.
 */
export function loadSources(dir = SEASONS_DIR) {
	const sources = {};
	const raw = {};
	for (const family of FAMILIES) sources[family] = {};
	if (existsSync(dir)) {
		for (const file of readdirSync(dir).sort()) {
			if (!file.endsWith('.json')) continue;
			const family = file.slice(0, -5);
			const text = readFileSync(path.join(dir, file), 'utf8');
			raw[family] = text;
			try {
				sources[family] = JSON.parse(text);
			} catch (err) {
				throw new Error(`${path.join(dir, file)}: invalid JSON (${err.message})`, { cause: err });
			}
		}
	}
	return { sources, raw };
}

/** Writes only the families whose bytes change; returns their names. */
export function writeSources(sources, dir = SEASONS_DIR) {
	mkdirSync(dir, { recursive: true });
	const changed = [];
	for (const family of FAMILIES) {
		const file = path.join(dir, `${family}.json`);
		const text = serializeFamily(sources[family] ?? {});
		if (existsSync(file) && readFileSync(file, 'utf8') === text) continue;
		writeFileSync(file, text);
		changed.push(family);
	}
	return changed;
}

/** key -> family the last triage assigned to every undecided key (todo_<family>.json). */
export function loadAssignments(workDir = WORK_DIR) {
	const assigned = new Map();
	for (const family of FAMILIES.filter((f) => f !== AY_FAMILY)) {
		for (const row of readJson(path.join(workDir, `todo_${family}.json`), [])) assigned.set(row.key, family);
	}
	return assigned;
}

export const loadVerdicts = (file = VERDICTS_FILE) => readJson(file, {});

export function writeJson(file, value) {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(value, null, '\t') + '\n');
}

/** Minimal `--flag=value` / `--flag` parser. */
export function parseFlags(argv) {
	const str = (flag) => {
		const hit = argv.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	return { str, has: (flag) => argv.includes(`--${flag}`) };
}
