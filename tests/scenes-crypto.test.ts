// Round-trip tests for the "My maps" scene crypto (src/io/sceneCrypto.ts).
// Runs in plain Node — Node 20's globalThis.crypto.subtle matches the browser.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  decryptScene,
  deriveKey,
  encryptScene,
  hexToBytes,
  type KdfParams,
} from '../src/io/sceneCrypto.ts';

// Realistic KDF params, but a low iteration count so the suite stays fast —
// derivation correctness is independent of the count.
const KDF: KdfParams = {
  salt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  iterations: 1000,
  hash: 'SHA-256',
};

describe('sceneCrypto hex codecs', () => {
  it('round-trips bytes → hex → bytes', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 255]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('rejects invalid hex', () => {
    expect(() => hexToBytes('abc')).toThrow(); // odd length
    expect(() => hexToBytes('zz')).toThrow(); // non-hex chars
  });
});

describe('sceneCrypto encrypt/decrypt', () => {
  it('round-trips a real scene document (deep-equal)', async () => {
    const raw = readFileSync(
      join(__dirname, '..', 'examples', 'the-corner-grind.iso.json'),
      'utf8'
    );
    const key = await deriveKey('correct horse battery staple', KDF);

    const payload = await encryptScene(key, new TextEncoder().encode(raw));
    // [iv(12) | ciphertext] — strictly longer than the plaintext.
    expect(payload.byteLength).toBeGreaterThan(raw.length + 12);

    const plain = await decryptScene(key, payload);
    const roundTripped = JSON.parse(new TextDecoder().decode(plain));
    expect(roundTripped).toEqual(JSON.parse(raw));
  });

  it('produces a different payload per call (fresh random IV)', async () => {
    const key = await deriveKey('pass', KDF);
    const msg = new TextEncoder().encode('{"v":1}');
    const a = await encryptScene(key, msg);
    const b = await encryptScene(key, msg);
    expect(bytesToHex(a)).not.toEqual(bytesToHex(b));
  });

  it('rejects a wrong passphrase (GCM auth failure)', async () => {
    const goodKey = await deriveKey('right passphrase', KDF);
    const badKey = await deriveKey('wrong passphrase', KDF);
    const payload = await encryptScene(goodKey, new TextEncoder().encode('{"v":1}'));
    await expect(decryptScene(badKey, payload)).rejects.toThrow();
  });

  it('rejects a truncated payload', async () => {
    const key = await deriveKey('pass', KDF);
    await expect(decryptScene(key, new Uint8Array(5))).rejects.toThrow();
  });
});
