import type { LetteringRequest } from '../src/lettering-outlines.ts';
import type { Scene, SceneClass } from '../src/index.ts';
import { useDiagrams, snapshotResolver } from '../integrations/agentic-mermaid/snapshot.ts';
import type { SnapshotStore, DiagramResolver } from '../integrations/agentic-mermaid/snapshot.ts';

export interface Setting {
  id: string;
  label: string;
  default: string;
  options: readonly { value: string; label: string }[];
}
export type Settings = Readonly<Record<string, string>>;
export type ExplainerClass = SceneClass & {
  /**
   * `lang` is the BCP 47 language of titles, captions and on-stage text (default `en`). `watch` names
   * the state readers follow, from a `scene.state` key to its label in that language (at most eight):
   * each step shows what it changed of these, under its caption.
   */
  meta?: {
    id?: string;
    title?: string;
    lang?: string;
    sources?: readonly string[];
    lettering?: LetteringRequest;
    /** Use Scene.text()/TextOpts.shaping instead of ambient lettering constructors. */
    textContext?: 'explicit';
    /** A scenario picker starts at its first step; transcript links enter there too. Direct step URLs still work. */
    scenarioNavigation?: 'first';
    /** Palette/corner cues and an optional standalone stage-width floor in CSS pixels (at most 4096). */
    /**
     * Palette/corner cues, an optional standalone stage-width floor in CSS pixels (at most 4096), and
     * `outline`: show every step's title in the steps rail from the start. By default the rail names
     * only the steps the reader has reached, so a later step's title cannot answer an earlier question.
     */
    player?: { accent?: boolean; paper?: boolean; corners?: 'rounded' | 'square'; minStageWidth?: number; outline?: boolean };
    watch?: Readonly<Record<string, string>>;
    /**
     * The script's answer to the reader's question, in one sentence. `check` fails when no teaching
     * step's title, line or caption contains it, and reports the step where it first appears; it
     * should come before the explanation elaborates.
     */
    answer?: string;
    /**
     * Questions a reader should be able to answer afterwards, each with its answer (at most six). The
     * player asks them after the last step, with each answer behind a disclosure; the transcript and
     * `describeExplainer` carry them too.
     */
    checks?: readonly { question: string; answer: string }[];
    /**
     * Claims that reach beyond the scenarios shown (a sentence with "every", "never", "only" and the like),
     * each with the test that holds it: `says` is a phrase of the sentence, `test` is
     * "test/<file>.test.ts: <part of the test's name>"; or `shown: true` when the sentence speaks only of
     * what its own step draws. `check` fails a claim no step states or whose test is not there, and
     * reports scope sentences no claim backs (explain/claims.ts).
     */
    claims?: readonly ({ says: string; test: string } | { says: string; shown: true })[];
  };
  settings?: readonly Setting[];
};
/** Settings bound by `withSettings`, per bound class: visible from the first line of any constructor. */
const bound = new WeakMap<object, Settings>();
/**
 * The query keys a page reads itself, beside its settings: the step, the events a reader sent
 * at a live step (app/embed-live.ts), the embedding host's origin and the theme. No setting may
 * take one as its id.
 */
export const PAGE_QUERY = { step: 'step', sent: 'sent', parentOrigin: 'parentOrigin', theme: 'theme' } as const;
const reserved = new Set<string>(Object.values(PAGE_QUERY));
/** A page's query for a scenario's `values` at `step` (the scenario's first step without one), without the `?`. */
export const stepQuery = (values: Readonly<Record<string, string>>, step?: string): string =>
  new URLSearchParams({ ...values, ...(step === undefined ? {} : { [PAGE_QUERY.step]: step }) }).toString();

/** What is wrong with a URL's settings, so each language can say it in its own words. */
export type SettingsProblem =
  | { kind: 'option'; id: string; label: string; value: string }
  | { kind: 'setting'; id: string }
  /** Anything else the validator refuses, with its (English) message. */
  | { kind: 'other'; message: string };
