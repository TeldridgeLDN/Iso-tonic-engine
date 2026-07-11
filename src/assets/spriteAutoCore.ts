// Pure, vite-free helpers for zero-step PNG sprite auto-discovery.
//
// WHY THIS FILE IS SEPARATE
// -------------------------
// The discovery itself (spriteAuto.ts) leans on `import.meta.glob`, which only
// resolves inside a vite / vite-node context — it cannot be unit-tested under
// plain vitest without a build. So every decision that has a right/wrong answer
// (id derivation, sidecar merge, orientation grouping, collision policy) lives
// here as pure functions over plain data, and spriteAuto.ts is a thin wiring
// layer that feeds glob output through these.

/** Per-sprite overrides a sidecar JSON may supply. All fields optional. */
export interface SpriteSidecar {
  footprint?: { w: number; d: number };
  widthPx?: number;
  category?: string;
  anchor?: { dx: number; dy: number };
  /** Base PNG's intrinsic pixel size, backfilled by prep-sprite. Drives the
   *  billboard aspect ratio without decoding image bytes at runtime. */
  intrinsic?: { w: number; h: number };
}

/** One discovered sprite, resolved from its base PNG (+ variants + sidecar). */
export interface DiscoveredSprite {
  id: string;
  category: string;
  footprint: { w: number; d: number };
  widthPx: number;
  anchor: { dx: number; dy: number };
  /** Base image's intrinsic pixel size (from the sidecar), if known. */
  intrinsic?: { w: number; h: number };
  /** Base image (orientation 0) plus optional o1..o3 variants (sparse ok). */
  images: [string, (string | undefined)?, (string | undefined)?, (string | undefined)?];
}

/** Defaults applied to every sprite before sidecar overrides. */
export const SPRITE_DEFAULTS = {
  category: 'prop',
  footprint: { w: 1, d: 1 },
  widthPx: 64,
  anchor: { dx: 0, dy: 0 },
} as const;

/**
 * Strip a sprites-dir glob key down to its bare filename.
 * `./sprites/My_Desk.o2.png` → `My_Desk.o2.png`.
 */
export function basename(globKey: string): string {
  const slash = globKey.lastIndexOf('/');
  return slash < 0 ? globKey : globKey.slice(slash + 1);
}

/**
 * Kebab-case an id from a raw base name (no extension, no `.oN` suffix).
 * Lower-cases, converts spaces / underscores / camelCase boundaries to single
 * hyphens, drops anything else. `My_Desk` → `my-desk`, `bookShelf2` →
 * `book-shelf2`. Deterministic — the same file always yields the same id.
 */
export function kebabId(rawBase: string): string {
  return rawBase
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2') // camelCase boundary
    .replace(/[\s_]+/g, '-') // spaces / underscores → hyphen
    .replace(/[^A-Za-z0-9-]+/g, '-') // any other run → hyphen
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-|-$/g, '') // trim edges
    .toLowerCase();
}

/**
 * Parse a PNG filename into `{ base, orientation }`.
 * - `crate.png`      → base `crate`, orientation null (the base image)
 * - `lorry.o2.png`   → base `lorry`, orientation 2 (a per-facing variant)
 * A `.oN` where N is 0–3 is treated as a variant; anything else is part of the
 * base name. Returns null if the file isn't a `.png`.
 */
export function parsePngName(filename: string): { base: string; orientation: number | null } | null {
  if (!/\.png$/i.test(filename)) return null;
  const stem = filename.replace(/\.png$/i, '');
  const m = stem.match(/^(.*)\.o([0-3])$/);
  if (m) return { base: m[1], orientation: Number(m[2]) };
  return { base: stem, orientation: null };
}

/** Parse a sidecar JSON filename into its base name, or null if not `.json`. */
export function parseJsonName(filename: string): string | null {
  if (!/\.json$/i.test(filename)) return null;
  return filename.replace(/\.json$/i, '');
}

/**
 * Validate + narrow a parsed sidecar object. Unknown / malformed fields are
 * dropped (never throw on a bad sidecar — a typo shouldn't crash the whole
 * palette). Returns only the fields that are well-formed.
 */
