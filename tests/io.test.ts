import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kebabCase } from '../src/io/filename.ts';
import {
  stripEditorOnly,
  computeBBox,
  assembleSvg,
  assembleSvgWithMeta,
  metadataBlock,
  exportDimensions,
  parseTranslate,
  parsePointsAttr,
  parsePathCoords,
  EXPORT_MARGIN,
} from '../src/io/svg-prep.ts';
import { buildExportSvg } from '../src/io/export.ts';
import { fileNameFor } from '../src/io/persistence.ts';
import {
  setupAutosave,
  checkAutosave,
  clearAutosave,
  writeAutosave,
  AUTOSAVE_KEY,
} from '../src/io/autosave.ts';
import { History } from '../src/core/commands.ts';
import { createEmptyDocument } from '../src/core/model.ts';
import type { SceneDocument } from '../src/core/model.ts';

// ---------------------------------------------------------------------------
// filename derivation
// ---------------------------------------------------------------------------

describe('kebabCase', () => {
  it('lowercases and dashes spaces', () => {
    expect(kebabCase('Demo Service Map')).toBe('demo-service-map');
  });

  it('collapses non-alphanumeric runs and trims dashes', () => {
    expect(kebabCase('  Ops // Logistics (2026)!!  ')).toBe('ops-logistics-2026');
  });

  it('folds diacritics to ASCII', () => {
    expect(kebabCase('Café Résumé')).toBe('cafe-resume');
  });

  it('returns empty string for dash/symbol-only input (caller supplies fallback)', () => {
    expect(kebabCase('---  ///  ')).toBe('');
    expect(kebabCase('!!!')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// pure coordinate parsers
// ---------------------------------------------------------------------------

describe('coordinate parsers', () => {
  it('parseTranslate reads translate(dx dy) and translate(dx,dy)', () => {
    expect(parseTranslate('transform="translate(10 20)"')).toEqual({ x: 10, y: 20 });
    expect(parseTranslate('transform="translate(-5,3.5)"')).toEqual({ x: -5, y: 3.5 });
    expect(parseTranslate('transform="translate(7)"')).toEqual({ x: 7, y: 0 });
    expect(parseTranslate('fill="none"')).toEqual({ x: 0, y: 0 });
  });

  it('parsePointsAttr yields x,y pairs', () => {
    expect(parsePointsAttr('points="0,0 32,16 0,32"')).toEqual([
      { x: 0, y: 0 },
      { x: 32, y: 16 },
      { x: 0, y: 32 },
    ]);
  });

  it('parsePathCoords reads number pairs from d', () => {
    expect(parsePathCoords('M0 0 L10 20 L-4 8 Z')).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: -4, y: 8 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// editor-only stripping
// ---------------------------------------------------------------------------

describe('stripEditorOnly', () => {
  it('removes a data-editor-only group and its contents', () => {
    const svg =
      '<g data-scene><polygon points="0,0"/></g>' +
      '<g data-editor-only="true"><circle cx="1" cy="1" r="1"/></g>';
    const out = stripEditorOnly(svg);
    expect(out).toContain('polygon');
    expect(out).not.toContain('data-editor-only');
    expect(out).not.toContain('circle');
  });

  it('handles nested groups inside the editor-only layer', () => {
    const svg =
      'A<g data-editor-only="true"><g><circle/></g><g><rect/></g></g>B';
    expect(stripEditorOnly(svg)).toBe('AB');
  });

  it('is a no-op when no editor-only content present', () => {
    const svg = '<g data-entity-id="x"><polygon points="0,0 1,1"/></g>';
    expect(stripEditorOnly(svg)).toBe(svg);
  });

  it('removes multiple editor-only groups', () => {
    const svg =
      '<g data-editor-only="true"><rect/></g>KEEP<g data-editor-only="true"><rect/></g>';
    expect(stripEditorOnly(svg)).toBe('KEEP');
  });
});

// ---------------------------------------------------------------------------
// bbox maths
// ---------------------------------------------------------------------------

describe('computeBBox', () => {
  it('returns null for coordinate-free / empty input', () => {
    expect(computeBBox('')).toBeNull();
    expect(computeBBox('<g></g>')).toBeNull();
  });

  it('bounds a polygon', () => {
    const b = computeBBox('<polygon points="0,0 32,16 0,32 -32,16"/>');
    expect(b).toEqual({ minX: -32, minY: 0, maxX: 32, maxY: 32 });
  });

  it('applies a group translate offset to child coordinates', () => {
    const svg = '<g transform="translate(100 50)"><polygon points="0,0 10,10"/></g>';
    expect(computeBBox(svg)).toEqual({ minX: 100, minY: 50, maxX: 110, maxY: 60 });
  });

  it('accumulates nested translates', () => {
    const svg =
      '<g transform="translate(100 0)"><g transform="translate(0 40)">' +
      '<line x1="0" y1="0" x2="5" y2="5"/></g></g>';
    expect(computeBBox(svg)).toEqual({ minX: 100, minY: 40, maxX: 105, maxY: 45 });
  });

  it('bounds circles by centre ± radius', () => {
    expect(computeBBox('<circle cx="10" cy="10" r="4"/>')).toEqual({
      minX: 6,
      minY: 6,
      maxX: 14,
      maxY: 14,
    });
  });

  it('bounds rect by x,y and x+w,y+h', () => {
    expect(computeBBox('<rect x="2" y="3" width="6" height="8"/>')).toEqual({
      minX: 2,
      minY: 3,
      maxX: 8,
      maxY: 11,
    });
  });

  it('unions across multiple elements and sibling groups', () => {
    const svg =
      '<g transform="translate(0 0)"><polygon points="-32,16 0,0"/></g>' +
      '<g transform="translate(60 60)"><circle cx="0" cy="0" r="2"/></g>';
    expect(computeBBox(svg)).toEqual({ minX: -32, minY: 0, maxX: 62, maxY: 62 });
  });
});

// ---------------------------------------------------------------------------
// SVG assembly
// ---------------------------------------------------------------------------

describe('assembleSvg / exportDimensions', () => {
  it('pads viewBox by EXPORT_MARGIN and adds white bg + xmlns', () => {
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    const svg = assembleSvg('<polygon points="0,0"/>', bbox);
    const m = EXPORT_MARGIN;
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`viewBox="${-m} ${-m} ${100 + 2 * m} ${50 + 2 * m}"`);
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('<polygon points="0,0"/>');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('exportDimensions = bbox size + 2×margin', () => {
    const dims = exportDimensions({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
    expect(dims).toEqual({ width: 100 + 2 * EXPORT_MARGIN, height: 50 + 2 * EXPORT_MARGIN });
  });

  it('degrades gracefully for a null bbox (empty scene)', () => {
    const svg = assembleSvg('', null);
    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#FFFFFF"');
  });
});

// ---------------------------------------------------------------------------
// accessibility metadata + legend-aware assembly
// ---------------------------------------------------------------------------

describe('metadataBlock', () => {
  it('emits title/desc and XML-escapes their text', () => {
    const block = metadataBlock('A & B <x>', 'desc > "q"');
    expect(block).toBe('<title>A &amp; B &lt;x&gt;</title><desc>desc &gt; "q"</desc>');
  });

  it('emits empty elements for empty strings (stable order for AT)', () => {
    expect(metadataBlock('', '')).toBe('<title></title><desc></desc>');
  });
});

describe('assembleSvgWithMeta', () => {
  it('injects title/desc as the first children, before the bg and fragment', () => {
    const bbox = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const svg = assembleSvgWithMeta('<polygon points="0,0"/>', bbox, {
      title: 'My map',
      desc: 'Two nodes',
    });
    const titleIdx = svg.indexOf('<title>My map</title>');
    const rectIdx = svg.indexOf('<rect');
    const fragIdx = svg.indexOf('<polygon');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeLessThan(rectIdx);
    expect(rectIdx).toBeLessThan(fragIdx);
  });

  it('drives the viewBox from extendedBBox when supplied (legend never cropped)', () => {
    const bbox = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const extendedBBox = { minX: 0, minY: 0, maxX: 100, maxY: 10 };
    const svg = assembleSvgWithMeta('<polygon points="0,0"/>', bbox, {
      extendedBBox,
      legendFragment: '<g id="legend"></g>',
    });
    const m = EXPORT_MARGIN;
    expect(svg).toContain(`viewBox="${-m} ${-m} ${100 + 2 * m} ${10 + 2 * m}"`);
    // legend fragment is drawn last, after the scene fragment.
    expect(svg.indexOf('<polygon')).toBeLessThan(svg.indexOf('<g id="legend">'));
  });

  it('degrades gracefully for a null bbox', () => {
    const svg = assembleSvgWithMeta('', null, { title: 't', desc: 'd' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<title>t</title>');
    expect(svg).toContain('fill="#FFFFFF"');
  });
});

// ---------------------------------------------------------------------------
// buildExportSvg — end-to-end pure prep (render → strip → bbox → assemble).
// Exercises the real renderer; no canvas / jsPDF (those live in exportPNG/PDF).
// ---------------------------------------------------------------------------

function docWithNode(): SceneDocument {
  const doc = createEmptyDocument('Export Me', '2026-07-05T00:00:00.000Z');
  return {
    ...doc,
    entities: [
      {
        id: 'n1',
        type: 'territory',
        label: 'Node One',
        placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
        asset: { symbol: 'server-rack' },
      },
    ],
  };
}

describe('buildExportSvg', () => {
  it('produces a self-contained SVG with title/desc metadata and a bbox', () => {
    const { svg, bbox, width, height } = buildExportSvg(docWithNode());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<title>Export Me</title>');
    expect(svg).toContain('<desc>');
    expect(bbox).not.toBeNull();
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('strips editor-only content from the exported SVG', () => {
    const { svg } = buildExportSvg(docWithNode());
    expect(svg).not.toContain('data-editor-only');
  });

  it('falls back to "Untitled map" title when meta.title is empty', () => {
    const doc = { ...docWithNode(), meta: { ...docWithNode().meta, title: '' } };
    const { svg } = buildExportSvg(doc);
    expect(svg).toContain('<title>Untitled map</title>');
  });

  it('legend option grows the export dimensions (panel kept inside viewBox)', () => {
    const doc = docWithNode();
    const plain = buildExportSvg(doc);
    const withLegend = buildExportSvg(doc, { legend: true });
    expect(withLegend.width).toBeGreaterThan(plain.width);
  });
});

// ---------------------------------------------------------------------------
// persistence filename derivation (pure)
// ---------------------------------------------------------------------------

describe('fileNameFor', () => {
  it('kebab-cases the title and appends .iso.json', () => {
    const doc = createEmptyDocument('Demo Service Map', '2026-07-05T00:00:00.000Z');
    expect(fileNameFor(doc)).toBe('demo-service-map.iso.json');
  });

  it('falls back to "untitled" for a symbol-only / empty title', () => {
    const doc = createEmptyDocument('!!!', '2026-07-05T00:00:00.000Z');
    expect(fileNameFor(doc)).toBe('untitled.iso.json');
  });
});

// ---------------------------------------------------------------------------
// autosave round-trip (mocked localStorage + fake History + fake timers)
// ---------------------------------------------------------------------------

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  clear(): void {
    this.map.clear();
  }
}

function validDoc(title = 'Autosave Doc'): SceneDocument {
  return createEmptyDocument(title, '2026-07-05T00:00:00.000Z');
}

describe('autosave', () => {
  let store: MemoryStorage;

  beforeEach(() => {
    store = new MemoryStorage();
    vi.stubGlobal('localStorage', store);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('writeAutosave + checkAutosave round-trips a valid document', () => {
    const doc = validDoc('Round Trip');
    writeAutosave(doc);
    const got = checkAutosave();
    expect(got).not.toBeNull();
    expect(got?.doc.meta.title).toBe('Round Trip');
    expect(typeof got?.timestamp).toBe('string');
  });

  it('setupAutosave debounces and persists on History change', () => {
    const history = new History(validDoc('Debounced'));
    setupAutosave(history);

    // Fire a change through the real History subscribe path.
    history.execute({
      label: 'noop',
      apply: (d) => ({ ...d, meta: { ...d.meta, title: 'Changed' } }),
      invert: (d) => d,
    });

    // Nothing written before the debounce window elapses.
    expect(store.getItem(AUTOSAVE_KEY)).toBeNull();

    vi.advanceTimersByTime(800);

    const got = checkAutosave();
    expect(got?.doc.meta.title).toBe('Changed');
  });

  it('only writes once for rapid successive changes (debounce collapse)', () => {
    const history = new History(validDoc());
    const spy = vi.spyOn(store, 'setItem');
    setupAutosave(history);

    for (let i = 0; i < 5; i++) {
      history.execute({
        label: 'noop',
        apply: (d) => ({ ...d, meta: { ...d.meta, title: `v${i}` } }),
        invert: (d) => d,
      });
      vi.advanceTimersByTime(100); // < 800ms between changes
    }
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('checkAutosave returns null and warns on corrupt JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.setItem(AUTOSAVE_KEY, '{not json');
    expect(checkAutosave()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('checkAutosave returns null and warns on invalid document', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ doc: { version: 2 }, timestamp: 'x' })
    );
    expect(checkAutosave()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('checkAutosave returns null (no warn) when key absent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(checkAutosave()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('clearAutosave removes the key', () => {
    writeAutosave(validDoc());
    expect(store.getItem(AUTOSAVE_KEY)).not.toBeNull();
    clearAutosave();
    expect(store.getItem(AUTOSAVE_KEY)).toBeNull();
  });
});
