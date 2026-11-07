// Axis-aligned boxes in scene units, [minX, minY, maxX, maxY] with y up: what
// Mobject.box() returns, and the geometry the engine, the stage, the player's
// close-ups and the review tools all do with it.
import type { Vec } from './vec.ts';

/** [minX, minY, maxX, maxY] in scene units. */
export type Box = [minX: number, minY: number, maxX: number, maxY: number];

/** The box of flat point arrays ([x, y, x, y, ...]), or null when they hold no points. */
export function pointsBox(arrays: Iterable<ArrayLike<number>>): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of arrays) {
    for (let i = 0; i + 1 < a.length; i += 2) {
      const x = a[i]!, y = a[i + 1]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : [minX, minY, maxX, maxY];
}

/** The smallest box holding every given box, skipping null ones; null when there are none. A new box. */
export function unionBoxes(boxes: Iterable<Readonly<Box> | null | undefined>): Box | null {
  let out: Box | null = null;
  for (const b of boxes) {
    if (!b) continue;
    if (!out) out = [b[0], b[1], b[2], b[3]];
    else {
      if (b[0] < out[0]) out[0] = b[0];
      if (b[1] < out[1]) out[1] = b[1];
      if (b[2] > out[2]) out[2] = b[2];
      if (b[3] > out[3]) out[3] = b[3];
    }
  }
  return out;
}

/**
 * The part two boxes share, or null when they share no area. With `lines`, a shared
 * edge or corner counts too, so a line (no height, or no width), which is still drawn,
 * survives a clip: only boxes that miss each other give null.
 */
export function intersect(a: Readonly<Box>, b: Readonly<Box>, { lines = false }: { lines?: boolean } = {}): Box | null {
  const box: Box = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return (lines ? box[2] >= box[0] && box[3] >= box[1] : nonempty(box)) ? box : null;
}

/** Whether a box has area: positive width and height. */
export const nonempty = (b: Readonly<Box>): boolean => b[2] > b[0] && b[3] > b[1];

/**
 * Whether two boxes meet. By default touching counts (closed boxes); with
 * `touching: false` they must share area (open boxes).
 */
export function overlaps(a: Readonly<Box>, b: Readonly<Box>, { touching = true }: { touching?: boolean } = {}): boolean {
  return touching
    ? a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
    : a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/** Whether `inner` lies within `outer`, edges included, to within `slack` on every side. */
export const contains = (outer: Readonly<Box>, inner: Readonly<Box>, slack = 0): boolean =>
  inner[0] >= outer[0] - slack && inner[1] >= outer[1] - slack && inner[2] <= outer[2] + slack && inner[3] <= outer[3] + slack;

/** A box grown by `x` on the left and right and `y` on the top and bottom (shrunk when negative). A new box. */
export const pad = (b: Readonly<Box>, x: number, y = x): Box => [b[0] - x, b[1] - y, b[2] + x, b[3] + y];

/** A box's centre. */
export const center = (b: Readonly<Box>): Vec => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
