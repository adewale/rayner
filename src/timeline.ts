// Timeline: seeking and step indexing on top of the deterministic frame loop.
//
// A scene is a program, not a data structure, so "the frame at t" is found by
// re-running the program up to t. The fixed-dt loop makes that exact, and at
// well under a millisecond per frame it is cheap enough to do per request.

import { StopScene } from './scene.ts';
import type { Scene, SceneClass, SceneOptions, Sink, Step } from './scene.ts';

/** Sink that records nothing. */
export class NullSink implements Sink {
  async frame(): Promise<void> {}
}

/**
 * Wraps a sink: frames before `t` are dropped (not rendered, not paced),
 * frames from `t` on are forwarded. With `stopAfterFirst`, the first
 * forwarded frame ends the run, which is how a single frame is extracted.
 */
export class SeekSink implements Sink {
  target: Sink;
  t: number;
  stopAfterFirst: boolean;
  forwarded: number;

  constructor(target: Sink, t: number, { stopAfterFirst = false }: { stopAfterFirst?: boolean } = {}) {
    this.target = target; this.t = t; this.stopAfterFirst = stopAfterFirst;
    this.forwarded = 0;
  }
  async frame(scene: Scene, dt: number): Promise<void> {
    if (scene.time + 1e-9 < this.t) return;
    await this.target.frame(scene, this.forwarded === 0 ? 0 : dt);
    this.forwarded++;
    if (this.stopAfterFirst) throw new StopScene();
  }
  async stepBegin(scene: Scene, s: Step): Promise<void> { if (scene.time + 1e-9 >= this.t) await this.target.stepBegin?.(scene, s); }
  async stepEnd(scene: Scene, s: Step): Promise<void> { if (scene.time + 1e-9 >= this.t) await this.target.stepEnd?.(scene, s); }
}

/** A scene's steps and length, from a dry run: the steps are the scene's own records (see Step). */
export interface SceneIndex {
  fps: number;
  duration: number;
  frames: number;
  steps: Step[];
}

/**
 * @internal Run a scene with every frame skipped, handing step boundaries to `sink`: the one dry run an
 * index and a trace (traceRun) are both read from. Nothing reads frames, and the state at a step
 * boundary is exact (see SceneOptions.skipUntil).
 */
export async function dryRun(SceneClass: SceneClass, sink: Sink, opts: SceneOptions = {}): Promise<Scene> {
  const scene = new SceneClass(sink, { skipUntil: Infinity, ...opts });
  await scene.run();
  return scene;
}

/** Dry-run a scene to learn its steps and duration. */
export async function indexScene(SceneClass: SceneClass, opts: SceneOptions = {}): Promise<SceneIndex> {
  const scene = await dryRun(SceneClass, new NullSink(), opts);
  return { fps: scene.fps, duration: scene.time, frames: scene.frameCount, steps: scene.steps };
}

/** Resolve a step name (or path) to its start time, or null. */
export function stepTime(index: { steps: ReadonlyArray<Pick<Step, 'name' | 'path' | 't0'>> }, name: string): number | null {
  const s = index.steps.find((x) => x.name === name || x.path === name);
  return s ? s.t0 : null;
}

/** Render exactly one frame at time t through `sink` (any sink with frame()). */
export async function renderAt(SceneClass: SceneClass, t: number, sink: Sink, opts: SceneOptions = {}): Promise<Scene> {
  const seek = new SeekSink(sink, t, { stopAfterFirst: true });
  const scene = new SceneClass(seek, { skipUntil: t, ...opts });
  await scene.run();
  if (seek.forwarded === 0) await sink.frame(scene, 0); // t past the end: final frame
  return scene;
}

/**
 * Render exactly frame `frame` through `sink`: the frame a scene's `frameCount` reaches as it draws
 * it, as a step's `frame0`, `frame1` and `holdFrame` record, so `renderFrame(Scene, step.frame1, sink)`
 * draws the step's resting picture. Frames before it are counted, not drawn; past the end, the
 * final frame is drawn. The frame is found by its number, never by a rounded time.
 */
export async function renderFrame(SceneClass: SceneClass, frame: number, sink: Sink, opts: SceneOptions = {}): Promise<Scene> {
  if (typeof frame !== 'number') throw new TypeError(`renderFrame(): the frame is ${typeof frame}; give a frame number, 0 or more`);
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError(`renderFrame(): the frame is ${String(frame)}; give a whole frame number, 0 or more`);
  const seek = new FrameSeek(sink, frame);
  const scene = new SceneClass(seek, opts);
  // Frames that end before this one are skipped, by the scene's own clock (its fps is known only now).
  scene.skipUntil = frame / scene.fps;
  await scene.run();
  if (!seek.forwarded) await sink.frame(scene, 0); // past the end: final frame
  return scene;
}

/** Forwards frame `at` (by `frameCount`) and the step boundaries from it on, then stops the run, as SeekSink does by time. */
class FrameSeek implements Sink {
  readonly target: Sink;
  readonly at: number;
  forwarded = false;
  constructor(target: Sink, at: number) { this.target = target; this.at = at; }
  async frame(scene: Scene): Promise<void> {
    if (scene.frameCount < this.at) return;
    await this.target.frame(scene, 0);
    this.forwarded = true;
    throw new StopScene();
  }
  async stepBegin(scene: Scene, s: Step): Promise<void> { if (scene.frameCount >= this.at) await this.target.stepBegin?.(scene, s); }
  async stepEnd(scene: Scene, s: Step): Promise<void> { if (scene.frameCount >= this.at) await this.target.stepEnd?.(scene, s); }
}
