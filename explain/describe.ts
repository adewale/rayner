// An explainer as data, for agents: every scenario and every step, with the words a reader gets,
// the state the scene recorded, what each step changed and its resting picture drawn as text.
// One definition behind `rayner describe` and anything an agent imports; it runs the scene in
// Node or a browser, with no Chromium, given the diagrams' pinned snapshots.
import { renderText } from '../src/output.ts';
import { machinesOf } from './machine.ts';
import { traceRun } from '../src/trace.ts';
import type { Scene, SceneState } from '../src/index.ts';
import { scenariosOf, withSettings, scenarioName, bindSnapshots } from './settings.ts';
import type { ExplainerClass, Setting, Settings } from './settings.ts';
import { pictureSummary, stepWords, watchedChanges } from './trace.ts';
import type { WatchedChange } from './trace.ts';
import { isHeading, paperOf } from './stage.ts';
import type { SnapshotStore, DiagramResolver } from '../integrations/agentic-mermaid/snapshot.ts';

/** One step of one scenario. Times are seconds on the scene's clock. */
export interface StepDescription {
  step: string;
  title: string;
  /** The few words under the title, drawn on the picture; empty when the step has none. */
  line: string;
  caption: string;
  start: number;
  end: number;
  /** When the caption-reading hold begins, if the step has one. */
  hold?: number;
  /** The model, `scene.state`, when the step ends. */
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
}
/**
 * A model the scene lets events drive (src/machine.ts): what a reader could do, and where from.
 * `states` counts the states those events reach, breadth first up to the machine's limit
 * (`sampled` when it was reached), each of which `rayner check` draws and checks.
 */
export interface MachineDescription {
  events: string[];
  start: SceneState;
  states: number;
  sampled?: true;
  /** The step where the reader can drive it: the step it last played in (docs/MACHINES.md, "The player"); absent when it never played. */
  step?: string;
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
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
    { trace, scene } = await traceRun(Bound, {}, (ran, step) => {
      if (draw === true || draw === step.path) drawings.set(step.path, drawing(ran));
    }),
    paper = paperOf(scene),
    steps: StepDescription[] = [];
  for (const s of trace.steps) {
    const before = s.before,
      after = s.after ?? {},
      shown = withoutPicture(s.shown),
      changed: StepDescription['changed'] = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (!same(before[k], after[k]))
        changed[k] = { ...(k in before ? { before: before[k] } : {}), ...(k in after ? { after: after[k] } : {}) };
    const words = stepWords(s);
    const d: StepDescription = {
      step: s.step,
      title: words.title,
      line: words.line,
      caption: words.caption,
      start: s.t0,
      end: s.t1 ?? trace.duration,
      ...(s.hold == null ? {} : { hold: s.hold }),
      state: after,
      ...(Object.keys(shown).length ? { shown } : {}),
      changed,
      ...(Scene.meta?.watch ? { watched: watchedChanges(s, Scene.meta.watch, Scene.meta.lang) } : {}),
      picture: pictureSummary(s.shown),
    };
    const events = (s.evidence ?? []).filter((e) => e.kind === 'event').map((e) => String(e.event));
    if (events.length) d.events = events;
    const drawn = drawings.get(s.step);
    if (drawn !== undefined) d.drawing = drawn;
    steps.push(d);
  }
  const invariants = [...scene.invariants.keys()];
  const machines: MachineDescription[] = machinesOf(scene).map((machine) => {
    const states = machine.reachable().length;
    return {
      events: [...machine.spec.events],
      start: JSON.parse(JSON.stringify(machine.spec.start)) as SceneState,
      states,
      ...(states >= machine.spec.limit ? { sampled: true as const } : {}),
      ...(machine.lastPlayedIn === null ? {} : { step: machine.lastPlayedIn }),
    };
  });
  return {
    values,
    name: scenarioName(Scene, values),
    duration: trace.duration,
    ...(paper ? { paper } : {}),
    ...(invariants.length ? { invariants } : {}),
    ...(machines.length ? { machines } : {}),
    steps,
  };
}

/** The scene's picture now as text, without the heading that names the step, as `rayner check` draws it. */
function drawing(scene: Scene): string {
  const all = scene.mobjects;
  scene.mobjects = all.filter((m) => !isHeading(m));
  try { return renderText(scene); } finally { scene.mobjects = all; }
}
