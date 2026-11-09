// Matching transforms: which part pairs with which, what the unmatched parts
// do, and the invariants every animation keeps (seek-exact, no jumps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Text, Code, Circle, Rectangle, Polygon, Line, Arc, Labeled, Arrow, VMobject, FadeIn, Transform, LaggedStart, TransformMatching, TransformMatchingShapes, TransformMatchingText, keyed } from '../src/index.ts';
import { StringSink, renderFrame } from '../src/output.ts';
import { SnapshotSink } from '../src/svg.ts';
import { MotionSink, analyzeMotion, loadFonts } from '../explain/testing.ts';
import type { Mobject, Vec } from '../src/index.ts';
import { drawsFrom as rng } from './lib/random-scene.ts';
import type { Rng } from './lib/random-scene.ts';
import { beginAnimation, interpolateAnimation, matchRows } from '../src/animation.ts';
import { mobjectId } from '../src/mobject.ts';

Scene.captionWpm = Infinity;
await loadFonts();

/** Visible VMobjects with points: what TransformMatching pairs. */
const parts = (m: Mobject) => m.family().filter((p) => p instanceof VMobject && p.style.opacity > 0 && p.hasPoints());

/** Every part of both sides lands in exactly one bucket. */
function assertPartition(a: TransformMatching, src: Mobject[], tgt: Mobject[], label: string): void {
  const s = [...a.pairs.map((p) => p[0]), ...a.morphed.map((p) => p[0]), ...a.removed];
  const t = [...a.pairs.map((p) => p[1]), ...a.morphed.map((p) => p[1]), ...a.added];
  assert.equal(new Set(s).size, s.length, `${label}: a source part in two buckets`);
  assert.equal(new Set(t).size, t.length, `${label}: a target part in two buckets`);
  assert.deepEqual(new Set(s), new Set(src), `${label}: source parts`);
  assert.deepEqual(new Set(t), new Set(tgt), `${label}: target parts`);
  const sum = a.summary();
  assert.equal(sum.matched + sum.morphed + sum.removed, src.length);
  assert.equal(sum.matched + sum.morphed + sum.added, tgt.length);
}

/** The pairing as part indices: comparable across two independent constructions. */
function pairing(a: TransformMatching, src: Mobject[], tgt: Mobject[]): string {
  const ix = (xs: Mobject[], m: Mobject) => xs.indexOf(m);
  return JSON.stringify({ pairs: a.pairs.map(([s, t]) => [ix(src, s), ix(tgt, t)]), morphed: a.morphed.map(([s, t]) => [ix(src, s), ix(tgt, t)]),
    removed: a.removed.map((s) => ix(src, s)), added: a.added.map((t) => ix(tgt, t)) });
}

const SHAPES = [
  () => new Rectangle({ width: 1, height: 1 }), () => new Rectangle({ width: 1.5, height: 1.5 }), () => new Circle({ radius: 0.5 }), () => new Rectangle({ width: 2, height: 1 }),
  () => new Polygon([[0, 0], [1, 0], [0.3, 0.8]]), () => new Line([0, 0], [1, 0.5]), () => new Arc({ radius: 0.6, angle: 2 }),
];
const at = <M extends Mobject>(m: M, r: Rng): M => m.moveTo([r(-6, 6), r(-3, 3)]);
function shapeSides(seed: number): [Group, Group] {
  const r = rng(seed);
  const src = new Group(...Array.from({ length: r.int(0, 8) }, () => at(r.pick(SHAPES)(), r)));
  const tgt = new Group(...Array.from({ length: r.int(0, 8) }, () => at(r.pick(SHAPES)(), r).scale(r.bool() ? 1 : r(0.5, 2))));
  return [src, tgt];
}
const ALPHABET = 'aab c(x)';
function textSides(seed: number): [Mobject, Mobject] {
  const r = rng(seed);
  const word = () => Array.from({ length: r.int(1, 10) }, () => r.pick([...ALPHABET])).join('');
  const side = () => (r.bool() ? new Text(word(), { font: r.bool() ? 'mono' : 'sans' }) : new Code(Array.from({ length: r.int(1, 3) }, word)));
  return [at(side(), r), at(side(), r)];
}

