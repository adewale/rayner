import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Scene,
  Rectangle,
  Text,
  FadeIn,
  Transform,
  Succession,
  } from '../src/index.ts';
import { NullSink, StringSink, renderAt, toSvgString } from '../src/output.ts';
import { MotionSink, analyzeMotion } from '../explain/testing.ts';
import type { Box, Mobject } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import type { Stage } from '../explain/index.ts';
import { bindSnapshots } from '../explain/testing.ts';
import { diagramKey, RENDERER } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { labelPx, restingTextProblems, MIN_PX } from '../tools/lib/explain-check.ts';
import { closeUps, stepLayouts, toView } from '../app/embed-closeup.ts';

const spec = { source: 'graph LR\nA --> B\nB --> C', style: 'nord' };
const HOME: Box = [-8, -4.5, 8, 4.5];
function fixture(): DiagramSnapshot {
  const shape = (x: number, extra: Record<string, unknown> = {}) => {
    const m = new Rectangle({ width: 0.5, height: 0.5, fill: '#334455', stroke: '#aabbcc' }).moveTo([x, 0]);
    return { subpaths: m.subpaths.map((a) => Array.from(a)), closed: m.closed, style: { ...m.style, ...extra } };
  };
  const edge = (from: string, to: string, x: number) => ({
    id: `edge:${from}->${to}#0`,
    role: 'edge',
    kind: 'connector',
    shapes: [shape(x, { fill: 'none' })],
    from,
    to,
    route: [
      [x - 1, 0],
      [x + 1, 0],
    ] as [number, number][],
  });
  return {
    version: 1,
    renderer: RENDERER,
    spec,
    family: 'flowchart',
    width: 800,
    height: 200,
    palette: { paper: '#123456', ink: '#ffffff', accent: '#ff8800', muted: '#aaaaaa' },
    findings: { ok: true, warnings: [] },
    parts: [
      { id: 'A', role: 'node', kind: 'shape', shapes: [{ ...shape(0), text: 'Alpha', fontSize: 20 }] },
      { id: 'B', role: 'node', kind: 'shape', shapes: [{ ...shape(3), text: 'Beta', fontSize: 20 }] },
      { id: 'C', role: 'node', kind: 'shape', shapes: [{ ...shape(6), text: 'Gamma', fontSize: 20 }] },
      edge('A', 'B', 1.5),
      edge('B', 'C', 4.5),
    ],
  };
}
const bound = (S: import('../src/index.ts').SceneClass) => bindSnapshots(S, { [diagramKey(spec)]: fixture() });
/** Every point of every part, as plain numbers, to compare before and after. */
const pointsOf = (mobs: Mobject[]) => mobs.flatMap((m) => m.family().flatMap((f) => f.pointArrays().map((a) => [...a])));
const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);

test('s.focus moves the camera, not the diagram; a view’s notes, marks, dims and a walk work while zoomed', async () => {
  class Zoom extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(spec, { box: 'full' });
      const parts = ['A', 'B', 'C', 'edge:A->B#0', 'edge:B->C#0'].map((id) => d.get(id));
      const before = pointsOf(parts);
      await s.focus(d.get('B'));
      assert.ok(this.frame.zoom > 1.5, 'the camera went closer');
      const view = this.frame.box()!;
      const b = d.get('B').box()!;
      assert.ok(b[0] >= view[0] && b[2] <= view[2] && b[1] >= view[1] && b[3] <= view[3], 'B is in view');
      assert.deepEqual(pointsOf(parts), before, 'no point moved');
      // Emphasis while zoomed, drawn by the diagram's view: it changes styles and adds notes, never part geometry.
      this.shown.emphasis = true;
      this.shown.walked = [];
      const v = s.diagramView(d, (_st, sh) =>
        sh.emphasis
          ? {
              marks: { B: d.emphasis, ...d.trail(sh.walked as [string, string][]) },
              dim: ['A', 'B'],
              notes: [{ id: 'B', text: 'here', side: 'above' }],
            }
          : {});
      const note = this.find('note:B')!;
      assert.ok(note.box()![1] >= d.get('B').box()![3], 'the note sits beside its part');
      await d.walk([['A', 'B']]);
      this.shown.walked = [['A', 'B']];
      await this.play(v.sync());
      assert.deepEqual(pointsOf(parts), before);
      const drawn = (id: string) => v.current.family().find((m) => m.key === id)!;
      assert.ok(drawn('C').family()[1]!.style.opacity! < 1, 'C is dimmed');
      assert.equal(drawn('edge:A->B#0').family()[1]!.style.stroke, d.emphasis, 'the walked link is marked travelled');
      // A focus can frame the part's note with it.
      await s.focus([d.get('B'), this.find('note:B')!]);
      const tight = this.frame.box()!;
      const nb = this.find('note:B')!.box()!;
      assert.ok(nb[1] >= tight[1] && nb[3] <= tight[3], 'the note is in view');
      assert.equal(d.describe().parts.find((p) => p.name === 'Beta')?.mark, 'marked');
      await s.focus('all');
      assert.ok(near(this.frame.box()!, HOME), 'all returns to the whole stage');
      assert.deepEqual(pointsOf(parts), before);
      this.shown.emphasis = false;
      await this.play(v.sync());
      await s.focus(d.get('C'));
      await s.clear();
      assert.ok(near(this.frame.box()!, HOME), 'clear() brings the camera home');
      this.state.done = true;
    }
  }
  await new (bound(Zoom))(new NullSink()).run();
});

