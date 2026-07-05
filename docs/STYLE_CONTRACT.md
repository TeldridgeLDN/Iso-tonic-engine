# Asset Style Contract

Every asset — hand-authored or parametric — conforms to this contract so all
pieces sit together seamlessly in the Arup-Digital-Studio line-art style.

## Projection & geometry

- **2:1 isometric**. Tile = **64 × 32 px** (`TILE_W = 64`, `TILE_H = 32`).
- Tile axes: **+x projects to screen (+32, +16)**; **+y projects to (−32, +16)**.
  `screen = ((tx − ty) · 32, (tx + ty) · 16)`.
- **Anchor**: an asset's local origin (0,0) is the projected **north (top)
  vertex of its footprint origin tile**. The base diamond of tile (0,0) has
  vertices (0,0) → (32,16) → (0,32) → (−32,16). Structures rise in −y.
- Free-placed assets (figurines): origin at **feet centre** (standing point).
- Standing figurine height: **~46 px** (reads correctly against 64×32 tiles).
- Depth key: `tx + ty` at the footprint's far corner for grid assets; free
  assets derive fractional tile coords from world position.

## Line & colour

| Token | Value | Use |
|-------|-------|-----|
| `INK` | `#1A1A1A` | all linework |
| `PAPER` | `#FFFFFF` | fills — **opaque white**, so nearer geometry occludes |
| `ACCENT` | `#E8541D` | annotations, callout ribbons, hover/spotlight highlight ONLY |
| `DIM_OPACITY` | `0.15` | non-spotlit content in Present mode |
| stroke width | `1.5` | primary outlines |
| stroke width | `1` | interior detail (windows, panel lines, hair) |
| linejoin/linecap | `round` | everywhere |

- **No colour fills, no gradients, no shadows.** Depth is communicated by
  linework alone (optionally a fine 45° hatch on one face, stroke 1, sparingly).
- Scene background is white; an optional faint dot at each tile's north vertex
  (`#1A1A1A` at 10%) forms the editor grid (never exported).

## Authoring format

Assets are **TypeScript modules emitting SVG strings** (not .svg files) so
parametric and static assets share one pipeline:

```ts
interface AssetDef {
  id: string;                        // registry key, kebab-case
  category: EntityType | 'prop';    // default palette grouping
  footprint?: { w: number; d: number };  // grid assets only; omit = free-placed
  render(params?: Record<string, unknown>): string;  // SVG fragment, local coords
  paramSchema?: ParamField[];       // drives the properties panel UI
}
```

- Fragments contain only `<g>`, `<path>`, `<line>`, `<polygon>`, `<polyline>`,
  `<rect>`, `<circle>`, `<text>` — the dialect svg2pdf supports.
- No `id` attributes inside fragments (they get stamped many times).
- No `style` attributes — presentation attributes only (`stroke`, `fill`, …).
- Text: `font-family="Helvetica, Arial, sans-serif"`; annotations use ACCENT.
- Faces must be drawn **back-to-front within the asset** (painter's algorithm
  applies between assets; inside an asset you own your own occlusion).

## Starter library (~28 assets)

- **Buildings (parametric ×1 + variants)**: office block, terraced building,
  warehouse/depot, civic building (columns), house.
- **Digital infra**: server rack, desktop workstation, laptop desk, large
  wall screen/dashboard, phone kiosk, network mast.
- **Physical infra**: van/truck, car, tram/bus, desk cluster, meeting table,
  shelving unit, barrier/gate, tree (×2), planter, street lamp, signpost.
- **Zones**: department/organisation ground plate (dashed outline + corner
  label), process zone (dotted outline).
- **Figurine**: parametric (see FigurineParams) — bodies ×2 builds, hair ×5,
  tops ×4, bottoms ×3, accessories ×3, skin tones ×5, standing pose.
- **Annotation**: angled callout ribbon (parametric text, ACCENT).
- **Terrain** (landscape family, all `ground`): road segments that follow the
  tile grid (straight / corner / T-junction — roads act as both connectors and
  boundaries), river segments, organic-outline region (hand-drawn-feel blob
  alternative to the rectangular zone plate), island coastline plate (large
  organic ground plate with shoreline edge treatment).
- **Zone plaques**: zones support a plaque block — numbered badge (circle +
  number), title, and a row of small generic user-group icons with labels.

## Orientation (rotation)

- `rotation` lives on the entity's placement: 0–3 quarter-turns clockwise.
  Effective footprint swaps w↔d on odd rotations (core `effectiveFootprint()`).
- Assets declare `orientations: 1 | 2 | 4` in the registry (default 1 = fixed).
  The orientation is passed to `render()` inside params as the reserved key
  `orientation` (0–3); assets that support 2 orientations treat 1|3 as the
  mirrored facing.
- Mirroring (scale(−1,1) about the anchor) is a legitimate way to implement
  the alternate facing for symmetric-enough assets (vehicles, figurines,
  furniture). **Text must never mirror** — any text inside an asset is
  re-rendered upright for every orientation (signage, plaques, labels).
- Parametric assets (building, zones, terrain) implement true quarter-turns
  by redrawing with axes swapped, not by transforms.
