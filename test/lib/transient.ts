// Indicate and Flash as the package had them before 0.2.0 cut them (rayner check's resting-picture
// rules reject transient emphasis, so no scene should reach for one). The engine tests keep them
// as ordinary there-and-back animations: groups, colours, seeking and successions are tested with them.
import { Animation, Transform, thereAndBack, linear } from '../../src/index.ts';
import type { AnimOpts, Mobject, TransformOpts } from '../../src/index.ts';

export interface IndicateOpts extends TransformOpts { scaleFactor?: number; color?: string }

/** Scale up and recolor, there and back. */
export class Indicate extends Transform {
  scaleFactor: number;
  color: string;

  constructor(mobject: Mobject, { scaleFactor = 1.2, color = '#ffff00', ...opts }: IndicateOpts = {}) {
    super(mobject, mobject, { rateFunc: thereAndBack, ...opts });
    this.scaleFactor = scaleFactor; this.color = color;
  }
  override begin(): void {
    const t = this.mobject.copy().scale(this.scaleFactor);
    for (const m of t.family()) {
      if (m.style.stroke !== 'none') m.style.stroke = this.color;
      if (m.style.fill !== 'none') m.style.fill = this.color;
    }
    this.target = t; this.ownsTarget = true; this.sameStructure = true;
    super.begin();
  }
}

/** Fade in, hold, fade out around a mobject. */
export class Flash extends Animation {
  constructor(mobject: Mobject, opts: AnimOpts = {}) { super(mobject, { rateFunc: linear, ...opts }); }
  override interpolateSubmobject(sub: Mobject, start: Mobject, alpha: number): void {
    sub.style.opacity = start.style.opacity * Math.sin(Math.PI * alpha);
  }
}
