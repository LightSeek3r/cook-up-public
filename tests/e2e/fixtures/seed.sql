-- Deterministic seed for the Playwright smoke suite. Applied after all
-- migrations to an isolated local D1 (.wrangler/e2e-state), never to the
-- developer's local database and never remotely. Small on purpose: it only has
-- to make every public page render real data, not exercise ranking.
--
-- Recipe ids 1-6. Recipe 1 has en/fr/ar rows and a stored related list; the
-- rest are English only, so non-English pages also exercise the source-language
-- fallback.

INSERT INTO ingredients (id, canonical_key, category, is_staple, beneficial, recipe_count) VALUES
 (1, 'tomato',  'vegetable', 0, 1, 2),
 (2, 'onion',   'vegetable', 0, 1, 3),
 (3, 'garlic',  'vegetable', 0, 1, 2),
 (4, 'egg',     'protein',   0, 0, 3),
 (5, 'flour',   'grain',     0, 0, 1),
 (6, 'butter',  'dairy',     0, 0, 2),
 (7, 'salt',    'spice',     1, 0, 5),
 (8, 'rice',    'grain',     0, 0, 3),
 (9, 'chicken', 'protein',   0, 1, 1),
 (10, 'milk',   'dairy',     0, 0, 2);

INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES
 (1, 'en', 'Tomato'), (2, 'en', 'Onion'), (3, 'en', 'Garlic'), (4, 'en', 'Egg'),
 (5, 'en', 'Flour'), (6, 'en', 'Butter'), (7, 'en', 'Salt'), (8, 'en', 'Rice'),
 (9, 'en', 'Chicken'), (10, 'en', 'Milk'),
 (1, 'fr', 'Tomate'), (2, 'fr', 'Oignon'), (3, 'fr', 'Ail'), (4, 'fr', 'Œuf'),
 (5, 'fr', 'Farine'), (6, 'fr', 'Beurre'), (7, 'fr', 'Sel'), (8, 'fr', 'Riz'),
 (9, 'fr', 'Poulet'), (10, 'fr', 'Lait'),
 (1, 'ar', 'طماطم'), (2, 'ar', 'بصل'), (3, 'ar', 'ثوم'), (4, 'ar', 'بيض'),
 (7, 'ar', 'ملح'), (8, 'ar', 'أرز');

INSERT INTO allergens (id, key) VALUES (1, 'gluten'), (2, 'dairy'), (3, 'egg');
INSERT INTO ingredient_allergens (ingredient_id, allergen_id) VALUES
 (5, 1), (6, 2), (10, 2), (4, 3);

INSERT INTO recipes (id, source_url, source_lang, license, attribution, cuisine, meal_type,
                     prep_minutes, total_minutes, servings, servings_assumed, kcal, protein_g,
                     fat_g, carb_g, fiber_g, sodium_mg, balance_grade, balance_score,
                     nutrition_coverage, difficulty) VALUES
 (1, 'https://en.wikibooks.org/wiki/Cookbook:E2E_Tomato_Stew', 'en', 'CC-BY-SA-3.0', 'Wikibooks contributors',
     'italian', 'dinner', 10, 25, 2, 0, 320, 6, 9, 40, 8, 600, 'A', 84, 0.9, 1),
 (2, 'https://en.wikibooks.org/wiki/Cookbook:E2E_Garlic_Rice', 'en', 'CC-BY-SA-3.0', 'Wikibooks contributors',
     'mexican', 'side', 5, 30, 4, 0, 280, 5, 4, 55, 2, 400, 'B', 70, 0.85, 1),
 (3, 'https://en.wikibooks.org/wiki/Cookbook:E2E_Egg_Fried_Rice', 'en', 'CC-BY-SA-3.0', 'Wikibooks contributors',
     'chinese', 'lunch', 10, 20, 2, 0, 450, 14, 15, 60, 2, 900, 'C', 55, 0.8, 2),
 (4, 'https://en.wikibooks.org/wiki/Cookbook:E2E_Chicken_Rice', 'en', 'CC-BY-SA-3.0', 'Wikibooks contributors',
     'indian', 'dinner', 15, 45, 4, 0, 520, 35, 12, 58, 3, 700, 'B', 68, 0.9, 2),
 (5, 'https://en.wikibooks.org/wiki/Cookbook:E2E_Pancakes', 'en', 'PD', NULL,
     'american', 'breakfast', 10, 25, 4, 1, 300, 8, 11, 42, 1, 350, 'D', 40, 0.95, 1),
 (6, 'https://en.wikibooks.org/wiki/Cookbook:E2E_Omelette', 'en', 'PD', NULL,
     'french', 'breakfast', 5, 10, 1, 0, 250, 15, 20, 2, 0, 450, 'C', 50, 0.9, 1);

