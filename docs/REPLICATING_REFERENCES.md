# Replicating reference art (dimensional calibration)

How to turn a reference PNG of an object into engine-correct proportions,
authored in world units through `src/assets/iso3.ts` rather than hand-tuned
screen-pixel maths.

> **The projection caveat, up front.** Most reference isometric art is drawn in
> **true 30° isometric** (or dimetric), where the ground axes rise at 30°. This
> engine uses **2:1 isometric** — ground axes rise at `atan(16/32) ≈ 26.57°`.
> The two projections do **not** pixel-match. Do **not** trace a reference. Read
> its **real-world dimensions** off it (or from the object's spec sheet) and
> **re-proportion** into world units. The overlay tool exists to sanity-check
> the re-proportioned result, not to trace over.

## The two scale anchors (from `iso3.ts`)

Because the 2:1 ground plane is foreshortened, one linear mm scale can't serve
both axes without distorting furniture. `iso3` fixes two independent anchors:

| Axis | Constant | Anchor | Value |
|------|----------|--------|-------|
| Ground (x, y) | `MM_PER_TILE` | single desk = 2×1 tiles ≈ 1400 mm wide | **700 mm / tile** |
| Vertical (z rise) | `MM_PER_PX_Z` | standing figurine ≈ 46 px / 1750 mm | **≈ 38.04 mm / px** |

Derived: `VZ = MM_PER_TILE / MM_PER_PX_Z ≈ 18.4 px` of rise per world-z unit,
so a world-z unit is "one tile tall" in the same 700 mm sense as the ground.

**Consequence to remember:** the style contract's 28-px storey therefore encodes
`28 × 38.04 ≈ 1065 mm` of world height — deliberately short for a literal
2.8–3.0 m storey. Storeys are a stylised building unit; only use `MM_PER_PX_Z`
(via `mmZ()`) for **object-scale** props (desks, monitors, mugs).

## Authoring recipe

1. **Get real dimensions.** From the object's spec or by measuring the
   reference (see the measurement recipe below). Work in millimetres.
2. **Convert.** Ground extents with `mm(widthMm)` → tiles; heights with
   `mmZ(heightMm)` → world-z. Example: a 1400×700 mm desk at 740 mm high →
   `box(x, y, 0, mm(1400), mm(700), mmZ(740))` = `box(x, y, 0, 2, 1, ~1.06)`.
3. **Author the solid** in world coords via `box` / `slab` / `laptop`.
4. **Get painter's order right** within the asset (back-to-front): far/low
   solids first, near/high last. Occlusion inside one asset is yours to own
   (the engine's `sortForRender` only orders *between* assets).
5. **Calibrate** with the overlay tool and re-proportion until it reads right.

## Measurement recipe — reading mm off a reference PNG

You measure **pixel runs along the two iso axes**, then invert the projection.

1. **Identify the two ground axes** in the reference. In 2:1 they run at
   screen slopes of `+16/+32` (the `+x` axis, going down-right) and `−16/+32`
   wait — in this engine `+x → (+32,+16)` and `+y → (−32,+16)`. Pick an edge of
   the object you know runs along one ground axis (e.g. the front-left edge of a
   desktop runs along `+x`).
2. **Measure its pixel length** `Lpx` along that axis (use an image editor's
   ruler, or count pixels between two corners).
3. **Convert screen px → tile units.** One tile edge projects to a screen
   segment of length `√(32² + 16²) = √1280 ≈ 35.78 px`. So
   `tiles = Lpx / 35.78`, and `mm = tiles × MM_PER_TILE` (× 700).
   - *If the reference is true 30° iso*, its tile edge projects to a **different**
     px length (`√(cos30² + sin30²)`-scaled), so this conversion is only
     approximate — treat the result as a proportion cue, then re-proportion.
4. **Measure vertical runs** (true screen height, straight up) directly in px
   and convert with `mm = px × MM_PER_PX_Z` (× 38.04). Vertical is NOT
   foreshortened, so this is exact for a straight-up edge.
5. **Cross-check against a known anchor** in the same image if one exists (a
   person ≈ 1750 mm, a door ≈ 2000 mm, an A4 sheet ≈ 297 mm long).

## Using the overlay tool

```bash
npm run ref-overlay -- <assetId> <reference.png> \
  [--scale n --dx px --dy px --opacity 0..1 --orientation 0..3 --params '{"signage":"X"}']
```

Writes a self-contained `ref-overlay.html` (reference embedded as a data URI,
asset inline as SVG). Open it in a browser and nudge `--scale` / `--dx` / `--dy`
until the asset sits over the reference, then judge proportions by eye.

- The asset is drawn at `--opacity` (default 0.6) so both are visible.
- `--scale` multiplies the whole asset SVG (use to match the reference's zoom).
- **The tool cannot judge fidelity for you** — it only assembles the overlay.
  Visual calibration is a human step. A 2:1 asset over 30°-iso reference art
  will never align perfectly; aim for matching *proportions*, not pixels.

## Using PNG sprites

Everything above re-proportions a reference into **authored line-art**. Sometimes
you just want to drop a **raster PNG** in as a foreground object — a logo, a
photo cut-out, a piece of pre-drawn art. `spriteAsset()` (`src/assets/sprite.ts`)
wraps a PNG in an SVG `<image>` billboard that behaves like any other asset:
it has a footprint, sorts by depth between assets, and exports through SVG / PNG
/ PDF.

A sprite is a flat, **camera-facing billboard**, not geometry projected onto the
ground plane — a PNG can't be foreshortened onto the 2:1 iso ground without
smearing, so it stands upright with its baseline anchored on the footprint.

### Drop in your own PNG (ONE step)

**Just drop the file.** Put `my-thing.png` in `src/assets/sprites/` (export it
with a **transparent background** / RGBA so it sits over the scene cleanly).
That is the whole workflow — no registration `.ts`, no `library.ts` edit.

On the next build / dev reload it appears in the **library, the app palette
("Props & scenery"), and the contact sheet** automatically. Discovery
(`src/assets/spriteAuto.ts`) enumerates every `sprites/*.png` via vite's
`import.meta.glob(..., { query: '?inline', eager: true })` — the same `?inline`
data-URI mechanism `spriteAsset` uses, so it works identically in the app build
AND in vite-node (contact sheet). The id is the kebab-cased filename
(`My_Desk.png` → `my-desk`).

**Defaults** (no config): category `prop`, footprint `1×1`, `widthPx` 64,
baseline anchored on the footprint-diamond centre.

**Verify:** `npm run contact-sheet` shows a tile for your PNG. `npx tsc
--noEmit` and `npm test` stay green.

#### Overrides — optional sidecar JSON

To change any default, drop a JSON file with the **same basename** next to the
PNG (`my-thing.json` beside `my-thing.png`). All fields are optional:

```json
{ "footprint": { "w": 2, "d": 3 }, "widthPx": 48, "category": "prop", "anchor": { "dx": 0, "dy": -4 } }
```

A malformed field is ignored (it falls back to the default) rather than
crashing the palette.

#### Per-orientation variants — filename convention

To draw a different image per facing, name files `my-thing.o0.png`,
`my-thing.o1.png`, `my-thing.o2.png`, `my-thing.o3.png` (orientation 0–3). Any
missing orientation reuses orientation 0; if only the base `my-thing.png`
exists, all four facings reuse it. With more than one image the asset reports
`orientations: 4`; with a single image, `orientations: 1`.

#### Hand-registering (rare)

If you need something `spriteAsset` can't express (a paramSchema, a custom
renderer), you can still add an entry to `HAND_ASSETS` in `library.ts` by hand.
**Hand-registered ids win**: a manual entry with the same id as a dropped-in
PNG shadows the auto one (a `console.warn` flags the ignored sprite). For a
plain bitmap billboard, prefer the one-step drop-in above.

### Choosing footprint / anchor / width

- **footprint** `{ w, d }` in tiles: the ground the object occupies, and what
  the depth sorter uses to decide what draws in front. Match it to the object's
  ground size (a person ≈ 1×1, a market stall ≈ 1×1, a lorry ≈ 2×1).
- **widthPx**: on-screen width in pixels. A 1×1 tile top spans 64px, so
  `widthPx: 64` fills roughly one tile. Height is derived from the PNG's
  intrinsic aspect ratio (read from its header) — the image is never stretched.
- **anchor** `{ dx, dy }`: nudges the **baseline** (bottom-centre of the
  billboard) away from the footprint diamond centre. Default `{0,0}` stands the
  bottom-centre on the diamond centre. `dy` negative lifts the sprite; positive
  sinks it. Use it to sit a sprite whose art has empty margin, or to plant a
  "feet" point that isn't at the image's bottom-centre.

### Per-orientation variants

Pass an **array** of up to four data URIs instead of one to draw a different
image per facing (orientation 0–3):

```ts
import n0 from './lorry-n.png?inline';
import e1 from './lorry-e.png?inline';
image: [n0, e1],          // indices 2,3 fall back to index 0
```

With more than one image the asset reports `orientations: 4`; with a single
image it reports `orientations: 1` (one billboard reused at every facing).

### Honest trade-offs

- **No token restyle.** A sprite is a bitmap — it ignores the `INK` / `PAPER` /
  stroke tokens and the line-art contract. It will not match hand-authored
  assets' look, and Present-mode dimming / spotlight recolouring don't apply.
- **Scaling artifacts.** Enlarging `widthPx` past the PNG's native pixel width
  upscales the bitmap (soft / blocky). Author the PNG at (or above) the largest
  size you'll display.
- **One image per orientation.** There's no free rotation — you either reuse one
  billboard for all facings or supply up to four pre-drawn variants.
- **PDF export rasterises it.** SVG and PNG export embed the bitmap cleanly (the
  data URI is same-origin, so PNG export's canvas is not tainted). PDF export via
  svg2pdf **embeds the PNG as a raster image** inside the PDF (it does not
  vectorise it) — fine for viewing, but the sprite won't scale losslessly like
  the vector line-art around it.
