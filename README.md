# cook-up

Pick the ingredients you have, find the recipes you can make.

cook-up is an ingredients-first recipe finder: rather than starting from a dish name, you
select what's in your kitchen and it ranks recipes by how few ingredients you're missing.
(You can still search by dish name when you already know what you want.) Every result carries
honest nutrition — shown only when enough of the recipe's mass actually resolved to real data,
and openly withheld when it didn't — a custom health grade, and, where a genuinely healthier
swap exists, a substitution tip.

## Features

- **Ingredient mosaic** — tap ingredient tiles (icon + category colour) instead of typing a
  search query; a sticky tray tracks your current selection.
- **Missing-ingredient ranking** — results are sorted by how many selected ingredients they
  use and how few non-staple ingredients they're missing, with the missing ones named.
- **"Almost there"** — once you've picked three or more ingredients, recipes that use *most*
  of them appear in a separate group below the exact matches, each saying which of your
  ingredients it doesn't use. The strict "you can cook this now" list stays the primary
  answer; near-misses never displace it.
- **Tap to add missing ingredients** — tap any missing ingredient on a result card to add it
  to your selection (e.g. once you've checked the cupboard).
- **Quickest-first sort** — sort recipes by how fast they cook, with recipes lacking timing
  data pushed to the end.
- **Allergen exclusion** — exclude recipes by allergen (gluten, dairy, nut, peanut, egg, soy,
  fish, shellfish, sesame).
- **Must-use ingredients** — pin must-have ingredients to force recipes to include them when
  near-misses are available.
- **Pick one for me** — opens a random recipe you can cook right now (from the loaded exact
  matches).
- **Related recipes** — each recipe page shows similar recipes based on shared ingredients.
- **Remembered fridge** — your ingredient selection is saved in browser storage (device-only,
  no account needed).
- **Search by dish name too** — the search bar matches recipe titles as well as ingredients,
  so you can go straight to a dish you already had in mind. (Recipe titles are deliberately
  never translated — a dish name is a proper noun — so title search is English in every
  locale.)
- **Honest result counts** — the count is the real number of matches, not the page size, and
  a *Load more* button pages through the rest.
- **Shareable, stable URLs** — the whole UI state lives in the query string
  (`?have=onion,garlic,egg&lang=fr&cuisine=italian&sort=grade`), keyed on ingredient names
  rather than database ids so a link keeps meaning the same thing after a data rebuild.
- **Light and dark themes** — a three-way light/dark/auto control, persisted, with no
  flash-of-wrong-theme on load and a forced-colors fallback.
- **Nutrition & Balance Grade** — per-serving macros, a curated 10-nutrient micronutrient
  panel with % NRV (EU Reg. 1169/2011), and an A–E grade. Hidden (with an explanation)
  rather than guessed when less than 70% of a recipe's mass resolved to real nutrition data.
- **Healthy substitution tips** — structural swap suggestions (e.g. butter → olive oil,
  sugar → banana) shown only when the substitute isn't already in the recipe.
- **Filters** — cuisine, meal type, diet (vegan/vegetarian/pescatarian/gluten-free/
  dairy-free), sort by match quality / kcal / quickest-first / balance grade. Allergen
  exclusion by any of: gluten, dairy, nut, peanut, egg, soy, fish, shellfish, sesame.
- **16 languages** — en, es, fr, de, ar, hi, zh, ja, ko, vi, pt, it, bn, ru, pnb, jv, including
  full RTL support for Arabic and Western Punjabi (Shahmukhi script). Ingredient names and UI
  strings are bundled; recipe titles and instructions are pre-translated in every language and
  shipped in the static data artefacts. Translation is complete: no translation job, cron or
  runtime translation endpoint exists, and a recipe page shows the stored text for its language
  (source language if a row is missing). The translations are machine-made and a review pass is
  under way; Javanese, Vietnamese and Western Punjabi show the English instructions until a
  reviewer has passed a recipe (`pipeline/lib/recipe_i18n_withheld.json`).
- **Cooking-techniques glossary** — `/glossary`: 152 techniques (knife cuts, dry and moist
  heat, doughs, sauces, preservation, modernist cooking...) in all 16 languages, searchable in
  each script, with 28 text-free SVG diagrams where a drawing explains it better than words.
  Static data checked into the repository, no database.
- **Recipe photos** — 711 recipes carry a Wikimedia Commons photograph, hotlinked, each credited
  to its own author and licence (all free: CC BY-SA, CC BY, CC0, public domain).
- **Difficulty, notes and quantity equivalents** — a 1–4 difficulty meter from the source infobox,
  the source's own "notes, tips and variations" where it has them, and every quantity shown in the
  other measuring system plus a real gram weight where one could be resolved.
- **Attribution built in** — every recipe links back to its source and license.
- **No third-party tracking** — the app contacts no third party at all. One row per page view
  goes into its own D1: path, language, coarse country, referrer host and mobile/desktop.
  No IP address, no cookie, no session id, no user-agent string, and never the query string,
  which on this site *is* the visitor's ingredient selection.
- **Admin dashboard** — `/admin`, behind a six-digit code emailed on request, showing traffic,
  translation completeness and corpus health.

## Tech stack

- [SvelteKit](https://svelte.dev) 2 (Svelte 5 runes) + TypeScript, deployed as a Cloudflare
  Worker with static assets (`@sveltejs/adapter-cloudflare`).
- Recipe, ingredient, nutrition and translation data is built offline into static data artefacts
  (a pinned release of the public `cook-up-data` repository, fetched at build time). The only
  **Cloudflare D1** (SQLite) tables left are runtime state: page views and admin sign-in. No KV
  or Workers AI binding.
- **Vitest** for unit tests; a plain Node ESM pipeline (no framework) for the offline data
  build.

## Project structure

```
src/                    SvelteKit app
  routes/                 pages + API endpoints (/api/match, /api/ingredients, /api/search,
                          /api/recipes, /api/track) plus /admin, the OTP-gated dashboard
  components/             Mosaic, ResultCard, NutritionPanel, SubstitutionTips, RecipeHits, ...
  lib/                     matching/search/nutrition/i18n logic, config, types — the pure,
                           testable core. SQL lives here, not inline in routes, so it can be
                           unit-tested against a spy without a real D1.
    data/                    the data artefacts' decoders and queries (Worker and browser)
    test/sql/                the D1 implementations the artefacts replaced, kept only as the
                             parity suites' reference; nothing outside src/lib/test imports them
migrations/             D1 schema — 0001_init.sql plus append-only follow-ups. 0001 is frozen,
                        schema changes ship as new numbered files. 0013 drops the recipe corpus:
                        D1 holds runtime state only (page_view, admin_otp, admin_session).
pipeline/               offline data build (see below) — Node ESM, run outside the Worker
  01_fetch.mjs .. 08_fetch_images.mjs   the eight numbered stages, run in order
  09_build_artefacts.mjs   the data artefacts the site serves (see Data artefacts)
  gen_remote_seed.mjs      retired remote reseed; only --restore-corpus, the rollback of 0013
  lib/                     shared pure logic (wikitext parsing, unit parsing, FDC matching, ...)
  data/                    fetched/downloaded raw sources, translation store and backup (git-ignored)
  out/                     generated .jsonl and artefacts (git-ignored)
tasks/                  working notes: todo.md (build log per phase), lessons.md (hard-won fixes)
```

## Getting started

```bash
npm install
npm run db:migrate          # the D1 schema (page views, admin auth) on your local database
npm run data:fetch          # data artefacts pinned by src/lib/data/lock.json (needs gh or GITHUB_TOKEN)
npm run dev                 # vite dev, with D1 emulated locally (no Cloudflare login needed)
```

All recipe and ingredient data comes from the data artefacts `data:fetch` installs; the local D1
needs no seeding (it holds no corpus since migrations/0013).

All configuration is via `wrangler.toml` bindings — there's no `.env` file in this project.
The three `/admin` secrets are the one exception, and they are set with `wrangler secret put`
rather than committed (see **Deployment**). For `npm run dev`, put the same three in a
git-ignored `.dev.vars`; without them the app runs normally and only `/admin` is unusable.

To serve data you built yourself rather than the pinned release, see **Data artefacts** below.

## Match API

`GET /api/match` backs the home page, which mirrors its whole state (ingredients, filters,
sort) into the page URL so any search is shareable:

```
GET /api/match?have=onion,garlic,egg&sort=time&noAllergen=dairy,gluten&lang=en
```

Ingredients are addressed by `canonical_key` (`onion`, `extra_virgin_olive_oil`: lowercase
`[a-z][a-z0-9_]*`), never by numeric id, because ids are renumbered on every reseed.

- `have` — comma-separated ingredient keys; required. Unknown keys are dropped.
- `offset` — pagination offset (default `0`); pages are `MATCH_PAGE_SIZE` (50) rows.
- `sort` — omitted = best match; `kcal` (lowest first), `grade` (best Balance Grade first) or
  `time` (quickest first; recipes with no known total time go last).
- `noAllergen` — comma-separated allergen keys to exclude: `gluten`, `dairy`, `nut`,
  `peanut`, `egg`, `soy`, `fish`, `shellfish`, `sesame`. Unknown keys are ignored.
- `must` — comma-separated ingredient keys every result must use. Only applies when 3+
  ingredients are selected (below that there are no "almost there" results, so every
  selected ingredient is already required), and only keys that are also in `have` count.
- `cuisine`, `meal`, `diet` — single-value filters; allowed values are in `src/lib/config.ts`.
- `lang` — any supported language code (`en`, `pnb`, …); anything else falls back to `en`.

Response: `{ results, total, haveCount }`. `total` is the full match count (for paging);
`haveCount` is how many `have` keys survived validation, so a stale link is detectable. Each
result carries `matched`, `missing`, and `missing_names` / `missing_keys`: the missing
non-staple ingredients as display names and as keys, in the same order, joined by U+001F
rather than a comma (a comma can appear inside a translated name).

## Data pipeline

All recipe, ingredient, and nutrition data is built offline by a sequence of Node scripts
under `pipeline/`, then shipped with the build as data artefacts (stage 09, **Data artefacts**
below) — nothing is scraped or computed at request time, and nothing of it is in D1.

| Stage | Script | What it does |
|---|---|---|
| 01 | `pipeline:fetch` | Fetches Wikibooks Cookbook pages + the Open Food Facts ingredient taxonomy into `pipeline/data/` |
| 02 | `pipeline:parse` | Wikitext → structured recipe records (ingredients, steps, servings, cuisine, meal type) |
| 03 | `pipeline:normalize` | Matches ingredient text against the OFF taxonomy; derives category/diet/allergens |
| 04 | `node pipeline/04_map_fdc.mjs` | Matches ingredients to USDA FoodData Central entries; resolves recipe quantities to grams |
| 05 | `node pipeline/05_compute_nutrition.mjs` | Aggregates per-recipe macros/micros and computes the Balance Grade |
| 06 | (library) | `06_seed_d1.mjs`: the corpus database's statements, used by stage 09 and the corpus restore; no longer seeds any D1 |
| 07 | (removed) | The batch machine-translation stage is gone: translations are agent batches validated and merged into the recipe translation store (**Recipe translations** below) |
| 08 | `node pipeline/08_fetch_images.mjs` | Resolves each recipe's Wikimedia Commons photo to a URL plus its author and licence (the only networked stage besides 01; disk-cached) |
| 09 | `data:build` | Builds the data artefacts from all of the above plus the translations |

Stage 04 needs the USDA FoodData Central **Foundation Foods** and **SR Legacy** CSV bulk
downloads in place first — there's no automated fetch for these (license/rate-limit
reasons); get them from [fdc.nal.usda.gov](https://fdc.nal.usda.gov)'s bulk data download
page and unzip into `pipeline/data/fdc/foundation/` and `pipeline/data/fdc/sr_legacy/`.

Run stages 01-05 and 08 before 09 — the artefacts read all of their output:

```bash
npm run pipeline:fetch
npm run pipeline:parse
npm run pipeline:normalize
node pipeline/04_map_fdc.mjs
node pipeline/05_compute_nutrition.mjs
node pipeline/08_fetch_images.mjs
npm run data:build -- --save-db=pipeline/out/snapshot.sqlite   # artefacts + the corpus as SQLite, to inspect
```

Each stage is resumable and logs real counts (pages fetched, ingredients matched, recipes
graded, etc.) rather than just "done" — check `tasks/todo.md` for what those numbers should
look like on the full corpus. As a reference point, the full build currently yields roughly
**3,400 recipes and 1,030 distinct ingredients**, about a third of them carrying enough
resolved mass to show nutrition.

### Retiring the D1 corpus

**Done on 2026-10-15.** Preconditions met: a full day with no corpus query in D1 insights, a
fresh export (private release `i18n-backup-2026-10-15`, 54,798 recipe and 11,835 ingredient
translation rows, verified), remote parity, and the Time Travel bookmark
`00000307-00000000-00005105-94afa0370aba3d18b24dd850444b41e6` (2026-10-15 08:14:57 UTC).
Applied in 227 ms; D1 now holds `page_view`, `admin_otp`, `admin_session` and its own tables.
The steps below are the record of what was done; the Time Travel restore is possible until
2026-10-22.

Since phase 3.2-3.4 no request reads the recipe corpus from D1, and
`migrations/0013_retire_recipe_corpus.sql` drops it: the 14 corpus tables (`recipes`,
`recipe_i18n`, `recipe_ingredients`, `ingredients`, `ingredient_i18n`, the nutrition, diet,
allergen and related tables, `recipe_i18n_stats`) and both FTS indexes. D1 keeps `page_view`,
`admin_otp` and `admin_session`. Applying it costs ~541 rows read and 0 written (measured
through Miniflare on the full corpus); the file's header has the details, the precondition
list and the restore. `pipeline/lib/migrations.mjs` `CORPUS_SCHEMA_LAST` (12) is the schema
the pipeline and the SQL parity tests still build their in-memory corpus databases with.

The cutover, in order, each step a hard stop:

1. **Deploy the code that reads no corpus table** (`/admin` now takes its corpus figures from
   the artefacts) *without* 0013: commit everything else first, or `deploy.mjs` stops on the
   pending migration. Code first, because the old code's `/admin` still queries the corpus.
2. **A full day with no corpus query.** After 24 h:
   `npx wrangler d1 insights cook-up-db --time-period=1d --sort-by=count --limit=500 --json > pipeline/out/insights-1d.json`
   then `node pipeline/tools/corpus_reads_check.mjs pipeline/out/insights-1d.json` must print
   `no corpus query`.
3. **Fresh backup**: `node pipeline/tools/export_remote_i18n.mjs --fresh` (~150k rows read),
   uploaded as a private release like `i18n-backup-2026-10-12`, and nothing in it missing from
   the recipe translation store.
4. **Parity once more**: `npm run data:parity:remote -- --only=sample` (~6k rows read).
5. **Bookmark**: `npx wrangler d1 time-travel info cook-up-db --json`, kept with the date.
6. **Owner confirmation**, then commit 0013 and `npm run db:migrate:remote`.
7. **Check**: `npx wrangler d1 execute cook-up-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"`
   lists only `_cf_*`/`d1_migrations`/`admin_otp`/`admin_session`/`page_view` (and
   `sqlite_sequence` if present); `/admin` signs in and shows its dashboard; a recipe page
   view still lands in `page_view`.

After 0013, **never `wrangler rollback` to a version older than step 1's**: older versions'
`/admin` (and, before 3.2-3.3, every page) read the dropped tables. To undo 0013 itself:
within Time Travel's window (7 days on Free, 30 on Paid)
`npx wrangler d1 time-travel restore cook-up-db --bookmark=<step 5>` (page views and admin
sessions since are lost); later, `node pipeline/gen_remote_seed.mjs --restore-corpus` then
`node pipeline/tools/apply_remote_chunks.mjs --dir=pipeline/out/remote-chunks-restore --across-days`,
rerun each day: 2,974 chunks, ~352k rows written, about five days on the free plan (one go on
Workers Paid), harmless while partial because nothing reads those tables.

**The remote reseed is retired.** `gen_remote_seed.mjs` (full, `--only=related|stats|fts`) and
`apply_remote_chunks.mjs` wrote the corpus into D1; publishing data is now
`npm run data:build`, `npm run data:publish` and a deploy (**Data artefacts**). After 0013 any
tool that still reads or writes a corpus table on remote (the reseed, `db:translate:manual`,
the ingredient-name tools, `export_remote_i18n.mjs`, `artefact_remote_parity.mjs`) stops with
"D1 has no recipe_i18n: migrations/0013 … retired the recipe corpus" from `pipeline/lib/d1.mjs`.

**Translation backup.** Remote `recipe_i18n` / `ingredient_i18n` are backed up into
`pipeline/data/i18n-backup/` by `node pipeline/tools/export_remote_i18n.mjs` (read-only, ~150k
rows read, resumable); it reads D1, so it works only until 0013, and its last `--fresh` run is
the frozen record of what D1 served. Recipe translations now live in the recipe translation
store (`pipeline/data/recipe-i18n`, `pipeline/lib/recipe_i18n_store.mjs`); ingredient names are
still read from this backup by the artefact build.

### Recipe translations

Recipe titles and instructions in all 16 languages live in the **recipe translation store**,
`pipeline/data/recipe-i18n/` (git-ignored, like the backup it was seeded from): per language
`titles/<lang>.jsonl` (a few hundred KB) and `instructions/<lang>.jsonl.gz` (~1 MB), so a title
batch never rewrites a language's instructions. Each file starts with a header carrying its row
count and the sha256 of its content, rows in recipe id order with a fixed key order (equal content
is equal bytes); a damaged or hand-edited file stops every tool and the build. There is no shared
manifest, so agents translating different languages in parallel never write the same file, and
each write is one atomic replace, refused if the file changed meanwhile. Stage 09 reads it (no D1
anywhere in this flow): a language row has the language's title, else the English one; a title
without instructions of its own still reaches the cards and the page, over the English text.

Each row records the hash of the English text it was translated from (a changed source shows up
as `stale`), whether it was imported from the backup or applied through the full gate, and
whether a second-pass reviewer has passed it. Content changes only through these tools (the
translating agents' rules: `.claude/rules/recipe-translation-subagents.md`):

```bash
node pipeline/tools/recipe_i18n_import_backup.mjs     # seed from the verified backup, once (idempotent: fills only what is missing)
node pipeline/tools/recipe_i18n_next_batch.mjs --kind=titles --lang=fr --out=pipeline/out/recipe_i18n_batches/in_titles_fr_1.json
node pipeline/tools/recipe_i18n_apply.mjs --kind=titles --lang=fr --file=pipeline/out/recipe_i18n_batches/titles_fr_1.json
node pipeline/tools/recipe_i18n_terms.mjs --lang=fr --out=pipeline/out/recipe_i18n_batches/terms_fr.json   # recurring title words, for consistency
npm run recipe-i18n:status                            # coverage matrix: done, missing, invalid, stale, reviewed
npm run recipe-i18n:mirror                            # whole store as a private release asset (--restore=<pack> brings it back)
```

`--kind=instructions` works the same way (15 recipes a batch instead of 100 titles); `--review`
on next_batch and apply is the second pass, which only touches existing entries, holds them to
the full gate, marks them reviewed and is the only way to keep a title exactly as in English
(`keep_source`, with the reason). Every tool takes `--store=<dir>` (and `--pipeline-out=<dir>`),
which is how `pipeline/tools/recipe_i18n_tools.test.mjs` runs the whole flow, from import to a
search over the built artefacts, on a three-recipe corpus.

The gate (`pipeline/lib/recipe_i18n_gate.mjs`) checks a whole batch before anything is written.
Titles: target script (CJK, Devanagari without Bengali and back, Shahmukhi versus Arabic,
Cyrillic, Hangul; Latin letters only and Vietnamese diacritics for the Latin languages), no
markup, line breaks or backslashes, length against the English (looser for CJK), digits and
Roman variant numerals kept, no English left in a Latin-script title (a word common in the
English recipes and not in the language's own translated instructions, unless a listed
loanword), no title identical to English unless it is a proper noun or a reviewer kept it, no
title copied from other languages. Instructions: the line count, script, copy, length and
backslash rules the old D1 writer had, plus identical digits, Western digits, the decimal
separator per language, no English unit words, no foreign letters, no markup. Rows imported from
the backup are held to the old rules plus foreign letters; their other issues show as
`advisory` in the status and are not handed out again.

The import leaves out 409 backup rows that are another recipe's title and instructions
(pipeline/lib/recipe_i18n_legacy.mjs, from the 2026-10-14 audit of the 417 backup titles that
differed from English: e.g. zh 488 "Creamed Potatoes" with creamed-potato steps for
"Atkins-Friendly Mock Tiramisu"; every row with equal line counts was read), and every backup
title that fails the gate. Those recipes show English in that language until translated.

### Data artefacts

The read-only corpus ships as versioned files with the build
(`.claude/plans/phase3-static-data.md`). Stage 09 builds them from the pipeline snapshot,
through the statements `06_seed_d1.mjs` writes into an in-memory SQLite with the corpus schema
(migrations up to `CORPUS_SCHEMA_LAST`), so every value is what D1 held before 0013:

| File | Holds | Size (gzip) |
|---|---|---|
| `core.bin` | everything `/api/match` and title search need, in a typed-array layout (`src/lib/data/core.js`) | 186 KB |
| `titles/<lang>.json` | the titles that differ from the source title (translated titles), per language | 0.1-2 KB today; ~50-60 KB once a language's 3,478 titles are translated |
| `names/<lang>.json` | ingredient display names, and which are the language's own | 5-7 KB |
| `mosaic/<lang>.json` | the `/api/ingredients` mosaic, as the API returns it | 17-20 KB |
| `r/<id>.json` | one recipe page, every language (3,478 files) | median 7 KB, max 44 KB |
| `sitemap.json`, `manifest.json` | every recipe id; data version, counts and sha256 of every file | |

`src/lib/data/` reads them in the Worker and in the browser alike (plain JS, no `$lib`
imports) and reproduces the SQL exactly: `matchCore`, `searchTitles`, `searchIngredients`,
`recipesByIds`, `recipePage`. `searchTitles` goes one step further than the SQL did: besides
the source title (FTS trigram semantics, so English queries find the same recipes in every
language), a query of 3+ characters also matches the page language's translated title in
`foldText` form (case, accents, Arabic-script variants, width and kana folded:
`src/lib/data/text.js`, shared with the glossary search), and one or two CJK characters are
searched (substring of the title shown) where the route used to answer them empty. Ranking is
unchanged. The parity suite compares English byte for byte with the SQL, and other languages
with the SQL extended by the translated titles (`src/lib/test/titleSearch.mjs`).

`/api/match`, `/api/search`, `/api/ingredients`, `/api/recipes`, the recipe pages and
`/sitemap.xml` serve from them and never touch D1, which only serves `/api/track`
(`page_view`) and `/admin` (auth, and the traffic half of the dashboard; its corpus figures
come from `core.bin` and `manifest.json`'s `counts`). `src/lib/server/data.ts` fetches
`core.bin` and English from
`env.ASSETS` on an isolate's first data request, each other language's two small files on its
first use, and keeps them for the isolate's lifetime; a recipe page also fetches its own
`r/<id>.json` (alongside the corpus on a cold isolate), the sitemap `sitemap.json`, on every
uncached request. A missing, corrupt or mixed-version file is `503 {"error":"unavailable"}` on
the APIs and the "try again" error page on pages (logged by `handleError`, retried on the next
request); an id the corpus does not have is a 404 without D1. The mosaic is the file itself,
sliced, not re-serialised. The `init` hook warms the query code up on a tiny embedded corpus
(`src/lib/server/warmup.ts`) at isolate startup, which is not billed to any request.

`src/lib/data/parity.sqlite.test.mjs` compares the real route handlers and the real recipe
page load (with a D1 stub that throws if touched) against the D1 implementations they replaced
(`src/lib/test/sqlRoutes.ts`, over `src/lib/test/sql/`): status, headers and body byte for
byte, over the D1 match
harness matrix, generated URLs and search, ingredient, favorites and sitemap queries, and the
page data as JSON (or the 400/404 thrown) for every recipe in every language plus an unknown
one. It runs on a real slice of the corpus in `pipeline/fixtures/artefact-corpus.sql`
(regenerate with `node pipeline/tools/make_artefact_fixture.mjs`); `DATA_PARITY_DB=<file>`
adds the full corpus saved by `--save-db`. Every database these suites build for the SQL side has
the corpus schema (`applyMigrations(db, { upTo: CORPUS_SCHEMA_LAST })`), while the D1 binding
the routes get has every migration, i.e. no corpus; `src/lib/test/corpusReads.test.mjs` fails if
app code outside `src/lib/test` names a corpus table in SQL. The e2e server
(`scripts/e2e-server.mjs`) serves
artefacts built from its own seed, stamped with the lock's data version so the browser path
below runs against them.

**Matching in the browser.** The home page matches locally once it has `core.bin`, English
names and the page language's names and titles (207 KB compressed for English: `core.bin` 199
KB brotli, names 6 KB, titles 1 KB), so toggling an ingredient, sorting, filtering or loading
more makes no request. `src/lib/client/localMatch.ts` schedules the download with
`requestIdleCallback` once the mosaic is in (low fetch priority, so it never competes with
it), or at the first ingredient tap if that comes first; on Save-Data or a 2G connection only
at that tap. The decoder and match code are a separate chunk (`src/lib/client/matchData.ts`,
5 KB gzip), imported only then. Each file is fetched as `/data/<file>?v=<data version>`
(lock.json's version, a hash of the content), and `_headers` serves `core.bin`, `names/*` and
`titles/*` with `Cache-Control: public, max-age=31536000, immutable`, so a repeat visit
downloads nothing until the data changes; a deploy that changes only code keeps the cached
copy. `core.bin` is also given `Content-Type: application/x-protobuf`: Cloudflare does not
compress `application/octet-stream`, which sent it raw (434 KB). Every file must carry this
build's data version: a mismatch (a tab older than the deploy, or a copy cached by a request
that raced one, since the assets ignore `?v=`) is fetched once more with `cache: 'reload'`,
and if it still differs the browser path stays off. Until the files are in, after any download
failure, a mismatch, or a match that throws, the page asks `/api/match` exactly as before
(same `responseCache`, loading and error states); a language whose files fail goes to the
server alone, and a language switch asks the server once while that language's two files
load. A tap's local answer is computed after the next paint (`afterPaint`), so the pressed
tile shows before the 50 new cards render, which is the expensive part: the match itself takes
3-12 ms on a 4x-throttled CPU and decoding about 30 ms in several short tasks, so there is no
Web Worker. Route and browser build the body with one function, `matchResponse`
(`src/lib/data/match.js`), and the parity suite checks the browser path against the real route
over the harness matrix, generated and hand-written URLs and the page's own `matchRequest`
strings, JSON byte for byte (`src/lib/client/*.test.*` cover scheduling and the version
checks; `tests/e2e/smoke.spec.ts` the local path and both fallbacks in the real bundle).

**Delivery: a pinned release asset, not committed files.** The per-recipe files alone are ~58
MB, regenerated whenever a translation changes, and `pipeline/out` is not in git anyway, so
committing them would bloat the history with every data version while CI still could not
rebuild them. Instead the files are one data pack (`scripts/lib/datapack.mjs`) on a GitHub
release `data-<version>` of the **public** repository
[`LightSeek3r/cook-up-data`](https://github.com/LightSeek3r/cook-up-data) (it holds nothing
else, and every file in it is already served publicly under `/data`; never a `v*` tag: those
deploy), pinned by `src/lib/data/lock.json` (repo, tag, asset sha256, manifest sha256). A
public repository means any build, Cloudflare's included, downloads the data with no token
that could expire. The translation backups stay private releases of this repository.
`npm run data:fetch`
installs it into `static/data/` (served as static assets) and the files the Worker may
bundle into `src/lib/data/generated/`; both are git-ignored. `scripts/build.mjs` refuses to
build unless the installed files match the lock, file by file. Code and data then deploy as
one Worker version, and a rollback rolls both back.

```bash
npm run data:fetch                        # once per clone and after the lock changes (CI does it)
npm run data:build -- --save-db=pipeline/out/snapshot.sqlite   # rebuild from the snapshot
DATA_PARITY_DB=pipeline/out/snapshot.sqlite npx vitest run src/lib/data   # full-corpus parity
GH_TOKEN=$(cat ../pat.txt) npm run data:publish   # release data-<version> in cook-up-data (needs write access), update the lock, install
npm run data:parity:remote -- --only=sample       # read-only snapshot == remote D1 check (until 0013)
```

`data:fetch` uses the `gh` CLI when installed (`GH_TOKEN` or `gh auth login`), else the
GitHub API, with `GITHUB_TOKEN`/`GH_TOKEN` when set and without a token otherwise (the data
repository is public). Commit `src/lib/data/lock.json` after publishing.
The full remote parity check (`data:parity:remote` without `--only`) reads ~265k rows, D1
billing about two rows per row scanned; `--only=sample` reads ~6k.

After publishing new artefacts, redeploy with fresh cache keys:
`npm run deploy -- --fresh-cache`. Public API responses are cached under the build version (see
**HTTP caching**), and the version is now the commit, so a plain redeploy of the same commit
would keep serving the old data for up to a day.

## Testing

```bash
npm test          # vitest run — unit tests over the pure logic (matching, nutrition, i18n, pipeline parsers)
npm run test:watch
npm run check     # svelte-kit sync + svelte-check — 0 errors is the bar
```

End-to-end smoke tests (Playwright) run against the real Worker bundle under
`wrangler dev --local`, on a throwaway D1 in `.wrangler/e2e-state` that gets all migrations
(runtime tables only), and data artefacts built from the small fixture
`tests/e2e/fixtures/seed.sql` (6 recipes, 10 ingredients). Your own local D1 is never
touched. They cover hydration and the mosaic, selecting an ingredient, a recipe page and its
stored translation, the glossary list and an Arabic (RTL) term, 404s, security headers on static
files, and that every `/_app/immutable` chunk the pages reference is served by the same build.
Every test also fails on any page error or console error (a broken CSP hash shows up there).

```bash
npx playwright install chromium   # once
npm run build:checked             # the suite serves this build
npm run test:e2e                  # starts and stops wrangler dev itself, port 8799
```

The same steps CI runs, locally: `npm run data:fetch`, `npm run check:eol`,
`npm run check:migrations`, `npm run check`, `npm test`, `npm run build:checked`,
`npm run check:bundle`, `npm run test:e2e`.

## Deployment

Deploys as a single Cloudflare Worker (`wrangler deploy`), serving the built SvelteKit app
as static assets plus its own API routes. Bindings live in `wrangler.toml`:

- `DB` — D1 (`cook-up-db`)

Three secrets are set with `wrangler secret put` instead, because they must not be in the repo:

```bash
wrangler secret put RESEND_API_KEY   # Resend key, used only to send the /admin sign-in code
wrangler secret put RESEND_FROM      # verified sender, e.g. cook-up@unit42.fr
wrangler secret put ADMIN_EMAILS     # comma-separated allowlist of addresses that may sign in
```

With any of them missing, `/admin` still renders and still accepts an address — it just never
sends anything. That is deliberate: the form answers identically whether or not an address is
allowlisted, so it cannot be used to discover who the admin is. Check `wrangler secret list`
rather than the UI when a code fails to arrive.

**D1 holds runtime state only** (`page_view`, `admin_otp`, `admin_session`), local and remote
alike: migration 0013 retired the recipe corpus from remote on 2026-10-15. The translated
recipe content that D1 used to hold is in the private release `i18n-backup-2026-10-15` and,
as the pipeline's source of truth, in the recipe translation store; see **Retiring the D1
corpus**.

**HTTP caching.** `/api/ingredients`, `/api/search`, `/api/match`, `/api/recipes` and
`/sitemap.xml` send a public `Cache-Control` (browser 1 h, edge 1 day; exact values in
`src/lib/httpCache.ts`); `/admin` and `/api/track` send `private, no-store`. The client adds
`v=<build version>` to its API URLs. The build version is the git commit (`kit.version.name`,
`scripts/lib/version.mjs`), so a deploy of a new commit starts on fresh cache keys, while
redeploying the same commit keeps them; `npm run deploy -- --fresh-cache` forces new keys (after
a reseed or translation batch). The edge cache works on `*.workers.dev` too (verified
2026-10-12: the first request has no `cf-cache-status`, a repeat in the same colo shows `HIT`
and `Age`); it is per colo and has no global purge.

### Deploying

One command, from a clean, committed tree:

```bash
npm run deploy                     # options: --fresh-cache, --allow-dirty, --dry-run, --skip-browser
```

`scripts/deploy.mjs` stops at the first failed step and never deploys a partial build:

1. **No dev servers.** It refuses while any `workerd`, `wrangler dev` or `vite dev` process runs
   (Windows and Linux). They lock `.svelte-kit/cloudflare`; on 2026-10-12 that made the adapter
   step fail after `vite build` had already rewritten the server output, and the deploy shipped
   new server code with old client assets: 9 chunk 404s, the site non-interactive for ~4 h.
   Stop them first (`Get-Process workerd | Stop-Process` / `pkill workerd`).
2. **Clean tree.** The version names the commit; uncommitted changes need `--allow-dirty` and
   get a `-dirty.<hash>` version.
3. **Migrations first.** `wrangler d1 migrations list cook-up-db --remote` (read-only) must say
   "No migrations to apply!". Otherwise it stops: new code can depend on a new column (0009's
   `non_staple_count`, 0012 for the admin code). Applying stays manual, because migrations
   spend daily D1 quota: check the cost comment at the top of each pending file against
   today's usage, run `npm run db:migrate:remote`, then deploy again.
4. **Checked build** (`npm run build:checked`, full log in `.wrangler/deploy/build.log`): fails
   unless `vite build` exits 0, adapter-cloudflare prints `✔ done`, no EPERM/EBUSY appears, the
   server build, the client build and `.svelte-kit/cloudflare/_app/version.json` carry the same
   version, every built chunk is in `.svelte-kit/cloudflare`, and the project-root `_headers`
   was copied. `node scripts/build.mjs --check` runs the same checks on an existing build.
5. **`wrangler deploy`**, retried up to 3 times on Cloudflare 5xx/network errors (or the
   transient 7403) with the same build, never rebuilding in between.
6. **Live check** (`npm run verify:deploy -- <url>`): waits until `/_app/version.json` is the new
   version, then requires 200 for `/`, `/glossary`, `/api/ingredients`, every
   `/_app/immutable` file those pages reference and everything those files import, one
   `__sveltekit_<hash>` global across HTML and chunks (two values = Worker and assets from
   different builds), and the `_headers` security headers on `/favicon.svg` and a chunk.
7. **Browser check** (`node scripts/hydration-check.mjs <url>`, Playwright Chromium, needs
   `npx playwright install chromium` once): no page errors, no failed requests, `/api/ingredients`
   answered and mosaic tiles rendered. `/api/track` is blocked, so no page view is recorded.

Builds are reproducible: two builds of one commit produce byte-identical `.svelte-kit/cloudflare`
and `.svelte-kit/output/server`, so a rebuild can never mix chunk names.

**Release order:** remote migrations, then deploy; new data is new artefacts (`data:publish`,
which updates the lock) and a deploy, with `--fresh-cache` when only data changed. The one
exception to "migrations first" is 0013, which drops what old code reads: deploy the code that
no longer reads it first (**Retiring the D1 corpus**).

**Rollback.** `npx wrangler rollback` returns to the previous version (`npx wrangler deployments
list` shows the history; pass a version id to pick another). It rolls back code and static
assets together, but **not D1**: if the bad release came with a migration, the old code must
still work on the new schema (append-only migrations keep that true), and data changes are
undone only through D1 Time Travel (`npx wrangler d1 time-travel restore cook-up-db
--timestamp=<before>`, 7 days on Free). Once 0013 is applied, never roll back past the release
that stopped reading the corpus. Run `npm run verify:deploy -- <url>` after a rollback.

If the dashboard still shows a Workers Builds Git connection for this Worker (it was once created
that way, `tasks/lessons.md`), disconnect it: it would deploy every push to `main` without the
migration gate or these checks.

### CI and secrets

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: `npm ci`, LF
check, migration check (files numbered 0001.. without gaps or duplicates, and no existing
migration modified, renamed or deleted compared with the base branch), `npm run check`,
`npm test`, the checked build, the bundle budget and the Playwright smoke suite.

Bundle budget: `wrangler deploy --dry-run` must report at most 16 MiB raw and 2.5 MiB gzip
(2026-10-12: 11.54 MiB raw, 1.87 MiB gzip). Cloudflare's actual limit is 64 MiB uncompressed on
Free and Paid, with no compressed limit ("Only the uncompressed bundle size counts",
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/), checked
2026-10-12); the old 3 MiB-gzip Free limit is gone. The budgets are an early warning for
startup time (1 s limit) and for unintended growth.

`.github/workflows/deploy.yml` deploys: run it from Actions on `main` (option: fresh cache keys)
or push a `v*` tag. It runs the whole CI workflow first, then waits for approval on the
`production` environment, then runs `scripts/deploy.mjs` (all the checks above, migration gate
included; it never applies migrations).

One-time GitHub setup (Settings):

1. **Environments → New environment `production`**: add yourself under *Required reviewers*;
   under *Deployment branches and tags* allow `main` and tags `v*`.
2. In that environment, **environment secrets**:
   - `CLOUDFLARE_ACCOUNT_ID`: the account id (dashboard, Workers & Pages, right sidebar).
   - `CLOUDFLARE_API_TOKEN`: dashboard → My Profile → API Tokens → Create Token → Custom token,
     *Account resources: Include → this account* only, permissions **Account · Workers Scripts ·
     Edit** and **Account · D1 · Edit**. D1 Edit rather than Read because `migrations list`
     first runs `CREATE TABLE IF NOT EXISTS d1_migrations`. (The "Edit Cloudflare Workers"
     template also works but grants more.)
3. For monitoring (below), **repository** secrets, since environment secrets are invisible to
   other workflows: `CF_ANALYTICS_TOKEN` (a separate token with only **Account · Account
   Analytics · Read**) and `CLOUDFLARE_ACCOUNT_ID` (secret or repository variable). Optional
   repository variable `COOKUP_URL` if the site moves to another host.

### Monitoring

- **Workers Logs** (`[observability]` in `wrangler.toml`): every request's invocation log plus
  `console` output, in the dashboard under Workers → cook-up → Logs. Free plan: 200,000 events
  a day, 3 days retention, nothing written to D1. `npx wrangler tail` streams live.
- **`.github/workflows/monitor.yml`**, read-only and scheduled:
  - *d1-usage*, hourly: today's account-wide D1 rows read/written (UTC day, the window the Free
    caps of 5M reads / 100k writes count) from the GraphQL Analytics API, with a linear
    projection to midnight. At 70% of either cap it opens or comments on an issue
    `D1 quota alert YYYY-MM-DD`; at 90% the run also fails, which emails you. Without
    `CF_ANALYTICS_TOKEN` it is skipped with a notice, not failed. Locally:
    `CF_ANALYTICS_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/d1-usage.mjs`.
  - *uptime*, every 30 min: `/`, `/glossary` and `/api/ingredients` answer 200 and their whole
    chunk graph loads. Failures open or comment on an issue `Site check failing YYYY-MM-DD`. It
    needs no secret and runs no JavaScript, so it never records page views; `/api/ingredients`
    reads D1 only on an edge-cache miss.
  - GitHub can delay scheduled runs, and disables schedules after 60 days without repository
    activity; failure emails go to whoever last edited the schedule.

## Data sources & attribution

- Recipes: [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook) — CC BY-SA 3.0.
- Ingredient taxonomy: [Open Food Facts](https://world.openfoodfacts.org) — ODbL.
- Nutrition: [USDA FoodData Central](https://fdc.nal.usda.gov) (Foundation Foods, SR
  Legacy) — U.S. Public Domain.
- Photos: [Wikimedia Commons](https://commons.wikimedia.org), hotlinked. Each is credited on its
  recipe page with its own author and licence — every file in the corpus is under CC BY-SA, CC BY,
  CC0 or public domain, and stage 08 refuses to emit one whose licence it could not read.

Every recipe page links back to its source and states its license, per Wikibooks' CC
BY-SA share-alike requirement. Photo credit is rendered separately from recipe-text credit,
because the two have different authors and often different licences.

`upload.wikimedia.org` is the one third-party origin the site contacts, allowed explicitly in
`svelte.config.js`'s `img-src`. Photos are hotlinked rather than mirrored — a deliberate trade
documented at that line. That sentence is now literally true: `/api/track` used to forward each
visit to an external endpoint, and no longer leaves the Worker.
