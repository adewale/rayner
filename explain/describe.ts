// An explainer as data, for agents: every scenario and every step, with the words a reader gets,
// the state the scene recorded, what each step changed and its resting picture drawn as text.
// One definition behind `rayner describe` and anything an agent imports; it runs the scene in
// Node or a browser, with no Chromium, given the diagrams' pinned snapshots.
import { groundingLabel, groundingSentence } from './grounding.ts';
import type { Grounding } from './grounding.ts';
import { renderText } from '../src/ascii.ts';
import { machinesOf } from './machine.ts';
import { liveSteps, logStart } from './live.ts';
import type { LogStart } from './live.ts';
import { predictionsOf, teachingIndices } from './script.ts';
import type { Prediction, StepKind } from './script.ts';
import { traceRun } from '../src/trace.ts';
import { canonicalJson, cloneJson } from '../src/json.ts';
import type { Scene, SceneState } from '../src/index.ts';
import { scenariosOf, withSettings, scenarioName, bindSnapshots } from './settings.ts';
import type { ExplainerClass, Setting, Settings } from './settings.ts';
import { pictureSummary, stepStates, stepWords, watchedChanges } from './trace.ts';
import type { WatchedChange } from './trace.ts';
import { paperOf, withoutHeading } from './stage.ts';
import type { SnapshotStore, DiagramResolver } from './diagram-snapshot.ts';

/** One step of one scenario. Times are seconds on the scene's clock. */
export interface StepDescription {
  step: string;
  /** The authored path, with the default made explicit. A detail can still be on an all-detail scenario's teaching path. */
  kind: StepKind;
  title: string;
  /** The few words under the title, drawn on the picture; empty when the step has none. */
  line: string;
  caption: string;
  start: number;
  end: number;
  /** When the caption-reading hold begins, if the step has one. */
  hold?: number;
  /** The step's local specimen when it has one; otherwise the model, `scene.state`, when the step ends. */
  state: SceneState;
  /** What was shown apart from the model (`scene.shown`), when anything was; the picture is described in `picture`. */
  shown?: SceneState;
  /** Each state value the step changed, before and after; a side is left out when the value was not set. */
  changed: Record<string, { before?: unknown; after?: unknown }>;
  /**
   * What the step changed of the state the scene names for readers (`meta.watch`), formatted as the
   * player shows it, at most four; present only when the scene declares `watch`.
   */
  watched?: WatchedChange[];
  /** The resting picture in words, as the page's description gives it; empty if the scene gives none. */
  picture: string;
  /** The resting picture drawn as text (heading left out), when `drawings` asks for this step. */
  drawing?: string;
  /** The events a machine replayed in this step, in order (`{ kind: 'event' }` evidence); absent when none. */
  events?: string[];
  /** The player's resolved prediction: answer is an option index, and reveal names the later step. */
  predict?: Pick<Prediction, 'prompt' | 'options' | 'answer' | 'reveal'>;
  /** Asking steps whose predictions this step reveals, in asking order. */
  reveals?: string[];
}
/**
 * A model the scene lets events drive: what a reader could do, and where from. `states`,
 * `complete` and `sampled` describe exploration from `start`; `live` describes the reader's origin
 * separately. A complete walk exhausted the graph, including when its size equals the limit.
 */
