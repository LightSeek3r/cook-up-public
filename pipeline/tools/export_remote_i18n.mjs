/**
 * Backs up remote `recipe_i18n` and `ingredient_i18n` into
 * pipeline/data/i18n-backup/ (see pipeline/lib/i18n_backup.mjs for the format).
 *
 * Read-only on remote: plain SELECTs through pipeline/lib/d1.mjs, so every
 * call is budget-checked and logged in the daily ledger. One full run reads
 * about 2x each table (a per-language COUNT, then the rowid-paged export)
 * plus 50 sampled rows per language and table: ~150k rows, ~4% of the
 * pipeline's daily read budget.
 *
 * Not `wrangler d1 export`: a per-table export does work on this database
 * despite the FTS5 tables (checked on 2026-10-12 with `--table=allergens`,
 * whereas the D1 docs say databases with virtual tables cannot be exported),
 * but it blocks every other query for its whole duration, is not resumable,
 * bypasses the ledger, and yields SQL text rather than per-language files.
 *
 * Resumable and idempotent: pages are staged under pipeline/out/i18n-export/;
 * a rerun after an interruption continues from the last staged page, and a
 * rerun after a finished export rewrites identical files without reading
 * remote again (apart from the verification sample). `--fresh` discards the
 * staged pages of the selected tables and takes a new snapshot.
 *
 * Reads remote D1, so it works only until migrations/0013_retire_recipe_corpus.sql
 * drops recipe_i18n and ingredient_i18n there; a final `--fresh` run, uploaded
 * as a private release, is one of 0013's preconditions. After 0013 the
 * backup in pipeline/data/i18n-backup (and its releases) is the frozen record
 * of what D1 served: recipe translations live on in the recipe translation
 * store, and the artefact build still reads ingredient names from here.
 *
 * Usage:
 *   node pipeline/tools/export_remote_i18n.mjs [--fresh] [--table=recipe_i18n] [--sample=50] [--no-verify]
 */

import { d1 } from '../lib/d1.mjs';
import {
	BACKUP_DIR,
	STAGE_DIR,
	TABLES,
	clearStage,
	readManifest,
	stageTable,
	verifySample,
	writeManifest,
	writeTable
} from '../lib/i18n_backup.mjs';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const tables = opt('table') ? [opt('table')] : Object.keys(TABLES);
const sampleSize = Number(opt('sample') ?? 50);

const query = (sql) => d1(sql);
const log = (m) => console.log(`export_remote_i18n: ${m}`);

if (args.includes('--fresh')) for (const table of tables) clearStage(table, STAGE_DIR);

const manifest = readManifest(BACKUP_DIR) ?? { format: 1, source: 'cook-up-db --remote', tables: {} };
for (const table of tables) {
	const { state, rows } = stageTable({ query, table, stageDir: STAGE_DIR, log });
	manifest.tables[table] = {
		...writeTable({ table, rows, counts: state.counts, backupDir: BACKUP_DIR }),
		snapshot_started_at: state.started_at,
		snapshot_completed_at: state.completed_at
	};
	// The oldest table snapshot: what a reader of the whole backup can rely on.
	manifest.exported_at = Object.values(manifest.tables).map((t) => t.snapshot_completed_at).sort()[0];
	writeManifest(manifest, BACKUP_DIR);
	const gz = Object.values(manifest.tables[table].langs).reduce((s, l) => s + l.gz_bytes, 0);
	log(`${table}: ${rows.length} rows in ${Object.keys(manifest.tables[table].langs).length} languages, ${(gz / 1e6).toFixed(2)} MB gzipped`);

	if (!args.includes('--no-verify')) {
		const v = verifySample({ query, table, backupDir: BACKUP_DIR, n: sampleSize });
		manifest.tables[table].verification = { at: new Date().toISOString(), per_lang: sampleSize, ...v };
		writeManifest(manifest, BACKUP_DIR);
		log(`${table}: verified ${v.sampled} sampled rows byte-for-byte, ${v.mismatches.length} mismatches`);
		if (v.mismatches.length) {
			for (const m of v.mismatches.slice(0, 20)) log(`  MISMATCH ${m}`);
			process.exitCode = 1;
		}
	}
}
