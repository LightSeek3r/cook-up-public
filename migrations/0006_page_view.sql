-- cook-up — first-party page view log.
--
-- Append-only, per the policy in 0001_init.sql. Replaces the outbound beacon
-- that /api/track used to forward to unit42.fr.
--
-- Deliberately absent: IP address, user agent, session id, cookie, and the
-- query string — which on this site *is* the visitor's ingredient selection.
-- What is kept is the smallest set that answers "which recipes are read, in
-- which language", the question that drives translation priority.

CREATE TABLE page_view (
  id             INTEGER PRIMARY KEY,
  path           TEXT    NOT NULL,
  -- Denormalised from the path so "views per recipe" is an indexed group-by
  -- rather than a LIKE scan over every row.
  --
  -- Deliberately NOT a foreign key into recipes(id). This is an append-only log
  -- of things that happened, and it must never be able to block a data rebuild:
  -- a FK here would make any seed that removes a recipe fail against the live
  -- DB, which is exactly the failure mode gen_remote_seed.mjs exists to avoid.
  -- A view of a since-deleted recipe also stays a true historical fact, and the
  -- dashboard's `JOIN recipes` drops orphans from the display anyway.
  recipe_id      INTEGER,
  lang           TEXT,
  country        TEXT,                          -- cf.country, 2 letters, coarse
  referrer_host  TEXT,                          -- host only, never a full URL
  device         TEXT,                          -- 'mobile' | 'desktop'
  -- 1 on the first view of a browser session, so visits and views are two
  -- different numbers that can both be read off this one table.
  is_new_visit   INTEGER NOT NULL DEFAULT 0,
  viewed_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_page_view_at     ON page_view(viewed_at);
CREATE INDEX idx_page_view_recipe ON page_view(recipe_id, viewed_at);
CREATE INDEX idx_page_view_lang   ON page_view(lang, viewed_at);
