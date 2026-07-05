// viewBox-based camera. The scene lives in world (projected-screen) pixels;
// the camera maps a world rectangle onto the <svg> viewport via the viewBox
// attribute. Zoom-to-pointer keeps the world point under the cursor fixed.
//
// Camera state is deliberately OUTSIDE the undo history (docs/PLAN.md #11:
// "document edits only"); it syncs to doc.camera separately, debounced.

import type { Camera } from '../core/model.ts';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * The viewBox for a given camera + viewport pixel size.
 *
 * Camera {x,y} is the world point mapped to the CENTRE of the viewport.
 * zoom is world-px per screen-px scale: higher zoom ⇒ smaller world window
 * ⇒ things look bigger. viewBox width = viewportW / zoom.
 */
export function viewBoxFor(
  cam: Camera,
  viewportW: number,
  viewportH: number
): { x: number; y: number; w: number; h: number } {
  const w = viewportW / cam.zoom;
  const h = viewportH / cam.zoom;
  return { x: cam.x - w / 2, y: cam.y - h / 2, w, h };
}

/** Format a viewBox object as the SVG attribute string. */
export function viewBoxAttr(vb: { x: number; y: number; w: number; h: number }): string {
  const r = (v: number): number => Math.round(v * 100) / 100;
  return `${r(vb.x)} ${r(vb.y)} ${r(vb.w)} ${r(vb.h)}`;
}

/**
 * Convert a point in viewport pixel coords (relative to the svg top-left) to
 * world coords, given the current camera and viewport size.
 */
export function screenToWorld(
  sx: number,
  sy: number,
  cam: Camera,
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const vb = viewBoxFor(cam, viewportW, viewportH);
  return { x: vb.x + sx / cam.zoom, y: vb.y + sy / cam.zoom };
}

/** Inverse of screenToWorld: world → viewport pixel coords. */
export function worldToScreen(
  wx: number,
  wy: number,
  cam: Camera,
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const vb = viewBoxFor(cam, viewportW, viewportH);
  return { x: (wx - vb.x) * cam.zoom, y: (wy - vb.y) * cam.zoom };
}

/**
 * Zoom toward a pointer position. Returns a NEW camera where the world point
 * currently under (sx, sy) remains under (sx, sy) after the zoom change.
 *
 * Standard zoom-to-pointer: keep worldUnderCursor fixed while zoom changes.
 * The camera centre must shift so that the same world point projects to the
 * same screen pixel.
 */
export function wheelZoom(
  cam: Camera,
  deltaY: number,
  sx: number,
  sy: number,
  viewportW: number,
  viewportH: number
): Camera {
  const world = screenToWorld(sx, sy, cam, viewportW, viewportH);

  // Exponential zoom feels natural; deltaY<0 (scroll up) ⇒ zoom in.
  const factor = Math.exp(-deltaY * 0.0015);
  const nextZoom = clampZoom(cam.zoom * factor);

  // Solve for a camera centre that pins `world` under (sx, sy) at nextZoom.
  //   worldUnderCursor.x = (cam.x - w/2) + sx/zoom, with w = viewportW/zoom
  //   => cam.x = world.x - sx/zoom + (viewportW/zoom)/2
  const wHalf = viewportW / nextZoom / 2;
  const hHalf = viewportH / nextZoom / 2;
  return {
    zoom: nextZoom,
    x: world.x - sx / nextZoom + wHalf,
    y: world.y - sy / nextZoom + hHalf,
  };
}

/**
 * Pan by a screen-pixel delta (drag). Dragging the background right should move
 * the world right under the cursor, i.e. the camera centre moves LEFT.
 */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    ...cam,
    x: cam.x - dxScreen / cam.zoom,
    y: cam.y - dyScreen / cam.zoom,
  };
}

/** A sensible default camera centred on world origin. */
export function defaultCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}
