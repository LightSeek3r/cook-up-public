/**
 * Runs the seasons gate on pipeline/seasons/*.json against
 * pipeline/out/ingredients.jsonl: every error rule (REJECTED lines, exit 1),
 * the compiled-mask rules when the data is complete, and the reviewer
 * warnings (WARN lines, never fatal).
 *
 * Usage:
 *   node pipeline/tools/seasons_check.mjs [--partial] [--no-warn] [--verbose]
 *   node pipeline/tools/seasons_check.mjs --grid=<zone>[:s] [--keys=a,b,c]   review grid (zone or "world")
 *   node pipeline/tools/seasons_check.mjs --fix   rewrite the family files in canonical form (format only)
 *
 * --partial skips missing-key while the data is still being written.
 */

import { ZONES } from '../../src/lib/data/seasons.js';
import { FAMILIES, compileSeasons, renderGrid } from '../lib/seasons_compile.mjs';
import { checkCompiled, formatIssue, seasonWarnings, validateSources } from '../lib/seasons_gate.mjs';
import { loadIngredients, loadSources, parseFlags, writeSources } from '../lib/seasons_io.mjs';

const MAX_LINES = 40;

function print(prefix, issues, verbose) {
	const shown = verbose ? issues : issues.slice(0, MAX_LINES);
	for (const i of shown) console.log(`${prefix} ${formatIssue(i)}`);
	if (shown.length < issues.length) console.log(`${prefix} ... ${issues.length - shown.length} more (--verbose)`);
}

function main() {
	const { str, has } = parseFlags(process.argv.slice(2));
	const { sources, raw } = loadSources();

	const grid = str('grid');
	if (grid !== undefined) {
		const [zone, hemi = 'n'] = grid.split(':');
		if (zone !== 'world' && !ZONES.includes(zone)) throw new Error(`--grid zone must be one of ${ZONES.join(', ')} or world`);
		if (hemi !== 'n' && hemi !== 's') throw new Error('--grid hemisphere must be :n or :s');
		const keys = str('keys')?.split(',').filter(Boolean);
		process.stdout.write(renderGrid(sources, zone, hemi, keys));
		return;
	}

	if (has('fix')) {
		const unknown = Object.keys(sources).filter((f) => !FAMILIES.includes(f));
		if (unknown.length) throw new Error(`not a seasons family: ${unknown.join(', ')}; move or delete by hand`);
		const changed = writeSources(sources);
		console.log(`rewrote ${changed.length ? changed.map((f) => `${f}.json`).join(', ') : 'nothing (already canonical)'}`);
		return;
	}

	const ingredients = loadIngredients();
	const verbose = has('verbose');
	const partial = has('partial');
	const errors = validateSources({ ingredients, sources, raw, partial });
	const missing = errors.filter((e) => e.rule === 'missing-key');
	const other = errors.filter((e) => e.rule !== 'missing-key');
	print('REJECTED', other, verbose);
	if (missing.length) {
		const sample = missing.slice(0, 8).map((e) => e.key).join(', ');
		console.log(`REJECTED [missing-key] ${missing.length} of ${ingredients.length} key(s) have no entry: ${sample}${missing.length > 8 ? ', ...' : ''}`);
	}
	if (!errors.length && !partial) {
		const compiled = compileSeasons(sources, ingredients.map((r) => r.canonical_key));
		const built = checkCompiled({ compiled, ingredients, sources });
		print('REJECTED', built, verbose);
		errors.push(...built);
	}
	const warnings = has('no-warn') ? [] : seasonWarnings({ ingredients, sources });
	print('WARN', warnings, verbose);
	console.log(`seasons_check: ${errors.length} error(s), ${warnings.length} warning(s)${partial ? ' (partial: missing keys not counted)' : ''}`);
	if (errors.length) process.exitCode = 1;
}

try {
	main();
} catch (err) {
	console.error(`seasons_check: ${err.message}`);
	process.exitCode = 1;
}
