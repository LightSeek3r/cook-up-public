-- recipe_related: the recipe page's "related recipes" list, precomputed.
--
-- Why: src/lib/related.ts ranked related recipes live on every recipe page
-- load (and SvelteKit preload), a self-join through idx_ri_ingredient that
-- read ~640 D1 rows per page on average and up to ~3,800 (measured over all
-- 3,478 recipes). The list only changes on reseed, so the pipeline computes it
-- (pipeline/lib/related_recipes.mjs, same ranking and constants) and the page
-- reads one row plus the six recipes it names, ~20 rows.
--
-- Shape: one row per recipe, the ranked ids as a JSON array ('[]' when the
-- recipe has no related recipes), rather than one row per (recipe, rank):
-- ~3,500 rows written per reseed instead of ~14,850, and every seeded recipe
-- has a row, so a missing row unambiguously means "not seeded yet" and
-- related.ts falls back to the live query for it. That fallback is what keeps
-- the page correct between applying this migration and running the seed, and
-- for a recipe inserted by any path that does not write this table.
--
-- No foreign keys: both seeds delete and rewrite this table wholesale, and an
-- FK would make 06_seed_d1.mjs's `DELETE FROM recipes` order-dependent and
-- cost a parent-row read per inserted row.
--
-- Keeping it right: pipeline/06_seed_d1.mjs and pipeline/gen_remote_seed.mjs
-- rewrite it on every reseed; `gen_remote_seed.mjs --only=related` writes just
-- this table. Changing RELATED_* in src/lib/config.ts (mirrored in
-- related_recipes.mjs) or recipe_ingredients / is_staple needs a rerun.
-- Populating it with INSERT … SELECT inside D1 instead would read ~2.36M rows.
--
-- Cost to apply once (measured through Miniflare's D1 on a copy of the local
-- database, 3,478 recipes): CREATE TABLE 1 row read, 2 written.
-- Populating it (the seeds' INSERT chunks, measured the same way): 3,478 rows
-- read, 3,478 written into an empty table; 3,478 read, 6,956 written when it
-- replaces a full one (DELETE + INSERT), which is what every later reseed adds.
--
-- Append-only per 0001_init.sql's policy; 0001-0009 are frozen because remote
-- D1 holds translated content that cannot be regenerated.
CREATE TABLE IF NOT EXISTS recipe_related (
	recipe_id   INTEGER PRIMARY KEY,
	related_ids TEXT NOT NULL
);
