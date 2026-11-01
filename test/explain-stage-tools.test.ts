// The stage's heading line and number, its camera focus (the heading stays put on screen),
// carry, the annotations and the drawing tool: what each leaves on screen, and that each
// plays without a motion failure and seeks exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, NullSink, Rectangle, Group, VMobject, Text, MotionSink, analyzeMotion, StringSink, renderAt, toSvgString } from '../src/index.ts';
import type { Box, Mobject, Vec } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { oneStrokeEach } from '../explain/annotate.ts';
import { restingTextProblems } from '../tools/lib/explain-check.ts';

/** Run a scene, collecting its motion failures and a probe's readings after each frame. */
async function run<T>(S: import('../src/index.ts').SceneClass, probe: (scene: Scene) => T) {
  const motion = new MotionSink(),
    seen: T[] = [];
  const scene = new S({
    async frame(sc: Scene) {
      await motion.frame(sc);
      seen.push(probe(sc));
    },
  });
  await scene.run();
  return { scene, events: analyzeMotion(motion), seen };
}
/** A box as the camera shows it: in the units of the 16 × 9 home frame. */
function onScreen(scene: Scene, b: Box): Box {
  const [x0, y0, x1, y1] = scene.frame.box()!,
    k = 16 / (x1 - x0),
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  return [(b[0] - cx) * k, (b[1] - cy) * k, (b[2] - cx) * k, (b[3] - cy) * k];
}
const near = (a: Box, b: Box, eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

test('a step line sits under a numbered title; a line too wide for one line fails', async () => {
  class Lined extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one', { title: 'A title', line: 'A short line under it.' });
      await this.wait(0.2);
      const keyed = this.mobjects.filter((m) => m.key === '__chrome');
      const line = keyed.find((m) => m instanceof Text && m.text === 'A short line under it.')!;
      const badge = keyed.find((m) => m instanceof Group)!;
      assert.ok(line, 'the line is drawn');
      assert.equal((badge.children[1] as Text).text, '1');
      // Under the title, and above the content area (y < 3.25).
      assert.ok(line.box()![3] <= s.heading.box()![1] + 1e-9);
      assert.ok(line.box()![1] >= 3.25);
      // The heading and its parts draw over anything added later.
      this.add(new Rectangle({ width: 2, height: 2 }));
      assert.ok(this.mobjects.indexOf(s.heading) > this.mobjects.findIndex((m) => m instanceof Rectangle && m.key == null && m !== s.paper));
    }
  }
  await new Lined(new NullSink()).run();
  class TooLong extends Scene {
    override async construct() {
      stage(this);
      await this.step('bad', { title: 'T', line: 'word '.repeat(40) });
    }
  }
  await assert.rejects(new TooLong(new NullSink()).run(), /Step "bad": its line is .* longer than one line under the heading/);
});

test('focus zooms onto a target below the heading, which stays put on screen at its size', async () => {
  let home: Box | null = null;
  class Focused extends Scene {
    target = new Rectangle({ width: 1, height: 0.5 }).moveTo([3, -2]);
    override async construct() {
      const s = stage(this);
      await this.step('one', { title: 'Close up', line: 'The heading holds still.' });
      home = s.heading.box()!;
      await s.enter(this.target, { describe: 'a box' });
      await s.focus(this.target, { margin: 0.2 });
      await this.wait(0.2);
      await s.focus('all');
    }
  }
  const { scene, events, seen } = await run(Focused, (sc) => {
    const heading = sc.mobjects.find((m) => m.key === '__heading' && (m as Text).text === 'Close up');
    return heading ? { heading: onScreen(sc, heading.box()!), frame: sc.frame.box()!, fading: (heading.style.opacity ?? 1) < 1 } : null;
  });
  assert.deepEqual(events, []);
  // Every frame of both camera moves shows the heading where it sits at home.
  const shown = seen.filter((x): x is NonNullable<typeof x> => !!x);
  assert.ok(shown.some((x) => x.frame[2] - x.frame[0] < 15), 'the camera moved');
  for (const x of shown) assert.ok(near(x.heading, home!), JSON.stringify(x));
  // At the closest, the target fills the content area's width or height, inside it.
  const closest = shown.reduce((a, b) => (b.frame[2] - b.frame[0] < a.frame[2] - a.frame[0] ? b : a));
  assert.ok(closest.frame[2] - closest.frame[0] < 16 / 3);
  const t = onScreen({ frame: { box: () => closest.frame } } as unknown as Scene, (scene as Focused).target.box()!);
  assert.ok(t[3] <= 3.25 && t[1] >= -4.25 && t[0] >= -7.55 && t[2] <= 7.55, JSON.stringify(t));
  // Home again exactly.
  assert.deepEqual(scene.frame.box(), [-8, -4.5, 8, 4.5]);
});

