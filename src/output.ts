// rayner/output: drawing a scene's frames outside the built page. SVG strings and a still at any
// frame or step, for a host page or a tool that renders a scene itself (docs/SCENE-OUTPUTS.md). A
// scene is written with rayner; the player (app/) is built on these.
//
// `renderFrame`, `toSvgString` and `StringSink` are the entry point's API. The other five names
// 0.1.0 published from `rayner`, and no explainer uses them: they are deprecated here, each saying
// what replaces it, and the next minor release (0.3.0) stops exporting them (docs/ENGINE.md, "What
// stays in the public API"). The repository's own tooling keeps them, from this file or their own modules.

export {
  toSvgString,
  StringSink,
  /**
   * @deprecated No explainer uses it, and 0.3.0 removes it from `rayner/output`. Serialize the
   * frame with `toSvgString`, whose SVG holds each part's geometry, paint and text; for a step's
   * picture in words, read `describeExplainer` from `rayner/testing`.
   */
  renderElements,
  /**
   * @deprecated No explainer uses it, and 0.3.0 removes it from `rayner/output`. To show a scene
   * on a host page, embed the page `rayner build` writes, which plays it with the reader's
   * controls; for a still, put `toSvgString(await renderFrame(Scene, frame))` in the page.
   */
  DomSink,
} from './svg.ts';
export type { ElementRecord, SvgOptions, RenderOptions } from './svg.ts';
export {
  /**
   * @deprecated No explainer uses it, and 0.3.0 removes it from `rayner/output`. Each step's
   * resting picture drawn as text is in `describeExplainer` from `rayner/testing`, and
   * `rayner see` prints one step's for a terminal.
   */
  renderText,
} from './ascii.ts';
export {
  renderFrame,
  /**
   * @deprecated No explainer uses it, and 0.3.0 removes it from `rayner/output`. `renderFrame`
   * runs a scene to a frame drawing nothing before it, and with no sink nothing at all;
   * `traceScene` from `rayner/testing` runs a whole scene for its steps and state; a run of your
   * own takes a `Sink` (from `rayner`) that skips every frame: `{ skipUntil: Infinity, async frame() {} }`.
   */
  NullSink,
} from './timeline.ts';
export {
  /**
   * What a sink throws to stop a run (a seek does, past its frame): a catch must rethrow it.
   *
   * @deprecated No explainer uses it, and 0.3.0 removes it from `rayner/output`. `renderFrame`
   * stops a run at its frame itself; a `catch` in a scene rethrows whatever it catches once
   * `this.phase` is `'stopped'`.
   */
  StopScene,
} from './scene.ts';
