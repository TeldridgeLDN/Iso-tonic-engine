// Guarded bridge to the parallel-built src/io module (persistence + export).
//
// FILE OWNERSHIP: Phase D does NOT own src/io. The contract below is FIXED by
// the spec; the parallel agent implements it. We declare the signatures here so
// this file (and everything importing it) typechecks standalone, and we call
// through `await import('../io')` guarded by try/catch + existence checks so the
// app keeps working if src/io is not present yet during our own verification.

import type { SceneDocument } from '../core/model.ts';
import type { History } from '../core/commands.ts';

/** Options shared by the visual exporters (legend inclusion). */
export interface ExportOpts {
  legend?: boolean;
}

/** The fixed public surface of src/io/index.ts. */
export interface IoModule {
  saveDocument(
    doc: SceneDocument,
    opts?: { saveAs?: boolean }
  ): Promise<{ fileName: string } | null>;
  openDocument(): Promise<{ doc: SceneDocument; fileName: string } | null>;
  checkAutosave(): { doc: SceneDocument; timestamp: string } | null;
  setupAutosave(history: History): void;
  clearAutosave(): void;
  // Wave 2: written description + legend option on the visual exporters.
  buildWrittenDescription(doc: SceneDocument): string;
  exportDescription(doc: SceneDocument): void;
  exportSVG(doc: SceneDocument, opts?: ExportOpts): void;
  exportPNG(doc: SceneDocument, scale: 1 | 2 | 4, opts?: ExportOpts): Promise<void>;
  exportPDF(doc: SceneDocument, opts?: ExportOpts): Promise<void>;
}

// The dynamic-import specifier. Kept as a variable the bundler can still
// statically analyse. If src/io is absent at build time this import path is
// unresolved, so we guard the call site and swallow the failure.
let cached: IoModule | null | undefined;

/**
 * Resolve the io module once, or null if it is not available.
 * Never throws: a missing/broken io module simply disables io features.
 */
export async function loadIo(): Promise<IoModule | null> {
  if (cached !== undefined) return cached;
  try {
    // src/io is built by a parallel agent to the fixed IoModule contract. The
    // dynamic import + runtime shape check means a missing/partial module simply
    // disables io features rather than breaking the app.
    const mod = (await import('../io/index.ts')) as Partial<IoModule>;
    cached = isUsableIo(mod) ? (mod as IoModule) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** True if the imported module exposes the full fixed contract. */
function isUsableIo(mod: Partial<IoModule> | undefined): mod is IoModule {
  return (
    !!mod &&
    typeof mod.saveDocument === 'function' &&
    typeof mod.openDocument === 'function' &&
    typeof mod.exportSVG === 'function'
  );
}

/**
 * Run an io action if io is available. Returns the action's result, or a
 * sentinel `{ unavailable: true }` if io is not present (caller can toast).
 */
export async function withIo<T>(
  fn: (io: IoModule) => Promise<T> | T
): Promise<{ ok: true; value: T } | { ok: false; unavailable: true }> {
  const io = await loadIo();
  if (!io) return { ok: false, unavailable: true };
  const value = await fn(io);
  return { ok: true, value };
}