test('the stage follows a camera the scene moves itself: a pin after a raw frame move is sized as after s.focus', async () => {
  // A 16:9 box a quarter of the stage wide: the camera's map scales by 0.25 about the box's centre.
  const box: Box = [-1, -0.625, 3, 1.625];
  const pinAfter = async (move: (scene: Scene, s: Stage) => PromiseLike<unknown>, composed = false) => {
    let drawn: number[][] = [];
    class Pinned extends Scene {
      override async construct() {
        const s = stage(this, { heading: false });
        await this.step('one');
        if (composed) {
          // Composed with the move, the pin is decided when it is called: for the camera then, at home.
          const pin = s.pin([1, 0.5]);
          await this.play(new Succession([s.focus(box, { exact: true }), pin]));
          drawn = pointsOf([pin.value]);
        } else {
          await move(this, s);
          drawn = pointsOf([await s.pin([1, 0.5])]);
        }
        this.state.done = true;
      }
    }
    await new Pinned(new NullSink()).run();
    return drawn.flat();
  };
  const close = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) < 1e-4);
  const home = await pinAfter(async () => {});
  const focused = await pinAfter((_scene, s) => s.focus(box, { exact: true }));
  const raw = await pinAfter((scene) => scene.play(new Transform(scene.frame, scene.frame.copy().fit(box, { margin: 0 }))));
  assert.ok(!close(focused, home), 'a pin while zoomed is sized for the screen');
  assert.ok(close(raw, focused), 'a raw camera move sizes the pin as s.focus does');
  assert.ok(close(await pinAfter(async () => {}, true), home), 'a pin composed after a focus is decided when called');
});

test('an enlargement does not depend on the camera', async () => {
  class Away extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(spec, { box: 'full' });
      const focused = () => d.describe().parts.filter((p) => p.mark === 'focused').map((p) => p.name);
      // The artwork moves inside the diagram's own box: where the camera is does not matter.
      await d.enlarge(['A']);
      await this.play(this.frame.animate.scale(0.9));
      assert.deepEqual(focused(), ['Alpha'], 'an enlargement holds wherever the camera is');
      this.state.done = true;
    }
  }
  await new (bound(Away))(new NullSink()).run();
});

test('enlarge moves the diagram inside its own box and the camera stays home', async () => {
  class Inside extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(spec, { box: 'left' });
      const wide = d.get('B').width();
      await d.enlarge(['B']);
      assert.ok(near(this.frame.box()!, HOME), 'the camera did not move');
      assert.ok(d.get('B').width() > 1.5 * wide, 'the artwork scaled up');
      assert.deepEqual(d.describe().parts.find((p) => p.name === 'Beta')?.mark, 'focused');
      await d.enlarge('all');
      assert.ok(Math.abs(d.get('B').width() - wide) < 1e-4, 'all puts the artwork back');
      this.state.done = true;
    }
  }
  await new (bound(Inside))(new NullSink()).run();
});

test('close-ups are worked out in the camera view: boxes in its units, label sizes times its zoom', async () => {
  class Look extends Scene {
    override async construct() {
      const label = new Text('a label to read', { fontSize: 0.2 }).moveTo([4, 2]);
      await this.step('home');
      await this.play(new FadeIn(label));
      await this.step('closer');
      await this.play(this.frame.animate.fit(label, { margin: 1 }));
    }
  }
  const layouts = await stepLayouts(Look);
  const home = layouts.get('home')!,
    closer = layouts.get('closer')!;
  const [a] = home.labels,
    [b] = closer.labels;
  assert.ok(a && b, 'the label is seen in both steps');
  const k = (b.box[2] - b.box[0]) / (a.box[2] - a.box[0]);
  assert.ok(k > 2, `the camera went closer (${k})`);
  assert.ok(Math.abs(b.size / a.size - k) < 1e-3, 'the size grows with the camera zoom');
  // In the camera's units the label sits at the middle of the view, where it was framed.
  assert.ok(Math.abs((b.box[0] + b.box[2]) / 2) < 1e-3 && Math.abs((b.box[1] + b.box[3]) / 2) < 1e-3);
  // A phone's close-up of the zoomed step needs less (or no) zoom of its own: the two multiply.
  const [w, h] = [358, 201];
  assert.ok(closeUps(closer, w, h)[0]!.k * k >= closeUps(home, w, h)[0]!.k - 1e-6);
  assert.ok(closeUps(closer, w, h)[0]!.k <= closeUps(home, w, h)[0]!.k);
});

