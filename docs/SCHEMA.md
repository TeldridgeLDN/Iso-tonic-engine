# Scene Document Schema (`.iso.json`) — v1

The scene document is the single source of truth. Rendering is a pure function
of this document. This schema is the **file contract**: the in-app wizard, the
editor, and any external generator (e.g. a Claude interview skill) all produce
or mutate this shape.

## Top level

```ts
interface SceneDocument {
  version: 1;                      // integer; migrations keyed off this
  meta: {
    title: string;                 // used for export filenames
    description?: string;
    created: string;               // ISO 8601
    modified: string;              // ISO 8601
  };
  camera?: { x: number; y: number; zoom: number };   // view state (not undoable)
  layers: CustomLayer[];           // custom layers only; type layers are implicit
  typeLayerVisibility?: Partial<Record<EntityType, boolean>>;  // default: all true
  figurinePresets?: Record<string, FigurineParams>;  // named reusable figurine configs
  entities: Entity[];
}

interface CustomLayer { id: string; name: string; visible: boolean }
```

## Entities

```ts
type EntityType =
  | 'user' | 'team' | 'process' | 'department' | 'organisation'
  | 'physical-infra' | 'digital-infra' | 'annotation';

interface Entity {
  id: string;                      // unique, stable (nanoid-style)
  type: EntityType;
  label: string;
  description?: string;            // shown in hover tooltip
  parentId?: string;               // semantic containment: person→team→department→organisation;
                                   // infra/process may parent to team/department.
                                   // Spotlight keeps parent/child/sibling chains lit.
  customLayers?: string[];         // ids of CustomLayer; type layer is implicit from `type`
  placement: GridPlacement | FreePlacement;
  asset: AssetRef;
  anchorEntityId?: string;         // annotations only: leader line target
  userGoal?: string;               // zones/whole-services: what the user is trying to do
  orgGoal?: string;                // zones/whole-services: what the organisation wants
                                   // (both shown in tooltips + generated written description)
}

interface GridPlacement {
  mode: 'grid';
  x: number; y: number;            // tile coords of footprint origin (integers)
  footprint: { w: number; d: number };  // tiles along +x / +y, AS AUTHORED (rotation 0)
  rotation?: 0 | 1 | 2 | 3;        // quarter-turns clockwise; default 0.
                                   // Effective footprint swaps w/d for odd rotations
                                   // (always derive via core effectiveFootprint()).
}

interface FreePlacement {
  mode: 'free';
  x: number; y: number;            // world px (same space as projected tiles)
  rotation?: 0 | 1 | 2 | 3;        // facing for free assets (figurines: 1|3 = mirrored)
}

interface AssetRef {
  symbol: string;                  // id in the asset library registry
  params?: Record<string, unknown>;// parametric assets: FigurineParams | BuildingParams | CalloutParams
}
```

## Parametric asset params

```ts
interface FigurineParams {
  skin: string;                    // palette key, e.g. 'tone-2'
  hairStyle: string;               // 'short' | 'long' | 'bun' | 'curly' | 'bald' | ...
  hairColor: string;               // palette key
  top: string;                     // 'shirt' | 'jacket' | 'hoodie' | 'hiviz' | ...
  bottom: string;                  // 'trousers' | 'skirt' | 'shorts' | ...
  accessory?: string;              // 'hardhat' | 'headset' | 'clipboard' | 'none'
  preset?: string;                 // name in figurinePresets this was stamped from
}

interface BuildingParams {
  widthTiles: number; depthTiles: number; storeys: number;
  windowStyle: 'grid' | 'ribbon' | 'sparse';
  roof: 'flat' | 'pitched' | 'plant';   // plant = rooftop plant/garden boxes
  signage?: string;                     // rooftop text, Arup 'EAT & DRINK' style
}

interface CalloutParams {
  text: string;
  angle?: number;                  // ribbon angle in degrees (default follows iso axis, ~26.57)
  leader?: boolean;                // draw leader line to anchorEntityId
}
```

## Rules

- **Depth/render order is never stored** — always derived (see core/depth.ts).
- Grid entities must not overlap footprints on the same tiles (editor enforces;
  validator warns, doesn't reject).
- `parentId` must reference an existing entity; validator rejects cycles.
- Hidden layer (type or custom) ⇒ entity excluded from render **and** export.
  An entity is visible only if its type layer AND all its custom layers are visible.
- Annotations render above all scene content, always.
- Unknown fields are preserved on load/save (forward compatibility).
- `version` bumps require a migration in `core/schema.ts`; loaders migrate
  then validate.

## Persistence

- File extension: `.iso.json` (plain UTF-8 JSON, pretty-printed, 2-space).
- localStorage autosave key: `isotonic.autosave` (full document + timestamp);
  offered for restore if newer than the opened file.
