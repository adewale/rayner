import { test } from 'node:test';
import { Square } from '../src/extras.ts';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { Rectangle, Group, VMobject, Line, Arrow, Text, Dot, Transform, AnimationGroup, FadeIn, linear, thereAndBack, Scene, SurroundingRectangle, Cross } from '../src/index.ts';
import { NullSink, toSvgString, renderElements } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import { NEUTRAL_COLORS } from '../src/color.ts';
import { rotate } from '../src/vec.ts';

// Text shapes on glyph outlines; scenes load fonts in run(), bare tests do it here
await loadFonts();

test('SVG output: a fixed 16 x 9 frame at 1000 units per scene unit, sized to the width asked for, text drawn as outlines', () => {
  const scene = new Scene(new NullSink());
  scene.add(new Text('handler', { fontSize: 0.4 }), new Arrow([-4, 0], [-1.5, 0]));
  const svg = toSvgString(scene, { width: 320 });
  assert.match(svg, /^<svg[^>]* width="320" height="180" viewBox="-8000 -4500 16000 9000"/);
  assert.ok(!svg.includes('<text'), 'text is outlines, not <text>: a page needs no font');
  // the arrow's line and tip, and one outline per glyph
  assert.equal((svg.match(/<path/g) || []).length, 2 + 'handler'.length);
});

// Engine defaults are not Manim's black-background colours: a part built without a colour takes
// the scene's colour for its role when it enters the scene (scene.colors, which a stage sets from
// its palette), and a scene without a stage draws dark ink on white paper (docs/ENGINE-FUNDAMENTALS.md).
test("a part built without a colour takes the scene's colour for its role when it enters; a colour given stays", () => {
  const colors = { paper: '#202020', ink: '#eeeeee', soft: '#999999', emphasis: '#ffaa00', bad: '#ff3355' };
  const scene = new Scene(new NullSink());
  assert.deepEqual(scene.colors, NEUTRAL_COLORS, 'a scene without a stage has the neutral colours');
  scene.colors = colors;
  const plain = new Text('ink'), given = new Text('red', { color: '#ff0000' });
  const box = new Rectangle(), outline = new SurroundingRectangle(box), cross = new Cross(box), dot = new Dot();
  assert.equal(plain.children[0]!.style.fill, NEUTRAL_COLORS.ink, 'until it enters a scene, a default is the neutral one');
  scene.add(plain, given, box, outline, cross, dot);
  assert.ok(plain.children.every((g) => g.style.fill === colors.ink), 'text takes the ink');
  assert.ok(given.children.every((g) => g.style.fill === '#ff0000'), 'a colour given stays');
  assert.equal(box.style.stroke, colors.ink, "a shape's default stroke is the ink");
  assert.equal(outline.style.stroke, colors.emphasis);
  assert.equal(cross.style.stroke, colors.bad);
  assert.equal(dot.style.fill, colors.ink);
  // Set after construction, before it enters: what was set stays.
  const late = new Text('late');
  late.setFill('#00ff00');
  scene.add(late);
  assert.ok(late.children.every((g) => g.style.fill === '#00ff00'));
  // A child added later, and a picture a part becomes, take the colours the part took.
  const group = new Group();
  scene.add(group);
  group.add(new Text('child'));
  assert.equal(group.children[0]!.children[0]!.style.fill, colors.ink);
  const shown = new Text('was');
  scene.add(shown);
  shown.become(new Text('now'));
  assert.ok(shown.children.every((g) => g.style.fill === colors.ink));
  // Without a stage the SVG's background is the neutral paper; with colours, the scene's.
  assert.match(toSvgString(new Scene(new NullSink()), { width: 16 }), /fill="#ffffff"/);
  assert.match(toSvgString(scene, { width: 16 }), /fill="#202020"/);
});

test("a play fixes both ends in the scene's colours before it begins", async () => {
  const colors = { paper: '#202020', ink: '#eeeeee', soft: '#999999', emphasis: '#ffaa00', bad: '#ff3355' };
  class S extends Scene {
    override async construct() {
      this.colors = colors;
      const a = new Text('a');
      await this.play(new FadeIn(a), { runTime: 0.1 });
      assert.ok(a.children.every((g) => g.style.fill === colors.ink), 'a part a play brings in');
      const b = new Rectangle();
      this.add(b);
      await this.play(new Transform(b, new Rectangle({ width: 3 })), { runTime: 0.1 });
      assert.equal(b.style.stroke, colors.ink, "a Transform lands on its target in the scene's colours");
    }
  }
  await new S(new NullSink()).run();
});

