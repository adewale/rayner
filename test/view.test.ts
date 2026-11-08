// view(): the picture as a function of the program's state. A sync rebuilds
// at its play's begin(), morphs by matching, keeps the View's identity and
// anchor, registers no updater (so seeks skip its frames), and the picture at
// every step is what the state renders (the fidelity helper).
import { test } from 'node:test';
import { Square } from '../src/extras.ts';
import type { ViewSync, Card, Stage } from '../explain/index.ts';
import { view, View, having, stage } from '../explain/index.ts';
import { card } from '../explain/drawing.ts';
import assert from 'node:assert/strict';
import { Scene, Group, Text, DecimalNumber, Rectangle, Circle, Animation, FadeIn, Succession } from '../src/index.ts';
import { StringSink, SnapshotSink, renderFrame } from '../src/output.ts';
import { MotionSink, analyzeMotion, perf, loadFonts, viewMismatch } from '../explain/testing.ts';
import type { Mobject, Sink, SceneState } from '../src/index.ts';
import { assertViewFollowsState } from './lib/view-fidelity.ts';
import type { Vec } from '../src/index.ts';
// Manim's values, which the package no longer exports.
const RIGHT: Vec = [1, 0];

/** A scene holding `st` as its state, for views tested without running a scene. */
const held = (st: object = {}) => ({ state: st }) as unknown as Scene;

await loadFonts();
Scene.captionWpm = Infinity;

/** A program step that happens at its turn in a Succession: runs `fn` when it begins, animates nothing. */
class Mutate extends Animation {
  fn: () => void;
  constructor(fn: () => void) { super(new Group(), { runTime: 0.5 }); this.fn = fn; }
  override begin(): void { this.fn(); super.begin(); }
}

const readoutOf = (s: SceneState) => new Text(`len ${s.len}  head ${s.head}`, { font: 'mono', fontSize: 0.4 });

/** A ring buffer's counters as a View of this.state, inside a panel Group. */
class Ring extends Scene {
  static skipSync = false;
  readout?: View<Text>;
  panel!: Group;
  syncs: Record<string, ViewSync<Text>> = {};
  anchors: Array<[number, number]> = [];

  override async construct(): Promise<void> {
    this.state = { len: 0, head: 0 };
    const skip = (this.constructor as typeof Ring).skipSync;
    const readout = view(this, readoutOf, { place: 'left' });
    readout.moveTo([-1, 1]);
    this.readout = readout;
    this.panel = new Group(new Rectangle({ width: 6, height: 1.2 }).moveTo([0, 1]), readout);
    const change = async (name: string, mutate: () => void): Promise<void> => {
      await this.step(name);
      mutate();
      if (skip) { await this.wait(1); return; }
      const s = readout.sync({ match: 'text', staged: false });
      this.syncs[name] = s;
      await this.play(s);
      const f = readout.current.frameBox;
      this.anchors.push([f[0]!, (f[1]! + f[3]!) / 2]);
    };
    await this.step('show');
    await this.play(new FadeIn(this.panel));
    await change('push-a', () => { this.state.len = 1; });
    await change('push-b', () => { this.state.len = 2; });
    await change('pop', () => { this.state.len = 1; this.state.head = 1; });
    await change('grow', () => { this.state.len = 10; });          // a digit more: the text grows to the right
    await change('same', () => {});                                 // nothing changed: nothing moves
    await this.step('turns');
    // Built at its turn: the state the Mutate before it leaves, not the state now
    const box = new Square({ side: 0.5 }).moveTo([4, -2]);
    await this.play(new FadeIn(box), { runTime: 0.5 });
    const seq = new Succession([box.animate.shift(RIGHT), readout.sync({ match: 'text', staged: false }), new Mutate(() => { this.state.head = 2; this.state.len = 9; }), readout.sync({ match: 'text', staged: false })]);
    this.state.len = 11;
    await this.play(seq);
    await this.wait(0.5);
  }
}

