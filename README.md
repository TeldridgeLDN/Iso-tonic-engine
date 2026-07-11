# Iso-tonic Engine

Build an **isometric picture of a service or system** in the browser — users,
teams, processes, departments, organisations, physical and digital
infrastructure — in the monochrome line-art style of Arup Digital Studio's
isometric city drawings.

## Features

- **Interview wizard** — an 8-step guided interview builds the semantic entity
  model (service → organisations → departments → teams → user groups → systems
  → infrastructure → key questions), then auto-lays-out a first draft for you
  to refine. Or start blank, or load the demo (`?demo` URL param).
- **Semantic scene document** — the map is a typed model (`.iso.json`), not a
  drawing: every element knows what it is, who it belongs to, and which layers
  it lives on. Schema: [docs/SCHEMA.md](docs/SCHEMA.md).
- **Hybrid isometric editing** — structures snap to a 2:1 isometric tile grid
  with footprint collision; figurines and annotation callouts place freely;
  depth order is always correct (painter's algorithm).
- **Customisable figurines** — skin tone, hair style/colour, top, bottom,
  accessory; randomise; save and stamp named presets.
- **Layers** — automatic type layers (one per entity type) plus named custom
  layers; hidden layers are excluded from exports.
- **Process-flow routes** — numbered dashed journey paths drawn stop by stop
  with the route tool (C); stops anchor to entities and follow them when
  moved. Spotlighting a route lights its stops (and vice versa).
- **Edit / Present modes** — hover tooltips everywhere; in Present mode,
  clicking spotlights an entity and its semantic relatives while everything
  else fades.
- **Save / load** — File System Access API (`.iso.json`) with download
  fallback; continuous localStorage autosave for crash recovery.
- **Export** — SVG, PNG (1×/2×/4×), and true vector PDF, auto-cropped to
  content, visible layers only.
- **Undo/redo** — every edit flows through an invertible command layer
  (Cmd+Z / Shift+Cmd+Z).

## Run

```bash
npm install
npm run dev            # develop
npm test               # unit tests (core, assets contracts, io, wizard, routes)
npm run build          # production build (static, deployable anywhere)
npm run contact-sheet  # render every asset to contact-sheet.svg
```

Deployed automatically to GitHub Pages on push to `main`.

## Design docs

| Doc | Contents |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | The 13 design decisions + architecture + build phases |
| [docs/SCHEMA.md](docs/SCHEMA.md) | The `.iso.json` scene document contract (also the interface for external generators, e.g. an AI-driven interview) |
| [docs/STYLE_CONTRACT.md](docs/STYLE_CONTRACT.md) | Projection maths, palette, stroke rules, and anchor conventions every asset follows |

## Formerly parked, now shipped

- ~~Process-flow arrows~~ — the route tool (numbered dashed journey paths)
- ~~Parametric customisation panels for infrastructure~~ — the properties
  panel edits any asset's `paramSchema` (buildings, shops, zones)
- ~~A Claude-side interview skill~~ — the `iso-map-interview` skill emits
  `.iso.json` via the schema contract, including journey routes
