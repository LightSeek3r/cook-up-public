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
  strings are bundled; recipe instructions are pre-translated and stored in D1 (`recipe_i18n`)
  for every language. Translation is complete: no translation job, cron or runtime translation
  endpoint exists, and a recipe page shows the stored text for its language (source language
  if a row is missing).
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
- **Cloudflare D1** (SQLite) for all recipe/ingredient/nutrition data, including the stored
  translations. No KV or Workers AI binding.
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
migrations/             D1 schema — 0001_init.sql plus append-only follow-ups. 0001 is frozen:
                        the shared remote DB holds machine-translated content that cannot be
                        regenerated, so schema changes ship as new numbered files.
pipeline/               offline data build (see below) — Node ESM, run outside the Worker
  01_fetch.mjs .. 08_fetch_images.mjs   the eight numbered stages, run in order
  gen_remote_seed.mjs      the remote-safe seed generator (see Deployment)
  lib/                     shared pure logic (wikitext parsing, unit parsing, FDC matching, ...)
  data/                    fetched/downloaded raw sources (git-ignored)
  out/                     generated .jsonl / seed.sql (git-ignored)
tasks/                  working notes: todo.md (build log per phase), lessons.md (hard-won fixes)
```

## Getting started

```bash
npm install
npm run db:migrate          # apply the D1 schema to your local database
npm run dev                 # vite dev, with D1 emulated locally (no Cloudflare login needed)
```

All configuration is via `wrangler.toml` bindings — there's no `.env` file in this project.
The three `/admin` secrets are the one exception, and they are set with `wrangler secret put`
rather than committed (see **Deployment**). For `npm run dev`, put the same three in a
git-ignored `.dev.vars`; without them the app runs normally and only `/admin` is unusable.

Without seeded data the app runs but has nothing to show. See **Data pipeline** below to
build a real dataset, or ask whoever set up the project for a `seed.sql` to load directly:

```bash
wrangler d1 execute cook-up-db --local --file=pipeline/out/seed.sql
```

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
under `pipeline/`, then loaded into D1 as one seed file — nothing is scraped or computed at
request time.

| Stage | Script | What it does |
|---|---|---|
| 01 | `pipeline:fetch` | Fetches Wikibooks Cookbook pages + the Open Food Facts ingredient taxonomy into `pipeline/data/` |
| 02 | `pipeline:parse` | Wikitext → structured recipe records (ingredients, steps, servings, cuisine, meal type) |
| 03 | `pipeline:normalize` | Matches ingredient text against the OFF taxonomy; derives category/diet/allergens |
| 04 | `node pipeline/04_map_fdc.mjs` | Matches ingredients to USDA FoodData Central entries; resolves recipe quantities to grams |
| 05 | `node pipeline/05_compute_nutrition.mjs` | Aggregates per-recipe macros/micros and computes the Balance Grade |
| 06 | `pipeline:seed` | Writes `pipeline/out/seed.sql` for D1 |
| 07 | (removed) | The batch machine-translation stage is gone: all 3,484 recipes are translated into all 15 non-English languages and stored. Corrections go through `db:translate:manual` (validated writer, not a job) |
| 08 | `node pipeline/08_fetch_images.mjs` | Resolves each recipe's Wikimedia Commons photo to a URL plus its author and licence (the only networked stage besides 01; disk-cached) |

Stage 04 needs the USDA FoodData Central **Foundation Foods** and **SR Legacy** CSV bulk
downloads in place first — there's no automated fetch for these (license/rate-limit
reasons); get them from [fdc.nal.usda.gov](https://fdc.nal.usda.gov)'s bulk data download
page and unzip into `pipeline/data/fdc/foundation/` and `pipeline/data/fdc/sr_legacy/`.

Run stages 01-05 and 08 before 06 — the seed reads all of their output, so don't skip straight to
seeding:

```bash
npm run pipeline:fetch
npm run pipeline:parse
npm run pipeline:normalize
node pipeline/04_map_fdc.mjs
node pipeline/05_compute_nutrition.mjs
npm run pipeline:seed
wrangler d1 execute cook-up-db --local --file=pipeline/out/seed.sql
```

(`npm run db:seed:real` chains 01/02/03/06 and applies the result, but skips 04/05 — only
use it on its own if you don't need nutrition data, e.g. a quick UX-only smoke test.)

Each stage is resumable and logs real counts (pages fetched, ingredients matched, recipes
graded, etc.) rather than just "done" — check `tasks/todo.md` for what those numbers should
look like on the full corpus. As a reference point, the full build currently yields roughly
**3,400 recipes and 1,030 distinct ingredients**, about a third of them carrying enough
resolved mass to show nutrition.

### Seeding the *remote* database

`pipeline/out/seed.sql` is for local use only. Applying it to `--remote` would delete content
that exists nowhere else — see **Deployment** below. Use the dedicated generator instead:

```bash
npm run pipeline:gen-remote-seed          # writes pipeline/out/remote-chunks/*.sql
for f in pipeline/out/remote-chunks/*.sql; do
  node node_modules/wrangler/bin/wrangler.js d1 execute cook-up-db --remote \
    --command "$(cat "$f")" || { echo "FAILED at $f"; break; }
done
```

The chunking and the direct `node .../wrangler.js` invocation are both deliberate: a remote
`--file=` import fails regardless of size, and `npx wrangler --command=` is capped by the
shell's argv limit. Each chunk is atomic, so a failure at chunk N leaves 1..N-1 committed —
fix and resume from N. That script's own header comment explains the details.

The recipe page's related-recipes lists (`recipe_related`, migration 0010) are part of that
reseed. To fill only that table (about 3,500 rows written, no full reseed), as long as remote's
ingredients came from the same `pipeline/out`:

```bash
node pipeline/gen_remote_seed.mjs --only=related   # writes pipeline/out/remote-chunks-related/*.sql
```

and apply those chunks with the same loop. Until the table is filled, the page ranks related
recipes live (correct, ~30x more D1 reads).

After any reseed, redeploy: public API responses are cached per build version (next section),
so the redeploy is what makes browsers and the edge stop serving the old data at once; otherwise
it ages out within a day.

## Testing

```bash
npm test          # vitest run — unit tests over the pure logic (matching, nutrition, i18n, pipeline parsers)
npm run test:watch
npm run check     # svelte-kit sync + svelte-check — 0 errors is the bar
```

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

**Local and remote D1 are not interchangeable.** Remote holds the translated recipe content
(`recipe_i18n`, every language) — rows that exist *only* there and that the pipeline cannot
reproduce, because they never flow back into its inputs.

`pipeline/out/seed.sql` unconditionally deletes and English-only-reinserts `recipe_i18n`.
**Never apply it to `--remote`.** Use `npm run pipeline:gen-remote-seed` (above), which never
touches `recipe_i18n` and updates `recipes` in place rather than replacing it. Cheap way to
confirm you're on the safe path before running anything:

```bash
grep -l "DELETE FROM recipe_i18n" pipeline/out/remote-chunks/*.sql   # must print nothing
```

**HTTP caching.** `/api/ingredients`, `/api/search`, `/api/match`, `/api/recipes` and
`/sitemap.xml` send `Cache-Control: public, max-age=3600, s-maxage=86400`
(`src/lib/httpCache.ts`); `/admin` and `/api/track` send `private, no-store`. The client adds
`v=<build version>` to its API URLs, so every deploy starts on fresh cache keys. Browser caching
works on any host. The edge cache is the adapter's own `caches.default` use, which Cloudflare
documents for custom domains and which may do nothing on `*.workers.dev`. To check, request the
same URL twice:

```bash
curl -sI "https://cook-up.asakura-account.workers.dev/api/ingredients?lang=en" | grep -iE "cf-cache-status|^age|cache-control"
curl -sI "https://cook-up.asakura-account.workers.dev/api/ingredients?lang=en" | grep -iE "cf-cache-status|^age|cache-control"
```

`cf-cache-status: HIT` (or an `age:` header) on the second response means the edge cache works
on this host; no `cf-cache-status`, or `MISS` every time, means only browsers cache, and moving
to a custom domain is what turns the edge cache on.

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
