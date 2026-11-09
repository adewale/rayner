// Timeline: seeking on top of the deterministic frame loop.
//
// A scene is a program, not a data structure, so "frame n" is found by
// re-running the program up to it. The fixed-dt loop makes that exact, and at
// well under a millisecond per frame it is cheap enough to do per request.

import { StopScene, drawFrame } from './scene.ts';
import type { EndedStep, Scene, SceneClass, SceneOptions, Sink, Step } from './scene.ts';

/** Sink that records nothing, and so skips every frame: the scene counts them without drawing them. */
export class NullSink implements Sink {
  readonly skipUntil = Infinity;
  async frame(): Promise<void> {}
}

/**
 * @internal Run a scene with every frame skipped, handing step boundaries to `sink`, whatever the
 * sink's own skip time: what the command and the player read a project's steps and layouts from.
 * Nothing reads frames, and the state at a step boundary is exact (see Sink.skipUntil).
 */
export async function dryRun(SceneClass: SceneClass, sink: Sink, opts: SceneOptions = {}): Promise<Scene> {
  const skipping: Sink = {
    skipUntil: Infinity,
    frame: (scene, dt) => sink.frame(scene, dt),
    stepBegin: async (scene, step) => { await sink.stepBegin?.(scene, step); },
    stepEnd: async (scene, step) => { await sink.stepEnd?.(scene, step); },
  };
  const scene = new SceneClass(skipping, opts);
  await scene.run();
  return scene;
}

/**
 * Run a scene to exactly frame `frame` and return it there, handing that frame to `sink`: the frame
 * a scene's `frameCount` reaches as it draws it, as a step's `frame0`, `frame1` and `holdFrame`
 * record, so `toSvgString(await renderFrame(Scene, step.frame1))` is the step's resting picture.
 * Frames before it are counted, not drawn; past the end, the final frame is drawn. The frame is
 * found by its number, never by a rounded time.
 */
export async function renderFrame(SceneClass: SceneClass, frame: number, sink: Sink = new NullSink(), opts: SceneOptions = {}): Promise<Scene> {
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError(`renderFrame(): the frame is ${String(frame)}; give a whole frame number, 0 or more`);
  const seek = new FrameSeek(sink, frame);
  const scene = new SceneClass(seek, opts);
  // Frames that end before this one are skipped, by the scene's own clock (its fps is known only now).
  seek.fps = scene.fps;
  await scene.run();
  if (!seek.forwarded) await drawFrame(scene, sink); // past the end: final frame
  return scene;
}

/**
 * Forwards frame `at` (by `frameCount`) and the step boundaries from it on, then stops the run.
 * Frames that end before it are skipped, by the scene's clock, once `fps` says what it runs at.
 */
class FrameSeek implements Sink {
  readonly target: Sink;
  readonly at: number;
  forwarded = false;
  fps: number | null = null;
  constructor(target: Sink, at: number) { this.target = target; this.at = at; }
  get skipUntil(): number { return this.fps === null ? 0 : this.at / this.fps; }
  async frame(scene: Scene): Promise<void> {
    if (scene.frameCount < this.at) return;
    await this.target.frame(scene, 0);
    this.forwarded = true;
    throw new StopScene();
  }
  async stepBegin(scene: Scene, s: Step): Promise<void> { if (scene.frameCount >= this.at) await this.target.stepBegin?.(scene, s); }
  async stepEnd(scene: Scene, s: EndedStep): Promise<void> { if (scene.frameCount >= this.at) await this.target.stepEnd?.(scene, s); }
}
