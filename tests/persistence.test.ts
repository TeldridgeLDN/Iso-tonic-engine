import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveDocument,
  openDocument,
  resetFileHandle,
} from '../src/io/persistence.ts';
import { createEmptyDocument } from '../src/core/model.ts';
import type { SceneDocument } from '../src/core/model.ts';

// The File System Access API is mocked with in-memory fakes so we exercise the
// module's DECISION logic (plain-Save reuses the retained handle, Save-As opens
// a fresh picker, AbortError → null, Open parses/migrates/validates and retains
// its handle), not the browser APIs themselves. Runs under vitest's node env,
// so `window` is stubbed for the duration of each test.

class FakeWritable {
  constructor(private readonly handle: FakeHandle) {}
  async write(data: string): Promise<void> {
    this.handle.contents = data;
  }
  async close(): Promise<void> {}
}

class FakeHandle {
  contents = '';
  constructor(public readonly name: string) {}
  async createWritable(): Promise<FakeWritable> {
    return new FakeWritable(this);
  }
  async getFile(): Promise<{ text: () => Promise<string> }> {
    return { text: async () => this.contents };
  }
}

function abortError(): Error {
  const err = new Error('user cancelled');
  err.name = 'AbortError';
  return err;
}

function validDoc(title = 'Persist Doc'): SceneDocument {
  return createEmptyDocument(title, '2026-07-05T00:00:00.000Z');
}

interface FsaWindow {
  showSaveFilePicker: ReturnType<typeof vi.fn>;
  showOpenFilePicker: ReturnType<typeof vi.fn>;
}

function stubFsaWindow(): FsaWindow {
  const w: FsaWindow = {
    showSaveFilePicker: vi.fn(),
    showOpenFilePicker: vi.fn(),
  };
  vi.stubGlobal('window', w);
  return w;
}

describe('saveDocument (FSA)', () => {
  beforeEach(() => resetFileHandle());
  afterEach(() => vi.unstubAllGlobals());

  it('opens a save picker on first save and writes the serialised document', async () => {
    const w = stubFsaWindow();
    const handle = new FakeHandle('my-map.iso.json');
    w.showSaveFilePicker.mockResolvedValue(handle);

    const res = await saveDocument(validDoc('My Map'));
    expect(res).toEqual({ fileName: 'my-map.iso.json' });
    expect(w.showSaveFilePicker).toHaveBeenCalledTimes(1);
    // Written text is valid JSON carrying the title.
    const parsed = JSON.parse(handle.contents) as SceneDocument;
    expect(parsed.meta.title).toBe('My Map');
  });

  it('stamps meta.modified to now on save (non-mutating on the source doc)', async () => {
    const w = stubFsaWindow();
    const handle = new FakeHandle('x.iso.json');
    w.showSaveFilePicker.mockResolvedValue(handle);

    const doc = validDoc();
    const before = doc.meta.modified;
    await saveDocument(doc);
    const parsed = JSON.parse(handle.contents) as SceneDocument;
    expect(parsed.meta.modified).not.toBe(''); // freshly stamped ISO string
    expect(doc.meta.modified).toBe(before); // source doc untouched
  });

  it('plain Save reuses the retained handle without re-prompting', async () => {
    const w = stubFsaWindow();
    const handle = new FakeHandle('kept.iso.json');
    w.showSaveFilePicker.mockResolvedValue(handle);

    await saveDocument(validDoc()); // establishes the handle
    await saveDocument(validDoc('Second')); // plain save
    expect(w.showSaveFilePicker).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(handle.contents) as SceneDocument;
    expect(parsed.meta.title).toBe('Second');
  });

  it('Save-As re-prompts even when a handle is retained', async () => {
    const w = stubFsaWindow();
    const first = new FakeHandle('first.iso.json');
    const second = new FakeHandle('second.iso.json');
    w.showSaveFilePicker.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await saveDocument(validDoc());
    const res = await saveDocument(validDoc(), { saveAs: true });
    expect(w.showSaveFilePicker).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ fileName: 'second.iso.json' });
  });

  it('returns null when the user cancels the picker (AbortError)', async () => {
    const w = stubFsaWindow();
    w.showSaveFilePicker.mockRejectedValue(abortError());
    expect(await saveDocument(validDoc())).toBeNull();
  });

  it('rethrows non-abort errors', async () => {
    const w = stubFsaWindow();
    w.showSaveFilePicker.mockRejectedValue(new Error('disk full'));
    await expect(saveDocument(validDoc())).rejects.toThrow('disk full');
  });
});

describe('openDocument (FSA)', () => {
  beforeEach(() => resetFileHandle());
  afterEach(() => vi.unstubAllGlobals());

  it('parses, migrates and validates a picked file, returning doc + name', async () => {
    const w = stubFsaWindow();
    const handle = new FakeHandle('loaded.iso.json');
    handle.contents = JSON.stringify(validDoc('Loaded Map'));
    w.showOpenFilePicker.mockResolvedValue([handle]);

    const res = await openDocument();
    expect(res?.fileName).toBe('loaded.iso.json');
    expect(res?.doc.meta.title).toBe('Loaded Map');
  });

  it('retains the opened handle so a later plain Save rewrites the same file', async () => {
    const w = stubFsaWindow();
    const openHandle = new FakeHandle('same.iso.json');
    openHandle.contents = JSON.stringify(validDoc('Original'));
    w.showOpenFilePicker.mockResolvedValue([openHandle]);
    await openDocument();

    // A plain save must NOT open a save picker — it reuses the opened handle.
    await saveDocument(validDoc('Edited'));
    expect(w.showSaveFilePicker).not.toHaveBeenCalled();
    const parsed = JSON.parse(openHandle.contents) as SceneDocument;
    expect(parsed.meta.title).toBe('Edited');
  });

  it('returns null when the user cancels the open picker (AbortError)', async () => {
    const w = stubFsaWindow();
    w.showOpenFilePicker.mockRejectedValue(abortError());
    expect(await openDocument()).toBeNull();
  });

  it('throws a descriptive error on non-JSON file contents', async () => {
    const w = stubFsaWindow();
    const handle = new FakeHandle('bad.iso.json');
    handle.contents = '{ not json';
    w.showOpenFilePicker.mockResolvedValue([handle]);
    await expect(openDocument()).rejects.toThrow(/Not valid JSON/);
  });

  it('throws listing validation errors on a schema-invalid document', async () => {
    const w = stubFsaWindow();
    const handle = new FakeHandle('invalid.iso.json');
    handle.contents = JSON.stringify({ version: 1, meta: {}, entities: 'nope' });
    w.showOpenFilePicker.mockResolvedValue([handle]);
    await expect(openDocument()).rejects.toThrow(/Invalid \.iso\.json/);
  });
});
