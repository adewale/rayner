// An explainer as data, for agents: every case and every step, with the words a reader gets,
// the state the scene recorded, what each step changed and its resting picture drawn as text.
// One definition behind `rayner describe` and anything an agent imports; it runs the scene in
// Node or a browser, with no Chromium, given the diagrams' pinned snapshots.
import { renderAt, renderText } from '../src/index.ts';
import { traceRun } from '../src/trace.ts';
import type { Scene, SceneState, Sink } from '../src/index.ts';
import { variantsOf, withSettings, caseName } from './settings.ts';
import type { ExplainerClass, Setting, Settings } from './settings.ts';
import { pictureSummary, restingTime, stepWords, watchedChanges } from './trace.ts';
import type { WatchedChange } from './trace.ts';
import { isHeading, paperOf } from './stage.ts';
import { bindSnapshots } from './index.ts';
import type { SnapshotStore, DiagramResolver } from '../integrations/agentic-mermaid/snapshot.ts';

/** One step of one case. Times are seconds on the scene's clock. */
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
  /** `scene.state` when the step ends, without the picture description (see `picture`). */
  state: SceneState;
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
}
/** One case: a combination of setting values, as a reader picks it under the title. */
export interface CaseDescription {
  values: Settings;
  /** "Label: option · Label: option"; empty for a scene without settings. */
  name: string;
  duration: number;
  /** The stage's paper colour when the case ends (its palette's `paper`); absent for a scene without a stage. */
  paper?: string;
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
  /** The questions a reader should be able to answer afterwards, with answers (`meta.checks`). */
  checks?: { question: string; answer: string }[];
  cases: CaseDescription[];
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

/** What `Scene` explains, every case and step, in one JSON-safe object. */
export async function describeExplainer(Scene: ExplainerClass, options: DescribeOptions = {}): Promise<ExplainerDescription> {
  const meta = Scene.meta ?? {},
    cases: CaseDescription[] = [];
  for (const values of variantsOf(Scene)) cases.push(await describeCase(Scene, values, options));
  return {
    schema: 1,
    id: meta.id ?? '',
    title: meta.title ?? meta.id ?? '',
    lang: meta.lang ?? 'en',
    sources: [...(meta.sources ?? [])],
    settings: (Scene.settings ?? []).map((s) => ({ ...s, options: s.options.map((o) => ({ ...o })) })),
    ...(meta.answer ? { answer: meta.answer } : {}),
    ...(meta.checks?.length ? { checks: meta.checks.map((c) => ({ question: c.question, answer: c.answer })) } : {}),
    cases,
  };
}

/** One case of `describeExplainer`, for a caller that needs only that case (`rayner see`). */
export async function describeCase(Scene: ExplainerClass, values: Settings, options: DescribeOptions = {}): Promise<CaseDescription> {
  const Source = options.snapshots ? bindSnapshots(Scene, options.snapshots) : Scene,
    Bound = withSettings(Source, values),
    { trace, scene } = await traceRun(Bound),
    paper = paperOf(scene),
    draw = options.drawings ?? true,
    steps: StepDescription[] = [];
  for (const s of trace.steps) {
    const before = withoutPicture(s.before),
      after = withoutPicture(s.after),
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
      changed,
      ...(Scene.meta?.watch ? { watched: watchedChanges(s, Scene.meta.watch, Scene.meta.lang) } : {}),
      picture: pictureSummary(s.after),
    };
    if (draw === true || draw === s.step) d.drawing = await drawing(Bound, restingTime(s, trace.fps));
    steps.push(d);
  }
  return { values, name: caseName(Scene, values), duration: trace.duration, ...(paper ? { paper } : {}), steps };
}

/** The picture at `t` as text, without the heading that names the step, as `rayner check` draws it. */
async function drawing(Bound: ExplainerClass, t: number): Promise<string> {
  const sink: Sink = { async frame() {} };
  const scene: Scene = await renderAt(Bound, t, sink);
  scene.mobjects = scene.mobjects.filter((m) => !isHeading(m));
  return renderText(scene);
}