export interface MachineDescription {
  events: string[];
  start: SceneState;
  states: number;
  complete: boolean;
  sampled?: true;
  /** The step it last played in; absent when it never played. `live` is present only for the machine whose controls the player shows there. */
  step?: string;
  /** The actual reader origin at step end (or the reset start), absent when this machine has no live controls. Counts may overlap start's. */
  live?: { from: LogStart; state: SceneState; states: number; complete: boolean; sampled?: true };
}
/** One scenario: a combination of setting values, as a reader picks it under the title. */
export interface ScenarioDescription {
  values: Settings;
  /** "Label: option · Label: option"; empty for a scene without settings. */
  name: string;
  duration: number;
  /** The stage's paper colour when the scenario ends (its palette's `paper`); absent for a scene without a stage. */
  paper?: string;
  /**
   * The invariants the scene holds of its picture on every frame (`scene.addInvariant`), by name,
   * as registered when the scenario ends; `rayner check` checks each one on every frame. Absent when none.
   */
  invariants?: string[];
  /** The models the scene lets events drive; absent when none. */
  machines?: MachineDescription[];
  /** Step IDs in the player's teaching order; detail steps are skipped unless all steps are details. */
  teaching: string[];
  /** Invalid prediction declarations, as the player/check read them; absent when none. */
  predictionProblems?: string[];
  steps: StepDescription[];
}
export interface ExplainerDescription {
  /** Bumped when a field changes meaning or goes away; added fields keep it. */
  schema: 1;
  id: string;
  title: string;
  lang: string;
  sources: string[];
  settings: Setting[];
  /** The script's one-sentence answer (`meta.answer`), when the scene declares it. */
  answer?: string;
  /** The questions a reader should be able to answer afterwards, with answers (`meta.questions`). */
  questions?: { question: string; answer: string }[];
  /** What the model is checked against, from the script's intent header. */
  checkedAgainst?: string;
  /** How the model was checked, from the script's Grounding line: a grade, the system checked against, and the receipt's sentence and short label (explain/grounding.ts). */
  grounding?: Grounding & { label: string; sentence: string };
  scenarios: ScenarioDescription[];
}
export interface DescribeOptions {
  /** Where the scene's diagrams come from: its pinned snapshots, or a resolver that captures them. */
  snapshots?: SnapshotStore | DiagramResolver;
  /**
   * Draw each resting picture as text (default true); false is faster, a trace only. A step's name
   * draws only that step, for a caller that shows one step (`rayner see`).
   */
  drawings?: boolean | string;
}

const PICTURE = 'picture';
const withoutPicture = (state: SceneState = {}): SceneState =>
  Object.fromEntries(Object.entries(state).filter(([k]) => k !== PICTURE));
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/** What `Scene` explains, every scenario and step, in one JSON-safe object. */
export async function describeExplainer(Scene: ExplainerClass, options: DescribeOptions = {}): Promise<ExplainerDescription> {
  const meta = Scene.meta ?? {},
    scenarios: ScenarioDescription[] = [];
  for (const values of scenariosOf(Scene)) scenarios.push(await describeScenario(Scene, values, options));
  return {
    schema: 1,
    id: meta.id ?? '',
    title: meta.title ?? meta.id ?? '',
    lang: meta.lang ?? 'en',
    sources: [...(meta.sources ?? [])],
    ...((meta as { checkedAgainst?: string }).checkedAgainst ? { checkedAgainst: (meta as { checkedAgainst?: string }).checkedAgainst } : {}),
    ...(meta.grounding ? { grounding: { ...meta.grounding, label: groundingLabel(meta.grounding, meta.lang), sentence: groundingSentence(meta.grounding, meta.lang) } } : {}),
    settings: (Scene.settings ?? []).map((s) => ({ ...s, options: s.options.map((o) => ({ ...o })) })),
    ...(meta.answer ? { answer: meta.answer } : {}),
    ...(meta.questions?.length ? { questions: meta.questions.map((c) => ({ question: c.question, answer: c.answer })) } : {}),
    scenarios,
  };
}

