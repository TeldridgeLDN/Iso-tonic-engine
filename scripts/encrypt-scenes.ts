// encrypt-scenes — publish private .iso.json maps as ciphertext.
//
//   SCENES_PASSPHRASE='…' npm run encrypt-scenes
//
// Reads every private/scenes/*.iso.json (plaintext, gitignored), encrypts each
// with AES-GCM-256 (key: PBKDF2 from SCENES_PASSPHRASE) and writes:
//   public/maps/<name>.iso.json.enc   — [iv(12) | ciphertext], committed
//   public/maps/manifest.json         — gallery index + published KDF params
//
// The salt/iterations in the manifest are NOT secret; only the passphrase is.
// An existing manifest's salt is reused so previously-derived keys stay valid;
// delete public/maps/manifest.json to rotate the salt (then re-run).
//
// The crypto itself is the same src/io/sceneCrypto.ts module the browser
// gallery (src/ui/myMaps.ts) uses — Node 20's globalThis.crypto.subtle.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bytesToHex,
  deriveKey,
  encryptScene,
  type KdfParams,
} from '../src/io/sceneCrypto.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const SCENES_DIR = join(REPO, 'private', 'scenes');
const OUT_DIR = join(REPO, 'public', 'maps');
const MANIFEST = join(OUT_DIR, 'manifest.json');

const ITERATIONS = 200_000;
const HASH = 'SHA-256';

interface MapEntry {
  id: string;
  title: string;
  file: string;
}

interface Manifest {
  v: number;
  kdf: KdfParams;
  maps: MapEntry[];
}

async function main(): Promise<void> {
  const passphrase = process.env.SCENES_PASSPHRASE;
  if (!passphrase) {
    console.error('SCENES_PASSPHRASE env var is required.');
    process.exit(1);
  }

  if (!existsSync(SCENES_DIR)) {
    console.error(`No scenes directory at ${SCENES_DIR} — nothing to encrypt.`);
    process.exit(1);
  }
  const files = readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith('.iso.json'))
    .sort();
  if (files.length === 0) {
    console.error(`No *.iso.json files in ${SCENES_DIR} — nothing to encrypt.`);
    process.exit(1);
  }

  // Reuse an existing manifest's salt (keeps cached keys valid across runs);
  // generate a fresh random 16-byte salt for a brand-new gallery.
  let salt: string;
  if (existsSync(MANIFEST)) {
    const prev = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    salt = prev.kdf.salt;
    console.log(`Reusing existing manifest salt (${salt.slice(0, 8)}…).`);
  } else {
    salt = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
    console.log('Generated fresh manifest salt.');
  }

  const kdf: KdfParams = { salt, iterations: ITERATIONS, hash: HASH };
  const key = await deriveKey(passphrase, kdf);

  mkdirSync(OUT_DIR, { recursive: true });
  const maps: MapEntry[] = [];
  for (const file of files) {
    const plaintext = readFileSync(join(SCENES_DIR, file));
    // Title from the document itself; id from the filename stem.
    const id = file.replace(/\.iso\.json$/, '');
    let title = id;
    try {
      const doc = JSON.parse(plaintext.toString('utf8')) as {
        meta?: { title?: string };
      };
      if (typeof doc.meta?.title === 'string' && doc.meta.title.trim()) {
        title = doc.meta.title;
      }
    } catch {
      console.warn(`  ! ${file}: not valid JSON — using filename as title.`);
    }

    const encName = `${file}.enc`;
    const payload = await encryptScene(key, new Uint8Array(plaintext));
    writeFileSync(join(OUT_DIR, encName), payload);
    maps.push({ id, title, file: encName });
    console.log(`  ✓ ${file} → public/maps/${encName} (${payload.byteLength} bytes)`);
  }

  const manifest: Manifest = { v: 1, kdf, maps };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote manifest with ${maps.length} map(s) → public/maps/manifest.json`);
}

void main();