test('a sync rebuilds from the state, morphs by glyph, and keeps the View, its parent and its anchor', async () => {
  const s = new Ring(new StringSink());
  await s.run();
  const v = s.readout!;
  assert.equal(v.current.text, 'len 9  head 2');
  assert.ok(v.parent === s.panel && s.panel.children.includes(v), 'the View stays in its group');
  assert.ok(!s.mobjects.includes(v), 'and the scene draws it through the group, not twice');
  assert.equal(v.children.length, 1, 'one child: the current picture');

  // TransformMatchingText: 'len 0  head 0' -> 'len 1  head 0' keeps eight glyphs, each paired with itself
  const push = s.syncs['push-a']!;
  assert.deepEqual(push.summary(), { matched: 8, morphed: 0, removed: 1, added: 1 });
  const charOf = (g: Mobject) => [...(g.parent as Text).text][(g as Mobject & { cluster: number }).cluster];
  for (const [a, b] of (push.inner as unknown as { pairs: Array<[Mobject, Mobject]> }).pairs) assert.equal(charOf(a), charOf(b));
  assert.deepEqual(s.syncs['grow']!.summary(), { matched: 9, morphed: 0, removed: 0, added: 1 }, '1 -> 10: the 1 stays, a 0 grows in');

  // Left-placed: every rebuilt line starts where the first did, at the same height
  for (const [x, y] of s.anchors) {
    assert.ok(Math.abs(x - s.anchors[0]![0]) < 1e-5 && Math.abs(y - s.anchors[0]![1]) < 1e-5, `anchor ${x},${y}`);
  }

  // Nothing changed: no inner transform, the same picture object, and still the full run time
  const same = s.syncs['same']!;
  assert.equal(same.inner, null);
  assert.equal(same.summary(), null);
  const step = s.steps.find((x) => x.name === 'same')!;
  assert.equal(step.frame1! - step.frame0, 30, 'a no-op sync still takes its run time');
});

test('sync() inside a Succession builds from the state at its turn, not at construction', async () => {
  const seen: number[] = [];
  class Lazy extends Scene {
    override async construct() {
      this.state = { n: 0 };
      const v = view(this, (state) => {
        seen.push(state.n as number);
        return new Text(String(state.n));
      });
      this.add(v);
      const seq = new Succession([v.sync({ match: 'text' }), new Mutate(() => { this.state.n = 2; }), v.sync({ match: 'text' })]);
      assert.deepEqual(seen, [0], 'creating syncs does not build their targets');
      this.state.n = 1;
      await this.play(seq);
      assert.equal(v.current.text, '2');
    }
  }
  await new Lazy(new StringSink()).run();
  assert.deepEqual(seen, [0, 1, 2]);
});

test('tween() writes into the picture on screen when it begins: after a sync in the same Succession, the synced one', async () => {
  let before: Mobject | null = null;
  class Tweened extends Scene<{ n: number }, {}> {
    override async construct() {
      this.state = { n: 0 };
      const v = view(this, (st) => new Rectangle({ width: 1 + st.n, height: 1 }), { place: false });
      this.add(v);
      before = v.current;
      this.state.n = 1;
      // Both are made before either plays: the tween's target is the picture the sync swaps in.
      await this.play(new Succession([v.sync({ match: 'index', runTime: 0.2 }), v.tween((t) => ({ n: 1 + t }), { runTime: 0.2 })]));
      assert.notEqual(v.current, before, 'the sync swapped in a new picture');
      assert.ok(Math.abs(v.current.width() - 3) < 1e-6, `the picture on screen is ${v.current.width()} wide, not the tween's 3`);
      assert.ok(Math.abs(before.width() - 2) < 1e-6, 'the picture the sync replaced is left as the sync left it');
      assert.equal(this.state.n, 2);
    }
  }
  await new Tweened(new StringSink()).run();
  assert.ok(before);
});

