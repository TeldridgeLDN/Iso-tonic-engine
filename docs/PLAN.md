# Iso-tonic Engine — Build Plan

An isometric service/system mapping engine: build an Arup-Digital-Studio-style
isometric picture of a service — users, teams, processes, departments,
organisations, physical & digital infrastructure — human-in-the-loop, in the
browser.

## Design decisions (from the grill-me interview, 2026-07-05)

| # | Decision |
|---|----------|
| 1 | **Stack**: Vite + TypeScript, no framework, SVG rendering. Static build. |
| 2 | **Placement**: hybrid — isometric tile grid + snapping for anything with a footprint; free placement for figurines and annotation callouts; unified depth-sort (painter's algorithm) across both. |
| 3 | **Semantic scene document**: the save file is a JSON model of typed entities (not sprites); rendering is a pure function of the document. |
| 4 | **Layers**: automatic type layers (one per entity type) + named custom layers; hidden layers are excluded from exports. No user-facing render-order layers (depth-sort owns order). |
| 5 | **Assets**: hand-authored SVG symbol library under a strict style contract, plus parametric figurines (part-swap) and parametric buildings. Starter set ~25–30 assets. |
| 6 | **Interview**: in-app scripted wizard (data-driven question flow) creating entities → auto-laid-out first draft. Scene JSON schema documented so a Claude-side skill can also generate maps (file contract). |
| 7 | **Persistence**: File System Access API with download/upload fallback; `.iso.json` file is the source of truth; localStorage autosave for crash recovery. One file = one map. |
| 8 | **Export**: SVG (serialise), PNG (canvas, 1×/2×/4×), vector PDF (svg2pdf.js + jsPDF). Full map bounds auto-fit, visible layers only, page auto-sized to map aspect. |
| 9 | **View/interaction**: wheel-zoom to cursor, background-drag pan, entity-drag move. Hover = accent highlight + tooltip. Edit/Present mode toggle: in Present, click = spotlight (everything else fades to 15%, semantic relatives stay lit). |
| 10 | **Annotations**: Arup-style angled orange callout ribbons, first-class free-placed entities with optional leader line to an anchor entity. **No drawn edges in v1** (process-flow arrows parked as fast-follow). |
| 11 | **Undo/redo**: command layer from day one — all document mutations flow through invertible commands; Cmd+Z / Shift+Cmd+Z; 100-step stack; document edits only. |
| 12 | **Figurines**: part-swap editor (skin, hair style/colour, top, bottom, accessory) + randomise button + save-as-preset. One pose (standing) in v1. Stretch goal (customisable infrastructure) reuses the same param-panel pattern. |
| 13 | **Delivery**: GitHub Pages via Actions; Vitest on the pure core (projection, depth, footprint, commands, schema); UI verified interactively; `main` + conventional commits, feature branches once stable. |

## Architecture

```
src/
├── core/      # pure TS, no DOM — fully unit-tested
│   ├── iso.ts        # tile↔screen projection, constants
│   ├── depth.ts      # painter's-algorithm sort key for grid + free entities
│   ├── model.ts      # SceneDocument types + factory/query helpers
│   ├── schema.ts     # validation + versioned migration of .iso.json
│   ├── commands.ts   # invertible command layer + undo stack
│   └── layout.ts     # auto-layout heuristic for wizard output
├── assets/    # style-contract SVG symbol library (TS modules emitting SVG)
│   ├── style.ts      # contract constants (palette, stroke, tile)
│   ├── primitives.ts # iso box/prism/path helpers used by all assets
│   ├── figurine.ts   # parametric figurine (parts + palette)
│   ├── building.ts   # parametric building generator
│   ├── library.ts    # registry: id → renderer + metadata (category, footprint)
│   └── symbols/      # hand-authored static assets
├── render/    # SVG scene renderer, camera, spotlight, hover
├── ui/        # toolbar, palette, layers panel, properties panel,
│              # figurine editor, interview wizard
├── io/        # persistence (FSA + fallback + autosave), export (svg/png/pdf)
└── main.ts    # app shell + state wiring
```

Contracts: `docs/SCHEMA.md` (scene document), `docs/STYLE_CONTRACT.md` (assets).

## Build phases

| Phase | Content | Executor |
|-------|---------|----------|
| 0 | Scaffold, contracts, deps | Fable (done) |
| A | Core engine (`src/core` + tests) | Opus subagent |
| B | Asset library (`src/assets` + contact-sheet script) | Opus subagent (parallel with A) |
| C | Renderer + interaction + app shell (`src/render`, `main.ts`) | Opus subagent |
| D | UI panels + figurine editor + wizard (`src/ui`) | Opus subagent |
| E | Persistence + export (`src/io`) | Opus subagent (parallel with D, owns only `src/io`) |
| F | Integration, visual verification, GH Pages deploy, README | Fable |

Each subagent works only on tasks it can fully evaluate (tests pass, script
output renders, build compiles). Fable performs the final check of all output.
