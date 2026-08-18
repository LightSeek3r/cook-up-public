/**
 * Stage 06 — seed D1.
 *
 * Input:  pipeline/out/*.jsonl
 * Output: SQL applied to the local (or remote) D1 database.
 *
 * Emits batched INSERT statements to pipeline/out/seed.sql, then:
 *   wrangler d1 execute cook-up-db --local --file=pipeline/out/seed.sql
 *
 * Must finish with a full-text rebuild, because both FTS tables are
 * external-content and are not populated by the inserts themselves:
 *   INSERT INTO ingredient_fts(ingredient_fts)     VALUES('rebuild');
 *   INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('rebuild');
 *
 * And refresh the mosaic weights:
 *   UPDATE ingredients SET recipe_count =
 *     (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.ingredient_id = ingredients.id);
 */

// TODO(phase 2): stream jsonl -> batched, escaped INSERTs (D1 caps statement size).
console.log('06_seed_d1: not implemented');
