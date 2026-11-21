// Typed traces (docs/REFERENCE.md, "Typed traces"): traceScene, loadProject and the classes
// withSettings and bindSnapshots bind carry the scene's model and shown types. `tsc -b` checks the
// types below, each `@ts-expect-error` a defect the typing must reject; the tests run the same
// code, so the types describe what the trace holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/index.ts';
import { loadProject, traceScene, withSettings } from '../explain/testing.ts';
import { bindSnapshots } from '../explain/internal.ts';
import type { Jsonified, StepRecord, Trace, TraceOf } from '../explain/testing.ts';
import type { EndedStep, SceneClass, SceneState, Step } from '../src/index.ts';
import LatestSearch from '../scenes/explainers/latest-search/scene.ts';

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const same = <A, B>(proof: Same<A, B>) => proof;

interface Model { count: number; label?: string; items: string[]; nested: { on: boolean | null }; maybe: number | undefined }
class Typed extends Scene {
  override state: Model = { count: 1, items: ['a'], nested: { on: null }, maybe: undefined };
  override shown: { lit?: string } = {};

  override async construct() {
    this.shown.lit = 'a';
    await this.step('one');
    this.state.count = 2;
  }
}
class DynamicState extends Scene {
  override state: SceneState = {};
  override shown: SceneState = {};
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

test('traceScene preserves initialized fields and explicit dynamic dictionaries', async () => {
  same<TraceOf<typeof Typed>, Trace<Jsonified<Model>, Jsonified<{ lit?: string }>>>(true);
  same<TraceOf<typeof DynamicState>, Trace>(true);
  same<TraceOf<any>, Trace>(true);
  same<TraceOf<SceneClass>, Trace>(true);
  class Empty extends Scene {}
  same<keyof TraceOf<typeof Empty>['steps'][number]['after'], never>(true);
  const trace = await traceScene(Typed);
  const after = trace.steps[0]!.after;
  const count: number = after.count;
  // Framework evidence is not a model field.
  // @ts-expect-error the model declares no walks field
  const walks: unknown = after.walks;
  void walks;
  assert.equal(count, 2);
  assert.equal(trace.steps[0]!.before.count, 1);
  // @ts-expect-error a key the model does not name
  void after.cuont;
  // Authored presentation is exact; derived observations have a separate channel.
  const lit: string | undefined = trace.steps[0]!.shown?.lit;
  assert.equal(lit, 'a');
  // @ts-expect-error derived fields never appear in authored presentation
  void trace.steps[0]!.shown?.picture;
  const extra: unknown = trace.steps[0]!.derived?.picture;
  void extra;
  // A typed trace goes wherever a plain one does.
  const plain: Trace = trace;
  void plain;
  const loose = await traceScene(DynamicState);
  assert.equal(loose.steps[0]!.after.anything, 1);
});

test('an interface-initialized state is a valid scene constructor and its trace keeps concrete field types', async () => {
  interface Counter { count: number; label: string }
  const initial = (): Counter => ({ count: 7, label: 'seven' });
  class InterfaceState extends Scene {
    override state: Counter = initial();
    override async construct() { await this.step('one'); this.state.count++; }
  }
  const constructor: SceneClass = InterfaceState;
  const trace = await traceScene(InterfaceState);
  const count: number = trace.steps[0]!.after.count;
  const label: string = trace.steps[0]!.after.label;
  assert.deepEqual({ count, label }, { count: 8, label: 'seven' });
  const erased = await traceScene(constructor);
  const unknown: unknown = erased.steps[0]!.after.count;
  // @ts-expect-error an erased constructor's model remains unknown JSON, not any
  const unsafe: number = erased.steps[0]!.after.count;
  void [unknown, unsafe];
});

test('the classes withSettings and bindSnapshots bind, and loadProject, keep the scene type', async () => {
  same<ReturnType<typeof withSettings<typeof Typed>>, typeof Typed>(true);
  same<ReturnType<typeof bindSnapshots<typeof Typed>>, typeof Typed>(true);
  const bound = await traceScene(withSettings(bindSnapshots(Typed, {}), {}));
  assert.equal(bound.steps[0]!.after.items[0], 'a');
  const project = await loadProject(LatestSearch, 'scenes/explainers/latest-search');
  same<typeof project.scenarios[number]['trace'], TraceOf<typeof LatestSearch>>(true);
  same<ReturnType<typeof project.scenario>['trace'], TraceOf<typeof LatestSearch>>(true);
  const last = project.scenario().trace.steps.at(-1)!.after;
  // A union model: a key only one shape has needs narrowing first.
  // @ts-expect-error `log` is the race's alone
  void last.log;
  assert.ok('log' in last && Array.isArray(last.log));
});

test('a trace holds ended steps only, so each one\'s end, last frame and state after are always there', async () => {
  const { TraceSink } = await import('../explain/testing.ts');
  const { StopScene } = await import('../src/scene.ts');
  // The types say so: a step record's end needs no check before it is read.
  same<StepRecord['t1'], number>(true);
  same<StepRecord['frame1'], number>(true);
  same<StepRecord['after'], SceneState>(true);
  // @ts-expect-error a running Step marks a step not yet ended with null; a record never does
  same<StepRecord['frame1'], number | null>(true);
  // An EndedStep is a Step whose end is set: what a sink's stepEnd and a metadata function are given.
  same<EndedStep['t1'], number>(true);
  same<EndedStep['frame1'], number>(true);
  same<Step['frame1'], number | null>(true);
  const trace = await traceScene(Typed);
  // A record's metadata is the frozen copy the step began with, and typed read-only.
  const meta = trace.steps[0]!.meta;
  // @ts-expect-error read-only, as it is frozen
  assert.throws(() => { meta.caption = 'changed'; }, TypeError);
  for (const s of trace.steps) assert.ok(Number.isInteger(s.frame1) && typeof s.t1 === 'number' && typeof s.after === 'object', s.step);
  // A run stopped inside a step leaves that step out: it never ended, so it has no record to give.
  class Stopped extends Scene {
    override async construct() {
      await this.step('one');
      await this.wait(0.2);
      await this.step('two');
      await this.wait(0.2);
      throw new StopScene();
    }
  }
  const sink = new TraceSink();
  await new Stopped(sink).run();
  assert.deepEqual(sink.steps().map((s) => [s.step, s.frame0, s.frame1]), [['one', 0, 6]]);
});

test('frame zero receives the bound model and shown before construct runs', async () => {
  const { settingsOf } = await import('../explain/index.ts');
  const { StopScene } = await import('../src/scene.ts');
  class Counter extends Scene {
    static settings = [{ id: 'start', label: 'Start', default: 'one', options: [
      { value: 'one', label: 'One' }, { value: 'two', label: 'Two' },
    ] }] as const;
    override state: { count: number } = { count: settingsOf(this, Counter).start === 'two' ? 2 : 1 };
    override shown = { label: String(this.state.count) };
    override async construct() { assert.fail('the sink stopped on the first frame'); }
  }
  for (const [value, count] of [['two', 2], ['one', 1]] as const) {
    const Bound = withSettings(Counter, { start: value });
    let frames = 0;
    const scene = new Bound({ async frame(actual, dt) {
      assert.equal(dt, 0);
      assert.equal(actual.frameCount, 0);
      assert.deepEqual(actual.stateJson(), { count });
      assert.deepEqual(actual.shownJson(), { label: String(count) });
      frames++;
      throw new StopScene();
    } });
    assert.equal(scene.state.count, count);
    assert.equal(scene.shown.label, String(count));
    await scene.run();
    assert.equal(frames, 1);
  }
});

test('invalid initial JSON is refused before frame zero and construct, even without steps', async () => {
  for (const channel of ['state', 'shown'] as const) {
    let frames = 0, constructs = 0;
    class Broken extends Scene {
      override async construct() { constructs++; }
    }
    const broken = new Broken({ async frame() { frames++; } });
    broken[channel] = { first: [{ amount: Infinity }] };
    await assert.rejects(broken.run(), { name: 'TypeError', message: `this.${channel}: this.${channel}.first[0].amount must contain finite, acyclic JSON data` });
    assert.deepEqual([frames, constructs], [0, 0]);
  }
});

test('initial validation reads authored fields even if a subclass overrides its JSON convenience methods', async () => {
  let frames = 0;
  class Broken extends Scene {
    override state = { amount: Infinity };
    override stateJson() { return {}; }
    override shownJson() { return {}; }
  }
  await assert.rejects(new Broken({ async frame() { frames++; } }).run(), /this\.state\.amount.*finite, acyclic JSON/);
  assert.equal(frames, 0);
});
