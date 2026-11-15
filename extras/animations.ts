// Animations built on the engine's public ones, through the hooks a subclass overrides: `doBegin` fixes
// what the animation runs between as it begins, and `interpolateSubmobject` or `doInterpolate` draws a
// frame from those ends and how far the run has got. Each frame is a function of that progress alone,
// so a frame sought on its own draws what a played run draws there.
import { Animation, MoveAlongPath, linear } from '../src/index.ts';
import type { AnimationOptions, Mobject, MoveAlongPathOptions, VMobject, Vec } from '../src/index.ts';

export interface GrowFromEdgeOptions extends AnimationOptions {
  /** How much of its size along the axis it starts at, from 0 to 1; above 0 by default, so a path it starts as still has length. */
  initialScale?: number;
}

/**
 * Fade in while growing along one axis from a fixed edge: a bar rising from its base, a task's span
 * spreading from its start. Built on `Animation`: as it begins it fixes two copies of the mobject, its
 * end and a start squashed against the edge with `stretch` and made transparent, and each frame
 * interpolates every part of the mobject between its two copies with `Mobject.interpolate`.
 */
export class GrowFromEdge extends Animation {
  /** The edge it grows from: [0, -1] the bottom, [0, 1] the top, [-1, 0] the left, [1, 0] the right. */
  readonly edge: Vec;
  readonly #axis: 0 | 1;
  readonly #initialScale: number;
  /** Each part of the mobject's family, with its start and its end; fixed as it begins. */
  #ends = new Map<Mobject, [start: Mobject, end: Mobject]>();

  constructor(mobject: Mobject, edge: Readonly<Vec> = [0, -1], { initialScale = 0.001, ...opts }: GrowFromEdgeOptions = {}) {
    if (!Array.isArray(edge) || edge.length !== 2 || !Number.isFinite(edge[0]) || !Number.isFinite(edge[1]) ||
      Math.abs(edge[0]) + Math.abs(edge[1]) !== 1 || (edge[0] !== 0 && edge[1] !== 0))
      throw new TypeError('new GrowFromEdge(): the edge must be one unit step along an axis: [0, 1], [0, -1], [-1, 0] or [1, 0]');
    if (!Number.isFinite(initialScale) || initialScale < 0 || initialScale > 1)
      throw new RangeError('new GrowFromEdge(): initialScale must be a number from 0 to 1');
    super(mobject, opts);
    this.edge = [edge[0], edge[1]];
    this.#axis = edge[0] === 0 ? 1 : 0;
    this.#initialScale = initialScale;
  }

  protected override doBegin(): void {
    // The ends are copies made now, never in the constructor: the mobject may change before it plays.
    const end = this.mobject.copy();
    const start = this.mobject.copy();
    for (const part of start.family()) part.style.opacity = 0;
    start.stretch(this.#initialScale, this.#axis, { aboutEdge: this.edge });
    // A copy's family lists its parts in the same order as the mobject's.
    const parts = this.mobject.family(), from = start.family(), to = end.family();
    this.#ends = new Map(parts.map((part, i) => [part, [from[i]!, to[i]!]]));
    super.doBegin();
  }

  protected override interpolateSubmobject(part: Mobject, _asItBegan: Mobject, alpha: number): void {
    const [start, end] = this.#ends.get(part)!;
    part.interpolate(start, end, alpha);
  }
}

/**
 * Travel a fixed route while fading in and out, as a token or a packet passes along a link: invisible at
 * both ends, fully seen half way. It takes the mobject off the stage when it ends, unless given
 * `remover: false`, and runs at an even pace unless given another `rateFunc`. Built on `MoveAlongPath`:
 * it copies the route as it begins, so a route changed later does not move it, and scales each part's
 * opacity by a sine of the progress on top of the move.
 */
export class PulseAlongPath extends MoveAlongPath {
  readonly #route: VMobject;
  readonly #remover: boolean;
  /** The mobject's family and each part's opacity, fixed as it begins. */
  #parts: Mobject[] = [];
  #opacities: number[] = [];

  constructor(mobject: Mobject, path: VMobject, opts: MoveAlongPathOptions = {}) {
    const options = { rateFunc: linear, remover: true, ...opts };
    super(mobject, path, options);
    this.#route = path;
    this.#remover = options.remover ?? false;
  }

  protected override doBegin(): void {
    // The route, like the mobject's starting geometry, is fixed when the play begins.
    this.path = this.#route.copy();
    this.#parts = this.mobject.family();
    this.#opacities = this.#parts.map((part) => part.style.opacity);
    super.doBegin();
  }

  protected override doInterpolate(alpha: number): void {
    super.doInterpolate(alpha);
    const seen = Math.sin(Math.PI * alpha);
    this.#parts.forEach((part, i) => { part.style.opacity = this.#opacities[i]! * seen; });
  }

  protected override doFinish(alpha?: number): void {
    super.doFinish(alpha);
    // Taken off the stage, it gets its opacity back, so it can be shown or sent again.
    if (this.#remover) this.#parts.forEach((part, i) => { part.style.opacity = this.#opacities[i]!; });
  }
}
