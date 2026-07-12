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
   * Swap-sprite mode: arm the given (swappable) entity so the NEXT palette
   * click replaces its asset instead of starting a placement. Cancelled by Esc,
   * by selecting a different entity, or by a completed swap.
   */
  beginAssetSwap(entityId: string): void;
  /** Cancel armed swap mode (no-op if not armed). */
  cancelAssetSwap(): void;
  /** True while swap mode is armed (palette routes clicks to performSwap). */
  isSwapArmed(): boolean;
  /**
   * Perform the armed swap onto the given palette asset id. Rejects (with a
   * hint) an incompatible target or an overlapping result; on success swaps,
   * exits swap mode, and keeps the entity selected.
   */
  performSwap(assetId: string): void;

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

  // --- Journeys view-state (route hide / focus) --------------------------
  // Pure VIEW state: none of these mutate the document, touch the schema, or
  // create an undo entry. They drive the renderer's hiddenRouteIds / spotlight.

  /** Is this journey (route entity id) currently toggled off in the panel? */
  isRouteHidden(routeId: string): boolean;
  /** Toggle a journey's visibility (hides its line + badges + label). */
  toggleRouteHidden(routeId: string): void;
  /** The journey currently focused (all non-members dimmed), or undefined. */
  focusedRouteId(): string | undefined;
  /**
   * Focus a journey: keep it, its stop entities, their ancestors and their
   * descendants at full opacity; dim the rest. Re-focusing the same journey
   * clears focus; focusing a hidden journey unhides it first. One at a time.
   */
  focusJourney(routeId: string): void;
  /**
   * Subscribe to Journeys view-state changes (hide/focus, incl. Esc-clear).
   * Returns an unsubscribe fn. Distinct from `subscribe` (document changes).
   */
  onViewStateChange(listener: () => void): () => void;
}
