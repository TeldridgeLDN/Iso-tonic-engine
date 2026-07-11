# Territory — collapse all zone kinds into a single unlabeled ground territory

**Status:** Spec agreed 2026-07-11 (seams + scope confirmed with user). Execution via /tdd slices.

## Problem Statement

Department zones and process zones do essentially the same job — mark out an area of the
isometric ground — but each carries its own label. With several zones plus real objects on
the canvas, the labels crowd the scene and the two near-identical zone kinds add palette
and mental overhead without adding meaning.

## Solution

Replace all zone kinds with a single **territory**: an unlabeled isometric ground plate you
place objects and journeys on, seeing the territory behind them. No label, no plaque. It can
be resized up to **100 × 100 tiles**. Old saved scenes open cleanly — their zones become
territories, labels dropped.

## User Stories

1. As a map author, I want one "territory" palette item instead of department/process/organisation/team zones, so that choosing a ground area is a single decision.
2. As a map author, I want territories to render with no label or plaque, so that the canvas stays uncluttered as objects accumulate.
3. As a map author, I want to resize a territory up to 100 × 100 tiles, so that one territory can underlie an entire large map.
4. As a map author, I want to place objects and journeys on top of a territory and see the territory behind them, so that the territory acts as visible ground (existing ground-plate behavior, preserved).
5. As a returning user, I want old `.iso.json` scenes containing department/process/organisation/team zones to load as territories, so that nothing breaks on upgrade.
6. As a wizard user, I want the build wizard to lay down territories (unlabeled), so that generated scenes match the new model.
7. As an iso-map-interview user, I want the skill to emit territory entities, so that AI-generated scene files use live asset ids.

## Implementation Decisions

- **One new entity type `territory`** with one registry asset (`territory`), `ground: true`, resizable, replacing the four zone entity types (department, process, organisation, team) and their assets (department-zone, process-zone). Decorative plates `region-organic` and `island-coastline` also become type `territory` (per user: "all zone kinds → one territory") but keep their distinct renderers as visual variants of territory.
- **Renderer:** single territory renderer = the existing dashed diamond outline + invisible hit-area polygon, with all label/plaque/text drawing removed. Param schema keeps only `w`/`d` (min 1, **max 100**); `label`, `number`, `userGroups` params deleted.
- **Zone-only semantic fields (`userGoal`, `orgGoal`) are dropped** from the model and tooltip: goals on an anonymous territory have no anchor. (Flagged in Open Questions before agreement; resolved by the "drop labels / drop zone sections" decisions.)
- **Migration (expand → migrate → contract):** document `migrate()` gains a real case: any entity of the old zone types is rewritten to type `territory`; old zone asset symbols map to `territory` (decorative plate symbols keep their own ids); `label`/`number`/`userGroups` params and `userGoal`/`orgGoal` are stripped. Labels are discarded, not hidden (user decision). Bump or in-place-v1 rewrite decided at implementation — must be idempotent.
- **Per-type layer visibility** map migrates its old zone-type keys into the single `territory` key (visible if any old key was visible).
- **Exporters:** description and legend drop their per-zone sections entirely; exports describe only objects and journeys (user decision). Zone-noun vocabularies and zone heading constants are deleted.
- **UI:** palette shows one "Territory" entry under a single section (former Departments/Processes sections removed); properties panel shows "Territory" with only size controls; resize tool/toolbar behavior unchanged apart from the new 100-tile bound; resize continues to skip collision so entities can nest on territories.
- **Wizard:** steps that created labeled department/organisation/team zones now create unlabeled territories sized to contain their children; name/goal prompts for zones are removed.
- **Lockstep external update:** `~/.claude/skills/iso-map-interview/SKILL.md` updated to emit `territory` (type + asset id), no labels/goals on territories.
- **Demo scene** rebuilt on territories.

## Testing Decisions

Agreed seams (all pre-existing; no new seams):

1. **Document seam** — `.iso.json` → migrate/validate → document. Tests: old-format zones become territories, params stripped, idempotent re-migration, layer-visibility key folding. Prior art: `tests/schema.test.ts`.
2. **Params/resize seam** — size param seeding and clamping. Tests: territory clamps at 100 (replacing the max-12 assertions), min 1, seeding without label. Prior art: `tests/resize.test.ts`, `tests/placementSeed.test.ts`.
3. **Exporter seam** — document → description/legend text. Tests: no zone sections; objects/journeys still exported. Prior art: `tests/io-description.test.ts`.

Good tests here assert external behavior (document text out, clamped params out, migrated JSON out), never renderer internals. Depth/ground behavior is already covered by `tests/depth.test.ts` and stays green.

## Task Breakdown (Vertical Slices)

1. **Territory exists end-to-end (expand).** Add `territory` entity type + registry asset with unlabeled renderer and w/d schema (max 100); palette entry appears; placeable, resizable to 100×100 in the running app. Old types untouched. Acceptance: params seam clamps territory to 1–100; a placed territory renders with no text elements; existing suites green.
2. **Old scenes migrate. Blocked by: #1.** `migrate()` rewrites all old zone types/symbols to territory, strips label/plaque params and goals, folds layer-visibility keys; idempotent. Demo scene rebuilt on territories. Acceptance: document seam — fixture docs with each old zone kind load as territories; loading twice yields identical docs.
3. **UI + exporters contract. Blocked by: #2.** Remove old zone types from type unions/validation, palette sections, properties display names, tooltip goal lines; description/legend drop zone sections and zone vocabularies. Acceptance: exporter seam — no zone headings/prose for a doc with territories; schema seam rejects old types only via migration path (raw new-doc validation no longer lists them).
4. **Wizard emits territories. Blocked by: #3.** Wizard steps create unlabeled territories sized to children; zone name/goal questions removed. Acceptance: wizardBuild tests — output entities are type territory, no label params, children nested within footprint.
5. **Lockstep externals. Blocked by: #3.** Update iso-map-interview SKILL.md to the new type/asset id and remove zone-label/goal instructions; verify its documented schema pointers still resolve. Acceptance: skill doc contains no dead asset ids (`department-zone`/`process-zone`).

## Out of Scope

- Multiple simultaneous territory visual themes beyond keeping region-organic / island-coastline renderers as variants.
- Any new grouping/containment semantics (nesting stays `parentId`-based as today).
- Export grouping by territory (explicitly declined — zone sections dropped instead).
- Fixing the pre-existing unrelated `route-path` dead id noted in iso-map-interview.

## Open Questions

None — scope (all zone kinds), migration (drop labels), exporters (drop zone sections), and lockstep skill update were all settled with the user on 2026-07-11.

## Further Notes

- The world grid is unbounded; 100×100 needs no camera/canvas work — only the schema cap and the tests asserting the old 12-tile clamp.
- Resize-without-collision is intentional (territories legitimately contain nested entities) and must be preserved.
