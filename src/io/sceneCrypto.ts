// Shared WebCrypto helpers for the encrypted "My maps" gallery.
// Pure TS, no DOM. Used by BOTH the browser gallery (src/ui/myMaps.ts) and the
// Node authoring script (scripts/encrypt-scenes.ts) — Node 20 exposes the same
// `globalThis.crypto.subtle` as browsers, so one implementation serves both.
//
// Format: each encrypted scene payload is `[iv(12 bytes) | AES-GCM ciphertext]`
// with a 256-bit key derived via PBKDF2 (params published in manifest.json —
// the salt is not secret; the passphrase is).

export interface KdfParams {
  /** Hex-encoded PBKDF2 salt (published in the manifest — not secret). */
  salt: string;
  iterations: number;
  /** Digest name, e.g. 'SHA-256'. */
  hash: string;
}

const IV_BYTES = 12;

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Derive the AES-GCM-256 key from a passphrase + published KDF params. */
export async function deriveKey(passphrase: string, kdf: KdfParams): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: hexToBytes(kdf.salt) as BufferSource,
      iterations: kdf.iterations,
      hash: kdf.hash,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt plaintext bytes → `[iv(12) | ciphertext]` with a fresh random IV. */
export async function encryptScene(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource
  );
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), IV_BYTES);
  return out;
}

/**
 * Decrypt a `[iv(12) | ciphertext]` payload. Throws on GCM auth failure —
 * i.e. wrong passphrase or corrupted file.
 */
export async function decryptScene(key: CryptoKey, payload: Uint8Array): Promise<Uint8Array> {
  if (payload.byteLength <= IV_BYTES) throw new Error('payload too short');
  const iv = payload.subarray(0, IV_BYTES);
  const ct = payload.subarray(IV_BYTES);
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource
  );
  return new Uint8Array(plain);
}
