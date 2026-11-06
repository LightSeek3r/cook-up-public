# Seasonal ingredients: source data

Source of truth for which ingredients are in season where and when. The
artefact build compiles these files into `seasons.json` (per ingredient, 19
month masks: 9 climate zones north, the same 9 south, and World; contract in
`src/lib/data/seasons.js`). Every one of the canonical ingredient keys in
`pipeline/out/ingredients.jsonl` has exactly one entry, in exactly one file.

Change these files only through the tools below; they validate everything and
write the canonical form. `npm run seasons:check` runs the full gate.

## Files

| File | Holds |
|---|---|
| `produce.json` | fresh vegetables, fruit, fresh legumes (pea, fava, edamame), fresh sweetcorn |
| `herbs.json` | fresh herbs and aromatic leaves (parsley, basil, dill, lemongrass) |
| `fungi_nuts.json` | wild mushrooms, truffles, chestnuts, fresh walnuts |
| `animal.json` | game, wild fish and shellfish with a real, widely agreed season |
| `allyear.json` | every `ay` entry, and nothing else |

Each file is one JSON object, keys sorted, one entry per line indented with a
tab, LF line endings, trailing newline. `seasons_check --fix` rewrites a
hand-edited file in that form (format only, never content).

## Entries

```json
{
	"asparagus": {"z":{"trop":"none","sav":"none","high":"none","arid":"1-3","med":"2-4","subtrop":"3-4","oce":"4-6","cont":"5-6","bor":"6"},"p":["med:n","oce:n"],"st":0,"note":"Spears are cut from early spring for about eight weeks."},
	"basil_leaf": {"like":"basil"},
	"flour": {"ay":"staple"}
}
```

### All year: `{"ay": reason}`

Never ranked in or out of season. `reason` is one of:

| Reason | For |
|---|---|
| `processed` | made from something and keeps: flour, oil, sauce, juice, jam, dried, smoked, cooked, canned, frozen, cheese, cream |
| `generic` | a catch-all key spanning many foods: `fish`, `meat`, `fruit`, `nut`, `spice`, `salad` |
| `farmed` | animals and animal products raised all year: chicken, pork, beef, lamb, eggs, milk, farmed fish |
| `cultivated` | grown indoors or under control all year: button and shiitake mushrooms, sprouts |
| `staple` | shelf-stable pantry basics: salt, sugar, water, rice, grains, dried pulses |
| `traded` | dried spices, shelled nuts, seeds, coffee, tea, cocoa, vanilla: traded worldwide all year |

An optional one-line `note` may say why when it is not obvious.

### Same as another key: `{"like": key}`

`basil_leaf` gets exactly the masks of `basil`. The target must be a seasonal
(`z`) entry: no chains, no `like` of an all-year key (write its own `ay`).

### Seasonal: `{"z": {...}, "p": [...], "st": n, "note": "..."}`

- `z`: month range per climate zone. Zones (crop calendars, not strict Köppen):
  `trop` equatorial (Java, Amazon, Congo), `sav` monsoon / savanna (India,
  Thailand, West Africa, Caribbean), `high` tropical highlands (Mexico City,
  Bogotá, Nairobi), `arid` (Gulf, Egypt, Pakistan, Arizona), `med`
  (Spain, Italy, California, Chile, Cape Town), `subtrop` humid subtropical
  (south-east USA, south China, Tokyo, Sydney), `oce` oceanic (UK, northern
  France, New Zealand), `cont` continental (Poland, Moscow, north-east USA,
  Beijing), `bor` boreal (Finland, Siberia, Canada).
- Ranges are text, never bitmasks: `"4-6"` April to June, `"11-2"` wraps
  over the new year, `"4-5,9-10"` two harvests (parts may not overlap), `"6"`
  one month, `"all"` all year in that zone, `"none"` not grown commercially
  there (never "in season").
- Write the window for the **northern hemisphere**. The southern view is the
  same window shifted by 6 months, except `trop`, which has no winter to
  mirror and is the same in both. Where the shift is wrong, add an explicit
  `"<zone>:s"` range (`"med:s": "4-5"`); it must differ from the shift.
- `trop`, `med` and `cont` are always written. An omitted zone inherits:
  `bor` and `oce` from `cont`, `subtrop` and `arid` from `med`, `sav` from
  `trop`, `high` is `all`. Write a zone out wherever it differs; reviewers see
  inherited cells marked in the grid.
- `p`: 1 to 4 views of the major producers and exporters (`"med:n"`,
  `"sav:s"`; `trop` is always `"trop:n"`). World is the union of those views,
  so it says when the food is in season somewhere it is grown at scale, not
  "always somewhere". Every producer view must have a season.
