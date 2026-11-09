// rayner/geo: 3D and the globe, opt in. seenFrom draws a 3D model through a viewpoint as keyed 2D
// pieces in an explicit depth order; latLon, greatArc, circleOn, between and project build and turn
// it. See docs/REFERENCE.md, "3D".
export { seenFrom, seenPictures, depthOrder, latLon, toLatLon, greatArc, circleOn, between, project } from './seen-from.ts';
export type { Vec3, Viewpoint, Hidden, PointPart, PathPart, FacePart, Part, Body, Model3D, SeenOptions, Layer, SeenPiece, SeenPicture } from './seen-from.ts';
