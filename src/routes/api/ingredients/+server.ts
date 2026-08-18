import { json } from '@sveltejs/kit';
import { requireDb } from '$lib/db';
import { resolveLang } from '$lib/i18n';
import type { IngredientTile } from '$lib/types';
import type { RequestHandler } from './$types';

/**
 * FTS5 phrase literal. Doubling `"` neutralises the query syntax, so user input
 * can never be interpreted as FTS operators.
 */
const ftsPhrase = (q: string) => `"${q.replace(/"/g, '""')}"`;

/** LIKE wildcards must be escaped for the short-query fallback path. */
const likeTerm = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Ingredient names fall back to English, then to the canonical key: a newly
 * ingested ingredient must still appear in the mosaic before its translations
 * land, rather than silently disappearing for nine of the ten languages.
 */
const NAME = `COALESCE(t.name, en.name, i.canonical_key)`;
const COLS = `i.id, i.canonical_key, i.category, i.recipe_count, ${NAME} AS name`;
const FALLBACK_JOINS = `LEFT JOIN ingredient_i18n t  ON t.ingredient_id = i.id AND t.lang = ?
       LEFT JOIN ingredient_i18n en ON en.ingredient_id = i.id AND en.lang = 'en'`;

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);
	const lang = resolveLang(url.searchParams.get('lang'));
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);

	// The trigram tokenizer cannot index terms shorter than 3 characters, so
	// short queries (common in CJK) fall back to a LIKE scan.
	if (q.length >= 3) {
		const { results } = await db
			.prepare(
				`SELECT ${COLS}
         FROM ingredient_fts f
         JOIN ingredient_i18n m ON m.rowid = f.rowid
         JOIN ingredients i     ON i.id = m.ingredient_id
         ${FALLBACK_JOINS}
         WHERE f.name MATCH ? AND m.lang IN (?, 'en') AND i.is_staple = 0
         GROUP BY i.id
         ORDER BY i.recipe_count DESC
         LIMIT 60`
			)
			.bind(lang, ftsPhrase(q), lang)
			.all<IngredientTile>();
		return json({ results: results ?? [] });
	}

	if (q.length > 0) {
		const { results } = await db
			.prepare(
				`SELECT ${COLS}
         FROM ingredients i
         ${FALLBACK_JOINS}
         WHERE i.is_staple = 0 AND ${NAME} LIKE ? ESCAPE '\\'
         ORDER BY i.recipe_count DESC
         LIMIT 60`
			)
			.bind(lang, `%${likeTerm(q)}%`)
			.all<IngredientTile>();
		return json({ results: results ?? [] });
	}

	// Full mosaic; the client groups by category and sizes tiles by recipe_count.
	const { results } = await db
		.prepare(
			`SELECT ${COLS}
       FROM ingredients i
       ${FALLBACK_JOINS}
       WHERE i.is_staple = 0
       ORDER BY i.recipe_count DESC, name ASC`
		)
		.bind(lang)
		.all<IngredientTile>();

	return json({ results: results ?? [] });
};
