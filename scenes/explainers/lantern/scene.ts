import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/lantern.ts';
import {
  Scene,
  Circle,
  Square,
  Rectangle,
  Dot,
  Line,
  Text,
  Group,
  FadeIn,
  FadeOut,
  Transform,
  toSvgString,
  renderAt,
  StringSink,
} from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, regionBox } from '../../../explain/index.ts';
const STYLE = 'hand-drawn';
const DEMO = [
  'class Demo extends Scene {',
  '  async construct() {',
  '    const dot = new Circle({ radius: 0.6 });',
  "    await this.step('before', { caption: 'One idea.' });",
  '    await this.play(new FadeIn(dot));',
  "    await this.step('after', { caption: 'The next idea.' });",
  '    await this.play(new Transform(dot, new Square()));',
  '  }',
  '}',
];
const CLASSES =
  'classDiagram\n direction LR\n class Scene {\n construct()\n play()\n step()\n }\n class Mobject {\n points\n style\n }\n class Animation {\n interpolate()\n }\n class Sink {\n frame()\n }\n Scene --> Mobject : owns\n Scene --> Animation : plays\n Scene --> Sink : emits';
const FLOW =
  'graph LR\nAuthor[Native Scene] --> Clock[Fixed dt loop]\nClock --> Browser[Browser sink]\nClock --> SVG[SVG frames]\nClock --> Trace[State trace]\nSVG --> PNG[PNG stills]';
const PUBLISH =
  'graph LR\nAuthor[Native Scene] --> Build[Build snapshots]\nBuild --> Page[Portable HTML]\nBuild --> JSON[Scene description]\nPage --> Reader[Reader-paced steps]';
