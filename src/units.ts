// The stage's geometry, in the one module every layer reads it from. The frame is 16 × 9 scene
// units centred on the origin, with y up; SVG writes UNITS integer user units per scene unit.
// This module imports only a type, so the engine, the player and the tools can all depend on it.

import type { Box } from './box.ts';

/** The frame's size in scene units: what the camera shows at home. */
export const FRAME = { w: 16, h: 9 } as const;
/** SVG user units per scene unit: lengths are emitted as integers (see VMobject.formatPathD). */
export const UNITS = 1000;
/** The camera's home box: the whole 16 × 9 stage, centred on the origin, in scene units. */
export const STAGE_BOX: Readonly<Box> = [-FRAME.w / 2, -FRAME.h / 2, FRAME.w / 2, FRAME.h / 2];
