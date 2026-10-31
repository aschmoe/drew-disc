// Dragging the scene sets up the shot: left and right turn the aim, up and down raise and lower
// the launch angle. Vertical is the finer adjustment, so it moves less per pixel and a sideways
// drag with a little wobble barely touches the height.

/** Aim degrees for a drag across the full width of the screen. */
export const AIM_DEG_PER_WIDTH = 45;
/** Launch degrees per pixel, as a fraction of aim degrees per pixel. */
export const LAUNCH_DRAG_RATIO = 0.6;

/**
 * The aim and launch change for a drag of (dx, dy) pixels on a screen `width` pixels wide.
 * Both axes are scaled by width, so a pixel up counts the same on a phone and a monitor as a
 * pixel across. Dragging up raises the launch.
 */
export function aimDragDelta(dx: number, dy: number, width: number): { aimDeg: number; launchDeg: number } {
  const degPerPx = AIM_DEG_PER_WIDTH / Math.max(1, width);
  return { aimDeg: dx * degPerPx, launchDeg: -dy * degPerPx * LAUNCH_DRAG_RATIO };
}
