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
npm run data:fetch          # data artefacts pinned by src/lib/data/lock.json (needs gh or GITHUB_TOKEN)
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
that exists nowhere else — see **Deployment** below. Use the dedicated generator, then the
chunk applier:

```bash
npm run pipeline:gen-remote-seed          # writes pipeline/out/remote-chunks/*.sql + plan.json
node pipeline/tools/apply_remote_chunks.mjs --dir=pipeline/out/remote-chunks
```

**A full reseed does not fit the Free plan.** It writes about 270k rows, and D1 Free stops
accepting writes at 100k/day, so it would halt partway and leave the site without ingredients
until 00:00 UTC. The generator therefore refuses when its estimate exceeds the write budget
(80% of the cap, 80,000 rows) unless `--paid-plan` is passed.

`apply_remote_chunks.mjs` goes through `pipeline/lib/d1.mjs`: every chunk is checked against
today's write budget and logged in the daily ledger, it stops before a chunk that would cross
the budget, retries Cloudflare's transient 7403 error once, and records each committed chunk in
`applied.json`, so a rerun resumes at the first uncommitted chunk (re-sending a committed one is
not safe). `--dry-run` shows the plan. Both scripts' header comments have the details.

Smaller refreshes that do fit the Free plan, applied with the same tool and their own `--dir`:

```bash
node pipeline/gen_remote_seed.mjs --only=related  # recipe_related (0010), ~7k rows written
node pipeline/gen_remote_seed.mjs --only=stats    # admin translation counts (0011), after a translation session
node pipeline/gen_remote_seed.mjs --only=fts      # rebuild recipe_title_fts, ~3.5k rows written
```

`--only=related` ranks from `pipeline/out`, so it matches remote only while remote's ingredients
came from that same `pipeline/out`. The site no longer reads remote `recipe_related`: recipe
pages take their related lists from the data artefacts (below), ranked the same way.

**Translation backup.** Remote `recipe_i18n` / `ingredient_i18n` are backed up into
`pipeline/data/i18n-backup/` by `node pipeline/tools/export_remote_i18n.mjs` (read-only, ~150k
rows read, resumable). Refresh it with `--fresh` after every translation session. The local seed
(`06_seed_d1.mjs`) loads translations from that backup, so a local database is no longer
English-only once a backup exists.

### Data artefacts

The read-only corpus is moving out of D1 into versioned files that ship with the build
(`.claude/plans/phase3-static-data.md`). Stage 09 builds them from the pipeline snapshot,
through the same statements `06_seed_d1.mjs` writes, so every value is exactly what D1 holds:

| File | Holds | Size (gzip) |
|---|---|---|
| `core.bin` | everything `/api/match` and title search need, in a typed-array layout (`src/lib/data/core.js`) | 186 KB |
| `titles/<lang>.json` | the titles that differ from the source title, per language | 0.1-2 KB |
| `names/<lang>.json` | ingredient display names, and which are the language's own | 5-7 KB |
| `mosaic/<lang>.json` | the `/api/ingredients` mosaic, as the API returns it | 17-20 KB |
| `r/<id>.json` | one recipe page, every language (3,478 files) | median 7 KB, max 44 KB |
| `sitemap.json`, `manifest.json` | every recipe id; data version, counts and sha256 of every file | |

`src/lib/data/` reads them in the Worker and in the browser alike (plain JS, no `$lib`
imports) and reproduces the SQL exactly: `matchCore`, `searchTitles`, `searchIngredients`,
`recipesByIds`, `recipePage`.