test('a scene that focuses twice seeks to the same SVG and moves without teleports', async () => {
  class Twice extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('look');
      const d = await s.show(spec, { box: 'full' });
      await s.focus(d.get('A'));
      await this.step('across');
      await s.focus(d.get('C'), { margin: 0.2 });
      await this.step('back');
      await s.focus('all');
    }
  }
  const Bound = bound(Twice);
  const sink = new StringSink();
  const motion = new MotionSink();
  await new Bound({
    async frame(scene, dt) {
      await sink.frame(scene);
      await motion.frame(scene);
      void dt;
    },
  }).run();
  assert.deepEqual(analyzeMotion(motion), [], 'a camera glide is smooth motion');
  const views = new Set(sink.frames.map((f) => f.match(/viewBox="([^"]+)"/)![1]));
  assert.ok(views.size > 10, 'the viewBox animates');
  for (const frame of [5, 30, 45, 60, 75, sink.frames.length - 1]) {
    const at = new StringSink();
    await renderAt(Bound, frame / 30, at);
    assert.equal(at.last(), sink.frames[frame], `seek to frame ${frame}`);
  }
});

test('labels are measured on screen: world size times the camera zoom', () => {
  const scene = new Scene(new NullSink());
  // 10 px at a 1280-pixel stage is 1/8 of a scene unit (80 px per unit at home).
  const small = new Text('small', { fontSize: 10 / 80 });
  scene.add(small);
  const home = labelPx(small, scene)!;
  assert.ok(Math.abs(home - 10) < 0.5, `about 10 px at home, got ${home}`);
  scene.frame.scale(0.5); // zoom 2
  assert.ok(labelPx(small, scene)! >= MIN_PX, 'a 10 px label zoomed 2x passes');
  scene.frame.reset();
  const big = new Text('big', { fontSize: 20 / 80 });
  scene.add(big);
  assert.ok(labelPx(big, scene)! >= MIN_PX);
  scene.frame.scale(2); // zoom 0.5
  assert.ok(labelPx(big, scene)! < MIN_PX, 'a 20 px label zoomed out 2x fails');
  // A view out of 16:9 is letterboxed: 16 x 36 shows 20 px per unit, so 20 px at home reads 5.
  scene.frame.reset().stretch(4, 1);
  assert.ok(Math.abs(labelPx(big, scene)! - 5) < 0.5, `about 5 px in a 16 x 36 view, got ${labelPx(big, scene)}`);
  assert.deepEqual(toView([0, 0, 4, 4], scene.frame.box()!), [0, 0, 1, 1], 'close-ups work in the letterboxed units too');
});

test('resting text is judged in the camera view: cut by its edge fails, wholly outside is off screen', () => {
  const scene = new Scene(new NullSink());
  scene.add(
    new Text('in view', { fontSize: 0.3 }).moveTo([0, 0]),
    new Text('across the edge', { fontSize: 0.3 }).moveTo([2, 1]),
    new Text('outside', { fontSize: 0.3 }).moveTo([6, -3]),
  );
  assert.deepEqual(restingTextProblems(scene), []);
  scene.frame.fit([-1, -1, 1, 1], { margin: 0.2 });
  assert.deepEqual(restingTextProblems(scene), ['"across the edge" is cut off by the frame']);
  // The SVG of a camera move differs from home, and coming back is the same picture.
  const zoomed = toSvgString(scene);
  scene.frame.reset();
  const home = toSvgString(scene);
  assert.notEqual(zoomed, home);
  scene.frame.fit([-1, -1, 1, 1], { margin: 0.2 });
  assert.equal(toSvgString(scene), zoomed);
});

test('one camera zoom: the stage pins its heading by the zoom the close-ups read, for a box out of 16:9 too', async () => {
  const { zoomOf } = await import('../src/units.ts');
  const { isHeading } = await import('../explain/stage.ts');
  assert.equal(zoomOf(HOME), 1);
  assert.equal(zoomOf([-2, -1.125, 2, 1.125]), 4, 'a 16:9 box: width and height agree');
  assert.equal(zoomOf([-1, -2, 1, 2]), 9 / 4, 'a tall box: its height sets the scale');
  assert.equal(zoomOf([-4, -1, 4, 1]), 2, 'a wide box: its width sets the scale');
  // s.focus with an exact box out of 16:9: the heading must stay where it is on screen, as the
  // close-ups map the world into the camera's view (toView, by zoomOf).
  for (const box of [[-1, -2, 1, 2], [-4, -1, 4, 1]] as Box[]) {
    let home: Box[] = [], away: Box[] = [], view: Box = HOME;
    class Tall extends Scene {
      override async construct() {
        const s = stage(this);
        await this.step('one', { title: 'A heading' } as never);
        const heading = () => this.mobjects.filter((m) => isHeading(m) && m.role === 'heading').map((m) => m.box()!);
        home = heading();
        await s.focus(box, { exact: true });
        view = this.frame.box()!;
        away = heading().map((b) => toView(b, view));
        this.state.done = true;
      }
    }
    await new Tall(new NullSink()).run();
    assert.ok(home.length > 0);
    assert.notDeepEqual(view, HOME);
    assert.ok(home.every((b, i) => b.every((v, k) => Math.abs(v - away[i]![k]!) < 1e-3)), `${JSON.stringify(box)}: the heading moved on screen, ${JSON.stringify(home)} to ${JSON.stringify(away)}`);
  }
});
