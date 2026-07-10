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
npm test               # 122 unit tests (core, assets contracts, io, wizard)
npm run build          # production build (static, deployable anywhere)
npm run contact-sheet  # render every asset to contact-sheet.svg
```

Deployed automatically to GitHub Pages on push to `main`.

## Public viewer / private editor

The deployed site has two pages:

- **`/` (public)** — a view-only demo: the built-in scene in Present mode with
  Export and pan/zoom, but no palette, panels, wizard, save/load, or shortcuts.
- **`/edit/` (private)** — the full editor, AES-encrypted at deploy time by
  [StatiCrypt](https://github.com/robinmoisson/staticrypt). CI reads the page
  password from the `PAGES_PASSWORD` repository secret; the build fails loudly
  if the page would ship unencrypted.

### "My maps" encrypted gallery

Personal `.iso.json` maps are published as ciphertext only (AES-GCM-256, key
derived with PBKDF2/200k from a passphrase). Authoring workflow:

```bash
# 1. Edit a map in /edit/, Save As → private/scenes/<name>.iso.json
#    (private/ is gitignored — plaintext never leaves this machine)
# 2. Encrypt + regenerate the manifest:
SCENES_PASSPHRASE='your strong passphrase' npm run encrypt-scenes
# 3. Commit public/maps/*.enc + public/maps/manifest.json and push.
```

On the `/edit/` page a **My maps ▾** menu appears when a gallery manifest is
published; picking a map prompts for the passphrase once per session and
decrypts in the browser. The manifest's salt is public by design — the
passphrase is the only secret. Delete `public/maps/manifest.json` before
re-running the script to rotate the salt.

## Design docs

| Doc | Contents |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | The 13 design decisions + architecture + build phases |
| [docs/SCHEMA.md](docs/SCHEMA.md) | The `.iso.json` scene document contract (also the interface for external generators, e.g. an AI-driven interview) |
| [docs/STYLE_CONTRACT.md](docs/STYLE_CONTRACT.md) | Projection maths, palette, stroke rules, and anchor conventions every asset follows |

## Roadmap (parked by design)

- Process-flow arrows (numbered dashed routes for user journeys)
- Parametric customisation panels for infrastructure (the figurine editor's
  chassis already supports this via `paramSchema`)
- A Claude-side interview skill emitting `.iso.json` via the schema contract
