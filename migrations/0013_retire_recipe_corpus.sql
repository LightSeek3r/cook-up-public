-- Retire the recipe corpus from D1: drop every table, FTS index and index the
-- offline pipeline wrote and the app used to read. D1 keeps runtime state only.
--
-- Why: since phase 3.2-3.4 (.claude/plans/phase3-static-data.md) every corpus
-- read goes through the static data artefacts deployed with the Worker
-- (src/lib/server/data.ts, src/lib/client/matchData.ts): /api/match, search,
-- the mosaic, favorites, recipe pages, related lists, the sitemap, browser
-- matching, and /admin's corpus figures (src/lib/admin/stats.ts). No app code
-- reads these tables (src/lib/test/corpusReads.test.mjs scans for it). Left in
-- place they are ~70 MB of dead weight that drifts from what the site serves
-- (remote has 3,484 recipes, the artefacts 3,478), and a standing invitation to
-- reseed D1, which the free plan's 100k writes/day cannot finish in a day.
--
-- Dropped (in this order: FTS first, then every child table before the table
-- its foreign keys reference; with D1's foreign keys on, a parent dropped
-- first fails with SQLITE_CONSTRAINT_FOREIGNKEY and rolls the whole file back,
-- measured):
--   recipe_title_fts, ingredient_fts      FTS5 trigram indexes; their shadow
--                                         tables (_data, _idx, _docsize,
--                                         _config) go with them
--   recipe_i18n_stats                     admin translation counts (0011); now
--                                         manifest.json counts
--   recipe_related, recipe_micronutrient, recipe_diets, recipe_ingredients,
--   recipe_i18n, recipes
--   ingredient_allergens, ingredient_generic_of, ingredient_micronutrient,
--   ingredient_nutrition, ingredient_i18n, ingredients, allergens
--   and their named indexes idx_ri_ingredient, idx_recipe_i18n_lang,
--   idx_igo_generic (automatic PRIMARY KEY / UNIQUE indexes go with their
--   tables). There are no triggers or views.
-- Kept, untouched: page_view (+ idx_page_view_at, idx_page_view_recipe),
-- admin_otp (+ idx_admin_otp_email), admin_session (+ idx_admin_session_expires),
-- and D1's own d1_migrations / _cf_* tables. page_view.recipe_id was never a
-- foreign key (0006), so views of every recipe survive.
--
-- Cost to apply once, measured through Miniflare's D1 (the row counters D1
-- bills) on the full pipeline snapshot (3,478 recipes, 54,702 recipe_i18n
-- rows, 69 MB) plus 500 page views: 541 rows read (schema rows), 0 written.
-- Dropping a table is not a per-row delete when nothing references it, which
-- the order above guarantees. The file stays 69 MB in SQLite terms (the pages
-- move to the freelist; D1 runs no VACUUM), so the size D1 reports may not drop
-- at once; size was never the constraint (500 MB per database).
--
-- Preconditions, all of them (the step-by-step runbook is README, "Retiring
-- the D1 corpus"):
--   1. The code that reads no corpus table is deployed and live (/admin
--      included), and D1 insights over the last full 24 h show no query on any
--      table above.
--   2. A fresh export of remote's translations (pipeline/tools/
--      export_remote_i18n.mjs --fresh), verified, uploaded as a private
--      release, and nothing in it missing from the recipe translation store
--      (pipeline/data/recipe-i18n): recipe_i18n and ingredient_i18n are the
--      tables here the pipeline cannot regenerate from its sources.
--   3. artefact_remote_parity.mjs passes once more against remote.
--   4. The Time Travel bookmark of the moment before applying is written down.
--   5. Explicit owner confirmation on the day.
--
-- Restore: within Time Travel's window (7 days on Free, 30 on Paid), restore
-- the bookmark from step 4 (loses page views and admin sessions written since).
-- Later: `node pipeline/gen_remote_seed.mjs --restore-corpus` writes the corpus
-- schema of 0012 and the full seed (pipeline/out, the translation store and
-- the ingredient-name backup, as the artefacts) as chunks for
-- pipeline/tools/apply_remote_chunks.mjs --across-days: ~352k rows written
-- (measured the same way: 2,974 chunks), about five days of the free plan's
-- 80k/day pipeline budget, one go on Workers Paid. Nothing reads the tables
-- meanwhile, so a partial restore is harmless. The pipeline never needs this:
-- publishing data is build artefacts (npm run data:build), release (npm run
-- data:publish), deploy.
--
-- Append-only per 0001_init.sql's policy; 0001-0012 are frozen. After this
-- file, pipeline/lib/migrations.mjs CORPUS_SCHEMA_LAST (12) is the schema the
-- pipeline and the SQL parity tests build their corpus databases with.
DROP TABLE IF EXISTS recipe_title_fts;
DROP TABLE IF EXISTS ingredient_fts;
DROP TABLE IF EXISTS recipe_i18n_stats;
DROP TABLE IF EXISTS recipe_related;
DROP TABLE IF EXISTS recipe_micronutrient;
DROP TABLE IF EXISTS recipe_diets;
DROP INDEX IF EXISTS idx_ri_ingredient;
DROP TABLE IF EXISTS recipe_ingredients;
DROP INDEX IF EXISTS idx_recipe_i18n_lang;
DROP TABLE IF EXISTS recipe_i18n;
DROP TABLE IF EXISTS recipes;
DROP TABLE IF EXISTS ingredient_allergens;
DROP INDEX IF EXISTS idx_igo_generic;
DROP TABLE IF EXISTS ingredient_generic_of;
DROP TABLE IF EXISTS ingredient_micronutrient;
DROP TABLE IF EXISTS ingredient_nutrition;
DROP TABLE IF EXISTS ingredient_i18n;
DROP TABLE IF EXISTS ingredients;
DROP TABLE IF EXISTS allergens;
