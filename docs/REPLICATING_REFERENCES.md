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
