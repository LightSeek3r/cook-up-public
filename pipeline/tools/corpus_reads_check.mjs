/**
 * Precondition check for migrations/0013_retire_recipe_corpus.sql: which
 * queries in a D1 insights report touch a corpus table. Reads a file; never
 * calls D1 or Cloudflare itself.
 *
 *   npx wrangler d1 insights cook-up-db --time-period=1d --sort-by=count --limit=500 --json > pipeline/out/insights-1d.json
 *   node pipeline/tools/corpus_reads_check.mjs pipeline/out/insights-1d.json
 *
 * Exit 0 and "no corpus query" when none does; otherwise every such query
 * (runs, rows read and written, the first line of its text) and exit 1. A
 * query from a pipeline tool the operator ran on purpose in that window
 * (export_remote_i18n.mjs, artefact_remote_parity.mjs) is reported too: the
 * point is that nothing *else* still reads the corpus.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tablesNamed } from '../lib/migrations.mjs';

/**
 * @typedef {{ query: string, numberOfTimesRun?: number, totalRowsRead?: number, totalRowsWritten?: number }} Insight
 */

/**
 * Every insight whose SQL names a corpus table, with the tables it names.
 * @param {Insight[]} insights wrangler's `d1 insights --json` output
 */
export function corpusQueries(insights) {
	if (!Array.isArray(insights)) throw new Error('not a `wrangler d1 insights --json` report (expected an array)');
	return insights.flatMap((i) => {
		const tables = tablesNamed(String(i.query ?? ''), { anyCase: true });
		return tables.length ? [{ ...i, tables }] : [];
	});
}

function main() {
	const file = process.argv[2];
	if (!file) throw new Error('usage: node pipeline/tools/corpus_reads_check.mjs <insights.json>');
	const insights = JSON.parse(readFileSync(file, 'utf8'));
	const hits = corpusQueries(insights);
	console.log(`corpus_reads_check: ${insights.length} queries in ${file}${insights.length >= 500 ? ' (the --limit was reached: raise it)' : ''}`);
	if (!hits.length) {
		console.log('corpus_reads_check: no corpus query');
		return;
	}
	for (const h of hits) {
		const first = h.query.trim().split('\n')[0].slice(0, 140);
		console.log(`  ${h.numberOfTimesRun ?? '?'} runs, ${h.totalRowsRead ?? '?'} read, ${h.totalRowsWritten ?? '?'} written  [${h.tables.join(', ')}]  ${first}`);
	}
	console.log(`corpus_reads_check: ${hits.length} corpus quer${hits.length === 1 ? 'y' : 'ies'}; 0013 must wait unless every one is a tool run you made on purpose`);
	process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
