import type { LetteringRequest } from '../src/lettering-outlines.ts';
import type { Scene, SceneClass } from '../src/index.ts';
import { useDiagrams, snapshotResolver } from './diagram-snapshot.ts';
import type { SnapshotStore, DiagramResolver } from './diagram-snapshot.ts';
import { PAGE_QUERY } from './page-query.ts';

export interface Setting {
  id: string;
  label: string;
  default: string;
  options: readonly { value: string; label: string }[];
}
export type Settings = Readonly<Record<string, string>>;
/**
 * How the explainer's own player looks: palette and corner cues, an optional standalone stage-width
 * floor in CSS pixels (at most 4096), and `outline`: show every step's title in the steps rail from
 * the start. By default the rail names only the steps the reader has reached, so a later step's
 * title cannot answer an earlier question.
 */
export interface PlayerMeta { accent?: boolean; paper?: boolean; corners?: 'rounded' | 'square'; minStageWidth?: number; outline?: boolean }
/**
 * What a scene's `static meta` declares: `static meta = { … } satisfies ExplainerMeta`. Collection
 * refuses a key not named here (and a `player` key not in PlayerMeta), so a misspelt key fails
 * rather than being ignored. A script's intent header supplies `title`, `answer`, `questions` and
 * `checkedAgainst`; a scene with one declares none of those four itself.
 */
export interface ExplainerMeta {
  /** Names the output files; the scene's folder name (or its file's, for a scene not named scene.ts) unless declared. One path segment: letters, digits, - and _. */
  id?: string;
  /** The page title. */
  title?: string;
  /** The BCP 47 language of titles, captions and on-stage text (default `en`). */
  lang?: string;
  /** Listed under the transcript. */
  sources?: readonly string[];
  /** Scripts, faces, styles or maths the build cuts lettering for. */
  lettering?: LetteringRequest;
  /** Use Scene.text()/TextOptions.shaping instead of ambient lettering constructors. */
  textContext?: 'explicit';
  /** A scenario picker starts at its first step; transcript links enter there too. Direct step URLs still work. */
  scenarioNavigation?: 'first';
  player?: PlayerMeta;
  /**
   * The state readers follow, from a `scene.state` key to its label in the scene's language (at most
   * eight): each step shows what it changed of these, under its caption.
   */
  watch?: Readonly<Record<string, string>>;
  /**
   * The script's answer to the reader's question, in one sentence. `check` fails when no teaching
   * step's title, line or caption contains it, and reports the step where it first appears; it
   * should come before the explanation elaborates.
   */
  answer?: string;
  /**
   * Questions a reader should be able to answer afterwards, each with its answer (at most six): the
   * script's `## Check yourself` list. The player asks them after the last step, with each answer
   * behind a disclosure; the transcript and `describeExplainer` carry them too.
   */
  questions?: readonly { question: string; answer: string }[];
  /** What the model is checked against, shown under the sources; each file it names in backticks must be in the explainer's folder. */
  checkedAgainst?: string;
  /**
   * Claims that reach beyond the scenarios shown (a sentence with "every", "never", "only" and the like),
   * each with the test that holds it: `says` is a phrase of the sentence, `test` is
   * "test/<file>.test.ts: <part of the test's name>"; or `shown: true` when the sentence speaks only of
   * what its own step draws. `check` fails a claim no step states or whose test is not there, and
   * reports scope sentences no claim backs (explain/claims.ts).
   */
  claims?: readonly ({ says: string; test: string } | { says: string; shown: true })[];
}
export type ExplainerClass = SceneClass & {
  meta?: ExplainerMeta;
  settings?: readonly Setting[];
};
// Every key of ExplainerMeta and PlayerMeta, so the type and the check below cannot drift apart.
const META_KEYS: { readonly [K in keyof Required<ExplainerMeta>]: true } = {
  id: true, title: true, lang: true, sources: true, lettering: true, textContext: true, scenarioNavigation: true,
  player: true, watch: true, answer: true, questions: true, checkedAgainst: true, claims: true,
};
const PLAYER_KEYS: { readonly [K in keyof Required<PlayerMeta>]: true } = { accent: true, paper: true, corners: true, minStageWidth: true, outline: true };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** The names that travel in a link or name a file. */
export type IdentifierKind = 'event' | 'id' | 'step';
/**
 * The names Windows reserves for devices, in any case and with any extension: a file or folder so
 * named cannot be written there, so a page or share page named by one could not be copied to it.
 */
const DEVICE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
/** Each kind of name, and the rule it keeps. */
const IDENTIFIERS: Readonly<Record<IdentifierKind, { valid: (name: string) => boolean; rule: string }>> = {
  // A link lists the events a reader sent joined by commas (app/embed-live.ts encodeLog).
  event: { valid: (name) => name.trim() !== '' && !name.includes(','), rule: 'words with no comma, as a link joins the events a reader sent with commas' },
  // It names the page's files, <id>.html, <id>.png and the folder of its share pages, and the site's
  // catalog and evidence, which hold it to this same rule: lower case, so no two differ only in case.
  id: { valid: (name) => /^[a-z0-9][a-z0-9-]*$/.test(name) && !DEVICE_NAME.test(name), rule: 'one path segment of lowercase letters, digits and -, starting with a letter or digit, and not a name Windows keeps for a device (con, nul, com1 and the like), as it names the page\'s files' },
  // A step so named has a share page, <id>/<step>.html; any other keeps its query link.
  step: { valid: (name) => /^[A-Za-z0-9_-]+$/.test(name) && !DEVICE_NAME.test(name), rule: 'letters, digits, - and _, and not a name Windows keeps for a device (con, nul, com1 and the like), as it names its share page' },
};
/**
 * Whether `name` is a name of this kind that can travel in a link or name a file: a machine's event
 * (words with no comma), a scene's `meta.id` (one safe path segment), or a step name a share page
 * can be named by. One validator for the three, so the player, the command and the site agree.
 */
