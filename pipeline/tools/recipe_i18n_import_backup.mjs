/**
 * Seeds the recipe translation store (pipeline/lib/recipe_i18n_store.mjs)
 * from the verified translation backup (pipeline/data/i18n-backup, readBackup
 * checks every file's sha256). Idempotent: it only fills what the store
 * lacks, so a second run changes nothing and never undoes an applied batch.
 *
 * What it takes from each backup row:
 *   - English rows: the source title and instructions;
 *   - every other row: its instructions (origin "backup", reviewed false),
 *     except the rows recipe_i18n_legacy.mjs lists as another recipe's text;
 *   - a title only where it differs from the English one, passes the title
 *     gate and is not listed as wrong there. The other 99 % of backup titles
 *     are the English title copied into the row, i.e. not translated yet.
 *
 * Usage:
 *   node pipeline/tools/recipe_i18n_import_backup.mjs [--backup=pipeline/data/i18n-backup]
 *     [--store=pipeline/data/recipe-i18n] [--pipeline-out=pipeline/out] [--dry-run]
 */

import path from 'node:path';
import { parseFlags } from '../lib/glossary_apply_lib.mjs';
import { BACKUP_DIR, readBackup } from '../lib/i18n_backup.mjs';
import { formatIssue } from '../lib/recipe_i18n_gate.mjs';
import { entryIssues, loadCorpus } from '../lib/recipe_i18n_lib.mjs';
import { LEGACY_WRONG_ROWS, LEGACY_WRONG_TITLES } from '../lib/recipe_i18n_legacy.mjs';
import { KINDS, readFile, SOURCE_LANG, srcHash, STORE_DIR, writeFile } from '../lib/recipe_i18n_store.mjs';

async function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const backupDir = path.resolve(str('backup') ?? BACKUP_DIR);
	const storeDir = path.resolve(str('store') ?? STORE_DIR);
	const outDir = path.resolve(str('pipeline-out') ?? 'pipeline/out');
	const dryRun = has('dry-run');

	const backup = readBackup('recipe_i18n', backupDir);
	if (!backup) throw new Error(`no recipe_i18n backup in ${backupDir}`);
	const byLang = new Map();
	for (const row of backup.rows) {
		if (!byLang.has(row.lang)) byLang.set(row.lang, new Map());
		byLang.get(row.lang).set(row.recipe_id, row);
	}
	const en = byLang.get(SOURCE_LANG);
	if (!en) throw new Error('the backup has no English rows');
	const write = (kind, lang, rows, sha) => (dryRun ? false : writeFile(kind, lang, rows, { dir: storeDir, expectSha: sha }));

	// English first: the gate compares every translation with it.
	for (const kind of KINDS) {
		const { rows, sha256 } = readFile(kind, SOURCE_LANG, storeDir);
		const merged = new Map(rows);
		for (const [id, r] of en) {
			if (merged.has(id)) continue;
			merged.set(id, kind === 'titles' ? { title: r.title } : { instructions: r.instructions, is_machine: r.is_machine });
		}
		const changed = write(kind, SOURCE_LANG, merged, sha256);
		console.log(`import: en ${kind} ${merged.size} rows (${merged.size - rows.size} new${changed ? '' : ', no change on disk'})`);
	}

	const corpus = await loadCorpus({ outDir, storeDir });
	const langs = [...byLang.keys()].filter((l) => l !== SOURCE_LANG).sort();
	for (const lang of langs) {
		const rows = byLang.get(lang);
		const wrongRows = new Set(LEGACY_WRONG_ROWS[lang] ?? []);
		const texts = readFile('instructions', lang, storeDir);
		const mergedTexts = new Map(texts.rows);
		let dropped = 0;
		for (const [id, r] of rows) {
			const source = en.get(id);
			if (!source) throw new Error(`backup ${lang} row ${id} has no English row`);
			if (wrongRows.has(id)) {
				dropped++;
				continue;
			}
			if (mergedTexts.has(id)) continue;
			mergedTexts.set(id, { instructions: r.instructions, is_machine: r.is_machine, src: srcHash(source.instructions), origin: 'backup', reviewed: false });
		}
		const changedTexts = write('instructions', lang, mergedTexts, texts.sha256);

		// The title gate reads the language's instructions (its vocabulary), so
		// titles are checked against what was just merged, not what is on disk.
		corpus.store.instructions[lang] = mergedTexts;
		const titles = readFile('titles', lang, storeDir);
		const mergedTitles = new Map(titles.rows);
		const wrongTitles = new Set([...(LEGACY_WRONG_TITLES[lang] ?? []), ...wrongRows]);
		const refused = [];
		let differ = 0;
		for (const [id, r] of rows) {
			const source = en.get(id);
			if (r.title === source.title || mergedTitles.has(id) || !corpus.recipes.has(id)) continue;
			differ++;
			const entry = { title: r.title, src: srcHash(source.title), origin: 'backup', reviewed: false };
			const issues = entryIssues({ corpus, kind: 'titles', lang, id, entry }).blocking;
			if (wrongTitles.has(id) || issues.length) refused.push(`${id}: ${wrongTitles.has(id) ? 'listed as wrong' : issues.map(formatIssue).join('; ')}`);
			else mergedTitles.set(id, entry);
		}
		corpus.store.titles[lang] = mergedTitles;
		const changedTitles = write('titles', lang, mergedTitles, titles.sha256);
		console.log(
			`import: ${lang} instructions ${mergedTexts.size} rows (${mergedTexts.size - texts.rows.size} new, ${dropped} listed as another recipe's text and left out` +
				`${changedTexts ? '' : ', no change on disk'}); titles ${mergedTitles.size} (${differ} backup titles differ from English, ` +
				`${mergedTitles.size - titles.rows.size} imported, ${refused.length} refused${changedTitles ? '' : ', no change on disk'})`
		);
		for (const line of refused.slice(0, has('verbose') ? Infinity : 5)) console.log(`  refused ${lang} ${line}`);
		if (refused.length > 5 && !has('verbose')) console.log(`  ... ${refused.length - 5} more (--verbose)`);
	}
	console.log(`import: ${dryRun ? 'DRY-RUN, nothing written; ' : ''}store ${path.relative(process.cwd(), storeDir) || storeDir}, backup exported ${backup.exported_at}`);
}

try {
	await main();
} catch (err) {
	console.error(`recipe_i18n_import_backup: ${err.message}`);
	process.exitCode = 1;
}
