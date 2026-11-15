// rayner/extras: animations, a shape and easings built only on Rayner's public entry points, as an
// author's own would be. It is the worked example of extending Rayner (docs/EXTENDING.md): each file
// imports nothing but `rayner`, by relative path in this checkout (test/extras.test.ts holds it to
// that), and says which public names each extra builds on. Explainers import it as they import
// any entry point; the engine's diagrams build their bars and tokens in with it too.
export { GrowFromEdge, PulseAlongPath } from './animations.ts';
export type { GrowFromEdgeOptions } from './animations.ts';
export { ArcBetweenPoints } from './shapes.ts';
export { rushInto, rushFrom, thereAndBack } from './easing.ts';
