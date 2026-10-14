import { describe, it, expect } from 'vitest';
import { corpusQueries } from './corpus_reads_check.mjs';

const insight = (query, n = 1) => ({ query, numberOfTimesRun: n, totalRowsRead: 10 * n, totalRowsWritten: 0 });

describe('corpusQueries', () => {
	it('flags queries on corpus tables, whatever their case or schema prefix', () => {
		const hits = corpusQueries([
			insight('SELECT id FROM recipes'),
			insight('select lang, count(*) from recipe_i18n group by lang'),
			insight('SELECT * FROM main.ingredient_i18n WHERE rowid > ?'),
			insight('INSERT INTO page_view (path, recipe_id) VALUES (?, ?)', 40),
			insight('SELECT COUNT(*) FROM admin_session WHERE token_hash = ?')
		]);
		expect(hits.map((h) => h.tables)).toEqual([['recipes'], ['recipe_i18n'], ['ingredient_i18n']]);
	});

	it('does not mistake runtime tables or prose for corpus tables', () => {
		expect(corpusQueries([insight('SELECT recipe_id AS id, COUNT(*) AS views FROM page_view GROUP BY recipe_id')])).toEqual([]);
	});

	it('reads the multi-line statements insights reports, joins and subqueries included', () => {
		const match = `
    WITH sat(have_id, ing_id) AS MATERIALIZED (
      SELECT h.value, h.value FROM json_each(?1) h
      UNION SELECT igo.generic_id, igo.specific_id FROM json_each(?1) h JOIN ingredient_generic_of igo ON igo.generic_id = h.value)
    SELECT r.id FROM sat s JOIN recipe_ingredients ri ON ri.ingredient_id = s.ing_id JOIN recipes r ON r.id = ri.recipe_id`;
		expect(corpusQueries([insight(match, 2)])[0].tables).toEqual(['ingredient_generic_of', 'recipe_ingredients', 'recipes']);
	});

	it('refuses anything but an insights array', () => {
		expect(() => corpusQueries({ result: [] })).toThrow(/insights/);
	});
});
