-- The recipe's lead photograph, and the attribution its licence requires.
--
-- Populated by the new stage 08 from the MediaWiki imageinfo API: 750 of 3,407
-- recipes (22%) have one. Every file is a Wikimedia Commons upload under a free
-- licence — CC BY-SA 4.0 x203, CC BY-SA 3.0 x168, Public domain x108, CC BY 2.0
-- x94, CC0 x38, and a long tail — with **no non-free files** in the corpus.
--
-- author and licence are NOT optional metadata. Most of these licences are
-- share-alike and require per-image credit, and the page footer's CC-BY-SA-3.0
-- line covers only the Wikibooks *text*: a photo has its own author and often a
-- different licence. Stage 08 therefore refuses to emit a row without a licence,
-- and the UI must not render an image without displaying both. `image_author` may
-- legitimately be NULL (45 rows) where the file states none — typically CC0 and
-- public-domain works, which require no attribution.
--
-- width/height are stored so the page can reserve the right box and avoid layout
-- shift, which is the whole reason to have them rather than recompute client-side.
--
-- Append-only; 0001 is frozen because remote D1 holds machine-translated content
-- that cannot be regenerated.
ALTER TABLE recipes ADD COLUMN image_url TEXT;
ALTER TABLE recipes ADD COLUMN image_width INTEGER;
ALTER TABLE recipes ADD COLUMN image_height INTEGER;
ALTER TABLE recipes ADD COLUMN image_page TEXT;
ALTER TABLE recipes ADD COLUMN image_author TEXT;
ALTER TABLE recipes ADD COLUMN image_licence TEXT;
