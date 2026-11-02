import { Scene, Rectangle, Dot, Line, Text, Group, FadeIn, Transform, toSvgString, renderAt, StringSink } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, regionBox } from '../../../explain/index.ts';
const STYLE = 'hand-drawn';
const CLASSES =
  'classDiagram\n direction LR\n class Scene {\n construct()\n play()\n step()\n }\n class Mobject {\n points\n style\n }\n class Animation {\n interpolate()\n }\n class Sink {\n frame()\n }\n Scene --> Mobject : owns\n Scene --> Animation : plays\n Scene --> Sink : emits';
const FLOW =
  'graph LR\nAuthor[Native Scene] --> Clock[Fixed dt loop]\nClock --> Browser[Browser sink]\nClock --> SVG[SVG frames]\nClock --> Trace[State trace]\nSVG --> PNG[PNG stills]';
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
    playedFrame: Mobject[] = [],
    playedAt = -1;
  const sink = {
    async frame(s: Scene) {
      if (played || s.time + 1e-9 < SEEK_T) return;
      played = toSvgString(s);
      playedFrame = s.mobjects.map((m) => m.copy());
      playedAt = s.frameCount;
    },
  };
  await new Demo(sink).run();
  const seekSink = new StringSink();
  const seeked = await renderAt(Demo, SEEK_T, seekSink);
  return {
    played,
    seeked: seekSink.last() ?? '',
    playedFrame,
    playedAt,
    seekedFrame: seeked.mobjects.map((m) => m.copy()),
    seekedAt: seeked.frameCount,
  };
}
/** The script's one-sentence answer, stated in the seek step. */
const ANSWER =
  'Seeking re-runs the scene’s program on the same fixed clock and skips only the drawing, so the still at t is the frame played at t';

