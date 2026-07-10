# Prototype — Staffed-desk rendering approach (THROWAWAY)

Companion notes for `scripts/prototype-staffed-desk.ts`. This is a **throwaway
prototype** built with the `/prototype` skill — it exists to answer one design
question, not to ship. Nothing here is registered in `library.ts`.

## The question

> Which rendering approach makes **staffed** desks read accurately:
> (A) the current vectors, (B) PNG/JPEG sprites, or (C) improved posed vectors?

## Diagnosis (why the current staffed desks read wrong)

The library's `desk-single` and `desk-meeting` (in `src/assets/symbols/desks.ts`,
drawn from `primitives.ts` + `figurine.ts`) read as inaccurate for three reasons:

1. **Broken contact points / pose.** The figure stands *through* the desk instead
   of sitting at it; hands don't rest on the desktop; the meeting chairs' star
   casters render as detached starbursts; the chair isn't tucked under the desk
   with correct occlusion.
2. **Detail budget.** Outline-only, uniform-stroke line art collapses into noise
   on a ~46 px figure — the head reads as a halo (a circle + a separate hair-ring
   arc, two thin strokes a few px apart).
3. **Redraw-by-eye conversion** captured the *object inventory* (desk, chair,
   person, laptop) but not the *pose / occlusion relationships* between them.

## What the prototype shows

A single self-contained HTML file, `prototype-staffed-desk.html` (repo root,
gitignored), with the reference image pinned in a fixed comparison panel and a
bottom-centre switcher pill (`?variant=` + ← / → arrow keys) cycling:

- **Variant A — CURRENT**: `deskSingle()` and `deskMeeting()` exactly as the
  library renders them today (baseline), at 2× and 1×.
- **Variant B — SPRITE**: the reference JPEG embedded as a data-URI billboard at
  tile scale (~112 px wide for a 2×1 desk, per `sprite.ts` conventions),
  demonstrating the pixel fidelity of the sprite path.
  - **Caveat (scaffolded/limited):** white→transparent cleaning is **not**
    applied. The source is a JPEG (no alpha) and Node ships no built-in JPEG
    decoder, so matte removal would need a new dependency (`sharp`/`jimp`) —
    out of scope for a throwaway. It's embedded as-is; a real sprite asset would
    be a PNG cut-out on transparency.
- **Variant C — POSED VECTOR**: a new throwaway `deskSingleV3` (defined *inside*
  `scripts/prototype-staffed-desk.ts`, never registered) that fixes all three
  failure modes with the existing primitive/iso3 vocabulary by **copying the
  reference image's composition** — that composition is *why* the reference
  works. The first draft seated the figure on the FAR side of the desk and
  visually failed ("person emerging from a desk", chair fully occluded); the
  rework mirrors the reference instead:
  - the **desk sits on the FAR (north) band** of the 2×1 footprint; the
    **figure sits on the NEAR side** of the desk's long front edge, **back to
    camera** (between the viewer and the desk);
  - a **properly seated figure** — bent legs reaching forward into the desk
    knee-hole, torso leaning slightly forward, upper arms angling forward and
    down so the forearms end **on the desktop plane** (desktop height computed
    from the iso3 / desks-v2 world-unit convention `topZ = mmZ(740)`), head a
    **single filled circle** (no halo ring);
  - **filled flat-grey shapes** for the figure (see grey note below) instead of
    outline-only line art;
  - a **simple four-leg chair** (legs + seat + back) VISIBLE behind/beneath the
    figure, replacing the star casters — the chair back is the nearest element
    and is painted LAST so it partially occludes the figure's lower torso;
  - painter order: `ground → desk (legs, front, top) → figure legs → torso →
    head → arms over the desktop → chair legs/seat/back last`.

### Grey-token honesty note

`style.ts` ships exactly **one** grey token — `GRID_GREY` (`#B8B8B8`). A figure
wants light/mid/dark separation, so the prototype uses `GRID_GREY` as the mid
grey (the real token) and derives two extra shades locally (`#8C8C8C`, `#DCDCDC`).
So "2–3 flat greys from `style.ts` tokens" is only partly satisfiable — the token
vocabulary has a single grey. Furniture stays house-style (ink outline + paper
fill); only the figure is filled.

