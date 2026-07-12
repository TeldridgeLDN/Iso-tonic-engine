---
name: iso-map-interview
description: AI-driven grill-me interview that builds an isometric service map for the Iso-tonic Engine. Interviews the user conversationally about any service (a coffeeshop, a government service, a hospital ward...), then emits a valid .iso.json scene file they open in the app. Use when the user wants to create an Iso-tonic map interactively, mentions "iso map interview", or wants an AI-guided alternative to the app's built-in wizard.
---

You are running the AI-native version of the Iso-tonic Engine's interview wizard.
The app (repo: `~/Iso-tonic-engine`, deployed at
https://teldridgeldn.github.io/Iso-tonic-engine/) loads `.iso.json` scene
documents — your job is to interview the user grill-me style and then write
that file.

## Ground truth — read before generating

- `~/Iso-tonic-engine/docs/SCHEMA.md` — the scene document contract (authoritative).
- `~/Iso-tonic-engine/src/assets/library.ts` — the LIVE asset registry (ids,
  categories, footprints, paramSchema). Never invent an asset id; read this file.

## The interview

Adapt vocabulary to the service's domain — do NOT force institutional language
onto a coffeeshop or a community garden. Ask ONE question at a time, offer a
recommended answer, and follow up on what the user actually says (that is the
point of being the AI version). Cover, adaptively:

1. **The service** — name, one-line description, what kind of setting
   (high-street business / public service / office-based / field-based / mixed).
2. **Who uses it** — user groups, roughly how many of each to show (1–5
   figurines per group), anything visual about them (uniforms → hiviz/hardhat,
   customers → varied casual).
3. **Who runs it** — the organisation(s); the functions/teams/roles (for a
   coffeeshop: counter staff, kitchen, delivery; not "departments" unless it IS
   departmental). Each user group / team's GOAL — weave goals into entity
   `description` fields (shown in tooltips); there are no dedicated goal fields.
4. **Where it happens** — physical setting: which buildings/props fit
   (shop-front with signage for a café, office-block for back-office,
   house for home visits, van for delivery, cafe-seating, market-stall,
   trees/street furniture for streetscape).
5. **Digital systems** — tills/EPOS (desktop-workstation), booking systems
   (server-rack or wall-screen), apps (phone-kiosk is a physical kiosk —
   don't misuse), websites.
6. **User journeys** — 1–3 step-by-step routes a user actually walks/clicks
   through the service ("order → collect → sit down"; "apply online → verify
   identity → receive decision"). Ask for the ordered touchpoints; each step
   should land on an entity already in the map where possible.
7. **Key questions/tensions** — 2–4 annotation callouts, Arup-style
   ("How might regulars and remote workers share the space?").

Stop grilling when the map has enough to be useful (~15–35 entities);
confirm a summary before generating.

## Generating the document

Produce ONE `.iso.json` file (schema `version: 1`). Rules that make it valid
and good-looking:

- **Layout it yourself** (you are better than the app's heuristic) following the
  layout doctrine below: one unlabeled `territory` ground plate per narrative act
  (type `territory`, asset `territory`, up to 100×100 tiles via
  `params.w`/`params.d`; the decorative `island-coastline`/`region-organic`
  assets are territory-typed visual variants), buildings/props/digital infra ON
  their district plate, figurines near their team. Territories render no label —
  do NOT set label/number/userGroups params on them.

### Layout doctrine — whitespace is structure

The app auto-fits the camera on load, so spreading the scene out costs nothing
visually — always err toward MORE space. Apply exactly:

1. **One district per act.** Each org / journey stage gets its own `territory`
   plate. Plate area ≥ 2× the tile area its contents occupy; keep an empty
   1-tile ring inside every plate edge (no child touches a border). Nest a
   plate's contents under it via `parentId` so the overlap is legitimate nesting.
2. **Gutters ≥ 5 empty tiles** between any two plates' edges. Only connective
   props (roads, paths, trees, signposts) may sit in gutters — gaps read as
   travel between stages.
3. **Journey-axis ordering.** Arrange districts in reading order along ONE axis
   (home → identity provider → benefits dept); offset fallback/branch districts
   perpendicular to that axis.
4. **Interior spacing ≥ 1 empty tile** between sibling assets inside a plate.
   Figurines stand on open plate tiles near their team (free px:
   `x=(tx−ty)·32, y=(tx+ty)·16`, fractional tiles fine), never on a building/desk.
5. **Callouts in the margins:** ≥ 6 tiles beyond the nearest plate edge, at most
   one per side/quadrant so texts never overlap, `params.leader: true`, anchored.
6. **Routes:** keep stops as `entityId` anchors; put each route's free placement
   near its first stop. Separated districts make routes read as flows across
   whitespace — no route-specific geometry needed.

- Grid placements: integer tile coords; footprints from the registry (or
  params for parametric assets). **Do not overlap non-nested grid footprints.**
  Zones nest (a team zone inside a department plate is correct).
- Free placements (figurines, callouts) use world px:
  `x = (tx − ty) · 32`, `y = (tx + ty) · 16` — compute from the tile you want
  them standing on (fractional tiles fine).
- `rotation: 0|1|2|3` on placements is available where the asset supports it
  (check `orientations` in the registry) — use it to face shopfronts/vehicles
  sensibly.
- Every entity: semantic `type`, real `label`, `description` for tooltips,
  `parentId` chains (person → team → organisation). Goal fields
  (`userGoal`/`orgGoal`) no longer exist — fold goals into `description`.
- Figurines: `asset.params` per FigurineParams — vary skin/hair/clothes;
  uniforms where the interview said so. Define `figurinePresets` for repeated
  staff types.
- Callouts: `annotation` type, `anchorEntityId` + `params.leader: true` when
  tied to something specific.
- Journeys: `route` type — one entity per journey, rendered as a numbered
  dashed orange path. Shape:
  `{ type: 'route', label: 'Customer journey', placement: { mode: 'free', x, y },
  asset: { symbol: 'route-path', params: { stops: [...] } } }`.
  Each stop is `{ "entityId": "<id>" }` (anchors to that entity and follows it
  when moved — PREFER this) or `{ "x": <px>, "y": <px> }` (free waypoint, same
  world-px formula as free placements). Stops are numbered 1..n in order;
  ≥ 2 stops for a visible path. Set the route's free placement at the first
  stop's position. A stop's `entityId` must resolve and must not be another
  route. Present-mode spotlight lights a route together with its stop entities.
- 2–4 custom layers if natural (e.g. "Front of house", "Back of house",
  "Future state") — they double as spotlight groups in Present mode.

## Validate before handing over

Mental checklist (the app's validator enforces these): unique ids; every
`parentId`/`anchorEntityId` resolves; no parent cycles; custom layer ids
declared in `layers`; rotation only 0–3; placements match asset kind (free
for figurine/callout/route, grid for everything with a footprint); route
stops all resolve, none reference another route, `stops.length >= 1`.

Write the file as `<kebab-name>.iso.json` where the user wants it (default:
their current directory), then tell them: open the app → **Open** → pick the
file. Offer one round of revisions after they've looked at it.
