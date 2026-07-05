// localStorage autosave for crash recovery (per docs/SCHEMA.md).
// Key 'isotonic.autosave' holds { doc, timestamp }. All localStorage access is
// guarded (quota / privacy modes throw). checkAutosave never throws — corrupt
// or invalid content → null + console.warn.

import type { SceneDocument } from '../core/model.ts';
import type { History } from '../core/commands.ts';
import { migrate } from '../core/schema.ts';
import { validateDocument } from '../core/schema.ts';

export const AUTOSAVE_KEY = 'isotonic.autosave';
const DEBOUNCE_MS = 800;

interface AutosavePayload {
  doc: SceneDocument;
  timestamp: string;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Accessing localStorage can throw in privacy modes.
    return null;
  }
}

/** Write { doc, timestamp } now, guarded. Exposed for direct/manual saves. */
export function writeAutosave(doc: SceneDocument): void {
  const store = storage();
  if (!store) return;
  const payload: AutosavePayload = { doc, timestamp: new Date().toISOString() };
  try {
    store.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or serialisation failure — autosave is best-effort.
  }
}

/**
 * Subscribe to History changes; debounce ~800ms; persist the current document
 * to localStorage. Returns nothing (the History subscription lives for the app
 * lifetime). Uses window.setTimeout when available, else the global.
 */
export function setupAutosave(history: History): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  history.subscribe((doc: SceneDocument) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      writeAutosave(doc);
    }, DEBOUNCE_MS);
  });
}

/**
 * Read + validate the autosave. Returns { doc, timestamp } when present and
 * valid; null when absent, unreadable, corrupt, or invalid (with a warning).
 * Never throws.
 */
export function checkAutosave(): { doc: SceneDocument; timestamp: string } | null {
  const store = storage();
  if (!store) return null;

  let text: string | null;
  try {
    text = store.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
  if (text === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn('[autosave] corrupt JSON in localStorage — ignoring');
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('doc' in parsed) ||
    !('timestamp' in parsed)
  ) {
    console.warn('[autosave] unexpected shape — ignoring');
    return null;
  }

  const { doc, timestamp } = parsed as { doc: unknown; timestamp: unknown };
  if (typeof timestamp !== 'string') {
    console.warn('[autosave] missing/invalid timestamp — ignoring');
    return null;
  }

  const result = validateDocument(migrate(doc));
  if (!result.ok) {
    console.warn(
      `[autosave] invalid document — ignoring:\n- ${result.errors.join('\n- ')}`
    );
    return null;
  }

  return { doc: result.doc, timestamp };
}

/** Remove the autosave key, guarded. */
export function clearAutosave(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