test('no updaters: seeking skips the frames of plays with syncs, and renders the frame a full run renders', async () => {
  // No updater at any frame
  let frames = 0;
  const watch: Sink = { async frame(scene) { frames++; assert.ok(!scene.hasUpdaters(), `updater at t=${scene.time}`); } };
  await new Ring(watch).run();
  assert.ok(frames > 200);

  const full = new StringSink();
  const s = await new Ring(full).run();
  const at = (name: string) => s.steps.find((x) => x.name === name)!.frame0;
  // Before, inside (first, middle, last frame) and after each kind of sync, and through the Succession
  const ks = new Set<number>([0, 20]);
  for (const n of ['push-a', 'pop', 'grow', 'same', 'turns']) for (const d of [0, 1, 12, 15, 29, 30, 31]) ks.add(at(n) + d);
  for (const d of [45, 60, 61, 75, 90, 105, 120]) ks.add(at('turns') + d);
  ks.add(full.frames.length - 1);
  for (const k of [...ks].sort((a, b) => a - b)) {
    const snap = new SnapshotSink();
    perf.enable();
    try { await renderFrame(Ring, k, snap); } finally { perf.disable(); }
    assert.equal(snap.svg, full.frames[k], `frame ${k}`);
    if (k > 30) assert.ok((perf.counters.get('frames skipped') ?? 0) > 0, `frame ${k}: the seek skipped frames`);
  }
});

test('syncs are free of motion discontinuities', async () => {
  const sink = new MotionSink();
  await new Ring(sink).run();
  assert.deepEqual(analyzeMotion(sink).map((e) => `${e.t}s ${e.kind} [${e.step}] ${e.what} ${e.detail}`), []);
});

test('the fidelity helper: the picture at every step is what the traced state renders', async () => {
  const n = await assertViewFollowsState(Ring, (s) => (s as Ring).readout);
  assert.equal(n, 7);
  // A wrong builder fails
  const wrong = (st: SceneState) => readoutOf({ ...st, head: (st.head as number) + 1 });
  await assert.rejects(assertViewFollowsState(Ring, (s) => (s as Ring).readout, wrong), /step "show": the view shows/);
  // So does a scene that changes state and forgets to sync
  class Forgetful extends Ring { static override skipSync = true; }
  await assert.rejects(assertViewFollowsState(Forgetful, (s) => (s as Ring).readout), /step "push-a"/);
  // viewMismatch, the pure form, on one state
  const st = { len: 3, head: 1 };
  const v = view({ state: st } as unknown as Scene, readoutOf);
  assert.equal(viewMismatch(v, st), null);
  assert.match(viewMismatch(v, { len: 4, head: 1 })!, /the view shows \["len 3  head 1"\]/);
});

test('match: index morphs by position (a DecimalNumber counts), shapes and keys pair parts', () => {
  const st = { n: 0 };
  const v = view(held(st), () => new DecimalNumber(st.n, { anchor: 'start' }), { place: 'left' });
  st.n = 10;
  const sync = v.sync({ match: 'index' });
  sync.begin();
  sync.interpolate(0.5);
  assert.equal(v.current.text, '5', 'the value blends');
  sync.finish();
  assert.equal(v.current.text, '10');
  assert.equal(v.current.value, 10);
  assert.equal(sync.summary(), null);

  // Shapes: the circle that stays pairs with itself, the square fades, a new one grows
  let kids = 2;
  const g = view(held(), () => new Group(new Circle({ radius: 0.5 }), ...Array.from({ length: kids - 1 }, (_, i) => new Square({ side: 0.4 }).shift([i + 1, 0]))));
  const before = g.current;
  kids = 3;
  const sh = g.sync({ match: 'shapes' });
  sh.begin(); sh.finish();
  assert.deepEqual(sh.summary(), { matched: 2, morphed: 0, removed: 0, added: 1 });
  assert.notEqual(g.current, before);
  assert.equal(g.current.children.length, 3);
  // By index
  const ix = g.sync({ match: 'index' });
  kids = 2;
  ix.begin(); ix.finish();
  assert.equal(ix.summary(), null);
  assert.equal(g.current.children.length, 2);

  // Your own key
  const fills = ['#ff0000', '#00ff00'];
  const k = view(held(), () => new Group(...fills.map((f, i) => new Square({ side: 0.4, fill: f, fillOpacity: 1 }).shift([i, 0]))));
  fills.reverse();
  const ks = k.sync({ match: (p) => p.style.fill });
  ks.begin(); ks.finish();
  assert.deepEqual(ks.summary(), { matched: 2, morphed: 0, removed: 0, added: 0 });
});