/** A tiny native scene, run twice inside this one: once played, once seeked. */
const SEEK_T = 1;
function demoScene(ink: string, accent: string) {
  return class SeekDemo extends Scene {
    override async construct() {
      const look = { stroke: ink, strokeWidth: 0.14, fill: accent, fillOpacity: 0.35 };
      const box = new Rectangle({ width: 3, height: 3, ...look }).moveTo([-4.5, 0]);
      const dot = new Dot({ radius: 0.5, color: ink }).moveTo([-4.5, -3]);
      await this.play(new FadeIn(box), new FadeIn(dot), { runTime: 0.5 });
      await this.play(
        new Transform(box, new Rectangle({ width: 8, height: 5, ...look }).moveTo([2.5, 0.5])),
        dot.animate.moveTo([6.5, 3.2]),
        { runTime: 1 },
      );
    }
  };
}
/** FNV-1a, so the reader can compare two frames by a short fingerprint. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
async function playedAndSeeked(ink: string, accent: string) {
  const Demo = demoScene(ink, accent);
  let played = '',
    playedFrame: Mobject[] = [];
  const sink = {
    async frame(s: Scene) {
      if (played || s.time + 1e-9 < SEEK_T) return;
      played = toSvgString(s);
      playedFrame = s.mobjects.map((m) => m.copy());
    },
  };
  await new Demo(sink).run();
  const seekSink = new StringSink();
  const seeked = await renderAt(Demo, SEEK_T, seekSink);
  return {
    played,
    seeked: seekSink.last() ?? '',
    playedFrame,
    seekedFrame: seeked.mobjects.map((m) => m.copy()),
  };
}

export default class LanternExplainer extends Scene {
  static meta = {
    id: 'lantern',
    title: 'How does one scene produce several outputs?',
    sources: ['https://github.com/ivarvong/lantern', 'https://github.com/ivarvong/lantern/blob/2c7bad5/src/scene.ts'],
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.palette.ink,
      accent = s.emphasis;

    await readerFirst(this, s, readerFrames());
    await this.step('model', {
      detail: true,
      title: 'One program names the steps and draws their pictures',
      line: 'Follow this.step and this.play from the code to the stage.',
      caption:
        'How can one scene make both an interactive page and the stills and trace that inspect it? In demo.ts, construct calls this.step to name each idea and this.play to draw it on the stage beside the code. The engine runs that ordinary method; later steps follow its frames into the page, SVG and trace rather than interpreting a separate lesson document.',
    });
    await s.clear();
    const code = await s.code(DEMO, { at: 'main', fontSize: 0.26 });
    // The same program, running on a small stage beside it.
    await s.enter(
      new Rectangle({ width: 4.6, height: 2.5875, stroke: s.soft, strokeWidth: 0.02, cornerRadius: 0.06 }).moveTo([
        5.1, 1.55,
      ]),
      { describe: 'A small stage beside the code, running the same program' },
    );
    const stepLabel = new Text("step 'before'", { fontSize: 0.22, font: 'mono', color: ink }).moveTo(
      [3.0, 0.5],
      [-1, 0],
    );
    await code.focus(3);
    await s.enter(stepLabel);
    const dot = new Circle({ radius: 0.6, stroke: ink, strokeWidth: 0.03 }).moveTo([5.1, 1.7]);
    await code.focus(4);
    await s.enter(dot, {
      describe: 'On the small stage, the circle the program drew, turned into a square by its last play',
    });
    await code.focus(5);
    const after = new Text("step 'after'", { fontSize: 0.22, font: 'mono', color: ink }).moveTo([3.0, 0.5], [-1, 0]);
    await this.play(new FadeOut(stepLabel), new FadeIn(s.keep(after)));
    await code.focus(6);
    const square = new Square({ side: 1.1, stroke: ink, strokeWidth: 0.03 }).moveTo([5.1, 1.7]);
    await this.play(new Transform(dot, square));
    // Each call, counted at the end of its line, just outside the panel.
    const tally = { step: 0, play: 0 };
    const panelRight = code.panel.box()![2];
    for (const [i, l] of DEMO.entries()) {
      const kind = l.includes('this.step(') ? 'step' : l.includes('this.play(') ? 'play' : null;
      if (!kind) continue;
      const box = code.code.lines[i]!.box()!;
      await s.callout([panelRight - 0.1, box[1], panelRight - 0.1, box[3]], `${kind} ${++tally[kind]}`, {
        side: 'right',
        gap: 0.25,
        color: kind === 'step' ? accent : s.soft,
        size: 0.24,
      });
    }

    await this.step('objects', {
      detail: true,
      title: 'A Scene owns mobjects, plays animations and emits frames to a sink',
      line: 'Three sinks turn the same frames into a view, SVG or a trace.',
      caption:
        'Each walked edge is one relation: a Scene owns mobjects, plays animations between endpoints fixed when they begin, and emits frames to a sink. The three sinks drawn out of Sink turn the same frames into a browser view, an SVG string or an inspection trace.',
    });
    await s.clear();
    const classes = await s.show({ source: CLASSES }, { box: 'main' });
    await classes.walk([['Scene', 'Mobject']], { trail: true });
    await classes.walk([['Scene', 'Animation']], { trail: true });
    await classes.walk([['Scene', 'Sink']], { trail: true });
    await classes.note('Animation', 'endpoints fixed at begin()', { side: 'below' });
    // Sink fans out to its three kinds, drawn from its right edge, each named with what it makes.
    const sinkBox = classes.get('Sink').box()!,
      from: Vec = [sinkBox[2] + 0.05, (sinkBox[1] + sinkBox[3]) / 2];
    const kinds = [
      ['DomSink', 'browser view'],
      ['StringSink', 'SVG string'],
      ['TraceSink', 'inspection trace'],
    ] as const;
    const fan = new Group(),
      names = new Group();
    kinds.forEach(([kind, makes], i) => {
      const to: Vec = [from[0] + 0.9, from[1] + (1 - i) * 0.55];
      fan.add(new Line(from, to, { stroke: s.soft, strokeWidth: 0.02 }));
      names.add(
        new Text(`${kind}: ${makes}`, { fontSize: 0.24, color: ink, anchor: 'start' }).moveTo(
          [to[0] + 0.12, to[1]],
          [-1, 0],
        ),
      );
    });
    await s.draw(fan, { tool: 'pen', runTime: 0.8, describe: 'Three lines fanning out of Sink to its three kinds' });
    await s.enter(names);

    // A real circle's points, drawn and listed beside Mobject for the camera to frame.
    const R = 1,
      centre: Vec = [3.15, 0.45];
    const circle = new Circle({ radius: R, stroke: ink, strokeWidth: 0.03 });
    const raw = Array.from(circle.subpaths[0]!);
    const pts: Vec[] = [];
    for (let i = 0; i < raw.length; i += 2) pts.push([raw[i]!, raw[i + 1]!]);
    await this.step('points', {
      detail: true,
      title: `A circle is ${pts.length} points: ${(pts.length - 1) / 3} cubic Béziers`,
      line: 'Anchors and handles: every shape and glyph is stored this way.',
      caption:
        'Every shape, glyph and imported diagram is stored as cubic Bézier points, like the anchors and handles drawn on this circle. The zoom onto Mobject is the camera: it changes what the stage shows, and no point in the diagram moves.',
    });
    await s.clearOverlays();
    await classes.unmark();
    await classes.note('Mobject', 'points: Float32Array', { side: 'below' });
    circle.moveTo(centre);
    const at = (p: Vec): Vec => [p[0] + centre[0], p[1] + centre[1]];
    const handles = new Group(),
      anchors = new Group();
    pts.forEach((p, i) => {
      if (i % 3 === 0) anchors.add(new Dot({ radius: 0.075, color: accent }).moveTo(at(p)));
      else {
        const a = pts[i % 3 === 1 ? i - 1 : i + 1]!;
        handles.add(new Line(at(a), at(p), { stroke: s.soft, strokeWidth: 0.022 }));
        handles.add(new Dot({ radius: 0.055, color: s.soft }).moveTo(at(p)));
      }
    });
    const figure = new Group(circle, handles, anchors);
    await s.enter(figure, {
      describe: `A circle of radius ${R} as ${(pts.length - 1) / 3} cubic Béziers: anchors as large dots, handles as small dots joined to their anchors`,
    });
    const f = (n: number) => (n >= 0 ? ' ' : '') + n.toFixed(2);
    const first = pts
      .slice(0, 4)
      .map((p, i) => `[${f(p[0])}, ${f(p[1])}]  ${i === 0 || i === 3 ? 'anchor' : 'handle'}`);
    const listing = await s.code([`circle.subpaths[0]  // radius ${R}`, ...first, '…'], {
      at: [4.35, -2.3, 7.8, 2.0],
      fontSize: 0.19,
    });
    // The camera frames Mobject, its note, the circle and the listing; nothing is redrawn.
    await classes.focus(['Mobject'], { camera: true, also: [figure, listing], margin: 1 });

    await this.step('clock', {
      detail: true,
      title: `Every sink gets the same frames, 1/${this.fps} s apart`,
      line: 'The browser waits for display ticks; the trace takes all at once.',
      caption:
        'Scene time advances by a fixed dt per frame, whichever sink is attached. The browser sink waits for a display tick before each frame while the trace sink takes them all at once, so both see the same scene times on the ruler.',
    });
    await s.clear();
    const flow = await s.show({ source: FLOW }, { box: regionBox('top', { bottom: -0.55 }) });
    await flow.walk(
      [
        ['Clock', 'Browser'],
        ['Clock', 'Trace'],
      ],
      { parallel: true, trail: true },
    );
    // Frame times from the scene's own fps; two sinks pace the same frames differently.
    const dt = 1 / this.fps,
      frames = 9,
      x0 = -3.3,
      pitch = 1.3;
    const ruler = new Group();
    const lane = (label: string, y: number) =>
      new Text(label, { fontSize: 0.22, color: s.soft, anchor: 'start' }).moveTo([-7.3, y], [-1, 0]);
    ruler.add(
      lane('scene time (ms)', -1.75),
      lane('browser sink', -2.75),
      lane('trace sink', -3.6),
      new Line([x0 - 0.2, -1.5], [x0 + pitch * (frames - 1) + 0.2, -1.5], { stroke: ink, strokeWidth: 0.02 }),
    );
    for (let n = 0; n < frames; n++) {
      const x = x0 + n * pitch;
      ruler.add(
        new Line([x, -1.38], [x, -1.62], { stroke: ink, strokeWidth: 0.02 }),
        new Text((n * dt * 1000).toFixed(0), { fontSize: 0.2, font: 'mono', color: ink }).moveTo([x, -1.85]),
        new Dot({ radius: 0.09, color: accent }).moveTo([x, -2.75]),
        new Dot({ radius: 0.09, color: accent }).moveTo([x0 + n * 0.28, -3.6]),
      );
    }
    await s.enter(ruler);

    await this.step('seek', {
      detail: true,
      title: 'Seeking replays the same program',
      line: 'Played or seeked to the same moment, the SVG matches.',
      caption:
        'renderAt seeks by running the scene again and skipping every frame before the target. Because each animation fixes its endpoints when it begins, the frame seeked straight to t has the same SVG fingerprint as the frame played there.',
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.dim(['Author', 'Clock', 'SVG']);
    await flow.walk(
      [
        ['Author', 'Clock'],
        ['Clock', 'SVG'],
      ],
      { trail: true },
    );
    // Run a tiny scene twice, played from zero and seeked straight to t, and compare.
    const run = await playedAndSeeked(ink, accent);
    const same = run.played === run.seeked;
    const thumb = (frame: Mobject[], cx: number, label: string, svg: string) => {
      const w = 5,
        k = w / 16;
      const box = new Rectangle({ width: w, height: (w * 9) / 16, stroke: ink, strokeWidth: 0.02, cornerRadius: 0.04 });
      const art = new Group(...frame);
      art.scale(k, { aboutPoint: [0, 0] });
      for (const m of art.family()) m.style.strokeWidth *= k;
      const g = new Group(box, art).moveTo([cx, -2.35]);
      const title = new Text(label, { fontSize: 0.22, color: ink }).moveTo([cx, -0.75]);
      const print = new Text(`svg ${fingerprint(svg)} · ${svg.length} chars`, {
        fontSize: 0.2,
        font: 'mono',
        color: s.soft,
      }).moveTo([cx, -4.0]);
      return new Group(g, title, print);
    };
    const left = thumb(run.playedFrame, -3.4, `played from 0 to t = ${SEEK_T.toFixed(2)} s`, run.played);
    const right = thumb(run.seekedFrame, 3.4, `seeked straight to t = ${SEEK_T.toFixed(2)} s`, run.seeked);
    await s.enter(left, right);
    await s.enter(new Text(same ? '=' : '≠', { fontSize: 0.7, color: accent, weight: 'bold' }).moveTo([0, -2.35]));
    this.state.seekContract = 'played SVG equals seeked SVG';

    await this.step('publish', {
      detail: true,
      title: 'The build captures diagrams once and ships one HTML file',
      line: 'Readers change only the pace; the page never lays anything out.',
      caption:
        'rayner build captures each diagram once and writes lantern.html with the steps, cases, poster and transcript. Because the layouts are already captured, reader controls change only the pace and the page never calls a layout service.',
    });
    await s.clearOverlays();
    await flow.morph({ source: PUBLISH });
    await flow.walk(
      [
        ['Author', 'Build'],
        ['Build', 'Page'],
        ['Page', 'Reader'],
      ],
      { trail: true },
    );
    await s.code(
      [
        '$ rayner build scenes/explainers/lantern',
        '  lantern.html               steps, cases, poster, transcript',
        '  lantern.html.receipt.json  source, engine and snapshot hashes',
        '$ rayner describe scenes/explainers/lantern',
        '  every case and step as JSON',
      ],
      { at: regionBox('bottom', { top: -0.85 }), fontSize: 0.24 },
    );

    await this.step('inspect', {
      detail: true,
      title: 'The trace records every walk, and rayner check tests every case',
      line: 'Recorded walks, and four checks run on every case.',
      caption:
        'Each walk records the edges it travelled, and trace.json lists this scene’s own clock and seek walks. rayner check runs the card’s four tests on every case, so a frame that jumps or text under 14 px fails the check.',
    });
    await s.clearOverlays();
    await flow.note('Page', 'trace + checks ship with it', { side: 'above' });
    // The trace this very scene has recorded so far.
    const walks = (this.state.walks ?? []) as { step: string; from: string; to: string }[];
    const shown = walks.filter((w) => w.step === 'clock' || w.step === 'seek');
    await s.code(
      [
        `"seekContract": "${String(this.state.seekContract)}",`,
        `"walks": [  // ${walks.length} recorded`,
        ...shown.map((w) => `  { "step": "${w.step}", "from": "${w.from}", "to": "${w.to}" },`),
        '  …',
        ']',
      ],
      { at: regionBox('bottom', { right: 1.6, top: -0.85 }), fontSize: 0.21 },
    );
    await s.card(
      [
        ['seek', 'played = seeked'],
        ['motion', 'no jumps'],
        ['legibility', 'text ≥ 14 px'],
        ['bare runtime', 'no renderer'],
      ],
      { at: regionBox('bottom', { left: 1.9, top: -0.85 }) },
    );
  }
}