INSERT INTO recipe_i18n (recipe_id, lang, title, instructions, is_machine) VALUES
 (1, 'en', 'Tomato and onion stew',
     'Chop the onion and the tomatoes.' || char(10) || 'Simmer for 20 minutes.' || char(10) || 'Season with salt.', 0),
 (1, 'fr', 'Ragoût de tomates et d''oignons',
     'Hacher l''oignon et les tomates.' || char(10) || 'Laisser mijoter 20 minutes.' || char(10) || 'Saler.', 1),
 (1, 'ar', 'يخنة الطماطم والبصل',
     'قطّع البصل والطماطم.' || char(10) || 'اتركها على نار هادئة 20 دقيقة.' || char(10) || 'تبّل بالملح.', 1),
 (2, 'en', 'Garlic tomato rice',
     'Fry the garlic.' || char(10) || 'Add rice and tomato.' || char(10) || 'Cook covered for 25 minutes.', 0),
 (3, 'en', 'Egg fried rice',
     'Scramble the eggs.' || char(10) || 'Fry the onion and the cooked rice.' || char(10) || 'Combine and season.', 0),
 (4, 'en', 'Chicken and rice',
     'Brown the chicken with onion and garlic.' || char(10) || 'Add rice and water.' || char(10) || 'Simmer for 30 minutes.', 0),
 (5, 'en', 'Simple pancakes', 'Whisk flour, egg and milk.' || char(10) || 'Cook in butter.', 0),
 (6, 'en', 'Plain omelette', 'Beat eggs with milk.' || char(10) || 'Cook in butter.' || char(10) || 'Fold and serve.', 0);

INSERT INTO recipe_ingredients (recipe_id, ingredient_id, raw_text, quantity, unit, grams) VALUES
 (1, 1, '4 tomatoes', 4, 'unit', 480), (1, 2, '1 onion', 1, 'unit', 110), (1, 7, 'salt to taste', NULL, NULL, NULL),
 (2, 3, '2 cloves garlic', 2, 'unit', 6), (2, 8, '1 cup rice', 1, 'cup', 185), (2, 1, '1 tomato', 1, 'unit', 120),
 (2, 7, '1 tsp salt', 1, 'tsp', 6),
 (3, 4, '2 eggs', 2, 'unit', 100), (3, 8, '2 cups cooked rice', 2, 'cup', 320), (3, 2, '1 onion', 1, 'unit', 110),
 (3, 7, 'salt', NULL, NULL, NULL),
 (4, 9, '500 g chicken', 500, 'g', 500), (4, 8, '1 cup rice', 1, 'cup', 185), (4, 3, '3 cloves garlic', 3, 'unit', 9),
 (4, 2, '1 onion', 1, 'unit', 110),
 (5, 5, '1 cup flour', 1, 'cup', 125), (5, 4, '1 egg', 1, 'unit', 50), (5, 10, '1 cup milk', 1, 'cup', 240),
 (5, 6, '1 tbsp butter', 1, 'tbsp', 14), (5, 7, 'pinch of salt', NULL, NULL, NULL),
 (6, 4, '3 eggs', 3, 'unit', 150), (6, 10, '2 tbsp milk', 2, 'tbsp', 30), (6, 6, '1 tsp butter', 1, 'tsp', 5),
 (6, 7, 'salt', NULL, NULL, NULL);

INSERT INTO recipe_diets (recipe_id, diet) VALUES
 (1, 'vegan'), (1, 'vegetarian'), (1, 'gluten_free'), (1, 'dairy_free'),
 (2, 'vegan'), (2, 'vegetarian'), (3, 'vegetarian'), (5, 'vegetarian'), (6, 'vegetarian'), (6, 'gluten_free');

INSERT INTO recipe_related (recipe_id, related_ids) VALUES (1, '[2,3]');

-- Same derivation as migrations/0009.
UPDATE recipes SET non_staple_count = (
	SELECT COUNT(*)
	FROM recipe_ingredients ri
	JOIN ingredients i ON i.id = ri.ingredient_id
	WHERE ri.recipe_id = recipes.id AND i.is_staple = 0
);

INSERT INTO ingredient_fts(ingredient_fts) VALUES('rebuild');

-- Source-language rows only, as in migrations/0008.
INSERT INTO recipe_title_fts(rowid, title)
SELECT i.rowid, i.title
FROM recipe_i18n i
JOIN recipes r ON r.id = i.recipe_id AND i.lang = r.source_lang;
