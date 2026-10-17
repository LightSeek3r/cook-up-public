# Contributing to Cook Up

Thanks for taking an interest. Cook Up is a small, one-person project, so the process is light.

## Reporting a problem

- **A bug or an idea:** open an [issue](https://github.com/LightSeek3r/cook-up-public/issues/new/choose)
  and pick the matching template.
- **A wrong or clumsy translation:** use the *Translation problem* template. Give the language,
  the recipe page (the URL carries the language), the text as shown, and what it should say.
  If the problem could be unsafe (a wrong temperature, an allergen), say so in the title.
- **A security problem:** do not use an issue. See [SECURITY.md](SECURITY.md).

Recipe titles and instructions come from the static data artefacts, which are built and published
in the separate [cook-up-data](https://github.com/LightSeek3r/cook-up-data) repository, so a
translation or recipe fix is usually made there and shipped as a new data release rather than as a
change in this repository.

## Running it locally

See **Getting started** in the [README](README.md). In short: `npm install`,
`npm run data:fetch`, `npm run build`, `npm run preview`.

## Sending a pull request

1. Open an issue first for anything larger than a fix, so we agree on the direction.
2. Branch from `main`, keep the change small and focused.
3. Run the checks CI runs. The ones that matter most:

   ```bash
   npm run check:eol         # LF line endings in the index
   npm run check:migrations  # numbered in order, existing files never edited
   npm run check             # svelte-check, 0 errors is the bar
   npm test                  # unit tests
   ```

   `npm run build:checked`, `npm run check:bundle` and `npm run test:e2e` run in CI too.
4. Put the reason in the PR description. For UI changes, add a before/after screenshot.

### House rules

- **LF line endings** everywhere (`.gitattributes` enforces it).
- **Migrations are append-only.** `0001_init.sql` is frozen; a schema change is a new numbered file.
- **Colours come from tokens** in `src/app.css`, never raw hex in components. A palette change
  has to keep the contrast figures in that file's comments true (`theme-css.test.mjs` checks the
  pairing between the light and dark copies).
- **No third-party requests** from the app, and nothing that records the query string: on this
  site it is the visitor's ingredient list.
- **Comments say why, not what.** Add a test for logic you touch.
- **Recipes, nutrition values and photographs are attributed.** Do not add content without its
  source and licence.

By contributing you agree that your contribution is released under the [MIT licence](LICENSE).
Please be kind: this is a place for people who like cooking and code.
