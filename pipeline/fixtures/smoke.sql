-- Throwaway smoke fixture for validating the match query shape. Not part of the build.
INSERT INTO ingredients (id, canonical_key, category, is_staple, beneficial, recipe_count)
VALUES (1,'tomato','vegetable',0,1,1), (2,'onion','vegetable',0,1,1), (3,'salt','spice',1,0,1);

INSERT INTO ingredient_i18n (ingredient_id, lang, name) VALUES
 (1,'en','Tomato'), (2,'en','Onion'), (3,'en','Salt'), (1,'fr','Tomate');

INSERT INTO recipes (id, source_url, source_lang, license, cuisine, meal_type, total_minutes, nutrition_coverage, balance_grade, balance_score, kcal)
VALUES (1,'https://example.org/r/1','en','PD','italian','dinner',25,0.82,'A',84,320);

INSERT INTO recipe_i18n (recipe_id, lang, title, instructions) VALUES
 (1,'en','Tomato and onion stew','Chop, simmer, season.');

INSERT INTO recipe_ingredients (recipe_id, ingredient_id, raw_text, quantity, unit, grams) VALUES
 (1,1,'2 tomatoes',2,'unit',240), (1,2,'1 onion',1,'unit',110), (1,3,'salt to taste',NULL,NULL,NULL);

INSERT INTO ingredient_fts(ingredient_fts) VALUES('rebuild');
INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('rebuild');