export const isIdentifier = (kind: IdentifierKind, name: unknown): name is string => typeof name === 'string' && IDENTIFIERS[kind].valid(name);
/** The rule a name of this kind keeps, for an error message. */
export const identifierRule = (kind: IdentifierKind): string => IDENTIFIERS[kind].rule;

/**
 * Refuse `static meta` keys that ExplainerMeta does not name, and `meta.player` keys that PlayerMeta
 * does not, naming the key and the known keys, and a `meta.id` that is not one safe path segment.
 * The type catches a misspelt key in a literal written at the declaration; this catches it however
 * the object was built.
 */
export function checkExplainerMeta(meta: unknown): void {
  if (meta === undefined) return;
  if (!isRecord(meta)) throw new TypeError('static meta: it must be an object');
  const unknown = (keys: object, value: Record<string, unknown>, where: string) => {
    const extra = Object.keys(value).filter((k) => !Object.hasOwn(keys, k));
    if (extra.length)
      throw new TypeError(`${where}: ${extra.map((k) => JSON.stringify(k)).join(', ')} ${extra.length > 1 ? 'are not keys' : 'is not a key'} it takes; it takes ${Object.keys(keys).join(', ')}`);
  };
  unknown(META_KEYS, meta, 'static meta');
  if (meta.id !== undefined && typeof meta.id !== 'string') throw new TypeError('meta.id: it must be a string');
  if (meta.id !== undefined && !isIdentifier('id', meta.id)) throw new RangeError(`meta.id: ${JSON.stringify(meta.id)} is not a page id; an id is ${identifierRule('id')}`);
  if (meta.player === undefined) return;
  if (!isRecord(meta.player)) throw new TypeError('meta.player: it must be an object');
  unknown(PLAYER_KEYS, meta.player, 'meta.player');
}
/** Settings bound by `withSettings`, per bound class: visible from the first line of any constructor. */
const bound = new WeakMap<object, Settings>();
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
      throw new Error(`static settings: ${JSON.stringify(s.id)} is not a setting id, or is used twice; an id matches [A-Za-z][A-Za-z0-9_-]*, is not ${[...reserved].join(', ')}, and names one setting`);
    const options = s.options.map((o) => o.value);
    if (!options.length || new Set(options).size !== options.length || !options.includes(s.default))
      throw new Error(`static settings: the setting ${JSON.stringify(s.id)} needs distinct option values, and a default that is one of them`);
    // Own keys only: an id such as `constructor` must not read Object.prototype.
    const value = Object.hasOwn(values, s.id) ? values[s.id]! : s.default;
    if (!options.includes(value)) throw new SettingsError({ kind: 'option', id: s.id, label: s.label, value }, `resolveSettings(): ${JSON.stringify(value)} is not an option of the setting ${JSON.stringify(s.id)}; it takes ${options.join(', ')}`);
    result[s.id] = value;
  }
  for (const id of Object.keys(values)) if (!(id in result)) throw new SettingsError({ kind: 'setting', id }, `resolveSettings(): the scene has no setting ${JSON.stringify(id)}`);
  return Object.freeze(result);
}

export function settingsOf(scene: Scene): Settings {
  for (let c: object | null = scene.constructor; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    const settings = bound.get(c);
    if (settings) return settings;
  }
  return resolveSettings(scene.constructor as ExplainerClass);
}

/**
 * Bind without mutating the source class or sharing state between readers. The bound class is
 * typed as the source, so its trace is typed as the source's (TraceOf).
 */
export function withSettings<C extends ExplainerClass>(Source: C, values: Settings = {}): C {
  const settings = resolveSettings(Source, values);
  const Bound = class extends (Source as ExplainerClass) {};
  bound.set(Bound, settings);
  return Bound as C;
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
  if (!(total <= limit)) throw new RangeError(`static settings: they make ${total} scenarios, more than ${limit}; remove a setting or some options`);
  let scenarios: Settings[] = [Object.freeze({})];
  for (const s of Scene.settings ?? []) {
    scenarios = scenarios.flatMap((v) => s.options.map((o) => Object.freeze({ ...v, [s.id]: o.value })));
  }
  return scenarios;
}

/**
 * A subclass whose diagrams come from `source`: pinned snapshots, or a resolver that captures them.
 * It is typed as the source, as withSettings' is.
 */
export function bindSnapshots<C extends ExplainerClass>(Source: C, source: SnapshotStore | DiagramResolver): C {
  const resolver = typeof source.diagram === 'function' ? (source as DiagramResolver) : snapshotResolver(source as SnapshotStore);
  return class extends (Source as ExplainerClass) {
    constructor(...args: ConstructorParameters<SceneClass>) {
      super(...args);
      useDiagrams(this, resolver);
    }
  } as C;
}
