# Drawing a glossary diagram

One file per diagrams.json id: `<id>.svelte`, props `{ rtl?: boolean; label: string }`, wrapped in
`<DiagramFrame {label} {rtl} directional={true|false}>` (must match the json flag). Copy
`sous-vide.svelte` as the template. Then set `"drawn": true` in `src/lib/glossary/diagrams.json`.

**Grid.** viewBox 240x160, y down. Keep art 8+ units inside the edges. The frame already draws the
rounded `--surface-sunken` ground and sets `fill="none" stroke="currentColor" stroke-width="1.5"`
with round caps/joins, so plain `<path d="..." />` is a 1.5 ink outline. Compose left to right.

**Text-free.** No `<text>` anywhere: the only glyphs are the digits Mark draws. Every explanation is a
step string in the legend, one per mark, in mark order. No `<image>`, `<use>`, external href,
animation, hex/rgb/hsl, `--line`/`--line-strong` (under 3:1). diagrams.test.ts enforces all of it.

**Palette** (DiagramFrame classes, on an element or a wrapping `<g>`; tint 1-2 subjects per stage):

- `c-primary` food/heat/the subject, `c-accent` water/liquid/tools of the process, `c-muted`
  steam, guides, leader lines, flow arrows. Default (no class) is `--ink`.
- `tint` = the current colour at 18% fill. It keeps the inherited 1.5 stroke, so every fill is also
  outlined (forced-colors and greyscale print rely on the outline). For a fill whose edge another
  path draws (water under a wavy surface line) add `stroke="none"` and draw that edge separately.
- `solid` full fill (small dots: seasoning, specks); `fine` 1.0 stroke for detail, `bold` 2.5 for
  handles and emphasis; `dashed` for leader lines and "removed/hidden" outlines.

**Marks.** `<Mark x y n />` last in the file so they sit on top (10-unit halo cuts through lines).
Number in reading order left to right; place each mark just above or beside its stage, not on top
of detail. Mark centres at least 22 units apart. Steps.length in every language == mark count.

**Arrows.** `<Arrow from={[x, y]} to={[x, y]} bend={n} />` or `<Arrow d="..." />`; colour from the
wrapping `<g class="c-muted fine">`. `bend` < 0 curves to the left of travel (up, for a left-to-
right arrow). Marker ids are per instance, so any number of arrows/diagrams can share a page.

**Directional or not.** `true` when order or arrows carry meaning (sequences, pouring, folding):
under ar/pnb the whole drawing mirrors and Mark counter-flips its digit, so never draw anything that
must not mirror (no clocks, no letters). `false` for symmetric cross-sections and cut shapes.

**Helpers.** Repeated shapes as small functions in the script returning path strings built from one
absolute `M${x} ${y}` and relative commands (see `steak`, `wave`, `drop`), so a shape can be placed
anywhere without editing its outline. Then `npx vitest run src/components/glossary`, and render it
(light, dark, RTL, forced colors, print) and look at the result before calling it done.
