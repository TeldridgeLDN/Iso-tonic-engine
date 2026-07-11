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

  /** Primary (last-clicked) selected entity id (edit mode), or undefined. */
  selectedId(): string | undefined;
  /** Every selected entity id (edit mode); [] when nothing is selected. */
  selectedIds(): string[];
  /** Programmatically set selection (single entity, or clear). */
  select(id: string | undefined): void;
  /** Subscribe to selection changes; returns an unsubscribe fn. */
  onSelectionChange(listener: () => void): () => void;

  /** Enter placement mode carrying a ghost of the given asset. */
  beginPlacement(req: PlacementRequest): void;
  /** Cancel any active placement mode. */
  cancelPlacement(): void;

  /**
   * Rotate the currently-selected entity one quarter-turn clockwise, with the
   * same collision-rejection feedback as a bad drop. No-op for fixed assets.
   * Shared by the R key and the properties-panel rotate button.
   */
  rotateSelected(): void;

  /**
   * Drag-to-resize arming for the selected zone (properties-panel toggle):
   * while armed, dragging the zone on the map resizes it (no Shift needed).
   * Cleared automatically when the selection changes or the mode flips.
   */
  resizeArmed(): boolean;
  setResizeArmed(on: boolean): void;

  /** Current interaction mode ('edit' | 'present'). Panels adapt to it. */
  getMode(): 'edit' | 'present';
  /**
   * Present-mode: spotlight all entities in a custom layer (layers-panel name
   * click). Toggles off when the same layer is clicked again. No-op in edit.
   */
  spotlightLayer(layerId: string): void;

  /**
   * Replace the entire document with a fresh one (new History), e.g. wizard
   * finish or "Load demo". Rewires subscriptions and refits the camera.
   */
  replaceDocument(doc: SceneDocument): void;
}
