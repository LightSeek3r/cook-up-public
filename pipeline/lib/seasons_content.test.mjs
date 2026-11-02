import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { compileSeasons } from './seasons_compile.mjs';
import { checkCompiled, formatIssue, missingKeys, validateSources } from './seasons_gate.mjs';
import { INGREDIENTS_FILE, loadIngredients, loadSources } from './seasons_io.mjs';

// pipeline/out is git-ignored: without the pipeline output there is nothing to check against.
const hasIngredients = existsSync(INGREDIENTS_FILE);
// Every key needs an entry before the data can be compiled; while agents are
// still writing it, only the entries that exist are held to the gate.
const REQUIRE_COMPLETE = false;

describe.skipIf(!hasIngredients)('seasons data (pipeline/seasons) against pipeline/out/ingredients.jsonl', () => {
	const ingredients = hasIngredients ? loadIngredients() : [];
	const { sources, raw } = loadSources();

	it('passes every rule on the entries written so far', () => {
		const issues = validateSources({ ingredients, sources, raw, partial: true });
		expect(issues.map(formatIssue)).toEqual([]);
	});

	it.skipIf(!REQUIRE_COMPLETE && missingKeys(ingredients, sources).length > 0)('covers every ingredient and compiles to valid masks', () => {
		expect(missingKeys(ingredients, sources)).toEqual([]);
		const compiled = compileSeasons(sources, ingredients.map((r) => r.canonical_key));
		expect(checkCompiled({ compiled, ingredients, sources }).map(formatIssue)).toEqual([]);
	});
});
