// choreograph(current, target): an authored transition between two pictures, part by part, by key.
// Whatever the author names or leaves out, the current picture ends showing the target's parts.

import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { choreograph } from '../explain/choreograph.ts';
import assert from 'node:assert/strict';
import { Scene, Group, Circle, Dot, Line, Rectangle, Succession, Transform, keyed } from '../src/index.ts';
import { NullSink } from '../src/timeline.ts';
import { toSvgString } from '../src/svg.ts';
import type { AnimationGroup } from '../src/index.ts';
import type { Mobject, Animation } from '../src/index.ts';
import { MotionSink, analyzeMotion } from '../src/internal.ts';

/** A picture of keyed parts. */
const picture = (...parts: [string, Mobject][]) => new Group(...parts.map(([key, m]) => keyed(m, key)));
/** What a picture shows, as unordered rendered marks. */
const marks = (m: Mobject) => {
  const s = new Scene(new NullSink());
  s.add(m);
  return toSvgString(s).split('/>').sort().join('/>');
};
/** Play `make(current)` on a scene holding `current`, then return it. */
async function play(current: Group, make: (c: Group) => Animation | AnimationGroup): Promise<Group> {
  class Play extends Scene {
    override async construct() {
      this.add(current);
      await this.step('go');
      await this.play(make(current));
    }
  }
  await new Play(new NullSink()).run();
  return current;
}

const before = () => picture(['a', new Circle({ radius: 0.5 }).moveTo([-2, 0])], ['b', new Rectangle({ width: 1, height: 1 }).moveTo([0, 0])]);
const after = () => picture(['a', new Circle({ radius: 0.5 }).moveTo([-1, 1])], ['c', new Dot().moveTo([2, 0])]);

test('morph, enter and leave in the author\'s order end on the target picture', async () => {
  const target = after();
  const done = await play(before(), (cur) => {
    const c = choreograph(cur, target);
    return new Succession([c.leave('b'), c.morph('a'), c.enter('c', { create: true })]);
  });
  assert.equal(marks(done), marks(after()));
});

test('rest() lands every keyed part the author did not name', async () => {
  const done = await play(before(), (cur) => choreograph(cur, after()).rest({ runTime: 0.5 }));
  assert.equal(marks(done), marks(after()));
});

test('a part brought in later is unseen until its turn, and can grow from a copy of a current part', async () => {
  const cur = before(), target = after();
  const c = choreograph(cur, target);
  const grow = c.enter('c', { from: 'b' });
  const added = cur.children.find((m) => m.key === 'c')!;
  // In the picture from the start (so play() never takes it for a new mobject), but unseen.
  assert.ok(added);
  assert.ok(added.family().every((m) => m.style.opacity === 0));
  const done = await play(cur, () => new Succession([c.morph('a'), grow, c.rest()]));
  assert.equal(marks(done), marks(after()));
});

test('entry from a group with a different family preserves target keys without opaque cut-outs', async () => {
  const source = new Group(keyed(new Rectangle({width: 1, height: 1}), 'source:body'), keyed(new Dot().shift([0.4,0]), 'source:dot')).shift([-3,0]);
  const destination = new Group(keyed(new Circle({radius: 0.5}), 'arrived:body')).shift([3,0]);
  const current = picture(['source', source]), target = picture(['source', source.copy()], ['arrived', destination]);
  class Entry extends Scene {
    override async construct() {
      await this.step('entry'); this.add(current);
      const c = choreograph(current, target), enter = c.enter('arrived', {from: 'source'});
      const keys = current.family().flatMap(m => m.key === undefined ? [] : [m.key]);
      assert.equal(new Set(keys).size, keys.length, 'temporary source copies have separate keys');
      await this.play(new Succession([enter, c.rest()]));
    }
  }
  const sink = new MotionSink();
  await new Entry(sink).run();
  assert.equal(marks(current), marks(target));
  assert.ok(current.find('arrived:body'));
  assert.deepEqual(analyzeMotion(sink).filter(f => f.kind === 'cut-out'), []);
});

