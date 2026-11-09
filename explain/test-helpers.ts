// The assertions and the diagram helper rayner/testing gives an author's tests: a step's state
// against the program it explains, the steps a story passes through in order, a view against the
// state at the end of every step, and a diagram built from a pinned snapshot to read its words.
// They throw plain errors, so they need no assertion library and run under any test runner.
import { Scene } from '../src/scene.ts';
import type { SceneClass, SceneState } from '../src/scene.ts';
import { TraceSink } from '../src/trace.ts';
import type { StepRecord } from '../src/trace.ts';
import { NullSink } from '../src/timeline.ts';
import { loadFonts } from '../src/fonts.ts';
import type { Mobject } from '../src/mobject.ts';
import { viewMismatch } from './view.ts';
import type { View } from './view.ts';
import { Diagram } from './diagrams.ts';
import type { DiagramSnapshot } from './diagram-snapshot.ts';
import type { StepKind } from './script.ts';

/** Two JSON values are the same: equal primitives, arrays item by item, objects key by key. */
function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameJson(item, b[i]));
  const plain = (o: object) => [Object.prototype, null].includes(Object.getPrototypeOf(o));
  if (!plain(a) || !plain(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const json = (value: unknown) => (value === undefined ? 'undefined' : JSON.stringify(value));

/**
 * Fail unless the step named `step` ended with each field of `expected` in its state (the trace's
 * `after`): the scene against the program it explains. Fields `expected` does not name are not
 * compared. Throws a RangeError when the trace has no such step, and an Error naming the field,
 * its value and the expected value when one differs.
 */
export function assertStepState(trace: { readonly steps: readonly Pick<StepRecord<object>, 'step' | 'after'>[] }, step: string, expected: Readonly<Record<string, unknown>>): void {
  const after = trace.steps.find((s) => s.step === step)?.after;
  if (!after) throw new RangeError(`assertStepState(): no step "${step}" ended; the steps are ${trace.steps.map((s) => s.step).join(', ')}`);
  for (const [key, value] of Object.entries(expected)) {
    const actual = (after as Record<string, unknown>)[key];
    if (!sameJson(actual, value)) throw new Error(`assertStepState(): step "${step}" ended with ${key} ${json(actual)}, not ${json(value)}`);
  }
}

/** A path through the steps: one kind, or 'story', every step but the details. */
export type StepPath = StepKind | 'story';

/**
 * Fail unless each of `names` is a step of the trace, in this order, other steps allowed between
 * them; with a path, only the steps on it count. A test that names the few steps it reads keeps
 * passing when the story gains or loses others.
 */
export function assertSteps(trace: { readonly steps: readonly Pick<StepRecord<object>, 'step' | 'meta'>[] }, names: readonly string[], path?: StepPath): void {
  const ids = trace.steps.filter((s) => !path || (path === 'story' ? s.meta.kind !== 'detail' : (s.meta.kind ?? 'main') === path)).map((s) => s.step);
  let at = 0;
  for (const name of names) {
    const found = ids.indexOf(name, at);
    if (found < 0)
      throw new Error(`assertSteps(): no step "${name}"${path ? ` on the ${path} path` : ''} after "${ids[at - 1] ?? 'the start'}"; the steps are ${ids.join(', ')}`);
    at = found + 1;
  }
}

/**
 * Run the scene and fail unless, at the end of every step, the view `pick` finds shows what `draw`
 * (by default the view's own) makes of the state the trace records then (viewMismatch): the
 * picture tells the same story as the state. Steps before the view exists are skipped, and it
 * fails if the view never exists. Returns how many steps it checked.
 */
export async function assertViewFollowsState(
  Explainer: SceneClass,
  pick: (scene: Scene) => View | null | undefined,
  draw?: (state: SceneState, shown: SceneState) => Mobject,
): Promise<number> {
  // Per step: null before the view exists, else viewMismatch's answer (null when they agree).
  const checks: ({ mismatch: string | null } | null)[] = [];
  const sink = new TraceSink((scene) => {
    const v = pick(scene), end = sink.steps().at(-1)!;
    checks.push(v ? { mismatch: viewMismatch(v, end.after, { shown: end.shown ?? {}, draw: draw ?? v.draw }) } : null);
  });
  await new Explainer(sink, { skipUntil: Infinity }).run();
  let checked = 0;
  sink.steps().forEach((s, i) => {
    const c = checks[i];
    if (!c) return;
    if (c.mismatch !== null) throw new Error(`assertViewFollowsState(): at the end of step "${s.step}", ${c.mismatch}`);
    checked++;
  });
  if (!checked) throw new Error('assertViewFollowsState(): pick found no view at the end of any step');
  return checked;
}

/**
 * The diagram a pinned snapshot draws, built in full (or, with `build: 'frame'`, its scaffolding
 * only, as `s.show(…, { build: 'frame' })` brings it in) on a scene of its own that draws nothing:
 * for a test that reads its words (`d.describe()`), its parts or a reveal. `lang` is the scene's
 * description language (`meta.lang`).
 */
export async function diagramOf(snapshot: DiagramSnapshot, { lang, build = 'all' }: { lang?: string; build?: 'all' | 'frame' } = {}): Promise<Diagram> {
  await loadFonts();
  class Shown extends Scene {
    static meta = { id: 'diagram', title: 'Diagram', ...(lang ? { lang } : {}) };
  }
  const d = new Diagram(new Shown(new NullSink(), { skipUntil: Infinity }), snapshot.spec, snapshot, {});
  await d.build(build);
  return d;
}
