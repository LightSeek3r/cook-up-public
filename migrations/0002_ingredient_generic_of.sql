-- Append-only per the migration policy in tasks/todo.md: remote D1 already
-- holds irreplaceable state (machine-translated recipe_i18n rows), so
-- 0001_init.sql is frozen and this ships as its own file instead of an
-- in-place edit.
--
-- A curated (not taxonomy-DAG-derived at query time) generic -> specific
-- ingredient relationship: selecting the generic in `matchRecipes` also
-- satisfies a recipe's need for one of its listed specific forms (e.g.
-- selecting "egg" satisfies a recipe that needs "egg_yolk"). Never the
-- other direction. Population is pipeline-curated — see
-- pipeline/lib/generic_ingredients.mjs for which taxonomy DAG edges made the
-- cut and which were deliberately excluded (whole-category anchors like
-- "spice"/"cheese", and confirmed taxonomy errors like chili_pepper being
-- the declared parent of allspice).
CREATE TABLE ingredient_generic_of (
  specific_id  INTEGER NOT NULL REFERENCES ingredients(id),
  generic_id   INTEGER NOT NULL REFERENCES ingredients(id),
  PRIMARY KEY (specific_id, generic_id)
);
