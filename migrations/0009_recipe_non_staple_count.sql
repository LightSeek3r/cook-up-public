-- recipes.non_staple_count, and an index on ingredient_generic_of(generic_id).
--
-- Why: /api/match read ~430,000-690,000 D1 rows per call (≈11 calls exhaust the
-- 5M/day free tier), because it joined every recipe_ingredients row in the
-- corpus and evaluated per-recipe subqueries for all recipes before HAVING and
-- LIMIT. src/lib/match.ts now starts from the selected ingredients instead, and
-- the one per-candidate value it still needs from outside that walk is how many
-- non-staple ingredients the recipe has in total ("required_non_staple", the
-- base of `missing`). That only changes on reseed, so it is stored here rather
-- than recounted per candidate on every request.
--
-- Keeping it right: pipeline/06_seed_d1.mjs and pipeline/gen_remote_seed.mjs
-- write it with every recipes row (pipeline/lib/non_staple_count.mjs), so it
-- must be regenerated whenever recipe_ingredients or ingredients.is_staple
-- change, which today only those two seeds do. match.ts falls back to a live
-- count when the column is NULL, so a row written by any other path (the
-- prototype seed, the smoke fixture) is slower, never wrong.
--
-- idx_igo_generic: match.ts looks pairs up by generic_id, and the table's
-- primary key is (specific_id, generic_id), so without it the lookup scans.
--
-- Cost to apply once (measured through Miniflare's D1 on a copy of the local
-- database, 3,478 recipes / 28,520 recipe_ingredients / 555 pairs):
--   ALTER TABLE        55 rows read,     1 written
--   UPDATE         63,995 rows read, 3,478 written
--   CREATE INDEX    1,113 rows read,   556 written
--   total          65,163 rows read, 4,035 written
-- Production has ~3,484 recipes, so expect the same order of magnitude: well
-- under the 80% pipeline budget (4M reads / 80k writes per day). Later reseeds
-- add nothing: the seeds write the value inside rows they already write.
--
-- Order matters: apply this BEFORE deploying the match.ts that reads the
-- column, and before running a reseed generated after it (both name it).
--
-- Append-only per 0001_init.sql's policy; 0001-0008 are frozen because remote
-- D1 holds translated content that cannot be regenerated.
ALTER TABLE recipes ADD COLUMN non_staple_count INTEGER;

UPDATE recipes SET non_staple_count = (
	SELECT COUNT(*)
	FROM recipe_ingredients ri
	JOIN ingredients i ON i.id = ri.ingredient_id
	WHERE ri.recipe_id = recipes.id AND i.is_staple = 0
);

CREATE INDEX IF NOT EXISTS idx_igo_generic ON ingredient_generic_of(generic_id, specific_id);