`/api/match`, `/api/search`, `/api/ingredients`, `/api/recipes`, the recipe pages and
`/sitemap.xml` serve from them and never touch D1, which now only serves `/api/track`
(`page_view`) and `/admin`. `src/lib/server/data.ts` fetches `core.bin` and English from
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
(`src/lib/test/sqlRoutes.ts`): status, headers and body byte for byte, over the D1 match
harness matrix, generated URLs and search, ingredient, favorites and sitemap queries, and the
page data as JSON (or the 400/404 thrown) for every recipe in every language plus an unknown
one. It runs on a real slice of the corpus in `pipeline/fixtures/artefact-corpus.sql`
(regenerate with `node pipeline/tools/make_artefact_fixture.mjs`); `DATA_PARITY_DB=<file>`
adds the full corpus saved by `--save-db`. The e2e server (`scripts/e2e-server.mjs`) serves
artefacts built from its own seed.

**Delivery: a pinned release asset, not committed files.** The per-recipe files alone are ~58
MB, regenerated whenever a translation changes, and `pipeline/out` is not in git anyway, so
committing them would bloat the history with every data version while CI still could not
rebuild them. Instead the files are one data pack (`scripts/lib/datapack.mjs`) on a GitHub
release `data-<version>` of this private repository (never a `v*` tag: those deploy), pinned
by `src/lib/data/lock.json` (tag, asset sha256, manifest sha256). `npm run data:fetch`
installs it into `static/data/` (served as static assets) and the files the Worker may
bundle into `src/lib/data/generated/`; both are git-ignored. `scripts/build.mjs` refuses to
build unless the installed files match the lock, file by file. Code and data then deploy as
one Worker version, and a rollback rolls both back.

```bash
npm run data:fetch                        # once per clone and after the lock changes (CI does it)
npm run data:build -- --save-db=pipeline/out/snapshot.sqlite   # rebuild from the snapshot
DATA_PARITY_DB=pipeline/out/snapshot.sqlite npx vitest run src/lib/data   # full-corpus parity
GH_TOKEN=$(cat ../pat.txt) npm run data:publish   # release data-<version>, update the lock, install
npm run data:parity:remote -- --only=sample       # read-only snapshot == remote D1 check
```

`data:fetch` uses the `gh` CLI when installed (`GH_TOKEN` or `gh auth login`), else the
GitHub API with `GITHUB_TOKEN`/`GH_TOKEN`. Commit `src/lib/data/lock.json` after publishing.
The full remote parity check (`data:parity:remote` without `--only`) reads ~265k rows, D1
billing about two rows per row scanned; `--only=sample` reads ~6k.

After any reseed or translation batch, redeploy with fresh cache keys:
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
`wrangler dev --local`, on a throwaway D1 in `.wrangler/e2e-state` that gets all migrations plus
the small fixture `tests/e2e/fixtures/seed.sql` (6 recipes, 10 ingredients). Your own local D1 is
never touched. They cover hydration and the mosaic, selecting an ingredient, a recipe page and its
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

**Local and remote D1 are not interchangeable.** Remote holds the translated recipe content
(`recipe_i18n`, every language) — rows that exist *only* there and that the pipeline cannot
reproduce, because they never flow back into its inputs.

`pipeline/out/seed.sql` unconditionally deletes and reinserts `recipe_i18n` from whatever the
local translation backup holds (source language only without one).
**Never apply it to `--remote`.** Use `npm run pipeline:gen-remote-seed` (above), which never
touches `recipe_i18n` and updates `recipes` in place rather than replacing it. Cheap way to
confirm you're on the safe path before running anything:

```bash
grep -l "DELETE FROM recipe_i18n" pipeline/out/remote-chunks/*.sql   # must print nothing
```

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

**Release order:** remote migrations, then deploy, then any data chunks (reseed, `--only=…`),
then `npm run deploy -- --fresh-cache` if data changed.

**Rollback.** `npx wrangler rollback` returns to the previous version (`npx wrangler deployments
list` shows the history; pass a version id to pick another). It rolls back code and static
assets together, but **not D1**: if the bad release came with a migration, the old code must
still work on the new schema (append-only migrations keep that true), and data changes are
undone only through D1 Time Travel (`npx wrangler d1 time-travel restore cook-up-db
--timestamp=<before>`, 7 days on Free). Run `npm run verify:deploy -- <url>` after a rollback.

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
