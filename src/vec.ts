// 2D vectors as plain arrays [x, y]. Math convention, as in manim: origin at
// the frame center, x right, y UP. The frame is 16 × 9: x in [-8, 8], y in
// [-4.5, 4.5]. The flip to SVG's y-down happens once, when path data is
// written (VMobject.roundedRelative); nothing else knows SVG exists.

/** A point or direction in scene units. */
export type Vec = [x: number, y: number];
/** Anything with an x at [0] and a y at [1]: a Vec, or a slice of a point buffer. */
export type VecLike = Readonly<Vec> | ArrayLike<number>;

export const add = (a: Readonly<Vec>, b: Readonly<Vec>): Vec => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Readonly<Vec>, b: Readonly<Vec>): Vec => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Readonly<Vec>, k: number): Vec => [a[0] * k, a[1] * k];
export const dot = (a: Readonly<Vec>, b: Readonly<Vec>): number => a[0] * b[0] + a[1] * b[1];
export const norm = (a: Readonly<Vec>): number => Math.hypot(a[0], a[1]);
export const normalize = (a: Readonly<Vec>): Vec => { const n = norm(a) || 1; return [a[0] / n, a[1] / n]; };
export const lerp = (a: Readonly<Vec>, b: Readonly<Vec>, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const rotate = (a: Readonly<Vec>, angle: number): Vec => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};
export const angleOf = (a: Readonly<Vec>): number => Math.atan2(a[1], a[0]);