test('y is up in the model and flipped once, in path data; angles turn counterclockwise', () => {
  const q = rotate([1, 0], Math.PI / 2);
  assert.ok(Math.abs(q[0]) < 1e-12 && Math.abs(q[1] - 1) < 1e-12, 'a quarter turn takes +x to +y');
  const r = new Rectangle({ width: 2, height: 2 }).shift([0, 1]);
  assert.deepEqual(r.center(), [0, 1]);
  assert.ok(r.top()[1] > r.bottom()[1], 'top() is the larger y');
  const d = new Line([0, 0], [0, 1]).toPathD();
  assert.match(d, /^M0 0L0 -1000$/, 'y = 1 is written as SVG y = -1000 (above center), and a straight segment as L');
});

test('ArcBetweenPoints hits both endpoints and bulges to the signed side', async () => {
  const { ArcBetweenPoints } = await import('../src/extras.ts');
  const a = new ArcBetweenPoints([0, 0], [2, 0], { angle: Math.PI / 2 });
  const end = a.pointFromProportion(1), mid = a.pointFromProportion(0.5);
  assert.ok(Math.hypot(end[0] - 2, end[1]) < 1e-5);
  assert.ok(Math.abs(mid[0] - 1) < 1e-5 && Math.abs(mid[1] + (Math.SQRT2 - 1)) < 1e-5);
  const b = new ArcBetweenPoints([0, 0], [2, 0], { angle: -Math.PI / 2 });
  assert.ok(b.pointFromProportion(0.5)[1] > 0, 'negative angle bulges the other way');
});

test('DecimalNumber blends its value through Transform', async () => {
  const { DecimalNumber } = await import('../src/index.ts');
  const seen: string[] = [];
  const n = new DecimalNumber(0, { decimals: 1, suffix: 's' });
  const scene = new Scene({ frame: async () => { seen.push(n.text); } }, { fps: 10 });
  scene.add(n);
  await scene.play(new Transform(n, n.copy().setValue(2.5)), { runTime: 0.5 });
  assert.equal(n.text, '2.5s');
  assert.ok(seen.some((t) => /^1\.\ds$/.test(t)), `an intermediate value was rendered: ${seen}`);
});

test('a copied Arrow owns its line and tip (no reference back to the original)', () => {
  const a = new Arrow([0, 0], [1, 0]);
  const c = a.copy();
  assert.equal(c.line, c.children[0]);
  assert.notEqual(c.line, a.line);
  c.putStartAndEndOn([0, 0], [0, 5]);
  assert.deepEqual(a.line.end().map((v) => +v.toFixed(3)), [0.7, 0], 'the original did not move');
});

test('a nested AnimationGroup adds every leaf mobject to the scene', async () => {
  const scene = new Scene(new NullSink(), { fps: 4 });
  const a = new Dot(), b = new Dot().shift([2, 0]);
  await scene.play(new AnimationGroup([new AnimationGroup([new FadeIn(a)], { rateFunc: linear }), new FadeIn(b)], { rateFunc: linear }));
  assert.deepEqual(scene.mobjects, [a, b]);
  assert.equal(a.style.opacity, 1);
});

test('Transform adds and removes optional SVG paint at exact endpoints, there-and-back included', async () => {
  const scene = new Scene(new NullSink(), { fps: 30 });
  const mark = new Dot(),
    styled = mark.copy().setStyle({ lineCap: 'butt', lineJoin: 'miter', dashArray: '0.1 0.2', dashOffset: 0.05, fillRule: 'evenodd' });
  await scene.play(new Transform(mark, styled));
  assert.deepEqual(mark.style, styled.style);
  const native = new Dot(), returnToStart = mark.copy();
  await scene.play(new Transform(mark, native, { rateFunc: thereAndBack }));
  assert.deepEqual(mark.style, returnToStart.style);
  await scene.play(new Transform(mark, native));
  assert.deepEqual(mark.style, native.style);
});

