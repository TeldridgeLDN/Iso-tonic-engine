---
name: sprite-verify
description: Verify a newly added or replacement Iso-tonic Engine sprite is genuinely live on the deployed GitHub Pages site — walk local files, the id-collision check, the deploy run, the live bundle, and the live palette DOM. Use when the user asks "is my sprite live", "verify the sprite deployed", "check the new asset on the live site", or "did the replacement take effect". Covers both a brand-new asset id and a sprite that replaces a retired vector asset.
---

You confirm a sprite is actually live on the deployed site — not merely committed. Two modes:

- **Mode A (new asset)** — a brand-new `<id>.png` must appear in the live palette.
- **Mode B (replacement)** — a sprite that takes over a retired hand-registered vector id must
  GENUINELY replace it: the live palette thumbnail must render the PNG, not the old vector art.

Run the checks in order and stop at the first FAIL. `<id>` is the kebab sprite id
(e.g. `telephone`). Repo remote: `TeldridgeLDN/Iso-tonic-engine`; live base
`https://teldridgeldn.github.io/Iso-tonic-engine/` (from vite `base` `/Iso-tonic-engine/`).

## Check pipeline

**1 — Local files present.** The sprite ships as a PNG plus a JSON sidecar.

```bash
ls src/assets/sprites/<id>*.png src/assets/sprites/<id>.json
cat src/assets/sprites/<id>.json   # keys: footprint {w,d}, widthPx, category
                                   # (+ intrinsic {w,h} since 2026-07-11 — auto-added, ignore)
```

Single-facing sprites ship one `<id>.png`; four-facing vehicles ship `<id>.o0.png … <id>.o3.png`
sharing the one sidecar — expect all four.

PASS: both exist; `category` is one of user, team, process, department, organisation,
physical-infra, digital-infra, annotation, prop (see `CATEGORIES` in library.ts). FAIL: missing
PNG → the raw drop was never prepped (`npm run prep-sprite`); bad `category` → falls back to `prop`
and lands in the wrong palette group.

**2 — Id-collision grep (the #1 failure mode).** An auto-sprite whose id matches a
hand-registered asset in `library.ts` is silently dropped — `mergeAutoSprites()` keeps the
hand entry and only `console.warn`s.

```bash
grep -n "id: '<id>'" src/assets/library.ts
```

PASS (Mode A): no match — the id is free. PASS (Mode B): no live `id:` line, only a retired-comment
(the vector registration must already be gone). FAIL: an active `{ id: '<id>', … }` line exists →
the sprite will NEVER appear until you retire that registration (see Mode B extras).

**3 — Committed and pushed.** Pages only builds `main`.

```bash
git status --porcelain src/assets/sprites/<id>.*   # empty = nothing uncommitted
git log origin/main --oneline -1 -- src/assets/sprites/<id>.png
```

PASS: clean tree and the file is in an `origin/main` commit. FAIL: uncommitted or unpushed →
`git add`/`commit`/`push` to `main`.

**4 — Deploy run green.** The "Deploy to GitHub Pages" workflow runs on push to main.

```bash
gh run list --limit 3 --repo TeldridgeLDN/Iso-tonic-engine
```

PASS: the run for your commit shows `completed  success`. FAIL: `in_progress`/`queued` → wait and
re-check (see gotchas — pushing is not deploying); `failure` → `gh run view --log-failed` (the
workflow runs `npm test` before build).

**5 — Live bundle carries the id and the PNG asset is served.** Since the viewer/editor
split (2026-07-11), sprites are NOT base64-inlined into a `sprites-<hash>.js` chunk any
more — they are URL references in the `app-<hash>.js` chunk, and each PNG ships as its
own hashed asset (`assets/<id>-<hash>.png`). Fetch the live `index.html`, find the app
chunk among the referenced scripts/preloads, grep it for the id, then confirm the PNG
itself is fetchable. Always use a cache-buster.

```bash
BASE=https://teldridgeldn.github.io/Iso-tonic-engine
curl -s "$BASE/index.html?cb=$(date +%s)" | grep -oE 'assets/[^"]+\.js'   # main/app/model/demo chunks
curl -s "$BASE/assets/app-<hash>.js?cb=$(date +%s)" | grep -c '<id>'
PNG=$(curl -s "$BASE/assets/app-<hash>.js?cb=$(date +%s)" | grep -oE '[a-zA-Z0-9_./-]*<id>[a-zA-Z0-9_.-]*\.png' | head -1)
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/assets/$(basename $PNG)?cb=$(date +%s)"   # expect 200
```

PASS: the id occurs in the app chunk, the PNG asset returns 200, and on a redeploy the
chunk hash has CHANGED from the previous build. FAIL: id absent or hash unchanged → the
deploy served a stale build; confirm check 4 completed, then retry with a fresh
cache-buster.

**6 — Live DOM (definitive — the only check that separates Mode B pass from fail).**
Since the viewer/editor split (2026-07-11) the live root `/` is a READ-ONLY VIEWER with
no palette; the full editor lives at `/edit/` behind StatiCrypt encryption and cannot be
automated. Two surfaces, in order of preference:

a) **Editor palette — LOCAL dev server** (`preview_start {name}`, the palette is
   identical to what `/edit/` serves after decryption). Each palette entry is a
   `<button class="iso-palette-item" data-asset-id="<id>">` whose `div.iso-thumb-wrap`
   holds an `svg.iso-thumb`. A PNG sprite renders as an `<image>` (data URI in dev,
   hashed asset URL in prod builds); a vector asset renders shape elements
   (`<path>`/`<polygon>`/`<rect>…`).

   ```js
   const b = document.querySelector('button[data-asset-id="<id>"]');
   b && b.querySelector('svg.iso-thumb').innerHTML.slice(0, 120);
   ```