test('sync() matches by key, staged, and refuses pictures that carry no keys', () => {
  let n = 1;
  const keyed = view(held(), () => new Group(...Array.from({ length: n }, (_, i) => { const sq = new Square({ side: 0.4 }).shift([i, 0]); sq.key = `cell-${i}`; return sq; })));
  n = 2;
  const sync = keyed.sync();
  assert.equal(sync.match, 'key');
  assert.equal(sync.staged, true);
  sync.begin(); sync.finish();
  assert.deepEqual(sync.summary(), { matched: 1, morphed: 0, removed: 0, added: 1 });
  assert.equal(keyed.sync({ match: 'text' }).staged, true, 'staged is the default for every match');

  const plain = view(held(), () => new Group(...Array.from({ length: n }, (_, i) => new Square({ side: 0.4 }).shift([i, 0]))));
  n = 3;
  assert.throws(() => plain.sync().begin(), /carry no keys below their roots.*\{ match: 'text' \}, 'shapes' or 'index'/);
});

test('placement: a moved and scaled View stays moved and scaled; place: false leaves it to draw()', () => {
  const st = { s: 'ab' };
  const v = view(held(st), () => new Text(st.s, { fontSize: 0.4 }), { place: 'right' });
  v.scale(0.5).moveTo([3, -2]);
  const right = v.current.frameBox[2]!, h = v.current.height();
  st.s = 'abcdef';
  const s = v.sync({ match: 'text' }); s.begin(); s.finish();
  assert.ok(Math.abs(v.current.frameBox[2]! - right) < 1e-5, 'right edge held');
  assert.ok(Math.abs(v.current.height() - h) < 1e-5, 'half size held');
  assert.equal(v.current.text, 'abcdef');

  const free = view(held(st), () => new Text(st.s).moveTo([1, 1]), { place: false });
  free.shift([5, 0]);
  st.s = 'x';
  free.rebuild();
  assert.ok(Math.abs(free.current.center()[0] - 1) < 1e-5, 'build() decides');

  // A picture build() hands back twice cannot morph into itself
  const fixed = new Text('same');
  const bad = view(held(), () => fixed);
  assert.throws(() => bad.sync().begin(), /draw a new one each time/);
});

test('a card view of the scene\'s state keeps its labels put as values change', async () => {
  class Counter extends Scene {
    rv?: View<Card>;
    s?: Stage;
    override async construct(): Promise<void> {
      this.state = { tokens: 10, responses: [] as number[] };
      const text = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
      const s = (this.s = stage(this, { style: 'github-dark', heading: false }));
      const rv = (this.rv = view(this, (st) => card(s, (['tokens', 'responses'] as const).map((k) => [k, text(st[k])] as const), { at: [-3, 1], width: 4, panel: false, key: 'readout' }), { place: false }));
      await this.step('show');
      await this.play(new FadeIn(rv));
      for (const [i, code] of [200, 200, 429].entries()) {
        await this.step(`req-${i}`);
        (this.state.responses as number[]).push(code);
        this.state.tokens = Math.max(0, 1 - i);
        await this.play(rv.sync(), { runTime: 0.5 });
      }
    }
  }
  const s = await new Counter(new StringSink()).run();
  assert.deepEqual(s.rv!.texts, ['tokens', '0', 'responses', '[200,200,429]']);
  const first = card(s.s!, [['tokens', '10'], ['responses', '[]']], { at: [-3, 1], width: 4, panel: false });
  for (const key of ['tokens', 'responses'])
    assert.ok(Math.abs(s.rv!.current.labels.get(key)!.frameBox[0]! - first.labels.get(key)!.frameBox[0]!) < 1e-5, 'label left edge held');
  assert.equal(await assertViewFollowsState(Counter, (sc) => (sc as Counter).rv), 4);
  const sink = new MotionSink();
  await new Counter(sink).run();
  assert.deepEqual(analyzeMotion(sink).map((e) => `${e.t}s ${e.kind} [${e.step}] ${e.what}`), []);
});

