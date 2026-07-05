// The surface the App exposes to Phase D panels. Panels are decoupled from the
// App class through this interface: they read the document, subscribe to change,
// drive selection, enter placement mode, and reset the document (wizard finish).

import type { SceneDocument } from '../core/model.ts';
import type { History } from '../core/commands.ts';

export interface PlacementRequest {
  /** Asset registry id to place. */
  assetId: string;
  /** Entity type the placed entity should get (from the palette category). */
  entityType: SceneDocument['entities'][number]['type'];
  /** Human label for the asset, used to seed the entity label. */
  assetLabel: string;
}

export interface AppContext {
  /** Live history (panels dispatch commands through it). */
  readonly history: History;
  /** The current document. */
  document(): SceneDocument;
  /** Subscribe to any document change; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;

  /** Currently-selected entity id (edit mode), or undefined. */
  selectedId(): string | undefined;
  /** Programmatically set selection. */
  select(id: string | undefined): void;
  /** Subscribe to selection changes; returns an unsubscribe fn. */
  onSelectionChange(listener: () => void): () => void;

  /** Enter placement mode carrying a ghost of the given asset. */
  beginPlacement(req: PlacementRequest): void;
  /** Cancel any active placement mode. */
  cancelPlacement(): void;

  /**
   * Replace the entire document with a fresh one (new History), e.g. wizard
   * finish or "Load demo". Rewires subscriptions and refits the camera.
   */
  replaceDocument(doc: SceneDocument): void;
}