- `st` (0-8, default 0): storage months. The stored crop counts as in season
  for `st` months after each harvest month (potato, onion, apple, squash,
  cabbage, citrus kept on the tree). It extends every window, wrapping into
  January, and never turns a `none` zone into a season.
- `note`: one line (at most 200 characters) on the window, in your own words.

## What a window means

- **Typical outdoor field peak**, not availability. A greenhouse tomato in
  January, an imported mango or a frozen pea does not make a season. The
  window is when the crop is harvested in the open in that zone in a normal
  year, plus `st` for crops that genuinely store.
- **Typical, not exact.** The UI says "typical peak"; local weather, altitude
  and variety shift it. Pick the months most growers and cookbooks of the
  zone would agree on, not the extreme edges. Do not copy any single site's
  table.
- **Animal seasons** are listed only for game, wild fish and shellfish with
  real consensus (venison, herring, mussel, oyster, crab). They describe when
  the food is traditionally at its best and most available, never what the
  law allows: no legal claims, no closed-season dates. Farmed animals are
  `ay` `farmed`.
- **Scope by kind, not by `category`** (the category field is unreliable:
  mushrooms and butter are `other`, parsley is `spice`). Seasonal: fresh
  produce, fresh herbs, wild mushrooms, chestnut and fresh walnut, fresh
  legumes. All year: spices, dried herbs and legumes, cultivated mushrooms,
  shelled nuts, dairy, farmed animals, generic keys. Keys named like a
  processed food (`dried_`, `ground_`, `_powder`, `_flour`, `_oil`, `_sauce`,
  `_paste`, `_juice`, `_jam`, `_broth`, `_stock`, `smoked_`, `cooked_`,
  `canned`, `frozen`) must be `ay` unless allowlisted in
  `pipeline/lib/seasons_gate.mjs`.

## Gate

`pipeline/lib/seasons_gate.mjs`. Errors (fail `seasons:check`, `seasons_apply`
and the artefact build): missing, unknown or duplicate keys; malformed entry,
zone, range or `st`; bad `ay` reason; `like` target missing, all year or
itself a `like`; a seasonal entry with no season anywhere or all year
everywhere; `p` empty, over 4, or naming a view without a season; a redundant
southern override; processed keys not `ay`; non-canonical bytes; compiled
masks out of ingredient order, `trop` rotated, or World not covering a
producer.

Warnings (for reviewers, never fatal): neighbouring zones whose windows never
overlap (`oce`/`cont`, `bor`/`cont`, `med`/`arid`); a `bor` window longer than
`cont`; a seasonal key filed under `grain`, `dairy` or `spice` (fresh herbs in
`herbs.json` and fresh corn excepted); a zone inherited by more than 60 % of
the seasonal entries.

## Workflow

All commands run from the repository root. Work files live in
`pipeline/out/seasons` (git-ignored).

1. `node pipeline/tools/seasons_triage.mjs` decides what needs no judgement
   (processed, staples, farmed, cultivated, generic) into `allyear.json`, and
   writes the work lists: `todo_<family>.json`, `batch_<family>_<nn>.json`
   (25 keys each, for the writers) and `classify_<nn>.json` (80 keys each,
   all year vs seasonal). Rows carry the key, its category, its English name,
   a `family_hint` (classify) and a `like_hint` when a generic key looks like
   the same food. Rerunning never touches decided entries; it renumbers the
   batches, so do not rerun while agents hold batch files.
2. Classifiers answer every key of a `classify_<nn>.json` with `{"ay": reason}`,
   `{"like": key}`, or `{"seasonal": "<family>"}` (needs its windows written),
   in one JSON object, and apply it. Rerun the triage afterwards: the seasonal
   verdicts move into that family's writer batches.
3. Writers answer every key of a `batch_<family>_<nn>.json` with an entry (a
   writer may also decide `ay` or `like`) and apply it:
   `node pipeline/tools/seasons_apply.mjs --file=<answer.json>`. The whole
   batch is checked; any problem prints `REJECTED <key>: [rule] message`
   lines and writes nothing. Success prints `APPLIED n entries; m keys
   remaining`. `--overwrite` replaces decided entries (reviews), `--family`
   places seasonal entries for a key no triage assigned, `--dry-run` checks
   only.
4. Reviewers work one zone at a time on the grid:
   `node pipeline/tools/seasons_check.mjs --grid=med` (`--grid=med:s`,
   `--grid=world`, `--keys=a,b`). `X` field peak, `S` storage month, `.` out
   of season; lowercase marks cells inherited from another zone.
5. `npm run seasons:status` shows progress; `npm run seasons:check` must end
   with 0 errors (`--partial` ignores missing keys while writing).