test('carry shrinks an object into a box, never enlarges it, and glides there', async () => {
  class Carried extends Scene {
    big = new Rectangle({ width: 6, height: 2 });
    small = new Rectangle({ width: 0.5, height: 0.5 });
    override async construct() {
      const s = stage(this);
      await this.step('one', { title: 'Carry' });
      await s.enter(this.big, this.small, { describe: 'two boxes' });
      await s.carry(this.big, [-7, 1, -4, 3]);
      await s.carry(this.small, [3, -3, 7, 1]);
    }
  }
  const { scene, events } = await run(Carried, () => null);
  assert.deepEqual(events, []);
  const c = scene as Carried;
  const b = c.big.box()!;
  assert.ok(b[0] >= -7 - 1e-6 && b[2] <= -4 + 1e-6 && b[1] >= 1 - 1e-6 && b[3] <= 3 + 1e-6);
  assert.ok(Math.abs(c.small.width() - 0.5) < 1e-6, 'never enlarged');
  assert.ok(near(c.small.box()!, [4.75, -1.25, 5.25, -0.75]));
});

test('annotations keep their words, and under a zoomed camera they show at their home size', async () => {
  let atHome = 0,
    zoomed = 0;
  class Noted extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one', { title: 'Annotate' });
      const box = new Rectangle({ width: 2, height: 1 }).moveTo([0, -1]);
      await s.enter(box, { describe: 'a box' });
      const d = await s.dimension([-1, -1.5], [1, -1.5], '2 units', { offset: -0.3 });
      const p = await s.pin([1, -0.5], { label: 'corner' });
      const c = await s.callout(box, 'a box', { side: 'left' });
      atHome = (c.children.find((m) => m instanceof Text) as Text).height();
      assert.ok(d.family().some((m) => m instanceof Text && m.text === '2 units'));
      await s.focus([box, d, p, c], { margin: 1.4 });
      const z = await s.callout(box, 'zoomed', { side: 'below', gap: 0.3 });
      const t = z.children.find((m) => m instanceof Text) as Text;
      zoomed = t.height() * (16 / (this.frame.box()![2] - this.frame.box()![0]));
    }
  }
  const { scene, events } = await run(Noted, () => null);
  assert.deepEqual(events, []);
  // On screen, the callout made while zoomed is as tall as one made at home.
  assert.ok(Math.abs(zoomed - atHome) / atHome < 0.05, `${zoomed} vs ${atHome}`);
  assert.deepEqual(restingTextProblems(scene), []);
});

