import type { LetteringRequest } from '../src/lettering-outlines.ts';
import type { Scene, SceneClass } from '../src/index.ts';

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
    /** A case picker starts at its first step; transcript links enter there too. Direct step URLs still work. */
    caseNavigation?: 'first';
    /** Palette/corner cues and an optional standalone stage-width floor in CSS pixels (at most 4096). */
    /**
     * Palette/corner cues, an optional standalone stage-width floor in CSS pixels (at most 4096), and
     * `outline`: show every step's title in the steps rail from the start. By default the rail names
     * only the steps the reader has reached, so a later step's title cannot answer an earlier question.
     */
    player?: { accent?: boolean; paper?: boolean; corners?: 'rounded' | 'square'; minStageWidth?: number; outline?: boolean };
    watch?: Readonly<Record<string, string>>;
    /**
     * The script's answer to the reader's question, in one sentence. `check` requires the title, line
     * or caption of one of the first two teaching steps to contain it, so the explanation answers
     * before it elaborates.
     */
    answer?: string;
    /**
     * Questions a reader should be able to answer afterwards, each with its answer (at most six). The
     * player asks them after the last step, with each answer behind a disclosure; the transcript and
     * `describeExplainer` carry them too.
     */
    checks?: readonly { question: string; answer: string }[];
  };
  settings?: readonly Setting[];
};
/** Settings bound by `withSettings`, per bound class: visible from the first line of any constructor. */
const bound = new WeakMap<object, Settings>();
// Query parameters the embed reads itself.
const reserved = new Set(['step', 'parentOrigin', 'theme']);

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
    if (!options.includes(value)) throw new Error(`Unknown ${s.id} option: ${value}`);
    result[s.id] = value;
  }
  for (const id of Object.keys(values)) if (!(id in result)) throw new Error(`Unknown setting: ${id}`);
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

/** A case as readers see it, "Label: option · Label: option"; empty for a scene without settings. */
export function caseName(Scene: ExplainerClass, values: Settings): string {
  return (Scene.settings ?? [])
    .map((s) => `${s.label}: ${s.options.find((o) => o.value === values[s.id])?.label ?? values[s.id]}`)
    .join(' · ');
}

/** Finite cartesian product, in declaration order; refuse accidental build explosions. */
export function variantsOf(Scene: ExplainerClass, limit = 64): Settings[] {
  resolveSettings(Scene);
  const total = (Scene.settings ?? []).reduce((n, s) => n * s.options.length, 1);
  if (!(total <= limit)) throw new Error(`Settings exceed ${limit} cases`);
  let variants: Settings[] = [Object.freeze({})];
  for (const s of Scene.settings ?? []) {
    variants = variants.flatMap((v) => s.options.map((o) => Object.freeze({ ...v, [s.id]: o.value })));
  }
  return variants;
}
