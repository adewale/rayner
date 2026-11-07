// choreograph(current, target): an authored transition between two pictures, part by part, by key.
// Whatever the author names or leaves out, the current picture ends showing the target's parts.

import { test } from 'node:test';
import { Square } from '../src/extras.ts';
import { choreograph } from '../explain/choreograph.ts';
import assert from 'node:assert/strict';
import { Scene, Group, Circle, Dot, Line, Succession, Transform } from '../src/index.ts';
import { NullSink, toSvgString } from '../src/output.ts';
import type { AnimationGroup } from '../src/index.ts';
import type { Mobject, Animation } from '../src/index.ts';

/** A picture of keyed parts. */
const picture = (...parts: [string, Mobject][]) => new Group(...parts.map(([key, m]) => Object.assign(m, { key })));
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

const before = () => picture(['a', new Circle({ radius: 0.5 }).moveTo([-2, 0])], ['b', new Square({ side: 1 }).moveTo([0, 0])]);
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
  const twice = new Group(Object.assign(new Circle(), { key: 'x' }), Object.assign(new Square(), { key: 'x' }));
  assert.throws(() => choreograph(twice, after()), /two parts are keyed x/);
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
    const watch = (anim: Animation, into: 'appeared' | 'moved') => Object.assign(anim, {
      finish: ((orig) => function (this: Animation) { orig.call(this); seen[into] = [...part.center()]; })(anim.finish),
    });
    return new Succession([watch(t.appear, 'appeared'), watch(t.move, 'moved'), t.leave, c.rest({ runTime: 0.2 })]);
  });
  assert.deepEqual(seen.appeared!.map((v) => Math.round(v * 1e6) / 1e6), [-3, -1]);
  assert.deepEqual(seen.moved!.map((v) => Math.round(v * 1e6) / 1e6), [3, -1]);
  assert.equal(marks(done), marks(after()));
  assert.ok(!done.children.some((m) => m.key === 'token'), 'the token left the picture');
  // A key the target has is a part to morph, not a token passing through.
  assert.throws(() => choreograph(before(), after()).travel('a', new Dot(), path), /passes through/);
});
