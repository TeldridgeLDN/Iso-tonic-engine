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

## How to run it

```bash
npm run prototype:staffed-desk
# → writes prototype-staffed-desk.html at the repo root, prints the self-checks
open prototype-staffed-desk.html      # then use ← / → or the pill to switch A/B/C
```

The reference image (licensed stock) is copied to a gitignored repo-local file
`ref-student-desk.jpg` at runtime and embedded as a data URI. Neither the copied
image nor the generated HTML is committed.

`scripts/` is excluded from `tsconfig.json` (`include: ["src"]`), so the script
is validated by running it via `vite-node`, not by `tsc`.

## Files

- Committed: `scripts/prototype-staffed-desk.ts`, this notes file, the
  `.gitignore` addition, the `package.json` npm script.
- Gitignored (never committed): `prototype-staffed-desk.html`,
  `ref-student-desk.jpg`.

## Verdict (fill in after viewing)

_TODO — view `prototype-staffed-desk.html`, flip A/B/C against the reference, and
record the decision here:_

- Does Variant C read as a seated person at a desk (vs A)? …
- Is the sprite path (B) worth the trade-offs (no token restyle, one image per
  orientation, matte-cleaning dependency)? …
- **Chosen approach for staffed desks:** …
- Follow-up work if C is chosen (port `deskSingleV3` into `desks.ts`, apply the
  same posing to `deskMeeting`, decide fill palette): …
