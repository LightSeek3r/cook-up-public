/**
 * Computes the next remediation batch from a fixed list of already-inserted
 * but corrupted recipe_id's (e.g. pipeline/out/bn_corrupted_ids.json), rather
 * than the translation gap next_batch.mjs computes. These rows already exist
 * in recipe_i18n with bad content, so apply_manual_translations.mjs must be
 * called with --overwrite (INSERT OR REPLACE) to fix them in place.
 *
 * Purely offset-based and stateless — no local progress file, since the
 * fixed id list makes that unnecessary and avoids any risk of silently
 * marking a row "done" before it's actually been re-applied. The caller
 * (not this script) tracks how far through the list it has gotten, the same
 * way translation-batch rounds have been tracked all session.
 *
 * Usage:
 *   node pipeline/tools/next_corrupted_batch.mjs --ids-file=pipeline/out/bn_corrupted_ids.json --offset=0 --n=15 --out=pipeline/out/batch_bn_redo_1.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('pipeline/out');
const SOURCES_PATH = path.join(OUT_DIR, 'sources.json');

function parseArgs() {
	const args = process.argv.slice(2);
	const str = (flag) => {
		const hit = args.find((a) => a.startsWith(`--${flag}=`));
		return hit ? hit.split('=').slice(1).join('=') : undefined;
	};
	const idsFile = str('ids-file');
	const out = str('out');
	const offset = Number(str('offset') ?? '0');
	const n = Number(str('n') ?? '15');
	if (!idsFile) throw new Error('--ids-file=<path> is required');
	if (!out) throw new Error('--out=<path> is required');
	if (!Number.isInteger(offset) || offset < 0) throw new Error('--offset must be a non-negative integer');
	if (!Number.isInteger(n) || n <= 0) throw new Error('--n must be a positive integer');
	return { idsFile, offset, n, out };
}

function main() {
	const { idsFile, offset, n, out } = parseArgs();
	if (!existsSync(idsFile)) throw new Error(`${idsFile} not found`);
	if (!existsSync(SOURCES_PATH)) {
		throw new Error(`${SOURCES_PATH} not found — run node pipeline/tools/export_sources.mjs first.`);
	}

	const corruptedIds = JSON.parse(readFileSync(idsFile, 'utf8'));
	const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));
	const sourceById = new Map(sources.map((s) => [s.id, s]));

	const slice = corruptedIds.slice(offset, offset + n);
	const batch = slice
		.map((id) => sourceById.get(id))
		.filter(Boolean)
		.map((s) => ({ recipe_id: s.id, title: s.title, instructions: s.instructions }));

	writeFileSync(out, JSON.stringify(batch, null, 2) + '\n');
	console.log(
		`next_corrupted_batch: wrote ${batch.length} rows to ${out} ` +
			`(offset=${offset}, total corrupted=${corruptedIds.length}, ` +
			`remaining after this batch=${Math.max(0, corruptedIds.length - offset - batch.length)})`
	);
}

main();
