// Trace: the scene as a list of step boundaries with structured state.
// This is the agent-facing form: no geometry, just what each step is called,
// when it happens, what the author attached to it (meta) and what the scene
// says its state is (stateJson()). Stable across float-formatting churn, so it
// is also what golden tests hash. A step that recorded evidence (Scene.record)
// carries it too; steps that recorded none have no `evidence` key, so their
// traces hash as they did before the channel existed.

import type { Evidence, Scene, SceneClass, SceneOptions, SceneState, Sink, Step, StepMeta } from './scene.ts';
import type { Jsonified } from './json.ts';
import { dryRun } from './timeline.ts';

/**
 * One step of a trace: what traceScene() returns per step. `S` and `Sh` are the types of the model
 * and of what is shown as the trace records them: `Jsonified` of the scene's own (`Scene<S, Sh>`),
 * which TraceOf gives. Untyped, both are JSON records.
 */
export interface StepRecord<S extends object = SceneState, Sh extends object = SceneState> {
  step: string;
  /** When the step began and ended, in seconds and frames (Step's `t0`, `frame0`, `t1` and `frame1`); a trace holds only steps that ended. */
  t0: number; frame0: number;
  t1: number; frame1: number;
  /** When the caption-reading hold began, if there was one. */
  hold?: number;
  /** The frame the caption hold began on, with `hold` (Step.holdFrame). */
  holdFrame?: number;
  meta: StepMeta;
  /** The model when the step began and when it ended (Scene.stateJson). */
  before: S;
  after: S;
  /** What was shown when the step ended, apart from the model (Scene.shownJson); absent when nothing was. */
  shown?: Sh;
  /** What the step recorded with Scene.record(), when it recorded anything. */
  evidence?: Evidence[];
}

/** A trace: the scene's timing and its state at every step boundary, typed as StepRecord is. */
export interface Trace<S extends object = SceneState, Sh extends object = SceneState> {
  fps: number;
  duration: number;
  frames: number;
  steps: StepRecord<S, Sh>[];
}

/**
 * The trace of a scene class (or of a scene), typed from the `Scene<S, Sh>` it extends: what
 * traceScene() returns for it, and what a test handed such a trace declares,
 * `trace: TraceOf<typeof Explainer>`. Its states are `Jsonified<S>`; what is shown is
 * `Jsonified<Sh>` with whatever helpers add to it (the stage's `picture`), so a key `Sh` does not
 * name reads as `unknown` (a shown type that is already a JSON record is taken as it is). The state
 * keeps the one key a helper writes there, `walks` (recordWalk), as `unknown`. An untyped scene, or
 * `any`, gives a plain Trace.
 */
export type TraceOf<C> = 0 extends 1 & C ? Trace
  : (C extends abstract new (...args: never) => infer I ? I : C) extends Scene<infer S, infer Sh> ? Trace<string extends keyof S ? Jsonified<S> : Jsonified<S> & { walks?: unknown }, string extends keyof Sh ? Jsonified<Sh> : Jsonified<Sh> & SceneState>
  : Trace;

/**
 * Called as each step ends, with the scene showing the step's resting picture: its last frame, after
 * its last play has landed (`rayner check` holds that the two are the same picture). Whatever reads
 * a picture of every step reads it here, from one run, instead of seeking to each step.
 */
export type AtRest = (scene: Scene, step: Step) => unknown;

export class TraceSink implements Sink {
  /** @internal Each ended step's record, in order: steps follow one another, so they end in the order they began. */
  records: StepRecord[];
  /** @internal What each step begun and not yet ended recorded as it began, by the scene's own Step. */
  private readonly begun: Map<Step, Pick<StepRecord, 'step' | 't0' | 'frame0' | 'meta' | 'before'>>;
  /** @internal */ private readonly atRest: AtRest | undefined;
  constructor(atRest?: AtRest) { this.records = []; this.begun = new Map(); this.atRest = atRest; }
  async frame(): Promise<void> {}
  async stepBegin(scene: Scene, s: Step): Promise<void> {
    this.begun.set(s, { step: s.path, t0: round(scene.time), frame0: scene.frameCount, meta: s.meta, before: scene.stateJson() });
  }
  async stepEnd(scene: Scene, s: Step): Promise<void> {
    const begun = this.begun.get(s);
    if (!begun) return;
    this.begun.delete(s);
    // The keys in the order a trace has always written them: what began, then how it ended.
    const after = scene.stateJson(), shown = scene.shownJson();
    const record: StepRecord = {
      ...begun,
      t1: round(scene.time), frame1: scene.frameCount,
      ...(s.hold != null && s.holdFrame != null ? { hold: round(s.hold), holdFrame: s.holdFrame } : {}),
      after,
      ...(Object.keys(shown).length ? { shown } : {}),
      ...(s.evidence?.length ? { evidence: s.evidence.slice() } : {}),
    };
    this.records.push(record);
    await this.atRest?.(scene, s);
  }
  /** One entry per step that ended, with its begin and end state. */
  steps(): StepRecord[] { return this.records; }
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * Run a scene and return its trace: { fps, duration, frames, steps }, its states typed as the
 * scene class declares them (TraceOf). stateJson() and shownJson() validate every state as JSON.
 */
export async function traceScene<C extends SceneClass>(SceneClass: C, opts: SceneOptions = {}): Promise<TraceOf<C>> {
  return (await traceRun(SceneClass, opts)).trace as TraceOf<C>;
}

/**
 * traceScene, with the scene as the run left it, for a caller that reads its final state too; and,
 * with `atRest`, each step's resting picture from the same run.
 */
export async function traceRun(SceneClass: SceneClass, opts: SceneOptions = {}, atRest?: AtRest): Promise<{ trace: Trace; scene: Scene }> {
  const sink = new TraceSink(atRest);
  const scene = await dryRun(SceneClass, sink, opts);
  return { trace: { fps: scene.fps, duration: round(scene.time), frames: scene.frameCount, steps: sink.steps() }, scene };
}