/** What resolveSettings throws: its English message, and the problem for a page to say in its own words. */
export class SettingsError extends Error {
  readonly problem: SettingsProblem;
  constructor(problem: SettingsProblem, message = problem.kind === 'other' ? problem.message : '') {
    super(message);
    this.problem = problem;
  }
}
/** Why resolveSettings refused: the problem it found, or its message for any other error. */
export const settingsProblem = (error: unknown): SettingsProblem =>
  error instanceof SettingsError ? error.problem : { kind: 'other', message: String((error as Error)?.message ?? error) };

/** Validate declarations and selections once, at the author/URL boundary. */
export function resolveSettings(Scene: ExplainerClass, values: Settings = {}): Settings {
  const result: Record<string, string> = Object.create(null);
  for (const s of Scene.settings ?? []) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(s.id) || reserved.has(s.id) || s.id in result)
      throw new Error(`Invalid or duplicate setting id: ${s.id}`);
    const options = s.options.map((o) => o.value);
    if (!options.length || new Set(options).size !== options.length || !options.includes(s.default))
      throw new Error(`Invalid options/default for setting: ${s.id}`);
    // Own keys only: an id such as `constructor` must not read Object.prototype.
    const value = Object.hasOwn(values, s.id) ? values[s.id]! : s.default;
    if (!options.includes(value)) throw new SettingsError({ kind: 'option', id: s.id, label: s.label, value }, `Unknown ${s.id} option: ${value}`);
    result[s.id] = value;
  }
  for (const id of Object.keys(values)) if (!(id in result)) throw new SettingsError({ kind: 'setting', id }, `Unknown setting: ${id}`);
  return Object.freeze(result);
}

export function settingsOf(scene: Scene): Settings {
  for (let c: object | null = scene.constructor; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    const settings = bound.get(c);
    if (settings) return settings;
  }
  return resolveSettings(scene.constructor as ExplainerClass);
}

/** Bind without mutating the source class or sharing state between readers. */
export function withSettings(Source: ExplainerClass, values: Settings = {}): ExplainerClass {
  const settings = resolveSettings(Source, values);
  const Bound = class extends Source {};
  bound.set(Bound, settings);
  return Bound;
}

/**
 * A scenario as readers see it, "Label: option · Label: option"; empty for a scene without
 * settings. `setting` names one setting, in English unless given a language's (embed-strings.ts
 * scenarioNameIn).
 */
export function scenarioName(Scene: ExplainerClass, values: Settings,
  setting: (label: string, option: string) => string = (label, option) => `${label}: ${option}`): string {
  return (Scene.settings ?? [])
    .map((s) => setting(s.label, s.options.find((o) => o.value === values[s.id])?.label ?? values[s.id]!))
    .join(' · ');
}

/** Finite cartesian product, in declaration order; refuse accidental build explosions. */
export function scenariosOf(Scene: ExplainerClass, limit = 64): Settings[] {
  resolveSettings(Scene);
  const total = (Scene.settings ?? []).reduce((n, s) => n * s.options.length, 1);
  if (!(total <= limit)) throw new Error(`Settings exceed ${limit} scenarios`);
  let scenarios: Settings[] = [Object.freeze({})];
  for (const s of Scene.settings ?? []) {
    scenarios = scenarios.flatMap((v) => s.options.map((o) => Object.freeze({ ...v, [s.id]: o.value })));
  }
  return scenarios;
}

/** A subclass whose diagrams come from `source`: pinned snapshots, or a resolver that captures them. */
export function bindSnapshots(Source: ExplainerClass, source: SnapshotStore | DiagramResolver): ExplainerClass {
  const resolver = typeof source.diagram === 'function' ? (source as DiagramResolver) : snapshotResolver(source as SnapshotStore);
  return class extends Source {
    constructor(...args: ConstructorParameters<SceneClass>) {
      super(...args);
      useDiagrams(this, resolver);
    }
  };
}