b) **Live viewer — rendered entities.** Open the LIVE URL directly in the Browser pane
   (`preview_start {url: "https://teldridgeldn.github.io/Iso-tonic-engine/"}` — no
   claude-in-chrome needed), then `javascript_tool` to inspect any map entity using the
   asset: `document.querySelectorAll('svg [data-entity-id]')`, filter to the relevant
   entity, and assert its markup is an `<image>` (sprite) rather than vector shapes.
   Only possible when the default/demo document actually places the asset.

PASS (Mode A): the palette button exists (a), or a placed entity renders the sprite (b).
PASS (Mode B): the thumb/entity markup contains `<image` — not `<path>`/`<polygon>` vector
shapes. FAIL: button/entity missing → re-check 2 and 5; vector shapes where an `<image>`
should be → the old vector is still winning (Mode B extras not complete).

**Static fallback when neither surface is available:** (a) the live app chunk contains
the sprite's id and its PNG asset serves 200 (check 5), and (b) the deployed commit has
no hand-registered id: `git show origin/main:src/assets/library.ts | grep "id: '<id>'"`
must be empty. `mergeAutoSprites()` is deterministic and unit-tested, so (a) + (b) imply
the palette renders the PNG. Note in your report that the DOM was inferred, not observed.

## Mode B extras (replacing a retired vector asset)

A replacement only takes effect once the vector is fully out of the way:

- The vector's `{ id: '<id>', … }` line is removed from `HAND_ASSETS` in `library.ts` (leave a
  dated retired-comment, as done for `telephone` and `desk-single`).
- The now-unused renderer import is removed from library.ts (its symbols file).
- If the id was renamed, add the old id to the `ID_ALIASES` map in library.ts so saved documents
  still load.
- The sidecar `category` matches the retired vector's category, so the sprite stays in the same
  palette group.
- The check-6 assertion holds: the live thumb is an `<image>` PNG, not vector shapes.

## Gotchas

- **Browser cache.** GitHub Pages caches aggressively. Always hard-reload and add a `?cb=<ts>`
  query on every fetch — a stale bundle is the commonest false FAIL.
- **The silent drop.** An id collision produces only a `console.warn`, no error. Check 2 is the
  only place it surfaces — never skip it.
- **Push ≠ deploy.** A green `git push` does not mean the site updated. Confirm the run reached
  `completed success` (check 4) AND the bundle hash changed (check 5) before trusting the live DOM.
- **Viewer ≠ editor.** The live root is the read-only viewer — "no palette buttons" there is
  normal, not a FAIL. Palette assertions belong to the local dev server (or the encrypted
  `/edit/` page, manually); the live surface to check is rendered entities or the bundle+PNG.
- **Vector-asset variant.** For a restyled/parametric VECTOR asset (figurine, buildings), checks
  1–2 invert: expect NO sprite files and an ACTIVE hand-registered `id:` line. Check 5 greps the
  app chunk for a code marker of the change; check 6 asserts stroke/fill properties on the
  rendered entity or thumb instead of `<image>`.
