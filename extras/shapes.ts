// Shapes built on the engine's own: each is a subclass of a public shape that works out its options.
import { Arc } from '../src/index.ts';
import type { Style, Vec } from '../src/index.ts';

/**
 * An arc from `start` to `end` turning through `angle` radians about its centre: positive turns
 * counterclockwise, which bulges to the right of the way from start to end. Built on `Arc`: it works out
 * the circle through both points (its centre, radius and starting angle) and draws `Arc`'s stretch of it.
 */
export class ArcBetweenPoints extends Arc {
  constructor(start: Readonly<Vec>, end: Readonly<Vec>, { angle = Math.PI / 4, ...style }: Style & { angle?: number } = {}) {
    const chord: Vec = [end[0] - start[0], end[1] - start[1]];
    // The chord subtends `angle` at the centre, which stands off the chord's midpoint along its normal.
    const radius = Math.hypot(chord[0], chord[1]) / (2 * Math.sin(Math.abs(angle) / 2));
    const mid: Vec = [start[0] + chord[0] * 0.5, start[1] + chord[1] * 0.5];
    const length = Math.hypot(-chord[1], chord[0]) || 1;
    const normal: Vec = [-chord[1] / length, chord[0] / length];
    const off = radius * Math.cos(Math.abs(angle) / 2) * Math.sign(angle);
    const center: Vec = [mid[0] + normal[0] * off, mid[1] + normal[1] * off];
    const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
    super({ center, radius, startAngle, angle, ...style });
  }
}
