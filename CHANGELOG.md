# Changelog

All notable changes to Cook Up are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org) loosely while the project is 0.x.

## [0.1.1] - 2026-10-17

### Fixed

- Scrolling lag: the page background no longer uses `background-attachment: fixed`, which made
  the browser repaint the whole viewport on every scroll frame. The line drawings now scroll with
  the page.

## [0.1.0] - 2026-10-17

The first tagged version, published with the source code. It covers everything since the
project started on 2026-08-18.

### Added

- **The recipe finder.** Ingredient mosaic, results ranked by how few ingredients you are
  missing, filters (cuisine, meal type, diet, allergens), nutrition with an A–E Balance Grade,
  substitution tips, favourites and a print stylesheet (August 2026).
- **First-party page-view counts** and an OTP-gated `/admin` dashboard over them, replacing the
  earlier beacon to another site (2 September).
- **Six more languages**, 16 in total, and a set of features inspired by My Fridge Food: the
  remembered fridge, allergen exclusion, "pick one for me", quickest-first sort (29 September).
- **The cooking-techniques glossary**: 152 techniques with 28 text-free step-by-step diagrams,
  searchable in every script (12 October).
- **Static data artefacts.** The public APIs, recipe pages and sitemap are served from versioned
  data files, and ingredient matching runs in the browser (13–14 October). Data releases are
  published to the public `cook-up-data` repository and pinned by `src/lib/data/lock.json`.
- **Reviewed translations.** A recipe translation store, with every recipe title and instruction
  text read against the English by a second reviewer in all 16 languages (14–16 October).
- **CI, a gated deploy script and API hardening** (12 October): migration checks, bundle
  budget, Playwright smoke tests, and a deploy that refuses to ship a partial build.
- **Countable ingredients and metric amounts**: counts such as "2 eggs", quantities in the other
  measuring system, and metric figures in the method text in every language (17 October).

### Changed

- **Design.** The "Atelier" look: brushed-steel chrome, a wooden board behind the ingredient
  grid, medallion tiles, a sticky selection tray, collapsible quick filters, Noto Emoji
  ingredient icons and a one-button light/dark toggle (16 October).
- **Bordeaux wine red** replaces copper as the single accent, with a pale red in dark mode.
  The logo is redrawn (shaded bowl, glint, thin rim) and the favicon, app icons and share image
  regenerated. The background becomes clean ingredient line drawings, with a few small smileys,
  fixed to the viewport (17 October).
- **Home page.** The numbered "how it works" steps are gone: the interface explains itself. The
  reserved space under the footer is removed.
- **The recipe corpus left D1.** Migration 0013 retired it on 2026-10-15; D1 now holds runtime
  state only (page views and admin sign-in).

### Removed

- Lazy, on-demand translation and the daily translation job: every recipe is pre-translated.
- The duplicate `/api/visit` endpoint and the external page-view beacon.

### Fixed

- Print stylesheet: `.no-print` is scoped to `@media print` and prints with less ink.
- The deploy's browser check retries during the edge rollout instead of failing on a stale edge.

[0.1.1]: https://github.com/LightSeek3r/cook-up-public/releases/tag/v0.1.1
[0.1.0]: https://github.com/LightSeek3r/cook-up-public/releases/tag/v0.1.0
