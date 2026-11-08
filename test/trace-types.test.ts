// Typed traces (docs/REFERENCE.md, "Typed traces"): traceScene, loadProject and the classes
// withSettings and bindSnapshots bind carry the scene's model and shown types. `tsc -b` checks the
// types below, each `@ts-expect-error` a defect the typing must reject; the tests run the same
// code, so the types describe what the trace holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/index.ts';
import { bindSnapshots, loadProject, traceScene, withSettings } from '../explain/testing.ts';
import type { Jsonified, Trace, TraceOf } from '../explain/testing.ts';
import LatestSearch from '../scenes/explainers/latest-search/scene.ts';

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const same = <A, B>(proof: Same<A, B>) => proof;

interface Model { count: number; label?: string; items: string[]; nested: { on: boolean | null }; maybe: number | undefined }
class Typed extends Scene<Model, { lit?: string }> {
  override async construct() {
    this.state = { count: 1, items: ['a'], nested: { on: null }, maybe: undefined };
    this.shown.lit = 'a';
    await this.step('one');
    this.state.count = 2;
  }
}
class Untyped extends Scene {
  override async construct() {
    this.state.anything = 1;
    await this.step('one');
  }
}

test('Jsonified maps a JSON-safe type to itself, and what the JSON copy refuses to never', () => {
  same<Jsonified<Model>, { count: number; label?: string; items: string[]; nested: { on: boolean | null }; maybe: number | undefined }>(true);
  same<Jsonified<readonly [number, string]>, readonly [number, string]>(true);
  same<Jsonified<Record<string, unknown>>, Record<string, unknown>>(true);
  same<Jsonified<{ f: () => void; b: bigint }>, { f: never; b: never }>(true);
  same<Jsonified<(number | undefined)[]>, number[]>(true);
  // A model and its JSON copy go wherever each other goes.
  const model: Model = null! as Jsonified<Model>, copy: Jsonified<Model> = null! as Model;
  void model, void copy;
  // @ts-expect-error a function is not JSON
  same<Jsonified<{ f: () => void }>, { f: () => void }>(true);
});

test('traceScene types every state from the scene class, and an untyped scene gives a plain Trace', async () => {
  same<TraceOf<typeof Typed>, Trace<Jsonified<Model>, Jsonified<{ lit?: string }> & Record<string, unknown>>>(true);
  same<TraceOf<typeof Untyped>, Trace>(true);
  same<TraceOf<any>, Trace>(true);
  const trace = await traceScene(Typed);
  const after = trace.steps[0]!.after!;
  const count: number = after.count;
  assert.equal(count, 2);
  assert.equal(trace.steps[0]!.before.count, 1);
  // @ts-expect-error a key the model does not name
  void after.cuont;
  // What is shown is typed, and what helpers add to it (the stage's picture) reads as unknown.
  const lit: string | undefined = trace.steps[0]!.shown?.lit;
  assert.equal(lit, 'a');
  const extra: unknown = trace.steps[0]!.shown?.picture;
  void extra;
  // A typed trace goes wherever a plain one does.
  const plain: Trace = trace;
  void plain;
  const loose = await traceScene(Untyped);
  assert.equal(loose.steps[0]!.after!.anything, 1);
});

test('the classes withSettings and bindSnapshots bind, and loadProject, keep the scene type', async () => {
  same<ReturnType<typeof withSettings<typeof Typed>>, typeof Typed>(true);
  same<ReturnType<typeof bindSnapshots<typeof Typed>>, typeof Typed>(true);
  const bound = await traceScene(withSettings(bindSnapshots(Typed, {}), {}));
  assert.equal(bound.steps[0]!.after!.items[0], 'a');
  const project = await loadProject(LatestSearch, 'scenes/explainers/latest-search');
  same<typeof project.scenarios[number]['trace'], TraceOf<typeof LatestSearch>>(true);
  same<ReturnType<typeof project.scenario>['trace'], TraceOf<typeof LatestSearch>>(true);
  const last = project.scenario().trace.steps.at(-1)!.after!;
  // A union model: a key only one shape has needs narrowing first.
  // @ts-expect-error `log` is the race's alone
  void last.log;
  assert.ok('log' in last && Array.isArray(last.log));
});