test('every part ends matched, morphed, removed or added, exactly once, and the pairing is deterministic', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const fadeMismatches of [true, false]) {
      const run = (make: (seed: number) => [Mobject, Mobject], Anim: typeof TransformMatchingShapes) => {
        const [src, tgt] = make(seed), sp = parts(src), tp = parts(tgt);
        const a = new Anim(src, tgt, { fadeMismatches });
        beginAnimation(a);
        assertPartition(a, sp, tp, `seed ${seed}`);
        if (fadeMismatches) assert.equal(a.morphed.length, 0);
        else assert.ok(a.removed.length === 0 || a.added.length === 0, 'fadeMismatches: false morphs what it can');
        return pairing(a, sp, tp);
      };
      assert.equal(run(shapeSides, TransformMatchingShapes), run(shapeSides, TransformMatchingShapes), `shapes seed ${seed}`);
      assert.equal(run(textSides, TransformMatchingText), run(textSides, TransformMatchingText), `text seed ${seed}`);
    }
  }
});

test('a moved, scaled and shuffled copy of a group pairs every part with its own copy', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed);
    const src = new Group(...Array.from({ length: r.int(1, 9) }, () => at(r.pick(SHAPES)(), r)));
    const copies = src.children.map((c) => c.copy());
    const of = new Map(src.children.map((c, i) => [c, copies[i]!]));
    const tgt = new Group(...[...copies].sort(() => r(-1, 1)));
    tgt.scale(r(0.5, 2)).shift([r(-3, 3), r(-2, 2)]);
    const a = new TransformMatchingShapes(src, tgt);
    beginAnimation(a);
    assert.deepEqual(a.summary(), { matched: src.children.length, morphed: 0, removed: 0, added: 0 }, `seed ${seed}`);
    for (const [s, t] of a.pairs) assert.equal(t, of.get(s), `seed ${seed}: a part paired with another's copy`);
  }
});

test('inserting or deleting a character keeps every other glyph', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed);
    const w = Array.from({ length: r.int(1, 12) }, () => r.pick([...'abcab'])).join('');
    const i = r.int(0, w.length), longer = w.slice(0, i) + r.pick([...'abc']) + w.slice(i);
    const grow = new TransformMatchingText(new Text(w), new Text(longer));
    beginAnimation(grow);
    assert.deepEqual(grow.summary(), { matched: w.length, morphed: 0, removed: 0, added: 1 }, `${w} -> ${longer}`);
    const shrink = new TransformMatchingText(new Text(longer), new Text(w));
    beginAnimation(shrink);
    assert.deepEqual(shrink.summary(), { matched: w.length, morphed: 0, removed: 1, added: 0 }, `${longer} -> ${w}`);
  }
});

