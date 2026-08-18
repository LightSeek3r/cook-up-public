-- cook-up — consolidated initial schema.
--
-- MIGRATION POLICY: greenfield, no durable data yet, so this file is edited in
-- place. The first time a shared/remote D1 holds state we cannot lose, this file
-- becomes immutable and all further changes ship as append-only 000N_*.sql.

-- ============================================================================
-- Canonical ingredients (language-neutral; names live in ingredient_i18n)
-- ============================================================================
CREATE TABLE ingredients (
  id             INTEGER PRIMARY KEY,
  canonical_key  TEXT NOT NULL UNIQUE,          -- e.g. 'green_onion' (Open Food Facts taxonomy)
  category       TEXT NOT NULL,                 -- vegetable|fruit|protein|dairy|grain|legume|nut|spice|other
  is_staple      INTEGER NOT NULL DEFAULT 0,    -- salt/water/oil: never counted as "missing"
  beneficial     INTEGER NOT NULL DEFAULT 0,    -- counts toward Balance Grade beneficial-mass %
  recipe_count   INTEGER NOT NULL DEFAULT 0     -- mosaic tile sizing
);

CREATE TABLE ingredient_i18n (
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id),
  lang           TEXT NOT NULL,                 -- en|es|fr|de|ar|hi|zh|ja|ko|vi
  name           TEXT NOT NULL,
  PRIMARY KEY (ingredient_id, lang)
);

CREATE TABLE allergens (
  id   INTEGER PRIMARY KEY,
  key  TEXT NOT NULL UNIQUE                     -- gluten|dairy|nut|peanut|egg|soy|fish|shellfish|sesame
);

CREATE TABLE ingredient_allergens (
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id),
  allergen_id    INTEGER NOT NULL REFERENCES allergens(id),
  PRIMARY KEY (ingredient_id, allergen_id)
);

-- ============================================================================
-- Nutrition reference, per 100 g, from USDA FoodData Central (public domain)
-- ============================================================================
CREATE TABLE ingredient_nutrition (
  ingredient_id  INTEGER PRIMARY KEY REFERENCES ingredients(id),
  fdc_id         INTEGER UNIQUE,
  kcal           REAL,
  protein_g      REAL,
  fat_g          REAL,
  sat_fat_g      REAL,
  carb_g         REAL,
  sugar_g        REAL,
  fiber_g        REAL,
  sodium_mg      REAL
);

CREATE TABLE ingredient_micronutrient (
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id),
  nutrient_key   TEXT NOT NULL,                 -- vitamin_c|iron|calcium|... (fixed vocab)
  amount         REAL NOT NULL,                 -- per 100 g
  unit           TEXT NOT NULL,                 -- mg|ug
  PRIMARY KEY (ingredient_id, nutrient_key)
);

-- ============================================================================
-- Recipes
-- ============================================================================
CREATE TABLE recipes (
  id                  INTEGER PRIMARY KEY,
  source_url          TEXT NOT NULL,
  source_lang         TEXT NOT NULL,            -- language of the original prose
  license             TEXT NOT NULL,            -- 'CC-BY-SA-3.0' | 'PD'
  attribution         TEXT,                     -- required credit string
  cuisine             TEXT,                     -- canonical key; label from bundled i18n
  meal_type           TEXT,                     -- breakfast|lunch|dinner|snack|dessert|side
  prep_minutes        INTEGER,
  total_minutes       INTEGER,
  servings            INTEGER,
  servings_assumed    INTEGER NOT NULL DEFAULT 0,  -- 1 => servings was not stated in the source

  -- precomputed per-serving nutrition (offline pipeline)
  kcal                REAL,
  protein_g           REAL,
  fat_g               REAL,
  sat_fat_g           REAL,
  carb_g              REAL,
  sugar_g             REAL,
  fiber_g             REAL,
  sodium_mg           REAL,

  balance_grade       TEXT,                     -- 'A'..'E'  (custom, see src/lib/config.ts)
  balance_score       INTEGER,                  -- 0..100    (custom)
  nutrition_coverage  REAL NOT NULL DEFAULT 0   -- 0..1 resolved mass; UI hides below COVERAGE_MIN
);

CREATE TABLE recipe_i18n (
  recipe_id     INTEGER NOT NULL REFERENCES recipes(id),
  lang          TEXT NOT NULL,
  title         TEXT NOT NULL,
  instructions  TEXT NOT NULL,
  is_machine    INTEGER NOT NULL DEFAULT 0,     -- 1 => machine translated, must be labelled
  PRIMARY KEY (recipe_id, lang)
);

CREATE TABLE recipe_ingredients (
  recipe_id      INTEGER NOT NULL REFERENCES recipes(id),
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id),
  raw_text       TEXT,                          -- '2 cups diced tomato' (source language)
  quantity       REAL,
  unit           TEXT,                          -- canonical unit
  grams          REAL,                          -- resolved mass, NULL when unresolvable
  PRIMARY KEY (recipe_id, ingredient_id)
);

CREATE TABLE recipe_diets (
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id),
  diet       TEXT NOT NULL,                     -- vegan|vegetarian|pescatarian|gluten_free|dairy_free
  PRIMARY KEY (recipe_id, diet)
);

CREATE TABLE recipe_micronutrient (
  recipe_id     INTEGER NOT NULL REFERENCES recipes(id),
  nutrient_key  TEXT NOT NULL,
  amount        REAL NOT NULL,                  -- per serving
  unit          TEXT NOT NULL,
  pct_nrv       REAL,                           -- vs EU NRV (Reg. 1169/2011)
  PRIMARY KEY (recipe_id, nutrient_key)
);

-- ============================================================================
-- Search — trigram tokenizer so CJK (no word breaks) and Arabic behave.
-- External-content tables: rowid maps 1:1 onto the source table, so the API
-- joins on rowid. Rebuild after seeding:
--   INSERT INTO ingredient_fts(ingredient_fts)     VALUES('rebuild');
--   INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('rebuild');
-- ============================================================================
CREATE VIRTUAL TABLE ingredient_fts USING fts5(
  name,
  content='ingredient_i18n',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE VIRTUAL TABLE recipe_title_fts USING fts5(
  title,
  content='recipe_i18n',
  content_rowid='rowid',
  tokenize='trigram'
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_ri_ingredient       ON recipe_ingredients(ingredient_id);
CREATE INDEX idx_recipes_filter      ON recipes(cuisine, meal_type);
CREATE INDEX idx_recipes_balance     ON recipes(balance_score);
CREATE INDEX idx_recipes_kcal        ON recipes(kcal);
CREATE INDEX idx_ingredient_i18n_lang ON ingredient_i18n(lang, ingredient_id);
CREATE INDEX idx_recipe_diets_diet   ON recipe_diets(diet);