export default class LanternExplainer extends Scene {
  static meta = {
    id: 'lantern',
    title: 'How does one scene produce several outputs?',
    sources: ['https://github.com/ivarvong/lantern', 'https://github.com/ivarvong/lantern/blob/2c7bad5/src/scene.ts'],
    // The script's answer and check questions (script.md); the seek step states the answer.
    answer: ANSWER,
    checks: [
      {
        question: 'How does renderAt make the still at t = 1 s?',
        answer:
          'It runs the scene’s program again from the start on the same clock and skips drawing every frame before t; the first frame it does draw is the still.',
      },
      {
        question: 'Why is the frame a replay reaches at t = 1 s the same one playback reached?',
        answer:
          'Scene time advances by a fixed 1/30 s per frame whatever the sink, so both runs reach t = 1 s on the same frame of the same program.',
      },
      {
        question: 'Why can the frames before t be skipped without changing the frame at t?',
        answer:
          'Each animation copies its endpoints when it begins and computes every frame as a blend of those two at its own time, so a frame depends on the program and the clock, not on which frames were drawn.',
      },
    ],
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.palette.ink,
      accent = s.emphasis;

    // A tiny scene, run twice: played from zero, and seeked straight to t.
    const run = await playedAndSeeked(ink, accent);
    if (run.played !== run.seeked || run.playedAt !== run.seekedAt)
      throw new Error('The played and seeked frames differ; the seek and clock steps would be false');
    const print = fingerprint(run.played);
    const thumb = (frame: Mobject[] | null, cx: number, label: string, svg: string | null) => {
      const w = 5,
        k = w / 16;
      const box = new Rectangle({ width: w, height: (w * 9) / 16, stroke: ink, strokeWidth: 0.02, cornerRadius: 0.04 });
      const parts: Mobject[] = [box];
      if (frame) {
        // Copies, so the same frame can be drawn again at the same size.
        const art = new Group(...frame.map((m) => m.copy()));
        art.scale(k, { aboutPoint: [0, 0] });
        for (const m of art.family()) m.style.strokeWidth *= k;
        parts.push(art);
      } else parts.push(new Text('?', { fontSize: 0.9, color: s.soft, weight: 'bold' }));
      const g = new Group(...parts).moveTo([cx, -0.9]);
      const title = new Text(label, { fontSize: 0.26, color: ink }).moveTo([cx, 0.85]);
      const out: Mobject[] = [g, title];
      if (svg)
        out.push(
          new Text(`svg ${fingerprint(svg)} · ${svg.length} chars`, { fontSize: 0.24, font: 'mono', color: s.soft }).moveTo([cx, -2.75]),
        );
      return new Group(...out);
    };
    const playedLabel = `played from 0 to t = ${SEEK_T.toFixed(2)} s`,
      seekedLabel = `seeked straight to t = ${SEEK_T.toFixed(2)} s`;

    await this.step('played', {
      title: `A tiny scene, played from 0 to t = ${SEEK_T.toFixed(2)} s`,
      line: `Predict: render t = ${SEEK_T} s straight away, without playing. Same SVG, or different?`,
      caption: `This page is drawn by a program, a scene, that the engine plays frame by frame. The same scene file also gives still images and a trace, without a browser playing it. Here a tiny scene grows a box and moves a dot; the left frame is what playback shows at t = ${SEEK_T.toFixed(2)} s, and its SVG has the fingerprint ${print}. A still made straight at t = ${SEEK_T} s, without playing the first second: is it the same frame?`,
    });
    const left = thumb(run.playedFrame, -3.4, playedLabel, run.played);
    const pending = thumb(null, 3.4, seekedLabel, null);
    await s.enter(left, pending, { describe: `Left: the tiny scene ${playedLabel}, fingerprint ${print}. Right: an empty frame marked with a question mark, ${seekedLabel}.` });

    await this.step('seek', {
      title: `Answer: the same SVG, fingerprint ${print}`,
      line: 'renderAt runs the scene again and skips drawing every frame before t.',
      caption: `renderAt does not jump to t: it runs the scene’s program again from the start and skips drawing every frame before t = ${SEEK_T} s. ${ANSWER}. Both frames have the fingerprint ${print}, ${run.played.length} characters of SVG each. Why can the skipped frames be skipped?`,
    });
    await s.clear();
    const right = thumb(run.seekedFrame, 3.4, seekedLabel, run.seeked);
    await s.enter(thumb(run.playedFrame, -3.4, playedLabel, run.played), right);
    await s.enter(new Text('=', { fontSize: 0.7, color: accent, weight: 'bold' }).moveTo([0, -0.9]));
    this.state.seekContract = 'played SVG equals seeked SVG';

    await this.step('clock', {
      title: `Every sink gets the same frames, 1/${this.fps} s apart`,
      line: 'The browser waits for display ticks; the trace takes all at once.',
      caption: `Scene time advances by a fixed step, 1/${this.fps} s, per frame, whatever receives the frames. Whatever receives them is a sink. The browser sink waits for a display tick before each frame, and the trace sink takes them all at once, so on a wall clock the browser’s frames spread out and the trace’s bunch together; each frame still carries the scene time above it. A replay reaches t = ${SEEK_T} s on frame ${run.playedAt}, as playback did.`,
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
      lane('browser sink, wall clock', -2.75),
      lane('trace sink, wall clock', -3.6),
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
    this.state.frameAtSeek = run.playedAt;

    await this.step('objects', {
      title: 'A Scene owns mobjects, plays animations and emits frames to a sink',
      line: 'Three sinks turn the same frames into a view, SVG or a trace.',
      caption:
        'The program never draws. Each walked edge is one relation: a Scene owns mobjects, the shapes and text on stage; it plays animations on them; and it emits each frame to a sink. The three sinks drawn out of Sink turn the same frames into a browser view, an SVG string or an inspection trace, which is how one scene makes the page, the stills and the trace.',
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
        new Text(`${kind}: ${makes}`, { fontSize: 0.24, color: ink, anchor: 'start' }).moveTo([to[0] + 0.12, to[1]], [-1, 0]),
      );
    });
    await s.draw(fan, { tool: 'pen', runTime: 0.8, describe: 'Three lines fanning out of Sink to its three kinds' });
    await s.enter(names);

    // src/animation.ts:1-3 and 78-83: begin() copies the starting mobject; every frame blends two fixed endpoints.
    await this.step('begin', {
      title: 'An animation fixes its endpoints when it begins',
      line: 'Each frame blends a copied start and a fixed end at its own time.',
      caption:
        'An animation copies its starting mobject when it begins, and from then on each frame is a blend of that start and a fixed end at the animation’s own time. A frame depends only on the program and the clock, never on which frames were drawn before it, so skipping the drawing changes nothing. The camera has moved in on Animation; no point in the diagram moved.',
    });
    await s.clearOverlays();
    await classes.unmark();
    await classes.note('Animation', 'endpoints fixed at begin()', { side: 'below' });
    const anim = classes.get('Animation').box()!,
      mob = classes.get('Mobject').box()!;
    // Beside the two boxes it is about: begin() copies a mobject, and the frames blend from that copy.
    const listing = await s.code(
      ['// src/animation.ts', 'begin():', '  starting = mobject.copy()', 'each frame:', '  blend(start, end,', '    rateFunc(t / runTime))'],
      { at: [anim[2] + 0.35, anim[1] - 0.5, Math.min(anim[2] + 4.2, 7.8), mob[3]], fontSize: 0.19 },
    );
    // The camera frames Mobject, Animation, its note and the listing; nothing is redrawn.
    await classes.focus(['Mobject', 'Animation'], { camera: true, also: [listing], margin: 0.6 });

    await this.step('inspect', {
      title: 'The trace records each walk; rayner check compares played and seeked',
      line: 'Recorded walks, and four of the checks run on every case.',
      caption:
        'The third output, the trace, records what each step did: each walk lists the edges it travelled, and trace.json holds this scene’s own clock walks. rayner check runs every case through all its checks; four of them are on the card. Its seek test compares played and seeked frames, as this page did with its tiny scene, and a frame that jumps or text under 14 px fails the check.',
    });
    await s.clear();
    const walks = (this.state.walks ?? []) as { step: string; from: string; to: string }[];
    const shown = walks.filter((w) => w.step === 'clock');
    await s.code(
      [
        `"seekContract": "${String(this.state.seekContract)}",`,
        `"walks": [  // ${walks.length} recorded`,
        ...shown.map((w) => `  { "step": "${w.step}", "from": "${w.from}", "to": "${w.to}" },`),
        '  …',
        ']',
      ],
      { at: regionBox('full', { right: 1.6 }), fontSize: 0.24 },
    );
    await s.card(
      [
        ['seek', 'played = seeked'],
        ['motion', 'no jumps'],
        ['legibility', 'text ≥ 14 px'],
        ['bare runtime', 'no renderer'],
      ],
      { at: regionBox('full', { left: 1.9 }) },
    );
  }
}
