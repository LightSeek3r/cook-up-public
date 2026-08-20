# cook-up

Pick the ingredients you have, find the recipes you can make.

cook-up is an ingredients-first recipe finder: instead of searching by dish name, you select
what's in your kitchen and it ranks recipes by how few ingredients you're missing. Every
result carries honest nutrition (only shown when enough of the recipe's mass actually
resolved to real data), a custom health grade, and — when a genuinely healthier swap exists
— a substitution tip.

## Features

- **Ingredient mosaic** — tap ingredient tiles (icon + category colour) instead of typing a
  search query; a sticky tray tracks your current selection.
- **Missing-ingredient ranking** — results are sorted by how many selected ingredients they
  use and how few non-staple ingredients they're missing, with the missing ones named.
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
  routes/                 pages + API endpoints (/api/match, /api/ingredients, /api/translate)
  components/             Mosaic, ResultCard, NutritionPanel, SubstitutionTips, ...
  lib/                     matching/nutrition/i18n logic, config, types — the pure/testable core
migrations/             D1 schema (0001_init.sql; append-only once a shared DB holds real state)
pipeline/               offline data build (see below) — Node ESM, run outside the Worker
  01_fetch.mjs .. 07_translate.mjs   the seven pipeline stages
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

`npm run dev` needs Workers AI for the `/api/translate` endpoint, which has no local
emulation — either run `npx wrangler login` and uncomment the `[ai]` block in
`wrangler.toml`, or leave it commented out to work fully offline (translation requests then
return a clear 500 instead of hanging).

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

Stage 04 needs the USDA FoodData Central **Foundation Foods** and **SR Legacy** CSV bulk
downloads in place first — there's no automated fetch for these (license/rate-limit
reasons); get them from [fdc.nal.usda.gov](https://fdc.nal.usda.gov)'s bulk data download
page and unzip into `pipeline/data/fdc/foundation/` and `pipeline/data/fdc/sr_legacy/`.

Run every stage in order — stage 06 reads stage 04/05's output, so don't skip straight to
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
look like on the full corpus.

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
- `AI` — Workers AI, commented out by default (see **Getting started**)

**Local and remote D1 are not interchangeable.** Remote accumulates machine-translated
recipe content over time via a daily job hitting the live `/api/translate` endpoint —
content that only ever exists in the remote database. Never apply a freshly generated
`pipeline/out/seed.sql` straight to `--remote` without checking what it deletes first.

## Data sources & attribution

- Recipes: [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook) — CC BY-SA 3.0.
- Ingredient taxonomy: [Open Food Facts](https://world.openfoodfacts.org) — ODbL.
- Nutrition: [USDA FoodData Central](https://fdc.nal.usda.gov) (Foundation Foods, SR
  Legacy) — U.S. Public Domain.

Every recipe page links back to its source and states its license, per Wikibooks' CC
BY-SA share-alike requirement.
