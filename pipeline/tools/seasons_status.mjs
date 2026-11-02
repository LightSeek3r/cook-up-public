/**
 * Coverage of the seasons data: per family file how many entries are all
 * year, like and seasonal, then how many ingredient keys are still undecided
 * and where the last triage routed them. Exits non-zero when the files fail
 * the gate (missing keys aside, which is what this reports).
 *
 * Usage: node pipeline/tools/seasons_status.mjs
 */

import { FAMILIES, flattenSources } from '../lib/seasons_compile.mjs';
import { missingKeys, validateSources } from '../lib/seasons_gate.mjs';
import { loadAssignments, loadIngredients, loadSources, loadVerdicts } from '../lib/seasons_io.mjs';

function main() {
	const ingredients = loadIngredients();
	const { sources, raw } = loadSources();
	const row = (...cells) => console.log(cells.map((c, i) => String(c)[i ? 'padStart' : 'padEnd'](i ? 9 : 11)).join(''));
	row('family', 'entries', 'ay', 'like', 'seasonal');
	const total = { entries: 0, ay: 0, like: 0, seasonal: 0 };
	for (const family of FAMILIES) {
		const entries = Object.values(sources[family] ?? {});
		const c = {
			entries: entries.length,
			ay: entries.filter((e) => e?.ay !== undefined).length,
			like: entries.filter((e) => e?.like !== undefined).length,
			seasonal: entries.filter((e) => e?.z !== undefined).length
		};
		for (const k of Object.keys(total)) total[k] += c[k];
		row(family, c.entries, c.ay, c.like, c.seasonal);
	}
	row('total', total.entries, total.ay, total.like, total.seasonal);

	const missing = missingKeys(ingredients, sources);
	const decided = flattenSources(sources).size;
	console.log(`\ndecided ${ingredients.length - missing.length}/${ingredients.length}, undecided ${missing.length}${decided !== ingredients.length - missing.length ? ` (${decided} entries: some keys are not ingredients, see seasons_check)` : ''}`);
	if (missing.length) {
		const assigned = loadAssignments();
		const verdicts = loadVerdicts();
		const by = {};
		for (const key of missing) {
			const where = verdicts[key] ? `${verdicts[key]} (verdict, rerun triage)` : assigned.get(key) ?? 'classify or untriaged';
			by[where] = (by[where] ?? 0) + 1;
		}
		for (const [where, n] of Object.entries(by).sort()) console.log(`  ${where.padEnd(34)} ${n}`);
	}

	const errors = validateSources({ ingredients, sources, raw, partial: true });
	console.log(`\ngate: ${errors.length} error(s) besides missing keys${errors.length ? ' (seasons_check --partial for details)' : ''}`);
	if (errors.length) process.exitCode = 1;
}

try {
	main();
} catch (err) {
	console.error(`seasons_status: ${err.message}`);
	process.exitCode = 1;
}
