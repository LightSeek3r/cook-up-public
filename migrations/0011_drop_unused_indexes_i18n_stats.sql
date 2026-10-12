-- Drop six indexes no runtime query uses; add recipe_i18n_stats.
--
-- Why the drops: every index costs one row written per row inserted into or
-- updated in its table, and D1's free tier caps writes at 100k/day. Checked
-- with EXPLAIN QUERY PLAN and Miniflare's D1 row counters over the 41
-- statements behind match (10 filter/sort variants), title search, favorites,
-- related, the recipe page, /api/ingredients, the sitemap, the admin
-- dashboard and the page-view insert, on a copy of the 16-language database
-- (30k synthetic page views), before and after this file:
--   idx_page_view_lang        in no plan; 1 of the 4 rows written per page view
--   idx_ingredient_i18n_lang  in no plan (every lookup is a PK point read)
--   idx_recipe_diets_diet     in no plan (the diet filter is an EXISTS on the PK)
--   idx_recipes_balance       in no plan
--   idx_recipes_kcal          only as the smallest covering index for the
--                             dashboard's unseen-recipes COUNT: 4,353 rows
--                             read with it, 4,353 without
--   idx_recipes_filter        match with a cuisine filter, which reads more
--                             rows with it: 7,825 -> 7,733 (italian),
--                             7,805 -> 7,515 (american), 1,694 -> 1,518 (indian)
-- No statement reads more rows after the drops (369,112 -> 368,554 in total);
-- the page-view insert writes 3 rows instead of 4. The six indexes wrote ~58k
-- of the ~314k rows of a full reseed. idx_page_view_recipe and
-- idx_page_view_at stay: without them the dashboard's unseen-recipes count and
-- daily series scan page_view (80M rows read at 30k views for the former).
--
-- The one pipeline read that used idx_ingredient_i18n_lang,
-- pipeline/tools/next_ingredient_batch.mjs, now probes the primary key from
-- `ingredients` instead (2,078 rows read on a full copy, vs 16,624 for its
-- old `WHERE lang = ?` without the index).
--
-- recipe_i18n_stats: the admin dashboard's per-language translation counts,
-- precomputed. Counting recipe_i18n live read every row of it (~55k) on each
-- dashboard load, for figures that only change when translations or a seed
-- are applied. Both seeds rewrite it in their tail (pipeline/lib/seed_sql.mjs
-- i18nStatsRefresh), and `gen_remote_seed.mjs --only=stats` refreshes it
-- alone after a translation session. src/lib/admin/stats.ts reads it and falls
-- back to the live count while it is empty, so the dashboard is right between
-- applying this file and the first refresh. WITHOUT ROWID: 16 rows keyed by
-- lang, no separate primary-key index to write.
--
-- Cost to apply once (measured through Miniflare's D1 on a copy of the
-- 16-language database at 0010): the six DROP INDEX 321 rows read (schema
-- rows), 0 written; CREATE TABLE 1 read, 2 written. The first stats refresh
-- reads every recipe_i18n row once (55,648 on that copy) and writes 16; a
-- dashboard load then reads 16 rows for these figures instead of ~55k.
--
-- Append-only per 0001_init.sql's policy; 0001-0010 are frozen because remote
-- D1 holds translated content that cannot be regenerated.
DROP INDEX IF EXISTS idx_page_view_lang;
DROP INDEX IF EXISTS idx_ingredient_i18n_lang;
DROP INDEX IF EXISTS idx_recipe_diets_diet;
DROP INDEX IF EXISTS idx_recipes_balance;
DROP INDEX IF EXISTS idx_recipes_kcal;
DROP INDEX IF EXISTS idx_recipes_filter;

CREATE TABLE IF NOT EXISTS recipe_i18n_stats (
	lang       TEXT PRIMARY KEY,
	translated INTEGER NOT NULL,
	machine    INTEGER NOT NULL
) WITHOUT ROWID;
