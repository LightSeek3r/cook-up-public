/**
 * Validate + apply manually-translated recipe_i18n rows produced by an LLM
 * translation agent.
 *
 * This exists to replace agents hand-authoring SQL directly, which caused two
 * real data-corruption incidents (English placeholder text inserted as if it
 * were a translation; the literal characters backslash+n typed into a
 * multi-line SQL string instead of a real newline). The agent's only job now
 * is to produce the JSON below — every check and every byte of SQL comes from
 * this script, not from the agent's self-report.
 *
 * Input JSON shape (anything else in an object, e.g. a `title` key, is never
 * read — title always comes from the source cache, never from the agent):
 *   [{ "recipe_id": 4821, "instructions": "1. Line one.\n2. Line two." }, ...]
 *
 * Source rows come from the local pipeline/out/sources.json cache
 * (pipeline/tools/export_sources.mjs), not a remote SELECT — that cache is
 * static (source text doesn't change mid-run) and re-reading it from D1 on
 * every batch was one of two remote SELECTs this script used to make per run,
 * neither of which needed to touch D1 at all. See
 * the unpublished plan notes, Part A, for why that mattered:
 * it was the difference between a handful of D1 reads for the whole
 * translation effort and re-scanning thousands of rows per 25-row batch.
 *
 * Already-applied (recipe_id, lang) pairs are tracked in the local
 * pipeline/out/applied/<lang>.json cache (append-only, this script writes it)
 * instead of a second remote SELECT before every batch. That cache is a
 * performance optimization, not the correctness gate — INSERT OR IGNORE (or
 * INSERT OR REPLACE with --overwrite) is what actually protects the DB if the
 * cache is ever stale, e.g. before pipeline/tools/next_batch.mjs's own gap
 * computation has had a chance to skip a row the cache doesn't know about yet.
 *
 * Usage:
 *   node pipeline/tools/apply_manual_translations.mjs --lang=fr --file=batch.json [--file=batch2.json ...] [--dry-run] [--overwrite] [--local]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { esc, d1 } from '../lib/d1.mjs';
import {
	nonEmptyLineCount,
	hasLiteralBackslashN,
	hasTargetScript,
	looksUntranslated,
	lengthRatioOk
} from '../lib/translate_gate.mjs';

const OUT_DIR = path.resolve('pipeline/out');
const SOURCES_PATH = path.join(OUT_DIR, 'sources.json');
const APPLIED_DIR = path.join(OUT_DIR, 'applied');
const FLUSH_EVERY = 15; // matches 07_translate.mjs — validated against real multi-KB CJK/Arabic text

function parseArgs() {
	const args = process.argv.slice(2);
	const str = (flag) => {
		const hit = args.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	const all = (flag) =>
		args.filter((a) => a.startsWith(`--${flag}=`)).map((a) => a.split('=').slice(1).join('='));
	const lang = str('lang');
	const files = all('file');
	if (!lang) throw new Error('--lang=<code> is required');
	if (!files.length) throw new Error('at least one --file=<path> is required');
	return {
		lang,
		files,
		dryRun: args.includes('--dry-run'),
		overwrite: args.includes('--overwrite'),
		local: args.includes('--local')
	};
}

function loadBatch(file) {
	const raw = JSON.parse(readFileSync(file, 'utf8'));
	if (!Array.isArray(raw)) throw new Error(`${file}: input file must be a JSON array`);
	const seen = new Set();
	for (const row of raw) {
		if (typeof row !== 'object' || row === null) throw new Error(`${file}: every element must be an object`);
		if (!Number.isInteger(row.recipe_id) || row.recipe_id <= 0) {
			throw new Error(`${file}: invalid recipe_id: ${JSON.stringify(row.recipe_id)}`);
		}
		if (typeof row.instructions !== 'string' || row.instructions.trim() === '') {
			throw new Error(`${file}: recipe_id ${row.recipe_id}: instructions must be a non-empty string`);
		}
		if (seen.has(row.recipe_id)) throw new Error(`${file}: duplicate recipe_id ${row.recipe_id} within input file`);
		seen.add(row.recipe_id);
	}
	return raw;
}

function loadSources() {
	if (!existsSync(SOURCES_PATH)) {
		throw new Error(
			`${SOURCES_PATH} not found — run node pipeline/tools/export_sources.mjs first (one-time, real D1 reads).`
		);
	}
	const rows = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));
	return new Map(rows.map((r) => [r.id, r]));
}

const appliedPath = (lang) => path.join(APPLIED_DIR, `${lang}.json`);

function loadApplied(lang) {
	const p = appliedPath(lang);
	return existsSync(p) ? new Set(JSON.parse(readFileSync(p, 'utf8'))) : new Set();
}

function saveApplied(lang, ids) {
	mkdirSync(APPLIED_DIR, { recursive: true });
	writeFileSync(appliedPath(lang), JSON.stringify([...ids].sort((a, b) => a - b)) + '\n');
}

async function main() {
	const { lang, files, dryRun, overwrite, local } = parseArgs();

	const batch = files.flatMap(loadBatch);
	const seenAcrossFiles = new Set();
	for (const row of batch) {
		if (seenAcrossFiles.has(row.recipe_id)) throw new Error(`duplicate recipe_id ${row.recipe_id} across input files`);
		seenAcrossFiles.add(row.recipe_id);
	}
	if (batch.length === 0) {
		console.log('apply_manual_translations: input file(s) empty, nothing to do');
		return;
	}

	const sourceById = loadSources();
	const appliedIds = loadApplied(lang);

	const rejects = [];
	const skippedExisting = [];
	const inserts = [];

	for (const row of batch) {
		const source = sourceById.get(row.recipe_id);
		if (!source) {
			rejects.push([row.recipe_id, 'no-source-match']);
			continue;
		}
		if (appliedIds.has(row.recipe_id) && !overwrite) {
			skippedExisting.push(row.recipe_id);
			continue;
		}
		if (nonEmptyLineCount(source.instructions) !== nonEmptyLineCount(row.instructions)) {
			rejects.push([row.recipe_id, 'line-count-mismatch']);
			continue;
		}
		if (hasLiteralBackslashN(row.instructions)) {
			rejects.push([row.recipe_id, 'literal-backslash-n-found']);
			continue;
		}
		const scriptCheck = hasTargetScript(lang, row.instructions);
		if (scriptCheck === false) {
			rejects.push([row.recipe_id, 'no-target-script']);
			continue;
		}
		if (scriptCheck === undefined && looksUntranslated(source.instructions, row.instructions)) {
			rejects.push([row.recipe_id, 'byte-identical-to-source']);
			continue;
		}
		if (!lengthRatioOk(source.instructions, row.instructions)) {
			rejects.push([row.recipe_id, 'length-ratio-out-of-bounds']);
			continue;
		}
		inserts.push({ recipe_id: row.recipe_id, title: source.title, instructions: row.instructions });
	}

	// OR IGNORE (OR REPLACE with --overwrite), not a pre-check SELECT: the
	// local applied-cache above is what cheaply skips already-done rows; this
	// is the DB-side backstop for when that cache is stale, so a genuine
	// collision is silently dropped rather than erroring the whole chunk.
	const insertKeyword = overwrite ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
	let insertedCount = 0;
	const attemptedIds = [];
	for (let i = 0; i < inserts.length; i += FLUSH_EVERY) {
		const chunk = inserts.slice(i, i + FLUSH_EVERY);
		const values = chunk
			.map((r) => `(${r.recipe_id},${esc(lang)},${esc(r.title)},${esc(r.instructions)},1)`)
			.join(',\n');
		if (!dryRun) {
			d1(
				`${insertKeyword} INTO recipe_i18n (recipe_id, lang, title, instructions, is_machine) VALUES\n${values};`,
				{ local, json: false }
			);
		}
		insertedCount += chunk.length;
		attemptedIds.push(...chunk.map((r) => r.recipe_id));
	}

	if (!dryRun && attemptedIds.length) {
		saveApplied(lang, new Set([...appliedIds, ...attemptedIds]));
	}

	// No FTS rebuild here (deliberate, not an oversight): recipe_title_fts now
	// indexes only source-lang rows (migrations/0008_recipe_title_fts_source_only.sql)
	// because titles are never translated, so a manually-translated row is never
	// indexed and there is nothing to rebuild. Rebuilding after every batch used
	// to re-read and rewrite the whole table — the actual cause of exhausting the
	// D1 free-tier read quota twice. Do not reintroduce a 'rebuild' call here.

	if (rejects.length) {
		mkdirSync(OUT_DIR, { recursive: true });
		const logPath = path.join(OUT_DIR, `manual_apply_rejects_${lang}.txt`);
		writeFileSync(logPath, rejects.map(([id, reason]) => `${id}\t${reason}`).join('\n') + '\n');
	}

	console.log(
		`apply_manual_translations: lang=${lang} inserted=${insertedCount} skipped-existing=${skippedExisting.length} ` +
			`rejected=${rejects.length}${dryRun ? ' [DRY RUN — nothing written]' : ''}`
	);
	if (rejects.length) {
		const counts = {};
		for (const [, reason] of rejects) counts[reason] = (counts[reason] ?? 0) + 1;
		console.log(`apply_manual_translations: reject reasons — ${JSON.stringify(counts)}`);
	}
	if (rejects.length / batch.length > 0.2) {
		console.log(
			`apply_manual_translations: WARNING — ${rejects.length}/${batch.length} rows rejected (>20%). ` +
				`This usually means something is systematically wrong with this batch, not normal per-row noise.`
		);
	}
}

await main();
