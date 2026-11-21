// A run as timed step boundaries: authored model and presentation, optional local
// specimens, computed observations, and evidence about what played.

import type { EndedStep, Evidence, Scene, SceneClass, SceneOptions, SceneState, Sink, Step, StepMeta } from './scene.ts';
import { stepStateOf } from './scene.ts';
import { cloneJson } from './json.ts';
import type { Jsonified } from './json.ts';

const evidenceCopy = (records: readonly Evidence[]): Evidence[] => records.map(record => {
  const copy = cloneJson(record, 'traceScene()', 'evidence');
  if (typeof copy.kind !== 'string' || !copy.kind.trim()) throw new TypeError('traceScene(): evidence.kind must be a nonempty string');
  const { kind, ...data } = copy;
  return { kind, ...data };
});

/**
 * One step of a trace: what traceScene() returns per step. `S` and `Sh` are the types of the model
 * and of what is shown as the trace records them: `Jsonified` of the scene's initialized fields,
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
  /** The step's metadata: the frozen copy the step began with (Step.meta). */
  readonly meta: Readonly<StepMeta>;
  /** The model when the step began and when it ended (Scene.stateJson). */
  before: S;
  after: S;
  /** A staged step's local specimen, when present. Its shape belongs to that step, not to the scene's model type. */
  state?: SceneState;
  /** What was shown when the step ended, apart from the model (Scene.shownJson); absent when nothing was. */
  shown?: Sh;
  /** Computed observations, such as the stage picture description, separate from model inputs. */
  derived?: SceneState;
  /** What the step recorded with Scene.record(), when it recorded anything. */
  evidence?: Evidence[];
}

/** A trace: the scene's timing and its state at every step boundary, typed as StepRecord is. */
export interface Trace<S extends object = SceneState, Sh extends object = SceneState> {
  fps: number;
  duration: number;
  frames: number;
  steps: StepRecord<S, Sh>[];
  /** Facts recorded before the first named step; step evidence is kept on that step only. */
  evidence?: Evidence[];
}

/** An uncustomized object field records an empty object. Distribute across chapter unions. */
type Recorded<T extends object> = T extends unknown ? keyof T extends never ? {} : Jsonified<T> : never;

/** The trace of a constructor or scene, with exactly its JSON model and presentation shapes. */
export type TraceOf<C> = 0 extends 1 & C ? Trace
  : (C extends abstract new (...args: never) => infer I ? I : C) extends (infer I extends Scene) ?
    [SceneClass, keyof I['state'] | keyof I['shown']] extends [C, never] ? Trace : Trace<Recorded<I['state']>, Recorded<I['shown']>>
  : Trace;

/**
 * Called as each step ends, with the scene showing the step's resting picture: its last frame, after
 * its last play has finished (`rayner check` holds that the two are the same picture). Whatever reads
 * a picture of every step reads it here, from one run, instead of seeking to each step.
 */
export type AtRest = (scene: Scene, step: EndedStep) => unknown;

/** Options for a TraceSink. */
export interface TraceSinkOptions {
  /**
   * Frames that end before this time are counted, not drawn (Sink.skipUntil). Infinity unless given:
   * a trace reads only step boundaries, which are exact either way; 0 draws every frame, as a full run does.
   */
  skipUntil?: number;
  /** @internal Called as each step ends, with the scene at rest (AtRest). */
  atRest?: AtRest;
}

export class TraceSink implements Sink {
  readonly skipUntil: number;
  /** Each ended step's record, in order: steps follow one another, so they end in the order they began. */
  readonly #records: StepRecord[] = [];
  /** What each step begun and not yet ended recorded as it began, by the scene's own Step. */
  readonly #begun = new Map<Step, Pick<StepRecord, 'step' | 't0' | 'frame0' | 'meta' | 'before'>>();
  readonly #atRest: AtRest | undefined;
  #prelude: Evidence[] = [];
  #started = false;
  constructor(options: TraceSinkOptions = {}) { this.skipUntil = options.skipUntil ?? Infinity; this.#atRest = options.atRest; }
  async frame(): Promise<void> {}
  async stepBegin(scene: Scene, s: Step): Promise<void> {
    if (!this.#started) { this.#prelude = evidenceCopy(scene.evidence); this.#started = true; }
    this.#begun.set(s, { step: s.path, t0: round(scene.time), frame0: scene.frameCount, meta: s.meta, before: scene.stateJson() });
  }
  async stepEnd(scene: Scene, s: EndedStep): Promise<void> {
    const begun = this.#begun.get(s);
    if (!begun) return;
    this.#begun.delete(s);
    // Record what began, then the independently owned channels at its end.
    const after = scene.stateJson(), shown = scene.shownJson(), derived = scene.derivedJson(), state = stepStateOf(s);
    const record: StepRecord = {
      ...begun,
      t1: round(scene.time), frame1: scene.frameCount,
      ...(s.hold != null && s.holdFrame != null ? { hold: round(s.hold), holdFrame: s.holdFrame } : {}),
      after,
      ...(state ? { state: cloneJson(state, 'traceScene()', 'step.state') } : {}),
      ...(Object.keys(shown).length ? { shown } : {}),
      ...(Object.keys(derived).length ? { derived } : {}),
      ...(s.evidence?.length ? { evidence: evidenceCopy(s.evidence) } : {}),
    };
    this.#records.push(record);
    await this.#atRest?.(scene, s);
  }
  /** One entry per step that ended, with its begin and end state. */
  steps(): StepRecord[] { return this.#records; }
  /** @internal Facts preceding all named steps (or all facts of a run without named steps). */
  prelude(scene: Scene): Evidence[] { return this.#started ? this.#prelude : evidenceCopy(scene.evidence); }
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
 * with `atRest`, each step's resting picture from the same run. `skipUntil: 0` draws every frame,
 * which `rayner check` compares with the skipped trace.
 */
export async function traceRun<S extends Scene>(SceneClass: SceneClass<S>, { skipUntil, ...opts }: SceneOptions & Pick<TraceSinkOptions, 'skipUntil'> = {}, atRest?: AtRest): Promise<{ trace: Trace; scene: S }> {
  const sink = new TraceSink({ skipUntil, atRest });
  const scene = new SceneClass(sink, opts);
  await scene.run();
  const evidence = sink.prelude(scene);
  return { trace: { fps: scene.fps, duration: round(scene.time), frames: scene.frameCount, steps: sink.steps(), ...(evidence.length ? { evidence } : {}) }, scene };
}
