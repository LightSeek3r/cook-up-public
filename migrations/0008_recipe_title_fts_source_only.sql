-- recipe_title_fts, source-language rows only.
--
-- Why: recipe titles are deliberately never translated (a dish name is a
-- proper noun — see src/lib/search.ts's header comment), so every language's
-- recipe_i18n row indexed the *same* English title. The index held up to ten
-- identical rows per recipe for no search benefit (search.ts already
-- GROUP BY r.id to hide the duplicates), and rebuilding it after every manual
-- translation batch re-read and rewrote the whole table — the actual cause of
-- exhausting the D1 free-tier read quota twice in one week. Indexing only the
-- source-language row shrinks the table roughly 10x and removes the rebuild
-- from the hot path entirely (apply_manual_translations.mjs and
-- 07_translate.mjs no longer call 'rebuild' — see those files).
--
-- Append-only per 0001_init.sql's policy; 0001-0007 are frozen because remote
-- D1 holds machine-translated content that cannot be regenerated.
INSERT INTO recipe_title_fts(recipe_title_fts) VALUES('delete-all');

INSERT INTO recipe_title_fts(rowid, title)
SELECT i.rowid, i.title
FROM recipe_i18n i
JOIN recipes r ON r.id = i.recipe_id AND i.lang = r.source_lang;