test('a returning sync preserves inherited scale for the next rebuild or sync', () => {
  for (const next of ['rebuild', 'sync'] as const) {
    let side = 1;
    const v = view(held(), () => new Rectangle({ width: side, height: side }));
    v.scale(2);
    const original = v.current;
    side = 3;
    const back = v.sync({ match: 'index', rateFunc: () => 0 });
    back.begin(); back.interpolate(0); back.finish();
    assert.equal(v.current, original, 'a returning rate keeps the original picture');
    assert.equal(v.current.width(), 2);
    assert.equal(v.current.height(), 2);
    side = 4;
    if (next === 'rebuild') v.rebuild();
    else {
      const sync = v.sync({ match: 'index' });
      sync.begin(); sync.interpolate(1); sync.finish();
    }
    assert.equal(v.current.width(), 8, `${next} inherits the original scale`);
    assert.equal(v.current.height(), 8, `${next} inherits the original scale`);
  }
});

test('rayner check names a view whose picture lags the state at the end of a step', async () => {
  const { ViewSink, FanSink } = await import('../tools/lib/explain-check.ts');
  const { NullSink } = await import('../src/output.ts');
  const lagging = (sync: boolean) => class extends Scene<{ n: number }> {
    override state = { n: 1 };
    override async construct() {
      const readout = view(this, (st) => new Text(`n ${st.n}`), { place: false });
      this.add(readout);
      await this.step('one');
      this.state = { n: 2 };
      if (sync) await this.play(readout.sync({ match: 'text', runTime: 0.2 }));
      await this.step('two');
    }
  };
  for (const sync of [false, true]) {
    const views = new ViewSink();
    await new (lagging(sync))(new FanSink([new NullSink(), views])).run();
    if (sync) assert.deepEqual(views.problems, []);
    else assert.match(views.problems[0]!, /^step "one": a view: the view shows \["n 1"\], the state \{"n":2\} draws \["n 2"\]/);
    assert.ok(views.checked >= 2);
  }
});

test('rayner check names a view whose words match its state but whose marks do not', async () => {
  const { ViewSink, FanSink } = await import('../tools/lib/explain-check.ts');
  const { Group, Rectangle } = await import('../src/index.ts'); const { NullSink } = await import('../src/output.ts');
  // A label and a bar under row `lit`: moving the bar by hand, outside the state, leaves the words alone.
  const marked = (byHand: boolean) => class extends Scene<{ lit: number }> {
    override state = { lit: 0 };
    override async construct() {
      const card = view(this, (st) => new Group(new Text('rows'), new Rectangle({ width: 2, height: 0.4 }).shift([0, -0.5 * st.lit])), { place: false });
      this.add(card);
      await this.step('one');
      if (byHand) card.current.children[1]!.shift([0, -0.5]);
      else { this.state = { lit: 1 }; await this.play(card.sync({ match: 'text', runTime: 0.2 })); }
    }
  };
  for (const byHand of [false, true]) {
    const views = new ViewSink();
    await new (marked(byHand))(new FanSink([new NullSink(), views])).run();
    if (byHand) assert.match(views.problems[0]!, /^step "one": a view: the view's part \d+ is \["Rectangle"/);
    else assert.deepEqual(views.problems, []);
  }
});

test('having narrows a state to the shapes that hold its keys and throws on a state of another shape, so check sees the draw read it', async () => {
  type Phased = { phase: 'year'; longitude: number } | { phase: 'look'; pitch: number };
  class Phases extends Scene<Phased, { lit?: string }> {
    year!: View<Text, Phased, { lit?: string }>;
    override async construct() {
      this.state = { phase: 'year', longitude: 10 };
      this.year = view(this, (st, sh) => new Text(`${having(st, 'longitude').longitude} ${sh.lit ?? ''}`));
      this.add(this.year);
    }
  }
  const scene = new Phases(new StringSink());
  await scene.run();
  assert.equal(scene.year.texts[0], '10 ');
  // A state of the other shape, as check draws one from another step: the draw throws, naming the key.
  assert.throws(() => scene.year.draw({ phase: 'look', pitch: 3 }, {}), /reads a state with longitude; this one has phase, pitch/);
  // An optional part, made present: several keys at once, and what is shown alike.
  const shown: { flow?: { walked: string[] }; lit?: string } = { flow: { walked: ['a'] } };
  assert.deepEqual(having(shown, 'flow').flow.walked, ['a']);
  assert.throws(() => having(shown, 'flow', 'lit'), /reads a state with lit/);
});