export function coerceSidecar(raw: unknown): SpriteSidecar {
  const out: SpriteSidecar = {};
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  const fp = o.footprint;
  if (fp && typeof fp === 'object') {
    const w = (fp as Record<string, unknown>).w;
    const d = (fp as Record<string, unknown>).d;
    if (typeof w === 'number' && typeof d === 'number' && w > 0 && d > 0) {
      out.footprint = { w, d };
    }
  }
  if (typeof o.widthPx === 'number' && o.widthPx > 0) out.widthPx = o.widthPx;
  if (typeof o.category === 'string' && o.category) out.category = o.category;
  const an = o.anchor;
  if (an && typeof an === 'object') {
    const dx = (an as Record<string, unknown>).dx;
    const dy = (an as Record<string, unknown>).dy;
    if (typeof dx === 'number' && typeof dy === 'number') out.anchor = { dx, dy };
  }
  const intr = o.intrinsic;
  if (intr && typeof intr === 'object') {
    const w = (intr as Record<string, unknown>).w;
    const h = (intr as Record<string, unknown>).h;
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
      out.intrinsic = { w, h };
    }
  }
  return out;
}

/**
 * Resolve one sprite from its grouped raw images + optional sidecar, applying
 * defaults then sidecar overrides. `rawImages` is indexed by orientation (0
 * required, 1–3 optional); `id` is the already-derived kebab id.
 */
export function resolveSprite(
  id: string,
  rawImages: (string | undefined)[],
  sidecar: SpriteSidecar | undefined
): DiscoveredSprite {
  const base = rawImages[0];
  if (!base) throw new Error(`sprite "${id}" has no base (orientation-0) image`);
  const sc = sidecar ?? {};
  return {
    id,
    category: sc.category ?? SPRITE_DEFAULTS.category,
    footprint: sc.footprint ?? { ...SPRITE_DEFAULTS.footprint },
    widthPx: sc.widthPx ?? SPRITE_DEFAULTS.widthPx,
    anchor: sc.anchor ?? { ...SPRITE_DEFAULTS.anchor },
    intrinsic: sc.intrinsic,
    images: [base, rawImages[1], rawImages[2], rawImages[3]],
  };
}

/**
 * Group flat glob maps (png key→dataUri, json key→parsed object) into resolved
 * sprites keyed by kebab id. Deterministic order: sorted by id.
 *
 * A PNG named `foo.oN.png` with no base `foo.png` still produces a sprite —
 * orientation 0 falls back to the lowest available variant so the sprite is
 * never invisible (mirrors spriteAsset's degrade-to-visible philosophy).
 */
export function groupSprites(
  pngs: Record<string, string>,
  jsons: Record<string, unknown>
): DiscoveredSprite[] {
  // base name → { orientation → dataUri }
  const byBase = new Map<string, Map<number, string>>();
  for (const [key, uri] of Object.entries(pngs)) {
    const parsed = parsePngName(basename(key));
    if (!parsed) continue;
    const o = parsed.orientation ?? 0;
    let slot = byBase.get(parsed.base);
    if (!slot) {
      slot = new Map();
      byBase.set(parsed.base, slot);
    }
    // If both `foo.png` and `foo.o0.png` exist, the explicit base (null) wins
    // for slot 0; otherwise first writer wins deterministically via order below.
    if (parsed.orientation === null || !slot.has(o)) slot.set(o, uri);
  }

  // base name → sidecar overrides
  const sidecarByBase = new Map<string, SpriteSidecar>();
  for (const [key, raw] of Object.entries(jsons)) {
    const base = parseJsonName(basename(key));
    if (base === null) continue;
    sidecarByBase.set(base, coerceSidecar(raw));
  }

  const sprites: DiscoveredSprite[] = [];
  for (const [base, slots] of byBase) {
    const id = kebabId(base);
    if (!id) continue; // filename kebab'd to empty — skip
    // orientation-0 fallback: lowest present variant if no explicit base image.
    const lowest = [...slots.keys()].sort((a, b) => a - b)[0];
    const rawImages: (string | undefined)[] = [
      slots.get(0) ?? slots.get(lowest),
      slots.get(1),
      slots.get(2),
      slots.get(3),
    ];
    sprites.push(resolveSprite(id, rawImages, sidecarByBase.get(base)));
  }
  sprites.sort((a, b) => a.id.localeCompare(b.id));
  return sprites;
}

/**
 * Collision policy between hand-registered ids and auto-discovered sprites:
 * HAND-REGISTERED WINS. Returns the auto sprites that survive (no id clash),
 * plus the list of dropped ids so the caller can warn. Deterministic.
 */
export function resolveCollisions(
  autoSprites: DiscoveredSprite[],
  handIds: ReadonlySet<string>
): { kept: DiscoveredSprite[]; dropped: string[] } {
  const kept: DiscoveredSprite[] = [];
  const dropped: string[] = [];
  for (const s of autoSprites) {
    if (handIds.has(s.id)) dropped.push(s.id);
    else kept.push(s);
  }
  return { kept, dropped };
}
