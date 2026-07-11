// Guards export self-containment after the sprite migration to hashed asset
// URLs. Sprites now render an EXTERNAL `<image href="/…/x.png">` (the bytes ship
// as a separate cacheable asset, not base64 in the JS bundle). Self-containment
// is restored at export time by inlineImageHrefs — an async post-pass that
// fetches each external image and substitutes a data URI. All three export
// paths (SVG/PNG/PDF) funnel their consumed SVG through this pass, so exercising
// it here with a fake fetcher guards every path. If self-containment ever
// regresses (an external URL survives into the exported document) these
// assertions fail.

import { describe, it, expect } from 'vitest';
import { getAsset } from '../src/assets/library.ts';
import { buildExportSvg } from '../src/io/export.ts';
import { assembleSvg, computeBBox, inlineImageHrefs } from '../src/io/svg-prep.ts';
import { createEmptyDocument, type Entity, type SceneDocument } from '../src/core/model.ts';

const DATA_URI = 'data:image/png;base64,';
// Canned replacement the fake fetcher hands back for any external URL.
const FAKE_PNG = `${DATA_URI}ZmFrZS1wbmc=`;
// A sprite auto-discovered from src/assets/sprites/. house-small.png ships in-repo.
const SPRITE_ID = 'house-small';

/** A fake image resolver: records calls (for dedup checks), returns a data URI. */
function fakeFetcher(): { resolve: (u: string) => Promise<string>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolve: async (url: string): Promise<string> => {
      calls.push(url);
      return FAKE_PNG;
    },
  };
}

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

describe('sprite export is self-contained (inline-at-export pass)', () => {
  it('the sprite asset now renders an EXTERNAL image URL, not an inline data URI', () => {
    const asset = getAsset(SPRITE_ID);
    expect(asset, `sprite "${SPRITE_ID}" should be auto-discovered`).toBeDefined();
    const frag = asset!.render();
    expect(frag).toContain('<image ');
    expect(frag).toMatch(/href="[^"]*\.png"/); // external URL, not base64
    expect(frag).not.toContain(DATA_URI); // NOT inlined at render time
  });

  it('inlineImageHrefs rewrites every external <image> href into a data URI', async () => {
    const frag = getAsset(SPRITE_ID)!.render();
    const svg = assembleSvg(frag, computeBBox(frag));
    // before: an external .png; after: a self-contained data URI.
    expect(svg).toMatch(/href="[^"]*\.png"/);
    const { resolve } = fakeFetcher();
    const inlined = await inlineImageHrefs(svg, resolve);
    expect(inlined).toMatch(/\bhref="data:image\/png;base64,/);
    expect(inlined).toMatch(/xlink:href="data:image\/png;base64,/);
    // and nothing points at an external .png file any more.
    expect(inlined).not.toMatch(/href="(?!data:)[^"]*\.png"/);
  });

  it('buildExportSvg + inline pass yields a self-contained document (shared by all 3 export paths)', async () => {
    const { svg } = buildExportSvg(docWithSprite());
    // buildExportSvg stays pure/sync and references the external asset URL…
    expect(svg).toContain('<image ');
    expect(svg).toMatch(/href="[^"]*\.png"/);
    // …the async inline pass (as wired into exportSVG/PNG/PDF) makes it self-contained.
    const { resolve, calls } = fakeFetcher();
    const inlined = await inlineImageHrefs(svg, resolve);
    expect(inlined).toMatch(/\bhref="data:image\/png;base64,/);
    expect(inlined).toMatch(/xlink:href="data:image\/png;base64,/);
    expect(inlined).not.toMatch(/href="(?!data:)[^"]*\.png"/);
    // De-duplicated: the single sprite's href + xlink:href share one URL → one fetch.
    expect(new Set(calls).size).toBe(1);
    expect(calls.length).toBe(1);
  });

  it('a failed fetch leaves the URL in place (degraded export beats a thrown one)', async () => {
    const { svg } = buildExportSvg(docWithSprite());
    const failing = async (): Promise<string | null> => null; // resolver reports failure
    const out = await inlineImageHrefs(svg, failing);
    expect(out).toBe(svg); // unchanged, no throw
    expect(out).toMatch(/href="[^"]*\.png"/); // external URL still present
  });

  it('a throwing fetch is swallowed, leaving the URL in place', async () => {
    const { svg } = buildExportSvg(docWithSprite());
    const throwing = async (): Promise<string> => {
      throw new Error('network down');
    };
    const out = await inlineImageHrefs(svg, throwing);
    expect(out).toBe(svg);
  });
});