test('alignData pads a path at its centre as the points stand, whether or not its box was cached', () => {
  // A path with no subpaths of its own whose shape sits in a child (alignFamily leaves a path so
  // after a Transform into a container) is padded to a two-subpath target. The first pad sits on the
  // target's first point; the second at the centre of the path with that pad. A box cached before
  // alignment (any layout call does it) used to give the second pad the old centre instead, so a
  // property test found frames that differed with and without a box() call (random-scene tape).
  const build = () => {
    const holder = new VMobject();
    holder.add(new Square({ side: 1 }).moveTo([-4, 0]));
    const target = new VMobject();
    target.startNewPath([4, 2]).addLineTo([5, 2]);
    target.startNewPath([4, -2]).addLineTo([5, -2]);
    return { holder, target };
  };
  const fresh = build(), cached = build();
  cached.holder.box();
  fresh.holder.alignData(fresh.target);
  cached.holder.alignData(cached.target);
  assert.deepEqual(cached.holder.subpaths.map((a) => Array.from(a)), fresh.holder.subpaths.map((a) => Array.from(a)));
  // The second pad is at the centre of the child square (-4.5..-3.5, -0.5..0.5) and the first pad
  // (4, 2), not at the square's own centre (-4, 0).
  assert.deepEqual(Array.from(fresh.holder.subpaths[0]!.slice(0, 2)), [4, 2]);
  assert.deepEqual(Array.from(fresh.holder.subpaths[1]!.slice(0, 2)), [-0.25, 0.75]);
});

test('fresh Text is centred on its advance box before any positioning', () => {
  // The contract is an absolute origin, not agreement with a second Text or
  // moveTo(), both of which can hide the same constructor offset.
  fc.assert(fc.property(
    fc.string({ unit: 'binary' }),
    fc.constantFrom('sans' as const, 'mono' as const),
    fc.double({ min: Number.MIN_VALUE, max: Number.MAX_VALUE, noNaN: true }),
    fc.constantFrom('normal' as const, 'bold' as const),
    (text, font, requestedSize, weight) => {
      // Draw all positive finite magnitudes, including subnormals. Bound only
      // materialization: outlines use Float32 storage, not unbounded reals.
      const fontSize = Math.min(requestedSize, 1e30);
      const t = new Text(text.slice(0, 32), { font, fontSize, weight });
      const f = t.frameBox;
      const anchor = t.anchorPoint();
      // Float32 points undergo a cast and a translation; allow their rounding
      // error, including the fixed subnormal quantum, rather than a scene-unit epsilon.
      const tolerance = 4 * 2 ** -23 * Math.max(t.run.width, t.run.ascent + t.run.descent) + 2 ** -149;
      assert.ok(Math.abs((f[0]! + f[2]!) / 2) <= tolerance, 'advance box x centre is zero');
      assert.ok(Math.abs((f[1]! + f[3]!) / 2) <= tolerance, 'advance box y centre is zero');
      assert.ok(anchor.every((v) => Math.abs(v) <= tolerance), 'public default anchor is the origin');
    }), params(500, { examples: [['Label', 'sans', 0.4, 'normal'], ['', 'mono', Number.MIN_VALUE, 'bold']] }));
});

test('scene admission methods render each descendant once across orders and batches', () => {
  const a = new Square(), b = new Square(), c = new Square(), parent = new Group(a, b);
  const ordered = new Scene(new NullSink()).add(parent, c, parent);
  assert.deepEqual(ordered.mobjects, [c, parent], 'last root occurrence is in front');
  ordered.add(a);
  assert.deepEqual(ordered.mobjects, [c, parent], 'adding a covered child is a no-op');
  ordered.bringToBack(parent, c);
  assert.deepEqual(ordered.mobjects, [parent, c], 'back batches retain argument order');

  const op = fc.record({ method: fc.constantFrom('add' as const, 'bringToFront' as const, 'bringToBack' as const), batch: fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 5 }) });
  fc.assert(fc.property(fc.array(op, { maxLength: 30 }), (batches) => {
    const a = new Square(), b = new Square().shift([2, 0]), c = new Square().shift([4, 0]);
    const inner = new Group(a, b), outer = new Group(inner, c);
    const choices = [a, b, c, inner, outer];
    // Independent input tree, including each node itself: no production
    // traversal or renderer supplies the expected ownership relation.
    const descendants = [[0], [1], [2], [0, 1, 3], [0, 1, 2, 3, 4]];
    const scene = new Scene(new NullSink());
    let admitted: number[] = [];
    for (const { method, batch } of batches) {
      scene[method](...batch.map((i) => choices[i]!));
      for (const index of method === 'bringToBack' ? [...batch].reverse() : batch) {
        if (admitted.some((i) => i !== index && descendants[i]!.includes(index))) continue;
        admitted = admitted.filter((i) => !descendants[index]!.includes(i));
        if (method === 'bringToBack') admitted.unshift(index); else admitted.push(index);
      }
      assert.deepEqual(scene.mobjects, admitted.map((i) => choices[i]!), 'admission keeps root draw order, including re-add to front');
      const ids = renderElements(scene).map((e) => e.id);
      const expected = admitted.flatMap((i) => descendants[i]!.filter((leaf) => leaf < 3));
      assert.equal(ids.length, new Set(ids).size, 'one rendered occurrence per shape');
      assert.deepEqual(ids, expected.map((i) => choices[i]!.id), 'all and only admitted leaves are painted, in order');
    }
  }), params(500, { examples: [[[ {method:'add',batch:[3,2,3]} ]], [[{method:'add',batch:[0]},{method:'add',batch:[4]}]], [[{method:'bringToBack',batch:[4,0]}]]] }));
});

