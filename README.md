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
  dairy-free), sort by match quality / kcal / grade. Allergen exclusion is already
  supported end-to-end by the matching logic and API (`excludeAllergens`) but has no
  filter-bar control yet.
- **10 languages** — en, es, fr, de, ar, hi, zh, ja, ko, vi, including full RTL support for
  Arabic. Ingredient names and UI strings are bundled; recipe titles/instructions are
  batch machine-translated offline with a live fallback for anything not yet translated.
- **Recipe photos** — 711 recipes carry a Wikimedia Commons photograph, hotlinked, each credited
  to its own author and licence (all free: CC BY-SA, CC BY, CC0, public domain).
- **Difficulty, notes and quantity equivalents** — a 1–4 difficulty meter from the source infobox,
  the source's own "notes, tips and variations" where it has them, and every quantity shown in the
  other measuring system plus a real gram weight where one could be resolved.
- **Attribution built in** — every recipe links back to its source and license.

## Tech stack

- [SvelteKit](https://svelte.dev) 2 (Svelte 5 runes) + TypeScript, deployed as a Cloudflare
  Worker with static assets (`@sveltejs/adapter-cloudflare`).
- **Cloudflare D1** (SQLite) for all recipe/ingredient/nutrition data, **KV** as a
  translation cache, **Workers AI** for on-demand machine translation.
- **Vitest** for unit tests; a plain Node ESM pipeline (no framework) for the offline data
  build.

## Project structure

```
src/                    SvelteKit app
  routes/                 pages + API endpoints (/api/match, /api/ingredients, /api/search,
                          /api/translate, /api/track)
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
npm run dev                 # vite dev, with D1/KV emulated locally
```

All configuration is via `wrangler.toml` bindings — there's no `.env` file in this project.

Without seeded data the app runs but has nothing to show. See **Data pipeline** below to
build a real dataset, or ask whoever set up the project for a `seed.sql` to load directly:

```bash
wrangler d1 execute cook-up-db --local --file=pipeline/out/seed.sql
```

`/api/translate` needs Workers AI, which has **no local emulation** — the `[ai]` binding in
`wrangler.toml` is always proxied to the real account. It ships uncommented (a deploy
requires it), so `npm run dev` also wants `npx wrangler login`. For fully offline work,
comment that block out: translation requests then return a clear 500 instead of hanging, and
recipe pages quietly keep their source-language text. **Uncomment it again before deploying.**

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
| 07 | `db:translate:daily` / `db:translate:all` | Batch machine-translates recipe titles/instructions into every non-English language |
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
- `TRANSLATIONS` — KV, caches on-demand translations
- `AI` — Workers AI, always remote-proxied; required for a deploy (see **Getting started**)

**Local and remote D1 are not interchangeable.** Remote accumulates machine-translated recipe
content over time, via a daily job (`npm run db:translate:daily`) hitting the live
`/api/translate` endpoint — thousands of rows that exist *only* there and that the pipeline
cannot reproduce, because they never flow back into its inputs.

`pipeline/out/seed.sql` unconditionally deletes and English-only-reinserts `recipe_i18n`.
**Never apply it to `--remote`.** Use `npm run pipeline:gen-remote-seed` (above), which never
touches `recipe_i18n` and updates `recipes` in place rather than replacing it. Cheap way to
confirm you're on the safe path before running anything:

```bash
grep -l "DELETE FROM recipe_i18n" pipeline/out/remote-chunks/*.sql   # must print nothing
```

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
documented at that line.
