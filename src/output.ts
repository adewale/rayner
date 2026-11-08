// rayner/output: drawing a scene's frames outside the built page. SVG strings, the live DOM, a
// still at any time or step, element records and a text drawing, for a host page or a tool that
// renders a scene itself (docs/SCENE-OUTPUTS.md). A scene is written with rayner; the player
// (app/) is built on these.

export { toSvgString, renderElements, StringSink, SnapshotSink, DomSink } from './svg.ts';
export type { ElementRecord, SvgOptions, RenderOptions } from './svg.ts';
export { renderText } from './ascii.ts';
export { NullSink, SeekSink, indexScene, stepTime, renderAt, renderFrame } from './timeline.ts';
export type { SceneIndex } from './timeline.ts';
/** What a sink throws to stop a run (a seek past its time does): a catch must rethrow it. */
export { StopScene } from './scene.ts';
