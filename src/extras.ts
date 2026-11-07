// rayner/extras: Manim's conveniences that Rayner keeps for scenes ported from Manim and for the
// feature tour. Each is a shorthand for something in rayner: Write for Create, TransformFromCopy
// for a Transform of a copy, Restore for saveState and a Transform, MoveAlongPath for
// PulseAlongPath (or a transition's travel), ArcBetweenPoints for Arc, Square for Rectangle,
// Underline for a Line under a box. No explainer needs them to teach.
export { Write, MoveAlongPath, Restore, TransformFromCopy } from './animation.ts';
export type { MoveAlongPathOpts } from './animation.ts';
export { ArcBetweenPoints, Square, Underline } from './shapes.ts';
export type { SquareOpts, UnderlineOpts } from './shapes.ts';