## Mechanical self-checks (Variant C)

The script judges Variant C as far as is mechanically possible (aesthetic
judgement is the human's). It prints PASS/FAIL to the console and renders the
same table inside the Variant C panel:

1. **no NaN** anywhere in the emitted SVG;
2. **each forearm endpoint lies on the desktop plane** — recompute
   `projectWorld(handTile, topZ)` independently and compare to the emitted point,
   and confirm the hand circle is drawn there;
3. **figure feet rest on the ground plane** (`z = 0`) with a consistent baseline
   (both feet share the same footprint `ty`);
4. **painter order** — desk fully painted before the figure, figure before the
   chair, and the chair back is the very last element (nearest to camera);
5. **occlusion direction** — the chair-back's screen bounding box must actually
   overlap the torso's bbox AND cover its lower portion while painting after it
   (both bboxes are printed so the direction is verifiable, not vacuous).

All five passed at authoring time, and the reworked composition was rasterised
and eyeballed in a browser: it reads as a person seated at the desk from behind,
chair back centred and occluding the lower torso, forearms on the desktop.

## How it was run (prototype now deleted)

The prototype was driven by `npm run prototype:staffed-desk`, which wrote
`prototype-staffed-desk.html` at the repo root (reference JPEG embedded as a
gitignored, licensed data URI) and printed the Variant-C self-checks. A
bottom-centre pill / arrow keys cycled A/B/C.

**Per the `/prototype` skill's throwaway rule, the prototype was removed once it
answered its question** (verdict above). Deleted: `scripts/prototype-staffed-desk.ts`,
the `prototype:staffed-desk` npm script, the prototype's `.gitignore` lines, and
the generated `prototype-staffed-desk.html` + `ref-student-desk.jpg` on disk.
**This notes file is the durable record.**

## Verdict

**Variant B (sprite) won.** Viewed A/B/C against the reference at both 2× and 1×.

- **Sprites (B) read accurately; posed vectors do not — at size.** Two
  numerically-verified iterations of posed-vector authoring (`deskSingleV3`,
  reworked once after the first "person emerging from a desk" failure) passed
  **all five mechanical self-checks** (no NaN, forearms on the computed desktop
  plane, feet on the ground plane, desk→figure→chair-back painter order,
  chair-back/torso bbox occlusion). Mechanically correct — yet at the real
  display size (~46 px figure, the engine's standing-figurine anchor) the posed
  vector still **reads poorly**: outline-only, uniform-stroke line art collapses
  into noise on a body that small, exactly the detail-budget failure mode the
  diagnosis predicted. Passing geometry checks did not buy legibility.
- **Sprite trade-offs are acceptable for this asset class.** No token restyle,
  one image per orientation, and a matte-cleaning step are real costs, but for a
  staffed/organic subject the pixel fidelity of a raster cut-out beats anything
  the line-art vocabulary can render at 46 px. The trade-offs (documented in
  `docs/REPLICATING_REFERENCES.md`) are worth it here.

**Decision — where each path applies:**

- **Sprites** for any asset that contains a **posed human or an organic form**
  (staffed desks, people at work, animals, plants-as-photos, vehicles-with-a-
  driver). Line art cannot carry a legible pose at prop scale.
- **Vectors** remain for **furniture, parametric, and resizable** assets
  (buildings, zones, roads/rivers, empty desks, shelving) — anything that
  benefits from token restyle, free re-proportioning, orientation maths, or
  lossless scaling.

**Tiered sprite migration plan (before mass conversion, build the four
infrastructure pieces first):**

1. **Props + trees** — one image each (radially symmetric or single-facing).
   Lowest risk; validates the prep→register→export loop end-to-end.
2. **Vehicles** — four facings each (`car.o0.png` … `car.o3.png`), exercising
   the per-orientation `.oN` variant path.
3. **Parametric assets stay vector** — buildings/zones/terrain are NOT migrated;
   they need the properties they'd lose as bitmaps.

**Follow-up:** none for `deskSingleV3` — it is thrown away with the prototype
(this decision supersedes "port it into `desks.ts`"). The staffed desk becomes a
sprite via the tiered plan above.
