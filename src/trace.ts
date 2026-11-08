// Trace: the scene as a list of step boundaries with structured state.
// This is the agent-facing form: no geometry, just what each step is called,
// when it happens, what the author attached to it (meta) and what the scene
// says its state is (stateJson()). Stable across float-formatting churn, so it
// is also what golden tests hash. A step that recorded evidence (Scene.record)
// carries it too; steps that recorded none have no `evidence` key, so their
// traces hash as they did before the channel existed.

import type { Evidence, Scene, SceneClass, SceneOptions, SceneState, Sink, Step, StepMeta } from './scene.ts';
import type { Jsonified } from './json.ts';

/**
 * One step of a trace: what traceScene() returns per step. `S` and `Sh` are the types of the model
 * and of what is shown as the trace records them: `Jsonified` of the scene's own (`Scene<S, Sh>`),
 * which TraceOf gives. Untyped, both are JSON records.
 */
export interface StepRecord<S extends object = SceneState, Sh extends object = SceneState> {
  step: string;
  t0: number; frame0: number;
  t1?: number; frame1?: number;
  /** When the caption-reading hold began, if there was one. */
  hold?: number;
  meta: StepMeta;
  /** The model when the step began and when it ended (Scene.stateJson). */
  before: S;
  after?: S;
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
 * name reads as `unknown` (a shown type that is already a JSON record is taken as it is). An
 * untyped scene, or `any`, gives a plain Trace.
 */
export type TraceOf<C> = 0 extends 1 & C ? Trace
  : (C extends abstract new (...args: never) => infer I ? I : C) extends Scene<infer S, infer Sh> ? Trace<Jsonified<S>, string extends keyof Sh ? Jsonified<Sh> : Jsonified<Sh> & SceneState>
  : Trace;

type TraceEvent =
  | { step: string; phase: 'begin'; t: number; frame: number; meta: StepMeta; state: SceneState }
  | { step: string; phase: 'end'; t: number; frame: number; state: SceneState; shown: SceneState; hold?: number; evidence: Evidence[] };

export class TraceSink implements Sink {
  /** @internal */ events: TraceEvent[];
  constructor() { this.events = []; }
  async frame(): Promise<void> {}
  async stepBegin(scene: Scene, s: Step): Promise<void> {
    this.events.push({ step: s.path, phase: 'begin', t: round(scene.time), frame: scene.frameCount, meta: s.meta, state: scene.stateJson() });
  }
  async stepEnd(scene: Scene, s: Step): Promise<void> {
    this.events.push({ step: s.path, phase: 'end', t: round(scene.time), frame: scene.frameCount, state: scene.stateJson(), shown: scene.shownJson(), ...(s.hold != null ? { hold: round(s.hold) } : {}), evidence: s.evidence?.slice() ?? [] });
  }
  /** Compact form: one entry per step with begin/end state. */
  steps(): StepRecord[] {
    const out: StepRecord[] = [];
    for (const e of this.events) {
      if (e.phase === 'begin') out.push({ step: e.step, t0: e.t, frame0: e.frame, meta: e.meta, before: e.state });
      else {
        const s = out.findLast((x) => x.step === e.step && x.t1 == null);
        if (s) { s.t1 = e.t; s.frame1 = e.frame; if (e.hold != null) s.hold = e.hold; s.after = e.state; if (Object.keys(e.shown).length) s.shown = e.shown; if (e.evidence.length) s.evidence = e.evidence; }
      }
    }
    return out;
  }
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * Run a scene and return its trace: { fps, duration, frames, steps }, its states typed as the
 * scene class declares them (TraceOf). stateJson() and shownJson() validate every state as JSON.
 */
export async function traceScene<C extends SceneClass>(SceneClass: C, opts: SceneOptions = {}): Promise<TraceOf<C>> {
  return (await traceRun(SceneClass, opts)).trace as TraceOf<C>;
}

/** traceScene, with the scene as the run left it, for a caller that reads its final state too. */
export async function traceRun(SceneClass: SceneClass, opts: SceneOptions = {}): Promise<{ trace: Trace; scene: Scene }> {
  const sink = new TraceSink();
  const scene = new SceneClass(sink, { skipUntil: Infinity, ...opts });
  await scene.run();
  return { trace: { fps: scene.fps, duration: round(scene.time), frames: scene.frameCount, steps: sink.steps() }, scene };
}
