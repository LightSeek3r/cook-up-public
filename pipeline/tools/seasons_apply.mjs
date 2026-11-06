/**
 * Validate and merge a seasons batch into pipeline/seasons/<family>.json.
 *
 * The agent's only job is to produce the JSON object below; every check and
 * every byte written comes from this script. The WHOLE batch is validated
 * (pipeline/lib/seasons_gate.mjs validateEntry: shape, zones, ranges, st,
 * producers, like targets, key exists, not already decided): one bad entry
 * rejects all of it, with a line per problem, and nothing is written.
 *
 * Input JSON (object; use the keys from the batch file verbatim):
 *   { "asparagus": {"z":{"trop":"none","med":"2-4","cont":"5-6"},"p":["med:n"],"st":0,"note":"..."},
 *     "fresh_basil": {"like":"basil"},
 *     "coconut": {"ay":"traded"},
 *     "goose": {"seasonal":"animal"} }
 * `ay` entries go to allyear.json; seasonal ones to the family the last triage
 * assigned (or --family); a `like` next to its target. {"seasonal": family}
 * is a classifier's verdict: recorded for the next seasons_triage run, which
 * puts the key in that family's writer batches.
 *
 * Usage:
 *   node pipeline/tools/seasons_apply.mjs --file=<batch.json> [--family=<family>] [--overwrite] [--dry-run]
 */

import { existsSync, readFileSync } from 'node:fs';
import { checkBatch } from '../lib/seasons_apply_lib.mjs';
import { formatIssue } from '../lib/seasons_gate.mjs';
import {
	VERDICTS_FILE,
	loadAssignments,
	loadIngredients,
	loadSources,
	loadVerdicts,
	parseFlags,
	writeJson,
	writeSources
} from '../lib/seasons_io.mjs';

function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const file = str('file');
	if (!file) throw new Error('--file=<path> is required');
	if (!existsSync(file)) throw new Error(`${file} not found`);
	let batch;
	try {
		batch = JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		throw new Error(`${file}: invalid JSON (${err.message})`, { cause: err });
	}
	const dryRun = has('dry-run');
	const { errors, merged, placed, verdicts, recorded, remaining } = checkBatch({
		batch,
		ingredients: loadIngredients(),
		sources: loadSources().sources,
		assignments: loadAssignments(),
		verdicts: loadVerdicts(),
		family: str('family'),
		overwrite: has('overwrite')
	});
	if (errors.length) {
		for (const e of errors) console.error(`REJECTED ${formatIssue(e)}`);
		console.error(`seasons_apply: batch rejected, ${errors.length} problem(s); nothing written`);
		process.exitCode = 1;
		return;
	}
	if (!dryRun) {
		writeSources(merged);
		if (recorded || placed.size) writeJson(VERDICTS_FILE, verdicts);
	}
	console.log(`${dryRun ? 'DRY-RUN ' : ''}APPLIED ${placed.size} entries; ${remaining} keys remaining`);
	if (recorded) {
		console.log(`RECORDED ${recorded} seasonal verdict(s); run seasons_triage to put them in writer batches`);
	}
}

try {
	main();
} catch (err) {
	console.error(`seasons_apply: ${err.message}`);
	process.exitCode = 1;
}