test("Text('cache') -> Text('cached'): five glyphs keep their letters, the d fades in, the scene ends holding the target", async () => {
  const s = new Scene(new StringSink());
  const a = new Text('cache'), b = new Text('cached', { color: '#ffff00' }).shift([0.5, -1]);
  const anim = new TransformMatchingText(a, b);
  s.construct = async function (this: Scene) { this.add(a); await this.play(anim); };
  await s.run();
  assert.deepEqual(anim.summary(), { matched: 5, morphed: 0, removed: 0, added: 1 });
  const cluster = (m: Mobject) => (m as Mobject & { cluster: number }).cluster;
  assert.deepEqual(anim.pairs.map(([x, y]) => [cluster(x), cluster(y)]), [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
  assert.equal(cluster(anim.added[0]!), 5, 'the d is the new glyph');
  for (const [x, y] of anim.pairs) assert.deepEqual((x as VMobject).subpaths, (y as VMobject).subpaths, 'glyphs land on the target');
  assert.ok(s.mobjects.includes(b) && !s.mobjects.includes(a), 'replace: the scene holds the target');

  // The d grows from a point beside the word as it fades in
  const c = new Text('cache'), d = new Text('cached');
  const grow = new TransformMatchingText(c, d);
  beginAnimation(grow);
  const copy = grow[matchRows].fadesIn[0]!.sub as VMobject, glyph = d.children[5] as VMobject;
  assert.equal(copy.parent, c, 'the new glyph lives in the source while it plays');
  assert.equal(copy.style.opacity, 0);
  interpolateAnimation(grow, 0.5);
  assert.ok(Math.abs(copy.style.opacity - 0.5) < 1e-12);
  assert.ok(copy.width() < glyph.width() * 0.6 && copy.width() > glyph.width() * 0.4, 'half grown');
  interpolateAnimation(grow, 1);
  assert.deepEqual(copy.subpaths, glyph.subpaths);
  assert.equal(copy.style.opacity, 1);
});

test('an inserted line of code leaves the other lines in place, and its glyphs join it', () => {
  const a = new Code(['const x = 1;', 'return x;']), b = new Code(['const x = 1;', 'const y = x + 1;', 'return y;']);
  const anim = new TransformMatchingText(a, b);
  beginAnimation(anim);
  const line = (m: Mobject) => b.lines.indexOf(m.parent as Text);
  for (const [x, y] of anim.pairs) assert.equal(line(y), a.lines.indexOf(x.parent as Text) === 0 ? 0 : 2, `${(x.parent as Text).text} stays its line`);
  assert.deepEqual(anim.added.map(line), [...Array(11).fill(1), 2], 'the new line, and the y');
  assert.deepEqual(anim.removed.map((m) => (m.parent as Text).text), ['return x;'], 'the x');
  interpolateAnimation(anim, 1);
  const stage = anim[matchRows].fadesIn[0]!.sub.parent!;
  assert.ok(stage instanceof Text && stage.parent === a, 'the new line grows inside a copy of its line');
});

test('mono and sans letters, and bold and normal, do not match', () => {
  const anim = new TransformMatchingText(new Group(new Text('ab', { font: 'mono' }), new Text('ab', { weight: 'bold' })), new Text('ab'));
  beginAnimation(anim);
  assert.deepEqual(anim.summary(), { matched: 0, morphed: 0, removed: 4, added: 2 });
});

/** Two small diagrams sharing a square and a circle. */
function diagrams(): [Group, Group, Record<string, Mobject>] {
  const sq = new Rectangle({ width: 1, height: 1 }).shift([-3, 0]), ci = new Circle({ radius: 0.5 }), tri = new Polygon([[2.5, -0.5], [3.5, -0.5], [3, 0.4]]);
  const sq2 = new Rectangle({ width: 1.4, height: 1.4 }).shift([-2, 1.5]), ci2 = new Circle({ radius: 0.5 }).shift([1, 1.5]), rect = new Rectangle({ width: 2, height: 1 }).shift([3, -2]);
  return [new Group(sq, ci, tri), new Group(sq2, ci2, rect), { sq, ci, tri, sq2, ci2, rect }];
}

test('shapes: shared nodes travel to the target, others fade out, new ones fade in', async () => {
  const [a, b, n] = diagrams();
  const anim = new TransformMatchingShapes(a, b);
  const s = new Scene(new StringSink());
  s.construct = async function (this: Scene) { this.add(a); await this.play(anim); };
  await s.run();
  assert.deepEqual(anim.pairs, [[n.sq, n.sq2], [n.ci, n.ci2]]);
  assert.deepEqual(anim.removed, [n.tri]);
  assert.deepEqual(anim.added, [n.rect]);
  for (const [x, y] of anim.pairs) assert.deepEqual((x as VMobject).subpaths, (y as VMobject).subpaths, 'shared nodes land on the target');
  assert.equal(n.tri!.style.opacity, 0, 'the triangle faded out');
  const copy = anim[matchRows].fadesIn[0]!.sub as VMobject;
  assert.deepEqual(copy.subpaths, (n.rect as VMobject).subpaths, 'the rectangle faded in where the target has it');
  assert.ok(s.mobjects.includes(b) && !s.mobjects.includes(a));
});

test('an explicit key; fadeMismatches: false morphs leftovers; replace: false keeps the source', async () => {
  const dots = (xs: number[], fill: string) => xs.map((x) => new Circle({ radius: 0.2, fill, fillOpacity: 1 }).shift([x, 0]));
  const a = new Group(...dots([-2, 0], '#ff0000'), ...dots([2], '#00ff00')), b = new Group(...dots([-1, 1, 3], '#ff0000'), new Rectangle({ width: 0.4, height: 0.4 }));
  const anim = new TransformMatching(a, b, { key: (p) => p.style.fill, fadeMismatches: false, replace: false });
  const s = new Scene(new StringSink());
  s.construct = async function (this: Scene) { this.add(a); await this.play(anim); };
  await s.run();
  assert.deepEqual(anim.summary(), { matched: 2, morphed: 1, removed: 0, added: 1 });
  // Reds pair in order (least total travel), the green morphs into the spare red, the square fades in
  const [r1, r2, g] = a.children, [t1, t2, t3, sq] = b.children;
  assert.deepEqual(anim.pairs, [[r1, t1], [r2, t2]]);
  assert.deepEqual(anim.morphed, [[g, t3]]);
  assert.deepEqual(anim.added, [sq]);
  assert.equal(g!.style.fill, '#ff0000', 'the green dot became the third red one');
  assert.ok(s.mobjects.includes(a) && !s.mobjects.includes(b), 'replace: false');
  assert.equal(parts(a).length, 4, 'the source now shows the target: 3 dots and a square');
});

test('one animation of the source: plays inside a group, and play() refuses a second animation of its parts', async () => {
  const a = new Text('ab'), b = new Text('abc'), dot = new Circle({ radius: 0.1 }).shift([2, 2]);
  const s = new Scene(new StringSink());
  s.construct = async function (this: Scene) {
    await this.play(new LaggedStart([new TransformMatchingText(a, b), new FadeIn(dot)]));
    const c = new Text('abc').shift([0, 1]);
    await assert.rejects(this.play(new TransformMatchingText(b, c), new Transform(b.children[0]!, new Rectangle({ width: 2, height: 2 }))), /both animate/);
  };
  await s.run();
  assert.deepEqual(s.mobjects, [b, dot], 'the group put the source on screen, and replace swapped in the target');
});

/** Every matching transform once, in a scene. Not registered: that would change golden traces and the catalog. */
class MatchingScene extends Scene {
  override async construct(): Promise<void> {
    await this.step('text');
    const w = new Text('cache').shift([-3, 2]);
    await this.play(new FadeIn(w));
    await this.play(new TransformMatchingText(w, new Text('cached', { fontSize: 0.6, color: '#ffff00' }).shift([2, 2.5])));
    await this.step('code');
    const c = new Code(['const x = 1;', 'return x;']).shift([-3, -1]);
    await this.play(new FadeIn(c));
    await this.play(new TransformMatchingText(c, new Code(['const x = 1;', 'const y = x + 1;', 'return y;']).shift([-3, -1.2])), { runTime: 1.5 });
    await this.step('shapes');
    const node = (label: string, x: number, y: number) => new Labeled(new Rectangle({ width: 1.6, height: 0.7 }), new Text(label, { fontSize: 0.3 })).moveTo([x, y]);
    const d1 = new Group(node('cache', 2, -1), node('db', 5, -1), new Arrow([2.8, -1], [4.2, -1]));
    await this.play(new FadeIn(d1));
    await this.play(new TransformMatchingShapes(d1, new Group(node('cache', 2, -2.5), node('api', 5.5, -2.5), new Circle({ radius: 0.4 }).shift([3.8, -1]))));
    await this.step('key');
    const dots = new Group(...[-1, 0, 1].map((x) => new Circle({ radius: 0.2, fill: '#58c4dd', fillOpacity: 1 }).shift([x, 3.5])));
    await this.play(new FadeIn(dots));
    await this.play(new TransformMatching(dots, new Group(...[-1.5, 1.5].map((x) => new Rectangle({ width: 0.4, height: 0.4, fill: '#58c4dd', fillOpacity: 1 }).shift([x, 3.4]))),
      { key: (p) => p.style.fill, fadeMismatches: false, lagRatio: 0.3 }));
    await this.wait(0.5);
  }
}

test('seeking into a matching transform renders the frame a full run renders', async () => {
  const full = new StringSink();
  await new MatchingScene(full).run();
  assert.equal(full.frames.length, 271);
  // The transforms run over frames 31-60, 91-135, 166-195
  // and 226-255: seek before, into (first, early, middle, last frame) and after each
  for (const k of [0, 15, 31, 38, 45, 60, 75, 91, 100, 113, 135, 150, 166, 172, 181, 195, 210, 226, 233, 241, 255, 270]) {
    const snap = new SnapshotSink();
    await renderFrame(MatchingScene, k, snap);
    assert.equal(snap.svg, full.frames[k], `frame ${k}`);
  }
});

test('matching transforms are free of motion discontinuities', async () => {
  const sink = new MotionSink();
  await new MatchingScene(sink).run();
  assert.deepEqual(analyzeMotion(sink).map((e) => `${e.t}s ${e.kind} [${e.step}] ${e.what} ${e.detail}`), []);
});

test('shapeKey: same shape at any position and size, nothing else', () => {
  const key = (m: VMobject) => m.shapeKey();
  const sq = new Rectangle({ width: 1, height: 1 });
  assert.equal(key(sq), key(new Rectangle({ width: 3, height: 3 }).shift([4.37, -2.11])));
  assert.equal(key(sq), key(sq.copy().scale(0.013).shift([7.9, 3.3])), 'tiny and far away');
  assert.notEqual(key(sq), key(new Rectangle({ width: 2, height: 1 })));
  assert.notEqual(key(sq), key(sq.copy().stretch(1.05, 0)), 'five percent wider is another shape');
  assert.notEqual(key(new Line([0, 0], [1, 0])), key(new Line([0, 0], [0, 1])), 'direction counts');
  const open = new Polygon([[0, 0], [1, 0], [1, 1], [0, 1]]);
  open.closed = open.closed.map(() => false);
  assert.notEqual(key(open), key(new Polygon([[0, 0], [1, 0], [1, 1], [0, 1]])), 'closed flags count');
  const p: Vec = [1, 2];
  assert.equal(key(new Line(p, p)), key(new Line([5, 5], [5, 5])), 'points key alike');
});

test('matchByKey: a keyed component is kept wherever it moves, its parts morph inside it, and the root key is ignored', async () => {
  const { matchByKey } = await import('../src/index.ts');
  const cell = (z: number, symbol: string, at: Vec) => {
    const g = new Group(new Rectangle({ width: 1, height: 1 }), new Text(symbol, { fontSize: 0.4 }), new Text(String(z), { fontSize: 0.2 }));
    keyed(g, `cell:${z}`);
    g.moveTo(at);
    return g;
  };
  const picture = (shuffled: boolean, note: string) => {
    const root = new Group(
      ...(shuffled ? [cell(2, 'He', [4, 2]), cell(1, 'H', [-4, 0])] : [cell(1, 'H', [-4, 2]), cell(2, 'He', [-2, 2])]),
      new Text(note, { fontSize: 0.3 }).moveTo([0, -2]),
    );
    keyed(root, 'table'); // the picture's own key names it; it must not make every part one component
    return root;
  };
  const src = picture(false, 'runs'), tgt = picture(true, 'table');
  const a = new TransformMatching(src, tgt, { key: matchByKey() });
  beginAnimation(a);
  assertPartition(a, parts(src), parts(tgt), 'keys');
  // Each cell's square pairs with its own key's square across the swap, not the nearer one
  for (const [s, t] of a.pairs) {
    const owner = (m: Mobject) => { let p: Mobject | null = m; while (p && p.key === undefined) p = p.parent; return p?.key; };
    assert.equal(owner(s), owner(t));
    if (s instanceof Rectangle) assert.notEqual(owner(s), 'table');
  }
  assert.equal(a.pairs.filter(([s]) => s instanceof Rectangle).length, 2);
  // The unkeyed note has no fallback: its glyphs fade out and in
  assert.equal(a.removed.length, 'runs'.length);
  assert.equal(a.added.length, 'table'.length);
  // A fallback keys what is under no key: the same word pairs
  const b = new TransformMatching(picture(false, 'same'), picture(true, 'same'), { key: matchByKey({ fallback: (p) => (p.parent instanceof Text ? `${p.parent.text}#${p.parent.children.indexOf(p)}` : undefined) }) });
  beginAnimation(b);
  assert.equal(b.removed.length + b.added.length, 0);
  // A kept Text may change its glyphs: the symbol's parts morph inside the kept cell
  const c = new TransformMatching(new Group(cell(3, 'Li', [0, 0])), new Group(cell(3, 'Be', [3, 0])), { key: matchByKey() });
  beginAnimation(c);
  assert.equal(c.summary().matched, 1 + 2 + 1, 'the square, both glyphs by place, and the digit');
  // The root's own key is not a component: matching one keyed cell to another reads only what is below it
  const d = new TransformMatching(cell(3, 'Li', [0, 0]), cell(3, 'Be', [3, 0]), { key: matchByKey() });
  beginAnimation(d);
  assert.equal(d.summary().matched, 0);
});

test('matchByKey text policy: by place, a relabelled keyed word morphs its glyphs; whole, it pairs only with the same words', async () => {
  const { matchByKey } = await import('../src/index.ts');
  const node = (label: string, at: Vec) => {
    const word = new Text(label, { fontSize: 0.3 });
    keyed(word, 'state:idle:label');
    const g = new Group(new Rectangle({ width: 2, height: 1 }), word).moveTo(at);
    keyed(g, 'state:idle');
    return new Group(g);
  };
  const byPlace = new TransformMatching(node('idle', [0, 0]), node('ready', [1, 0]), { key: matchByKey() });
  beginAnimation(byPlace);
  assert.deepEqual(byPlace.summary(), { matched: 1 + 4, morphed: 0, removed: 0, added: 1 });
  const whole = new TransformMatching(node('idle', [0, 0]), node('ready', [1, 0]), { key: matchByKey({ text: 'whole' }) });
  beginAnimation(whole);
  assert.deepEqual(whole.summary(), { matched: 1, morphed: 0, removed: 4, added: 5 });
  const same = new TransformMatching(node('idle', [0, 0]), node('idle', [1, 0]), { key: matchByKey({ text: 'whole' }) });
  beginAnimation(same);
  assert.deepEqual(same.summary(), { matched: 1 + 4, morphed: 0, removed: 0, added: 0 });
});

test('find and findAll address parts by key, depth first, on a mobject and across a scene', () => {
  const cell = (z: number) => { const g = new Group(new Rectangle({ width: 1, height: 1 }), new Text(String(z))); keyed(g, `cell:${z}`); keyed(g.children[1]!, `cell:${z}:z`); return g; };
  const table = new Group(cell(1), new Group(cell(2), cell(3)));
  keyed(table, 'table');
  assert.equal(table.find('table'), table);
  assert.equal(table.find('cell:3:z'), table.children[1]!.children[1]!.children[1]);
  assert.equal(table.find('cell:9'), undefined);
  assert.deepEqual(table.findAll((k) => /^cell:\d+$/.test(k)).map((m) => m.key), ['cell:1', 'cell:2', 'cell:3']);
  assert.deepEqual(table.findAll('cell:2').length, 1);
  const scene = new Scene(new StringSink());
  const other = cell(2);
  scene.add(table, other);
  assert.equal(scene.find('cell:2'), table.children[1]!.children[0], 'drawing order: the first on stage wins');
  assert.deepEqual(scene.findAll('cell:2'), [table.children[1]!.children[0], other]);
  // A copy finds its own parts
  const copy = table.copy();
  assert.notEqual(copy.find('cell:3'), table.find('cell:3'));
  assert.equal(copy.find('cell:3')!.parent!.parent, copy);
});

test('View.sync({ match: "keys" }) keeps a keyed cell across a rearrangement and seeks exactly', async () => {
  const { view } = await import('../explain/index.ts');
  const scene = new Scene<{ order: number[] }>(new StringSink());
  scene.state = { order: [1, 2, 3] };
  const v = view(scene, (st) => new Group(...st.order.map((z, i) => {
    const g = new Group(new Rectangle({ width: 0.8, height: 0.8 }), new Text(`c${z}`, { fontSize: 0.3 })).moveTo([i * 2 - 2, 0]);
    keyed(g, `cell:${z}`);
    return g;
  })), { place: false });
  scene.add(v);
  const before = v.current.children.map((c) => c.key);
  scene.state = { order: [3, 1, 2] };
  await scene.play(v.sync({ match: 'key', runTime: 0.4 }));
  assert.deepEqual(scene.evidence.at(-1), { kind: 'match', matched: 3 * (1 + 2), morphed: 0, removed: 0, added: 0 });
  assert.deepEqual(v.current.children.map((c) => c.key), ['cell:3', 'cell:1', 'cell:2']);
  assert.notDeepEqual(before, v.current.children.map((c) => c.key));
});

test('matchByKey unkeyed: by-place pairs parts under no key by their place in the picture; fade leaves them to fade', async () => {
  const { matchByKey } = await import('../src/index.ts');
  const picture = (word: string, at: Vec) => {
    const cell = new Group(new Rectangle({ width: 1, height: 1 }));
    keyed(cell, 'cell');
    return new Group(cell, new Text(word, { fontSize: 0.3 }).moveTo(at), new Circle({ radius: 0.2 }).moveTo([at[0], -2]));
  };
  const faded = new TransformMatching(picture('odds', [0, 0]), picture('odds', [2, 0]), { key: matchByKey() });
  beginAnimation(faded);
  assert.deepEqual(faded.summary(), { matched: 1, morphed: 0, removed: 4 + 1, added: 4 + 1 });
  const placed = new TransformMatching(picture('odds', [0, 0]), picture('odds', [2, 0]), { key: matchByKey({ unkeyed: 'by-place' }) });
  beginAnimation(placed);
  assert.deepEqual(placed.summary(), { matched: 1 + 4 + 1, morphed: 0, removed: 0, added: 0 });
  // A fallback still wins over unkeyed
  const fallen = new TransformMatching(picture('odds', [0, 0]), picture('odds', [2, 0]), { key: matchByKey({ unkeyed: 'by-place', fallback: () => undefined }) });
  beginAnimation(fallen);
  assert.equal(fallen.summary().matched, 1);
});

test('become takes another mobject\'s data in place, keeping identity, children and key', () => {
  const ptr = new Group(new Arrow([0, 0], [1, 0]), new Text('head', { fontSize: 0.24 }));
  keyed(ptr, 'ring:pointer:head');
  const ids = ptr.family().map((m) => mobjectId(m)), parent = new Group(ptr);
  const drawn = new Group(new Arrow([0, 0], [0, 2]), new Text('head', { fontSize: 0.24 }).moveTo([3, 3]));
  const before = drawn.family().map((m) => m.pointArrays().map((a) => [...a]));
  assert.equal(ptr.become(drawn), ptr);
  assert.deepEqual(ptr.family().map((m) => mobjectId(m)), ids, 'every member keeps its identity');
  assert.equal(ptr.key, 'ring:pointer:head');
  assert.equal(ptr.parent, parent);
  assert.deepEqual(ptr.family().map((m) => m.pointArrays().map((a) => [...a])), before, 'and takes the drawn points');
  assert.deepEqual(drawn.family().map((m) => m.pointArrays().map((a) => [...a])), before, 'the other is not changed');
  assert.ok(Math.abs(ptr.children[1]!.center()[0] - 3) < 1e-5);
});
