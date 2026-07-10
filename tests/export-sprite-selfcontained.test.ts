// Guards the Task-3 bundle-weight mitigation: sprite PNGs are kept as `?inline`
// base64 data URIs (relocated to a separate build chunk via manualChunks, NOT
// converted to external hashed-URL assets), precisely so the three export paths
// stay self-contained. If someone later switches sprites to URL assets, the
// exported SVG would reference an external file and these assertions fail —
// flagging that the export paths need an inline-at-export step first.

import { describe, it, expect } from 'vitest';
import { getAsset } from '../src/assets/library.ts';
import { buildExportSvg } from '../src/io/export.ts';
import { assembleSvg, computeBBox } from '../src/io/svg-prep.ts';
import { createEmptyDocument, type Entity, type SceneDocument } from '../src/core/model.ts';

const DATA_URI = 'data:image/png;base64,';
// A sprite auto-discovered from src/assets/sprites/. house-small.png ships in-repo.
const SPRITE_ID = 'house-small';

function docWithSprite(): SceneDocument {
  const doc = createEmptyDocument('Sprite export test', '2026-07-10T00:00:00.000Z');
  const entity: Entity = {
    id: 'e1',
    type: 'physical-infra',
    label: 'House',
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: SPRITE_ID },
  };
  return { ...doc, entities: [entity] };
}

describe('sprite export is self-contained (inline data URIs)', () => {
  it('the sprite asset renders an inline PNG data URI, not an external URL', () => {
    const asset = getAsset(SPRITE_ID);
    expect(asset, `sprite "${SPRITE_ID}" should be auto-discovered`).toBeDefined();
    const frag = asset!.render();
    expect(frag).toContain('<image ');
    expect(frag).toContain(DATA_URI);
    // no external href sneaking in (would taint PNG-export canvas + break PDF).
    expect(frag).not.toMatch(/href="(?!data:)[^"]*\.png"/);
  });

  it('assembleSvg keeps the data URI in a standalone export document', () => {
    const frag = getAsset(SPRITE_ID)!.render();
    const svg = assembleSvg(frag, computeBBox(frag));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(DATA_URI);
  });

  it('buildExportSvg embeds the sprite as a self-contained data URI (all 3 export paths share this)', () => {
    const { svg } = buildExportSvg(docWithSprite());
    expect(svg).toContain('<image ');
    expect(svg).toContain(DATA_URI);
    // both href and xlink:href are data URIs (SVG/PNG read href; PDF reads xlink).
    expect(svg).toMatch(/\bhref="data:image\/png;base64,/);
    expect(svg).toMatch(/xlink:href="data:image\/png;base64,/);
    // and nothing points at an external .png file.
    expect(svg).not.toMatch(/href="(?!data:)[^"]*\.png"/);
  });
});
