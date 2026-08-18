/**
 * Stage 07 — batch machine translation (ADR B′).
 *
 * Input:  recipes already seeded in D1 (stage 06)
 * Output: pipeline/out/translations.sql — `recipe_i18n` rows with is_machine = 1
 *
 * Translations are a pure function of (recipe, language) and the corpus only
 * grows by a handful of recipes per rebuild, so they are computed here rather
 * than at request time. Writing them into `recipe_i18n` (instead of KV) is what
 * makes translated titles show up in the mosaic, the result list and the
 * `recipe_title_fts` index — KV is only ever read by the detail page.
 *
 * `/api/translate` + KV stays in place as the runtime fallback for recipes added
 * since the last run of this stage.
 *
 * Selection query — only the gaps, so re-runs are cheap:
 *   SELECT r.id, r.source_lang, s.title, s.instructions
 *     FROM recipes r
 *     JOIN recipe_i18n s ON s.recipe_id = r.id AND s.lang = r.source_lang
 *    WHERE NOT EXISTS (SELECT 1 FROM recipe_i18n t
 *                       WHERE t.recipe_id = r.id AND t.lang = ?)
 *
 * Rules (must match src/routes/api/translate/+server.ts, which is the fallback
 * for the same job — divergence between the two would be a silent quality bug):
 *   - model must be NON-REASONING; `gemma-4-*-it` returns empty `content`
 *     because it spends the whole budget on `reasoning_content`
 *   - accept either `response` or `choices[0].message.content`
 *   - temperature 0.2 — sampling variance drops or merges recipe steps
 *   - titles are NOT translated; a dish name is a proper noun
 *
 * Quality gate the lazy endpoint cannot afford: assert the translation has the
 * same number of non-empty lines as the source, and re-queue mismatches instead
 * of writing them.
 *
 * Must finish with:
 *   INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('rebuild');
 *
 * FIRST TASK, before any full run: `--limit 50 --dry-run`, logging the neurons
 * reported by the Workers AI REST API, so the cost of the initial fill is a
 * measurement and not an estimate.
 */

// TODO(phase 5): dry run first (50 recipes, log neuron usage), then full fill.
console.log('07_translate: not implemented');