test('a part may leave and enter again (replaced in place), but not be animated twice otherwise', () => {
  const same = () => picture(['a', new Circle({ radius: 0.5 })]);
  const c = choreograph(same(), same());
  c.leave('a');
  c.enter('a');
  assert.throws(() => c.enter('a'), /already/);
  const d = choreograph(same(), same());
  d.morph('a');
  assert.throws(() => d.morph('a'), /already animated/);
});

test('replacement construction order does not change leave-then-enter playback', async () => {
  const same = () => picture(['a', new Circle({radius: 0.5})]);
  const target = same();
  const landed = await play(same(), current => {
    const c = choreograph(current, target);
    const enter = c.enter('a');
    const leave = c.leave('a');
    return new Succession([leave, enter]);
  });
  assert.equal(marks(landed), marks(target));
  await assert.rejects(play(same(), current => {
    const c = choreograph(current, target);
    const enter = c.enter('a');
    const leave = c.leave('a');
    return new Succession([enter, leave]);
  }), /must play before/);
});

test('a passing part the target does not have comes in, moves and goes out, and the picture still lands', async () => {
  const target = after();
  const done = await play(before(), (cur) => {
    const c = choreograph(cur, target);
    const token = c.insert('token', new Dot().moveTo([-3, -1]));
    return new Succession([
      new Transform(token, new Dot().moveTo([-3, -1]), { runTime: 0.2 }), // into view
      new Transform(token, new Dot().moveTo([3, -1]), { runTime: 0.5 }),
      c.leave('token', { runTime: 0.2 }),
      c.rest({ runTime: 0.3 }),
    ]);
  });
  assert.equal(marks(done), marks(after()));
  assert.ok(!done.children.some((m) => m.key === 'token'), 'the token left the picture');
});

test('a picture with two parts under one key is refused', () => {
  const twice = new Group(keyed(new Circle(), 'x'), keyed(new Rectangle({ width: 2, height: 2 }), 'x'));
  assert.throws(() => choreograph(twice, after()), /t\.choreograph\(\): two parts of one picture are keyed "x"/);
});

test('travel: a token appears at the path start, moves along it, and leaves; the picture still lands', async () => {
  const target = after();
  const path = new Line([-3, -1], [3, -1]);
  let seen: { appeared?: number[]; moved?: number[] } = {};
  const done = await play(before(), (cur) => {
    const c = choreograph(cur, target);
    const t = c.travel('token', new Dot(), path, { appear: 0.1, move: 0.4, leave: 0.1 });
    const part = cur.children.find((m) => m.key === 'token')!;
    // Unseen until its turn, then carried from one end of the path to the other.
    assert.ok(part.family().every((m) => m.style.opacity === 0));
    // Its landing hook, wrapped on the instance: finish() still keeps the phase around it.
    const watch = (anim: Animation, into: 'appeared' | 'moved'): Animation => {
      const hooks = anim as unknown as { doFinish(alpha?: number): void };
      const orig = hooks.doFinish;
      hooks.doFinish = function (this: Animation, alpha?: number) { orig.call(this, alpha); seen[into] = [...part.center()]; };
      return anim;
    };
    return new Succession([watch(t.appear, 'appeared'), watch(t.move, 'moved'), t.leave, c.rest({ runTime: 0.2 })]);
  });
  assert.deepEqual(seen.appeared!.map((v) => Math.round(v * 1e6) / 1e6), [-3, -1]);
  assert.deepEqual(seen.moved!.map((v) => Math.round(v * 1e6) / 1e6), [3, -1]);
  assert.equal(marks(done), marks(after()));
  assert.ok(!done.children.some((m) => m.key === 'token'), 'the token left the picture');
  // A key the target has is a part to morph, not a token passing through.
  assert.throws(() => choreograph(before(), after()).travel('a', new Dot(), path), /passes through/);
});