/** One scenario of `describeExplainer`, for a caller that needs only that scenario (`rayner see`). */
export async function describeScenario(Scene: ExplainerClass, values: Settings, options: DescribeOptions = {}): Promise<ScenarioDescription> {
  const Source = options.snapshots ? bindSnapshots(Scene, options.snapshots) : Scene,
    Bound = withSettings(Source, values),
    draw = options.drawings ?? true,
    // Each step's picture as text, drawn as the step ends: every one from the run that traces it.
    drawings = new Map<string, string>(),
    // A trace can add evidence through addJson(); the live model receives only scene.state.
    modelAtRest = new Map<string, SceneState>(),
    { trace, scene } = await traceRun(Bound, {}, (ran, step) => {
      modelAtRest.set(step.path, cloneJson(ran.state, 'describeExplainer()', 'scene.state') as SceneState);
      if (draw === true || draw === step.path) drawings.set(step.path, restingDrawing(ran));
    }),
    paper = paperOf(scene),
    steps: StepDescription[] = [],
    { predictions, problems: predictionProblems } = predictionsOf(trace.steps);
  for (const [index, s] of trace.steps.entries()) {
    const { before, after } = stepStates(s, trace.steps[index - 1]),
      shown = withoutPicture(s.shown),
      changed: StepDescription['changed'] = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (!same(before[k], after[k]))
        changed[k] = { ...(k in before ? { before: before[k] } : {}), ...(k in after ? { after: after[k] } : {}) };
    const words = stepWords(s);
    const d: StepDescription = {
      step: s.step,
      kind: s.meta.kind ?? 'main',
      title: words.title,
      line: words.line,
      caption: words.caption,
      start: s.t0,
      end: s.t1,
      ...(s.hold == null ? {} : { hold: s.hold }),
      state: after,
      ...(Object.keys(shown).length ? { shown } : {}),
      changed,
      ...(Scene.meta?.watch ? { watched: watchedChanges({ before, after }, Scene.meta.watch, Scene.meta.lang) } : {}),
      picture: pictureSummary(s.shown),
    };
    const events = (s.evidence ?? []).filter((e) => e.kind === 'event').map((e) => String(e.event));
    if (events.length) d.events = events;
    const prediction = predictions.find((p) => p.step === s.step);
    if (prediction) {
      const { prompt, options, answer, reveal } = prediction;
      d.predict = { ...(prompt ? { prompt } : {}), options, answer, reveal };
    }
    const reveals = predictions.filter((p) => p.reveal === s.step).map((p) => p.step);
    if (reveals.length) d.reveals = reveals;
    const drawn = drawings.get(s.step);
    if (drawn !== undefined) d.drawing = drawn;
    steps.push(d);
  }
  const invariants = [...scene.invariants.keys()];
  const lives = liveSteps(scene);
  const machines: MachineDescription[] = machinesOf(scene).map((machine) => {
    const walked = machine.explore(), states = walked.states.length;
    const step = machine.lastPlayedIn;
    const rest = step === null ? undefined : modelAtRest.get(step);
    const base = rest && lives.get(step!)?.machine === machine ? logStart(machine, rest) : null;
    const live = base === null ? undefined : canonicalJson(base.state) === canonicalJson(machine.spec.start) ? walked : machine.explore(base.state);
    return {
      events: [...machine.spec.events],
      start: JSON.parse(JSON.stringify(machine.spec.start)) as SceneState,
      states,
      complete: walked.complete,
      ...(!walked.complete ? { sampled: true as const } : {}),
      ...(machine.lastPlayedIn === null ? {} : { step: machine.lastPlayedIn }),
      ...(base && live ? { live: { from: base.from, state: base.state as SceneState, states: live.states.length, complete: live.complete, ...(!live.complete ? { sampled: true as const } : {}) } } : {}),
    };
  });
  return {
    values,
    name: scenarioName(Scene, values),
    duration: trace.duration,
    ...(paper ? { paper } : {}),
    ...(invariants.length ? { invariants } : {}),
    ...(machines.length ? { machines } : {}),
    teaching: teachingIndices(trace.steps).map((i) => trace.steps[i]!.step),
    ...(predictionProblems.length ? { predictionProblems } : {}),
    steps,
  };
}

/**
 * A step's resting picture as text: the scene as the step ends, drawn without the heading (number,
 * title, line) that names the step, since whoever reads the drawing has the step's title and line
 * beside it. The one text drawing of a resting picture: `describe`'s `drawing` and `rayner check`'s
 * `restingFrames` are both this.
 */
export function restingDrawing(scene: Scene): string {
  return withoutHeading(scene, () => renderText(scene));
}
