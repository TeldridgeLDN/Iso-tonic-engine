// "My maps" private gallery (edit page only). Fetches the published manifest
// of AES-GCM-encrypted scenes from public/maps/, prompts for the passphrase
// once (derived key cached for the session), decrypts the chosen scene and
// adopts it via the normal validate → replaceDocument path. Lazy-imported by
// the toolbar so the public viewer bundle never pulls it in.

import type { SceneDocument } from '../core/model.ts';
import { migrate, validateDocument } from '../core/schema.ts';
import { decryptScene, deriveKey, type KdfParams } from '../io/sceneCrypto.ts';

export interface MapEntry {
  id: string;
  title: string;
  file: string;
}

export interface MapsManifest {
  v: number;
  kdf: KdfParams;
  maps: MapEntry[];
}

export interface MyMapsHooks {
  onOpened(doc: SceneDocument): void;
  notify(message: string): void;
}

const mapsUrl = (file: string): string => `${import.meta.env.BASE_URL}maps/${file}`;

/**
 * Fetch + shape-check the gallery manifest. Returns null on any failure
 * (missing file, bad JSON, empty gallery) — callers hide the UI then.
 */
export async function fetchManifest(): Promise<MapsManifest | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}maps/manifest.json`);
    if (!res.ok) return null;
    const raw = (await res.json()) as Partial<MapsManifest> | null;
    if (
      !raw ||
      typeof raw.kdf?.salt !== 'string' ||
      typeof raw.kdf.iterations !== 'number' ||
      typeof raw.kdf.hash !== 'string' ||
      !Array.isArray(raw.maps) ||
      raw.maps.length === 0
    ) {
      return null;
    }
    return raw as MapsManifest;
  } catch {
    return null;
  }
}

// Passphrase-derived key, cached for the session after the first prompt.
let cachedKey: CryptoKey | null = null;

async function ensureKey(kdf: KdfParams): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  const pass = window.prompt('My maps passphrase:');
  if (!pass) return null; // cancelled
  cachedKey = await deriveKey(pass, kdf);
  return cachedKey;
}

/** Fetch, decrypt, validate, and adopt one gallery map. */
export async function openMap(
  manifest: MapsManifest,
  map: MapEntry,
  hooks: MyMapsHooks
): Promise<void> {
  const key = await ensureKey(manifest.kdf);
  if (!key) return;

  let payload: Uint8Array;
  try {
    const res = await fetch(mapsUrl(map.file));
    if (!res.ok) throw new Error(String(res.status));
    payload = new Uint8Array(await res.arrayBuffer());
  } catch {
    hooks.notify(`Could not fetch "${map.title}".`);
    return;
  }

  let plaintext: Uint8Array;
  try {
    plaintext = await decryptScene(key, payload);
  } catch {
    // GCM auth failure — almost always a wrong passphrase. Drop the cached
    // key so the next attempt prompts again.
    cachedKey = null;
    hooks.notify('Decryption failed — wrong passphrase?');
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    hooks.notify(`"${map.title}" decrypted but is not valid JSON.`);
    return;
  }

  const result = validateDocument(migrate(raw));
  if (!result.ok) {
    hooks.notify(`"${map.title}" failed validation: ${result.errors[0] ?? 'unknown error'}`);
    return;
  }
  hooks.onOpened(result.doc);
  hooks.notify(`Loaded ${map.title}`);
}