test('fresh paper enters under its ink in every construction order while a passing token stays in front', async () => {
  const tile = (key: string, width: number, color: string) =>
    keyed(new Rectangle({ width, height: width, fill: color, stroke: 'none' }), key);
  for (const start of ['empty', 'replace before leave', 'leave before replace']) {
    for (const order of [['ink', 'paper'], ['paper', 'ink']]) {
      const paper = tile('paper', 3, '#0000ff'), ink = tile('ink', 2, '#ff0000');
      const current = start === 'empty' ? new Group() : new Group(paper.copy(), ink.copy());
      const target = new Group(paper, ink);
      const c = choreograph(current, target);
      const token = c.insert('passing', tile('source', 0.4, '#00ff00'));
      let leaves: Animation[] = [];
      if (start === 'leave before replace') leaves = order.map(key => c.leave(key, { runTime: 0.1 }));
      const joins = order.map(key => c.enter(key, {}, { runTime: 0.1 }));
      if (start === 'replace before leave') leaves = order.map(key => c.leave(key, { runTime: 0.1 }));
      const leaveToken = c.leave('passing');
      assert.equal(current.children.at(-1), token, 'target entrances leave the transient token on top');
      await play(current, () => new Succession([...leaves, ...joins, new Transform(token, token.copy().setOpacity(1)), leaveToken]));
      assert.deepEqual(current.children.map(m => m.key), ['paper', 'ink'], start + ', ' + order);
      const s = new Scene(new NullSink()).add(current);
      const png = new Resvg(toSvgString(s, { width: 160 })).render();
      const at = (p: number) => [...png.pixels.slice((45 * png.width + p) * 4, (45 * png.width + p) * 4 + 3)];
      assert.deepEqual(at(80), [255, 0, 0], 'the opaque paper must leave the ink visible');
    }
  }
});

test('entering a root part beside a wrapped anchor preserves the wrapper and its clip', () => {
  const anchor = keyed(new Dot(), 'anchor'), layer = new Group(anchor);
  layer.clipBox = [4, 1, 5, 2];
  const current = new Group(layer), target = new Group(keyed(new Dot(), 'below'), layer.copy(), keyed(new Dot(), 'above'));
  const c = choreograph(current, target);
  const token = c.insert('passing', new Dot());
  c.leave('passing');
  c.enter('above'); c.enter('below');
  assert.deepEqual(current.children, [c.from('below'), layer, c.from('above'), token]);
  assert.deepEqual(layer.children, [anchor]);
});

test('replacing a layered part respects a changed target order without moving surviving siblings', async () => {
  const ink = keyed(new Dot(), 'ink'), paper = keyed(new Rectangle({ width: 2, height: 2 }), 'paper');
  const current = new Group(ink, paper), target = new Group(paper.copy(), ink.copy());
  await play(current, () => {
    const c = choreograph(current, target);
    const enter = c.enter('ink');
    assert.deepEqual(current.children.filter(m => m === ink || m === paper), [ink, paper]);
    return new Succession([c.leave('ink'), enter]);
  });
  assert.deepEqual(current.children.map(m => m.key), ['paper', 'ink']);
});

test('mixed-order replacements land on the target layers without moving the originals as the beats are built', async () => {
  const make = () => new Map([
    ['paper', keyed(new Rectangle({ width: 3, height: 3, fill: '#0000ff', stroke: 'none' }), 'paper')],
    ['ink', keyed(new Rectangle({ width: 2, height: 2, fill: '#ff0000', stroke: 'none' }), 'ink')],
    ['seal', keyed(new Rectangle({ width: 1, height: 1, fill: '#00ff00', stroke: 'none' }), 'seal')],
  ]);
  for (const keys of [['paper', 'ink', 'seal'], ['seal', 'paper', 'ink'], ['ink', 'seal']]) {
    const layers = make(), originals: Mobject[] = keys.length === 3
      ? [layers.get('paper')!, layers.get('seal')!, layers.get('ink')!]
      : [layers.get('ink')!, layers.get('seal')!, layers.get('paper')!];
    const current = new Group(...originals);
    const target = new Group(...[...layers.values()].map(m => m.copy()));
    const c = choreograph(current, target);
    const entries = keys.map(key => c.enter(key)), exits = keys.map(key => c.leave(key));
    assert.deepEqual(current.children.filter(m => originals.includes(m)), originals);
    await play(current, () => new Succession([...exits, ...entries]));
    assert.deepEqual(current.children.map(m => m.key), ['paper', 'ink', 'seal']);
    const raster = (m: Mobject) => new Resvg(toSvgString(new Scene(new NullSink()).add(m), { width: 160 })).render().pixels;
    assert.deepEqual(raster(current), raster(target));
  }
});
