// Trace: the scene as a list of step boundaries with structured state.
// This is the agent-facing form: no geometry, just what each step is called,
// when it happens, what the author attached to it (meta) and what the scene
// says its state is (stateJson()). Stable across float-formatting churn, so it
// is also what golden tests hash. A step that recorded evidence (Scene.record)
// carries it too; steps that recorded none have no `evidence` key, so their
// traces hash as they did before the channel existed.

import type { Evidence, Scene, SceneClass, SceneOptions, SceneState, Sink, Step, StepMeta } from './scene.ts';

/** One step of a trace: what traceScene() returns per step. */
export interface StepRecord {
  step: string;
  t0: number; frame0: number;
  t1?: number; frame1?: number;
  /** When the caption-reading hold began, if there was one. */
  hold?: number;
  /** The frame the step's picture stops changing on: where its hold begins, else its rest frame (Step.holdFrame). */
  holdFrame?: number;
  /** The step's resting frame, its last: what a link shows and the checks judge (Step.restFrame). */
  restFrame?: number;
  meta: StepMeta;
  /** The model when the step began and when it ended (Scene.stateJson). */
  before: SceneState;
  after?: SceneState;
  /** What was shown when the step ended, apart from the model (Scene.shownJson); absent when nothing was. */
  shown?: SceneState;
  /** What the step recorded with Scene.record(), when it recorded anything. */
  evidence?: Evidence[];
}

/** A trace: the scene's timing and its state at every step boundary. */
export interface Trace {
  fps: number;
  duration: number;
  frames: number;
  steps: StepRecord[];
}

/**
 * Called as each step ends, with the scene showing the step's resting picture: its last frame, after
 * its last play has landed (`rayner check` holds that the two are the same picture). Whatever reads
 * a picture of every step reads it here, from one run, instead of seeking to each step.
 */
export type AtRest = (scene: Scene, step: Step) => unknown;

export class TraceSink implements Sink {
  /** @internal Each step's record, in order; a step's end completes the record its beginning made. */
  records: StepRecord[];
  /** @internal The record of each step begun, by the scene's own Step. */
  private readonly of: Map<Step, StepRecord>;
  /** @internal */ private readonly atRest: AtRest | undefined;
  constructor(atRest?: AtRest) { this.records = []; this.of = new Map(); this.atRest = atRest; }
  async frame(): Promise<void> {}
  async stepBegin(scene: Scene, s: Step): Promise<void> {
    const record: StepRecord = { step: s.path, t0: round(scene.time), frame0: scene.frameCount, meta: s.meta, before: scene.stateJson() };
    this.records.push(record);
    this.of.set(s, record);
  }
  async stepEnd(scene: Scene, s: Step): Promise<void> {
    const record = this.of.get(s);
    if (!record) return;
    record.t1 = round(scene.time); record.frame1 = scene.frameCount;
    if (s.hold != null) record.hold = round(s.hold);
    record.holdFrame = s.holdFrame!; record.restFrame = s.restFrame!;
    record.after = scene.stateJson();
    const shown = scene.shownJson();
    if (Object.keys(shown).length) record.shown = shown;
    if (s.evidence?.length) record.evidence = s.evidence.slice();
    await this.atRest?.(scene, s);
  }
  /** One entry per step with its begin and end state. */
  steps(): StepRecord[] { return this.records; }
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

/** Run a scene and return its trace: { fps, duration, frames, steps }. */
export async function traceScene(SceneClass: SceneClass, opts: SceneOptions = {}): Promise<Trace> {
  return (await traceRun(SceneClass, opts)).trace;
}

/**
 * traceScene, with the scene as the run left it, for a caller that reads its final state too; and,
 * with `atRest`, each step's resting picture from the same run.
 */
export async function traceRun(SceneClass: SceneClass, opts: SceneOptions = {}, atRest?: AtRest): Promise<{ trace: Trace; scene: Scene }> {
  const sink = new TraceSink(atRest);
  const scene = new SceneClass(sink, { skipUntil: Infinity, ...opts });
  await scene.run();
  return { trace: { fps: scene.fps, duration: round(scene.time), frames: scene.frameCount, steps: sink.steps() }, scene };
}
