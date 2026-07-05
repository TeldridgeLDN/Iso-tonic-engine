// File persistence for .iso.json documents.
// Primary path: File System Access API (showSaveFilePicker / showOpenFilePicker),
// keeping the file handle module-level so a plain Save rewrites the same file.
// Fallback (Safari/Firefox, no FSA): Blob download for save, hidden <input
// type=file> for open. Browser-only (uses DOM + browser file APIs).

import type { SceneDocument } from '../core/model.ts';
import { migrate } from '../core/schema.ts';
import { validateDocument } from '../core/schema.ts';
import { kebabCase } from './filename.ts';

// ---------------------------------------------------------------------------
// FSA typings (minimal — the lib DOM lacks these in this TS config).
// ---------------------------------------------------------------------------

interface FileSystemWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  readonly name: string;
  createWritable(): Promise<FileSystemWritable>;
  getFile(): Promise<File>;
}
interface PickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}
interface SavePickerOpts {
  suggestedName?: string;
  types?: PickerAcceptType[];
}
interface OpenPickerOpts {
  types?: PickerAcceptType[];
  multiple?: boolean;
}
type WindowWithFSA = Window & {
  showSaveFilePicker?: (o?: SavePickerOpts) => Promise<FileHandle>;
  showOpenFilePicker?: (o?: OpenPickerOpts) => Promise<FileHandle[]>;
};

const ISO_EXT = '.iso.json';
const PICKER_TYPES: PickerAcceptType[] = [
  { description: 'Iso-tonic map', accept: { 'application/json': [ISO_EXT] } },
];

// Module-level handle so plain Save rewrites the same file.
let currentHandle: FileHandle | null = null;

function fsa(): WindowWithFSA | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithFSA;
  return typeof w.showSaveFilePicker === 'function' &&
    typeof w.showOpenFilePicker === 'function'
    ? w
    : null;
}

/** Filename derived from meta.title, kebab-cased, + `.iso.json`. */
export function fileNameFor(doc: SceneDocument): string {
  const base = kebabCase(doc.meta.title) || 'untitled';
  return `${base}${ISO_EXT}`;
}

/** Pretty-printed 2-space JSON; stamps meta.modified to now (non-mutating). */
function serialise(doc: SceneDocument): { text: string; fileName: string } {
  const stamped: SceneDocument = {
    ...doc,
    meta: { ...doc.meta, modified: new Date().toISOString() },
  };
  return { text: JSON.stringify(stamped, null, 2), fileName: fileNameFor(stamped) };
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'AbortError'
  );
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Save the document. With FSA: plain Save rewrites the retained handle;
 * `saveAs` (or no handle yet) opens a fresh Save picker. Without FSA: Blob
 * download. Returns { fileName } on success, or null if the user cancelled.
 */
export async function saveDocument(
  doc: SceneDocument,
  opts: { saveAs?: boolean } = {}
): Promise<{ fileName: string } | null> {
  const { text, fileName } = serialise(doc);
  const w = fsa();

  if (w) {
    try {
      let handle = currentHandle;
      if (opts.saveAs || handle === null) {
        handle = await w.showSaveFilePicker!({
          suggestedName: fileName,
          types: PICKER_TYPES,
        });
      }
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      currentHandle = handle;
      return { fileName: handle.name };
    } catch (err) {
      if (isAbortError(err)) return null; // user cancelled the picker
      throw err;
    }
  }

  // Fallback: trigger a Blob download.
  downloadBlob(text, fileName, 'application/json');
  return { fileName };
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

/**
 * Open a document via FSA (or fallback file input). Parses → migrates →
 * validates. Throws an Error listing validation errors on invalid content;
 * returns null if the user cancelled (no throw).
 */
export async function openDocument(): Promise<{
  doc: SceneDocument;
  fileName: string;
} | null> {
  const w = fsa();

  if (w) {
    let handle: FileHandle;
    try {
      const handles = await w.showOpenFilePicker!({
        types: PICKER_TYPES,
        multiple: false,
      });
      handle = handles[0];
    } catch (err) {
      if (isAbortError(err)) return null;
      throw err;
    }
    const file = await handle.getFile();
    const text = await file.text();
    const doc = parseAndValidate(text);
    currentHandle = handle; // subsequent plain Saves rewrite this file
    return { doc, fileName: handle.name };
  }

  // Fallback: hidden <input type=file>.
  const picked = await pickFileViaInput();
  if (!picked) return null;
  const text = await picked.text();
  const doc = parseAndValidate(text);
  currentHandle = null; // no handle in fallback mode → Save prompts for a target
  return { doc, fileName: picked.name };
}

/** Parse JSON, migrate, validate. Throws a descriptive Error on failure. */
function parseAndValidate(text: string): SceneDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Not valid JSON: ${msg}`);
  }
  const migrated = migrate(raw);
  const result = validateDocument(migrated);
  if (!result.ok) {
    throw new Error(`Invalid .iso.json:\n- ${result.errors.join('\n- ')}`);
  }
  return result.doc;
}

/** Reset the retained handle (e.g. on New). Exported for the app shell. */
export function resetFileHandle(): void {
  currentHandle = null;
}

// ---------------------------------------------------------------------------
// DOM glue (fallback paths)
// ---------------------------------------------------------------------------

function downloadBlob(data: string, fileName: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick so the download has committed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.iso.json,application/json';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    let settled = false;
    const done = (f: File | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => {
      done(input.files && input.files[0] ? input.files[0] : null);
    });
    // Cancel detection: focus returns to window with no file chosen.
    window.addEventListener(
      'focus',
      () => {
        // Defer: the change event fires slightly after focus on some browsers.
        setTimeout(() => done(null), 500);
      },
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  });
}