test('draw: the tool rides the tip without jumps, leaves no trace, and the drawing seeks exactly', async () => {
  class Drawn extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one', { title: 'Draw' });
      const many = new VMobject({ stroke: '#000000', strokeWidth: 0.03, fill: 'none' });
      // Strokes far apart, and tiny ones: the hops and the clusters.
      for (let i = 0; i < 12; i++) {
        const x = -6 + i, y = i % 2 ? 1 : -1;
        many.startNewPath([x, y]);
        many.addLineTo([x + (i % 3 ? 0.6 : 0.03), y + 0.02]);
      }
      const drawn = await s.draw(many, { tool: 'pen', runTime: 2, describe: 'twelve strokes' });
      assert.ok(drawn instanceof Group && drawn.children.length === 12, 'one path per stroke');
      await this.step('two', { title: 'Done' });
      await this.wait(0.2);
    }
  }
  const { scene, events } = await run(Drawn, () => null);
  assert.deepEqual(events, [], JSON.stringify(events.slice(0, 3)));
  // The tool is gone when the play ends: nothing but the strokes, paper and heading parts remain.
  const stageFurniture = (m: Mobject) => {
    for (let a: Mobject | null = m; a; a = a.parent) if (a.key === '__paper' || a.key === '__heading' || a.key === '__chrome') return true;
    return false;
  };
  const filled = scene
    .familyMembers()
    .filter((m) => m instanceof VMobject && m.hasPoints() && m.style.fill !== 'none' && (m.style.fillOpacity ?? 1) > 0 && !stageFurniture(m));
  assert.deepEqual(filled, [], 'the tool is left behind');
  for (const t of [0.6, 1.1, 1.7]) {
    const played = new StringSink();
    const full = new Drawn({
      async frame(sc: Scene) {
        if (Math.abs(sc.time - t) < 1e-9) played.frames.push(toSvgString(sc));
      },
    } as never);
    await full.run();
    const seeked = new StringSink();
    await renderAt(Drawn, t, seeked);
    assert.equal(seeked.last(), played.frames.at(-1), `seek at ${t}`);
  }
});

test('oneStrokeEach splits strokes, keeps a lettered fill whole, and splits separate fills', () => {
  const strokes = new VMobject({ stroke: '#000', strokeWidth: 0.02, fill: 'none' });
  for (const x of [0, 1, 2]) {
    strokes.startNewPath([x, 0]);
    strokes.addLineTo([x + 0.5, 0]);
  }
  assert.equal(oneStrokeEach(strokes).children.length, 3);
  // An "o": outer and inner contours overlap, so the counter stays a hole.
  const o = new VMobject({ fill: '#000', fillOpacity: 1, stroke: 'none' });
  const ring = (r: number) => {
    o.startNewPath([r, 0]);
    for (let i = 1; i <= 8; i++) o.addLineTo([r * Math.cos((i / 8) * 2 * Math.PI), r * Math.sin((i / 8) * 2 * Math.PI)] as Vec);
  };
  ring(1);
  ring(0.5);
  assert.equal(oneStrokeEach(o), o);
  // Two dots far apart are two shapes.
  const dots = new VMobject({ fill: '#000', fillOpacity: 1, stroke: 'none' });
  for (const x of [0, 5]) {
    dots.startNewPath([x, 0]);
    dots.addLineTo([x + 0.1, 0]);
    dots.addLineTo([x + 0.1, 0.1]);
  }
  assert.equal(oneStrokeEach(dots).children.length, 2);
  // Inside a group the split replaces the child in place.
  const g = new Group(strokes);
  oneStrokeEach(g);
  assert.ok(g.children[0] instanceof Group && (g.children[0] as Mobject).parent === g);
});

test("a step's line is in the page transcript, without an empty paragraph when absent", async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { collectProject } = await import('../tools/lib/explain-project.ts');
  const { buildExplainer } = await import('../tools/lib/explain-build.ts');
  const folder = await mkdtemp(join(tmpdir(), 'explain-line-'));
  await writeFile(
    join(folder, 'lined.ts'),
    `import{Scene,Rectangle}from'rayner';import{stage}from'rayner/explain';export default class L extends Scene{static meta={id:'lined',title:'Lined'};async construct(){const s=stage(this);
await this.step('one',{title:'First',line:'A line & a <tag>.',caption:'The first caption.'});await s.enter(new Rectangle(),{describe:'a box'});
await this.step('two',{title:'Second',caption:'No line here.'});await s.enter(new Rectangle().shift([3,0]),{describe:'another box'});}}`,
  );
  const project = await collectProject(join(folder, 'lined.ts'));
  const { html } = await buildExplainer(project, join(folder, 'lined.html'));
  const transcript = html.slice(html.indexOf('<details class="transcript"'), html.indexOf('</details>', html.indexOf('<details class="transcript"')));
  assert.ok(transcript.includes('<p><strong>A line &amp; a &lt;tag&gt;.</strong></p><p>The first caption.</p>'), transcript);
  assert.ok(transcript.includes('>Second</a><p>No line here.</p>'), 'a step without a line has no empty paragraph');
});
