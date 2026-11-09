// The tour's own shorthands for three Manim conveniences, each written with rayner's public API so
// an author can copy it: Write is a lagged Create, Square a Rectangle, Underline a Line under a box.
import { Create, Line, Rectangle } from '../../../src/index.ts';
import type { AnimOptions, Box, Mobject, Style } from '../../../src/index.ts';

/** Create, each letter (or part) starting before the one before it finishes. */
export class Write extends Create {
  constructor(mobject: Mobject, opts: AnimOptions = {}) { super(mobject, { lagRatio: 0.3, ...opts }); }
}

/** A Rectangle with equal sides. */
export class Square extends Rectangle {
  constructor({ side = 2, ...rest }: Style & { side?: number; cornerRadius?: number } = {}) { super({ width: side, height: side, ...rest }); }
}

/** A line along the bottom of a mobject's box (or a Box), `buff` below it, drawn left to right. */
export class Underline extends Line {
  constructor(target: Mobject | Box, { buff = 0.1, ...style }: Style & { buff?: number } = {}) {
    const b = 'box' in target ? target.box() : target;
    if (!b) throw new Error('new Underline(): the target has no points to underline');
    super([b[0], b[1] - buff], [b[2], b[1] - buff], style);
  }
}
