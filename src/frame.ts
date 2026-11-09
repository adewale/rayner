// Frame: the camera, as a box. Its point array is the visible rectangle
// [x0, y0, x1, y1] in scene units (the pattern of Text.frameBox), so shift,
// scale, moveTo, .animate and Transform move it exactly as they move any
// mobject, and an animated camera interpolates as points: pure in alpha,
// seek-safe. Sinks read the box at the root of the output (the SVG viewBox);
// no other mobject's points change when the camera moves.

import { Mobject } from './mobject.ts';
import type { Box } from './mobject.ts';
import { FRAME, STAGE_BOX, zoomOf } from './units.ts';
import { center } from './box.ts';

export interface FrameFitOptions {
  /** Space kept around the target on every side, in scene units. */
  margin?: number;
}

const ASPECT = FRAME.w / FRAME.h;

/**
 * The scene's camera (`scene.frame`): the rectangle of the scene that is on
 * screen, 16 × 9 at the origin by default. It is never drawn and never
 * rewrites other mobjects; moving it changes only the viewBox.
 *
 *   await this.play(this.frame.animate.fit(code, { margin: 0.5 }));  // zoom onto code
 *   await this.play(this.frame.animate.scale(0.5).moveTo(dot));      // closer, centered on dot
 *   await this.play(this.frame.animate.reset());                     // back to the whole frame
 *
 * Keep it 16:9: fit(), reset(), scale() and moveTo() do; stretch() would not.
 */
export class Frame extends Mobject {
  /** @internal The visible box as a point array [x0, y0, x1, y1]. */
  corners: Float32Array;

  constructor() {
    super();
    this.corners = new Float32Array(STAGE_BOX);
  }

  /** @internal */ override pointArrays(): Float32Array[] { return [this.corners]; }
  protected override copyData(src: Mobject): void { this.corners = new Float32Array((src as Frame).corners); }

  /**
   * Magnification, as the stage shows the box (zoomOf): 1 for the whole 16 × 9 frame, 2 when it
   * shows half as wide and half as high. A box out of 16:9 is letterboxed, so its tighter side sets it.
   */
  get zoom(): number { return zoomOf(this.box() ?? STAGE_BOX); }

  /** The smallest 16:9 box that holds `target` (a mobject or a box) plus `margin` on every side, centered on it. */
  fit(target: Mobject | Readonly<Box>, { margin = 0.5 }: FrameFitOptions = {}): this {
    const b = target instanceof Mobject ? target.box() : target;
    if (!b) throw new Error('frame.fit(): the target has no points to fit; give a mobject that is drawn, or a box');
    const w = Math.max(b[2] - b[0] + 2 * margin, (b[3] - b[1] + 2 * margin) * ASPECT);
    return this.place(...center(b), w);
  }

  /** Back to the default frame: 16 × 9 at the origin. */
  reset(): this { return this.place(0, 0, FRAME.w); }

  private place(cx: number, cy: number, w: number): this {
    const h = w / ASPECT;
    this.corners.set([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
    this.touchPoints();
    this.invalidateBox();
    return this;
  }
}