test('replacement admission does not duplicate promoted subtrees or delete a self-replaced sibling', () => {
  const a = new Square(), b = new Square(), old = new Square();
  const parent = new Group(a, b);
  const s = new Scene(new NullSink()).add(old, a, b);
  s.replace(old, parent, a);
  assert.deepEqual(s.mobjects, [parent]);
  assert.deepEqual(renderElements(s).map((e) => e.id), [a.id, b.id]);
  s.replace(a, a);
  assert.deepEqual(parent.children, [a, b]);
  const other = new Square(); s.add(other);
  s.replace(other, a);
  assert.deepEqual(parent.children, [b]);
  assert.deepEqual(renderElements(s).map((e) => e.id), [b.id, a.id]);
  assert.throws(() => s.replace(b, parent), /ancestor/);
  assert.deepEqual(parent.children, [b], 'invalid replacement leaves the hierarchy intact');
});

test('nested replacement preserves earlier siblings, retained old objects and backlinks', () => {
  const a = new Square(), old = new Square(), b = new Square();
  const parent = new Group(a, old, b), s = new Scene(new NullSink()).add(parent);
  s.replace(old, a);
  assert.deepEqual(parent.children, [a, b]);
  assert.equal(old.parent, null);
  assert.equal(a.parent, parent);
  const x = new Square(), y = new Square(), second = new Group(x, y);
  s.removeAll().add(second);
  s.replace(x, x, y);
  assert.deepEqual(second.children, [x, y]);
  assert.equal(x.parent, second);
  assert.equal(y.parent, second);
  const replacement = new Square(), source = new Group(replacement), targetOld = new Square();
  const target = new Group(targetOld);
  s.removeAll().add(target).replace(targetOld, replacement);
  assert.deepEqual(source.children, [], 'an off-screen source parent releases the replacement');
  assert.equal(replacement.parent, target);
  s.add(source);
  assert.equal(renderElements(s).filter((r) => r.id === replacement.id).length, 1);
});

test('a family stays a tree: add refuses the mobject itself or an ancestor, and remove releases only its own children', () => {
  // Before the guard, b.add(a) under a.add(b) made a cycle that hung the next box invalidation.
  const a = new Group(), b = new Group(), c = new Square();
  a.add(b); b.add(c);
  assert.throws(() => b.add(a), /^Error: m\.add\(\): a Group contains the mobject it is added to, so the family would be a cycle; add it to a mobject outside it$/);
  assert.throws(() => c.add(a), /m\.add\(\): a Group contains the mobject it is added to/);
  assert.throws(() => a.add(a), /^Error: m\.add\(\): a Group is the mobject it is added to/);
  // A refused add changes nothing, even after children listed before the one refused.
  const d = new Square();
  assert.throws(() => b.add(d, a));
  assert.deepEqual(b.children, [c]);
  assert.equal(d.parent, null);
  assert.deepEqual(a.family(), [a, b, c]);
  assert.ok(a.box(), 'the box of a refused family is still measured');

  // remove() on another group leaves the child with its real parent, whose box still follows it.
  const x = new Square({ side: 1 }), g1 = new Group(x), g2 = new Group(new Square());
  assert.equal(g1.box()![2], 0.5);
  g2.remove(x);
  assert.equal(x.parent, g1);
  assert.deepEqual(g1.children, [x]);
  x.shift([3, 0]);
  assert.equal(g1.box()![2], 3.5, 'the moved child invalidates its parent\'s box');
  g1.remove(x);
  assert.equal(x.parent, null);
  assert.deepEqual(g1.children, []);
});

