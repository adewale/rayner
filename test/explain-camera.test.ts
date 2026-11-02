import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Scene,
  NullSink,
  Rectangle,
  Text,
  MotionSink,
  FadeIn,
  analyzeMotion,
  StringSink,
  renderAt,
  toSvgString,
} from '../src/index.ts';
import type { Box, Mobject } from '../src/index.ts';
import { stage, bindSnapshots } from '../explain/index.ts';
import { diagramKey, RENDERER } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { cameraBox } from '../explain/diagrams.ts';
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

test('focus with camera moves the camera, not the diagram; notes, marks, dims and walks work while zoomed', async () => {
  class Zoom extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(spec, { box: 'full' });
      const parts = ['A', 'B', 'C', 'edge:A->B#0', 'edge:B->C#0'].map((id) => d.get(id));
      const before = pointsOf(parts);
      await d.focus(['B'], { camera: true });
      assert.ok(this.frame.zoom > 1.5, 'the camera went closer');
      const view = this.frame.box()!;
      const b = d.get('B').box()!;
      assert.ok(b[0] >= view[0] && b[2] <= view[2] && b[1] >= view[1] && b[3] <= view[3], 'B is in view');
      assert.deepEqual(pointsOf(parts), before, 'no point moved');
      // Emphasis while zoomed: it changes styles and adds marks, never part geometry.
      await d.mark(['B']);
      await d.dim(['A', 'B']);
      const note = await d.note('B', 'here', { side: 'above' });
      assert.ok(note.box()![1] >= d.get('B').box()![3], 'the note sits beside its part');
      await d.walk([['A', 'B']], { trail: true });
      assert.deepEqual(pointsOf(parts), before);
      assert.ok(d.get('C').family()[1]!.style.opacity! < 1, 'C is dimmed');
      // A focus frames the chosen parts' notes too.
      await d.focus(['B'], { camera: true });
      const tight = this.frame.box()!;
      const nb = note.box()!;
      assert.ok(nb[1] >= tight[1] && nb[3] <= tight[3], 'the note is in view');
      await d.focus('all');
      assert.ok(near(this.frame.box()!, HOME), 'all returns to the whole stage');
      assert.deepEqual(pointsOf(parts), before);
      assert.equal(d.describe().parts.some((p) => p.mark === 'focused'), false, 'nothing is in focus at home');
      await d.unmark();
      await d.focus(['C'], { camera: true });
      // The description says what the camera is on, as a mark does; a mark says more and wins.
      assert.deepEqual(d.describe().parts.find((p) => p.name === 'Gamma')?.mark, 'focused');
      await s.clear();
      assert.ok(near(this.frame.box()!, HOME), 'clear() brings the camera home');
      this.state.done = true;
    }
  }
  await new (bound(Zoom))(new NullSink()).run();
});

test('a camera focus is described only while the camera stays on it; an artwork focus does not depend on the camera', async () => {
  class Away extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(spec, { box: 'full' });
      const focused = () => d.describe().parts.filter((p) => p.mark === 'focused').map((p) => p.name);
      await d.focus(['B'], { camera: true });
      assert.deepEqual(focused(), ['Beta'], 'in focus while the camera is on it');
      await this.play(this.frame.animate.reset());
      assert.deepEqual(focused(), [], 'the camera went home without focus("all")');
      await d.focus(['B'], { camera: true });
      await this.play(this.frame.animate.shift([1, 0]));
      assert.deepEqual(focused(), [], 'the camera moved on');
      await this.play(this.frame.animate.reset());
      // The artwork moves inside the diagram's own box: where the camera is does not matter.
      await d.focus(['A']);
      await this.play(this.frame.animate.scale(0.9));
      assert.deepEqual(focused(), ['Alpha'], 'an artwork focus holds wherever the camera is');
      this.state.done = true;
    }
  }
  await new (bound(Away))(new NullSink()).run();
});

test('by default focus moves the diagram inside its own box and the camera stays home', async () => {
  class Inside extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(spec, { box: 'left' });
      const wide = d.get('B').width();
      await d.focus(['B']);
      assert.ok(near(this.frame.box()!, HOME), 'the camera did not move');
      assert.ok(d.get('B').width() > 1.5 * wide, 'the artwork scaled up');
      assert.deepEqual(d.describe().parts.find((p) => p.name === 'Beta')?.mark, 'focused');
      await assert.rejects(d.focus(['B'], { also: [s.heading] }), /camera: true/);
      await d.focus('all');
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

test('the camera box keeps 16:9, honours zoom and margin, and stays on the stage', () => {
  const box = cameraBox([0, 0, 2, 1], 0.5);
  assert.ok(Math.abs((box[2] - box[0]) / (box[3] - box[1]) - 16 / 9) < 1e-9);
  assert.ok(near([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], [1, 0.5]));
  // 2 x 1 plus 0.5 a side is 3 x 2; 16:9 around that is 2 tall, so 32/9 wide.
  assert.ok(Math.abs(box[2] - box[0] - 32 / 9) < 1e-9);
  const closer = cameraBox([0, 0, 2, 1], 0.5, 2);
  assert.ok(Math.abs((closer[2] - closer[0]) * 2 - (box[2] - box[0])) < 1e-9, 'zoom 2 is half as wide');
  // A part at the stage's corner: the view slides to stay on the paper.
  const corner = cameraBox([7, 4, 7.9, 4.4], 0.5);
  assert.ok(corner[2] <= 8 + 1e-9 && corner[3] <= 4.5 + 1e-9);
  // Wider than the stage: the whole stage, never past the paper.
  assert.ok(near(cameraBox([-20, -1, 20, 1]), HOME));
});

test('a scene that focuses twice seeks to the same SVG and moves without teleports', async () => {
  class Twice extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('look');
      const d = await s.show(spec, { box: 'full' });
      await d.focus(['A'], { camera: true });
      await this.step('across');
      await d.focus(['C'], { camera: true, zoom: 1.5 });
      await this.step('back');
      await d.focus('all');
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