test('the children and the parent are the mobject\'s own: no write to it changes them, and family() walks them whatever a subclass\'s getter says', () => {
  const a = new Group(), b = new Group(), c = new Square();
  a.add(b);
  // Writes to a field of the same name, by assignment and by element access, are unrelated fields.
  (b as unknown as { _children: unknown })._children = [a];
  (b as unknown as Record<string, unknown>)['_parent'] = c;
  assert.deepEqual(b.children, []);
  assert.equal(b.parent, a);
  assert.deepEqual(a.family(), [a, b], 'no cycle, so family() ends');
  // A subclass's getter misleads only its own readers.
  class Liar extends Group { override get children(): readonly Square[] { return []; } }
  const sq = new Square();
  const liar = new Liar(sq);
  assert.deepEqual([liar.children.length, liar.family().length, sq.parent === liar], [0, 2, true]);
  // Copies, which no subclass constructor makes, have their own children and parent.
  const g = new Group(new Square(), new Square());
  const copy = g.copy();
  assert.equal(copy.children.length, 2);
  assert.ok(copy.children.every((k) => k.parent === copy));
  assert.ok(g.children.every((k) => k.parent === g));
});

test('no public path makes the mobject tree a cycle, or lets a parent and its children disagree (invariant row 8)', () => {
  const a = new Group(), b = new Group();
  a.add(b);
  assert.throws(() => b.insert(0, a), /^Error: m\.insert\(\): a Group contains the mobject it is added to, so the family would be a cycle/);
  assert.throws(() => b.insert(5, new Square()), /^RangeError: m\.insert\(\): the index is 5; give a whole number from 0 to 0/);
  const s = new Square();
  b.add(s);
  assert.throws(() => b.replaceChild(s, a), /^Error: m\.replaceChild\(\): a Group contains the mobject it is added to/);
  assert.throws(() => a.replaceChild(s, new Square()), /^Error: m\.replaceChild\(\): a Square is not a child of a Group; replace one of its children/);

  // Every public way to change a family, in random order on a small pool, some refused: after each,
  // the tree is acyclic, each child names its holder as parent, and each parent holds its child.
  type Op = { kind: 'add' | 'insert' | 'remove' | 'replaceChild' | 'sceneReplace'; at: number; to: number; with: number[]; index: number };
  const op: fc.Arbitrary<Op> = fc.record({
    kind: fc.constantFrom('add' as const, 'insert' as const, 'remove' as const, 'replaceChild' as const, 'sceneReplace' as const),
    at: fc.integer({ min: 0, max: 5 }), to: fc.integer({ min: 0, max: 5 }),
    with: fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 3 }), index: fc.integer({ min: 0, max: 3 }),
  });
  fc.assert(fc.property(fc.array(op, { maxLength: 25 }), (ops) => {
    const pool = [new Group(), new Group(), new Group(), new Square(), new Square().shift([2, 0]), new Group()];
    const scene = new Scene(new NullSink()).add(pool[0]!);
    for (const o of ops) {
      const at = pool[o.at]!, to = pool[o.to]!, others = o.with.map((i) => pool[i]!);
      try {
        if (o.kind === 'add') at.add(to, ...others);
        else if (o.kind === 'insert') at.insert(o.index, to, ...others);
        else if (o.kind === 'remove') at.remove(to, ...others);
        else if (o.kind === 'replaceChild') at.replaceChild(to, ...others);
        else scene.replace(to, ...others);
      } catch (e) { assert.match(String(e), /would be a cycle|is not a child|the index is|cannot be an ancestor/); }
      for (const m of pool) {
        const seen = new Set<unknown>();
        for (let p: typeof m | null = m; p; p = p.parent) { assert.ok(!seen.has(p), 'no cycle through parents'); seen.add(p); }
        assert.equal(new Set(m.family()).size, m.family().length, 'no member twice in a family');
        for (const c of m.children) assert.equal(c.parent, m, 'a child names its holder');
        if (m.parent) assert.ok(m.parent.children.includes(m), 'a parent holds its child');
      }
    }
  }), params(500));
});
