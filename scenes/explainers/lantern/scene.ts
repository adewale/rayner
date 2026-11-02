import { Scene, Rectangle, Dot, Circle, Line, Text, Group, FadeIn, Transform, Animation, toSvgString, renderAt, StringSink } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, regionBox, settingsOf } from '../../../explain/index.ts';
const STYLE = 'hand-drawn';
const CLASSES =
  'classDiagram\n direction LR\n class Scene {\n construct()\n play()\n step()\n }\n class Mobject {\n points\n style\n }\n class Animation {\n interpolate()\n }\n class Sink {\n frame()\n }\n Scene --> Mobject : owns\n Scene --> Animation : plays\n Scene --> Sink : emits';
const FLOW =
  'graph LR\nAuthor[Native Scene] --> Clock[Fixed dt loop]\nClock --> Browser[Browser sink]\nClock --> SVG[SVG frames]\nClock --> Trace[State trace]\nSVG --> PNG[PNG stills]';

type Motion = 'blend' | 'nudge';
/** The still the story asks about: t = 1 s, halfway through the dot's one-second move. */
const SEEK_T = 1;
const START: Vec = [-6, -3],
  END: Vec = [6, -3],
  MOVE_TIME = 1,
  FPS = 30;

/**
 * The wrong way to move something, as a game loop would: shift the dot a fixed step on every
 * frame the scene computes, ignoring the animation's own time. Played, 30 frames make 30 steps;
 * seeked, the frames before t are only counted, so they make none.
 */
class Nudge extends Animation {
  private live = false;
  private readonly by: Vec;
  moves = 0;
  constructor(mobject: Mobject, by: Vec) {
    super(mobject, { runTime: MOVE_TIME });
    this.by = by;
  }
  override begin(): void {
    super.begin(); // begin() calls interpolate(0) once; that call is not a frame
    this.live = true;
  }
  override interpolate(_alpha: number): void {
    if (!this.live) return;
    this.mobject.shift(this.by);
    this.moves++;
  }
  // No last step at the end: the frames already made every move there is.
  override finish(): void {}
}

/** A tiny native scene, run inside this one: a box grows, and a dot crosses a track. */
function demoScene(ink: string, accent: string, soft: string, motion: Motion, nudges: Nudge[]) {
  return class SeekDemo extends Scene {
    override async construct() {
      const look = { stroke: ink, strokeWidth: 0.14, fill: accent, fillOpacity: 0.35 };
      const track = new Line(START, END, { stroke: soft, strokeWidth: 0.08 });
      const ticks = [START, [0, -3] as Vec, END].map(
        (p) => new Line([p[0], p[1] - 0.45], [p[0], p[1] + 0.45], { stroke: soft, strokeWidth: 0.08 }),
      );
      const box = new Rectangle({ width: 3, height: 2.4, ...look }).moveTo([-4.5, 1.6]);
      const dot = new Dot({ radius: 0.55, color: ink }).moveTo(START);
      await this.play(new FadeIn(new Group(track, ...ticks)), new FadeIn(box), new FadeIn(dot), { runTime: 0.5 });
      const move =
        motion === 'blend'
          ? dot.animate.moveTo(END)
          : new Nudge(dot, [(END[0] - START[0]) / (MOVE_TIME * FPS), 0]);
      if (move instanceof Nudge) nudges.push(move);
      await this.play(new Transform(box, new Rectangle({ width: 9, height: 3.6, ...look }).moveTo([1.5, 1.4])), move, {
        runTime: MOVE_TIME,
      });
    }
  };
}
/** FNV-1a, so the reader can compare two frames by a short fingerprint. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
/**
 * Run the tiny scene with one kind of motion: played from zero, frame by frame; seeked straight to
 * SEEK_T, as renderAt makes a still; and seeked to every other frame, as rayner check seeks, to
 * compare each with the played frame.
 */
async function runDemo(ink: string, accent: string, soft: string, motion: Motion) {
  const nudges: Nudge[] = [];
  const Demo = demoScene(ink, accent, soft, motion, nudges);
  const frames: string[] = [];
  let playedFrame: Mobject[] = [],
    playedMoves = 0;
  await new Demo({
    async frame(s: Scene) {
      frames[s.frameCount] = toSvgString(s);
      if (s.frameCount === Math.round(SEEK_T * FPS)) {
        playedFrame = s.mobjects.map((m) => m.copy());
        playedMoves = nudges[0]?.moves ?? 0;
      }
    },
  }).run();
  const seekAt = Math.round(SEEK_T * FPS);
  // Which frames a seeking run computes: every frame it hands its sink, and the frame number of the first.
  const computed: number[] = [];
  nudges.length = 0;
  // Frame 0, the empty stage before construct() runs, is handed to every sink and computes nothing.
  await new Demo({ async frame(s: Scene) { if (s.frameCount > 0) computed.push(s.frameCount); } }, { skipUntil: SEEK_T }).run();
  nudges.length = 0;
  const seekSink = new StringSink();
  const seeked = await renderAt(Demo, SEEK_T, seekSink);
  const seekedMoves = nudges[0]?.moves ?? 0;
  const matches: boolean[] = [];
  for (let f = 1; f < frames.length; f++) {
    const sink = new StringSink();
    await renderAt(Demo, f / FPS, sink);
    matches.push(sink.last() === frames[f]);
  }
  return {
    played: frames[seekAt]!,
    seeked: seekSink.last() ?? '',
    playedFrame,
    seekedFrame: seeked.mobjects.map((m) => m.copy()),
    seekAt,
    seekedAt: seeked.frameCount,
    /** Frames before the still that the seeking run computed (none), and the first it did compute. */
    computedBefore: computed.filter((f) => f < seekAt).length,
    firstComputed: computed[0]!,
    playedMoves,
    seekedMoves,
    matches,
  };
}
/** The script's one-sentence answer, stated in the seek step. */
const ANSWER =
  'A still re-runs the scene on the same fixed clock and skips computing the frames before t, so it matches playback only if each frame depends on the time alone';

export default class LanternExplainer extends Scene {
  static meta = {
    id: 'lantern',
    title: 'How can a still skip the frames before it?',
    sources: [
      'https://github.com/ivarvong/lantern',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/src/scene.ts',
      'https://github.com/adewale/rayner/blob/main/src/scene.ts',
      'https://github.com/adewale/rayner/blob/main/src/animation.ts',
    ],
    // The script's answer and check questions (script.md); the seek step states the answer.
    answer: ANSWER,
    checks: [
      {
        question:
          'A third version moves the dot with dot.animate.shift([12, 0]) instead of animate.moveTo. Does its still at t = 1 s match playback?',
        answer:
          'Yes. animate.shift builds a Transform to a shifted copy of the dot, so its start and end are fixed when the move begins and each frame blends them by the time alone. Only a shift applied on every computed frame, like the nudge, depends on how many frames ran.',
      },
      {
        question:
          'Another version moves the dot by the change in time since the last frame it computed: x += distance × (α − α at the last frame). Does its still at t = 1 s match playback?',
        answer:
          'Yes. begin() computes α = 0, the skipped frames are never computed, and the frame at t = 1 s adds the whole change from 0 to 0.5 in one go, so the dot is halfway, as in playback. Keeping state is allowed, as long as the frame comes out the same however many frames ran before it.',
      },
    ],
  };
  static settings = [
    {
      id: 'motion',
      label: 'The dot moves by',
      default: 'nudge',
      options: [
        { value: 'blend', label: 'Blending fixed endpoints' },
        { value: 'nudge', label: 'A nudge each frame' },
      ],
    },
  ];
  override async construct() {
    const motion = settingsOf(this).motion as Motion;
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.palette.ink,
      accent = s.emphasis,
      soft = s.soft;

    // The tiny scene with both kinds of motion: this case's, and the other one the last step compares.
    const runs = {
      blend: await runDemo(ink, accent, soft, 'blend'),
      nudge: await runDemo(ink, accent, soft, 'nudge'),
    };
    const run = runs[motion];
    const match = run.played === run.seeked;
    // The captions below say which way each case comes out; refuse to say it if the engine disagrees.
    if (runs.blend.played !== runs.blend.seeked || runs.nudge.played === runs.nudge.seeked)
      throw new Error('Blending must match playback and the nudge must not; the seek step would be false');
    if (runs.blend.played !== runs.nudge.played)
      throw new Error('Played, both scenes must give the same frame at t; the first step says so');
    if (run.seekAt !== run.seekedAt || run.firstComputed !== run.seekAt || run.computedBefore !== 0)
      throw new Error('A seek must compute no frame before t and land on the played frame number'); 
    const print = fingerprint(run.played),
      seekPrint = fingerprint(run.seeked);
    const thumb = (frame: Mobject[] | null, cx: number, label: string, svg: string | null, ghost?: Vec) => {
      const w = 6,
        k = w / 16;
      const box = new Rectangle({ width: w, height: (w * 9) / 16, stroke: ink, strokeWidth: 0.02, cornerRadius: 0.04 });
      const parts: Mobject[] = [box];
      if (frame) {
        // Copies, so the same frame can be drawn again at the same size.
        const art = new Group(...frame.map((m) => m.copy()));
        art.scale(k, { aboutPoint: [0, 0] });
        for (const m of art.family()) m.style.strokeWidth *= k;
        parts.push(art);
        // Where playback has the dot, drawn as an outline over a still that has it elsewhere.
        if (ghost)
          parts.push(
            new Circle({ radius: 0.55 * k + 0.04, stroke: accent, strokeWidth: 0.04, fill: 'none' }).moveTo([ghost[0] * k, ghost[1] * k]),
          );
      } else parts.push(new Text('?', { fontSize: 0.9, color: soft, weight: 'bold' }));
      const g = new Group(...parts).moveTo([cx, -0.75]);
      const title = new Text(label, { fontSize: 0.26, color: ink }).moveTo([cx, 1.25]);
      const out: Mobject[] = [g, title];
      if (svg)
        out.push(new Text(`svg ${fingerprint(svg)} · ${svg.length} chars`, { fontSize: 0.24, font: 'mono', color: soft }).moveTo([cx, -2.8]));
      return new Group(...out);
    };
    const t = SEEK_T.toFixed(2);
    const playedLabel = `played: frame ${run.seekAt}, t = ${t} s`,
      seekedLabel = `seeked: frames 1–${run.seekAt - 1} only counted`;
    const how =
      motion === 'blend'
        ? 'animate.moveTo moves the dot by blending its start and end.'
        : `A nudge moves the dot 1/${FPS} of the track on every frame the scene computes, as a game loop would.`;

    await this.step('played', {
      title: `Played, the dot is halfway at t = ${t} s`,
      line: `Predict: a still at t = ${SEEK_T} s never computes frames 1–${run.seekAt - 1}. Where is its dot?`,
      caption: `Open a Rayner page from a link to its fifth step and the player draws that step without playing the four before it, and renderAt, the function that saves one moment of a scene as an image, makes its still the same way. Here a tiny scene grows a box and moves a dot along a track. ${how} On the left is frame ${run.seekAt} as played: t = ${t} s, the dot halfway, and SVG with the fingerprint ${print}, whichever motion moves the dot. On the right is the still at t = ${SEEK_T} s. It runs the scene again from the start but only counts frames 1 to ${run.seekAt - 1}, so it never works out where anything was during them.`,
    });
    const left = thumb(run.playedFrame, -3.6, playedLabel, run.played);
    const pending = thumb(null, 3.6, seekedLabel, null);
    await s.enter(left, pending, {
      describe: `Left: the tiny scene ${playedLabel}, the dot halfway along its track, fingerprint ${print}. Right: an empty frame marked with a question mark, ${seekedLabel}.`,
    });

    const playedX = (START[0] + END[0]) / 2;
    await this.step('seek', {
      title: match
        ? `The still matches: the same SVG, fingerprint ${print}`
        : `The still differs: SVG ${seekPrint}, the dot ${run.seekedMoves} nudge along`,
      line: match
        ? 'Blending works the dot out from the time alone.'
        : `Played, the dot made ${run.playedMoves} nudges by t = ${SEEK_T} s; seeked, it made ${run.seekedMoves}.`,
      caption: match
        ? `Both frames are ${run.played.length} characters of SVG with the fingerprint ${print}, and the dot is halfway in each. animate.moveTo puts the dot where the time says, so frame ${run.seekAt} needs nothing from frames 1 to ${run.seekAt - 1}. ${ANSWER}. The other case, ‘A nudge each frame’, has a still that is wrong.`
        : `${ANSWER}. Here the still has the dot ${run.seekedMoves}/${FPS} of the way along, and the outline marks where playback has it, halfway. A nudge adds to wherever the last frame left the dot, so a still that skips ${run.seekAt - 1} frames skips ${run.playedMoves - run.seekedMoves} nudges. The box grows by blending its start and end sizes, so it matches.`,
    });
    await s.clear();
    const right = thumb(run.seekedFrame, 3.6, seekedLabel, run.seeked, match ? undefined : [playedX, START[1]]);
    await s.enter(thumb(run.playedFrame, -3.6, playedLabel, run.played), right, {
      describe: match
        ? `Two frames of the tiny scene at t = ${t} s, played and seeked, both with the dot halfway and the fingerprint ${print}.`
        : `Two frames of the tiny scene at t = ${t} s: played, with the dot halfway (${print}); seeked, with the dot near the start of its track and an outline where playback has it (${seekPrint}).`,
    });
    await s.enter(new Text(match ? '=' : '≠', { fontSize: 0.7, color: accent, weight: 'bold' }).moveTo([0, -0.75]));
    this.state.seek = { motion, match, played: print, seeked: seekPrint, playedMoves: run.playedMoves, seekedMoves: run.seekedMoves };

    await this.step('clock', {
      title: `Frame ${run.seekAt} is t = ${t} s in every run`,
      line: `Scene time is the frame number × 1/${this.fps} s, however fast the frames are taken.`,
      caption: `Half of the answer is the clock. Scene time advances a fixed 1/${this.fps} s per frame, whatever receives the frames; the receiver is called a sink. The browser sink waits for a display tick before each frame, and the trace sink takes them all at once. On a wall clock the browser’s dots spread out and the trace’s bunch together, but each frame carries the scene time above it, so a still for t = ${SEEK_T} s and playback both stop on frame ${run.seekAt}.`,
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
    this.state.frameAtSeek = run.seekAt;

    await this.step('objects', {
      title: 'A frame is the shapes on stage, as the playing animations left them',
      line: 'The other half: what a frame is worked out from.',
      caption: `In the diagram, a Scene owns mobjects, Rayner’s name for the shapes and text on stage; it plays animations, which change them; and it emits each frame to a sink, which only reads them. So the dot in frame ${run.seekAt} is wherever the playing animation put it. If an animation works that out from what the frame before left behind, as the nudge does, a still that skips those frames gets it wrong.`,
    });
    await s.clear();
    const classes = await s.show({ source: CLASSES }, { box: 'main' });
    await classes.walk([['Scene', 'Mobject']], { trail: true });
    await classes.walk([['Scene', 'Animation']], { trail: true });
    await classes.walk([['Scene', 'Sink']], { trail: true });
    // What the sink does with a frame, beside it: it reads; it never changes a mobject.
    const sinkBox = classes.get('Sink').box()!;
    const reads = new Text('reads each frame; changes nothing', { fontSize: 0.24, color: soft, anchor: 'start' }).moveTo(
      [sinkBox[2] + 0.3, (sinkBox[1] + sinkBox[3]) / 2],
      [-1, 0],
    );
    await s.enter(reads, { describe: 'Beside Sink: it reads each frame and changes nothing.' });

    // src/animation.ts:1-3 and 79-83: begin() copies the starting mobject; every frame blends two fixed endpoints.
    await this.step('begin', {
      title: 'An animation fixes its endpoints when it begins',
      line: `At t = ${SEEK_T} s the blend is halfway, however many frames ran before.`,
      caption: `In the listing, begin() copies the starting mobject, and each frame blends that copy with a fixed end by an amount set only by how far through its run time the animation is. At t = ${SEEK_T} s the move is half done whether ${run.seekAt - 1} frames were computed before it or none, so the frame comes out the same. The nudge’s one line, dot.shift(step), has no endpoints: its dot is wherever the frames so far have pushed it. The camera has moved in on Mobject and Animation.`,
    });
    await s.clearOverlays();
    await classes.unmark();
    const fixed = await classes.note('Animation', 'endpoints fixed at begin()', { side: 'below' });
    const anim = classes.get('Animation').box()!,
      mob = classes.get('Mobject').box()!;
    // Beside the two boxes it is about: begin() copies a mobject, and the frames blend from that copy.
    const listing = await s.code(
      [
        '// src/animation.ts',
        'begin():',
        '  start = mobject.copy()',
        'each frame:',
        '  blend(start, end,',
        '    rateFunc(t / runTime))',
        '',
        '// the nudge, each frame:',
        '  dot.shift(step)',
      ],
      { at: [anim[2] + 0.35, anim[1] - 0.9, Math.min(anim[2] + 4.2, 7.8), mob[3]], fontSize: 0.19 },
    );
    // Scene and Sink fade, so nothing behind the heading competes with it once the camera moves in.
    await classes.dim(['Mobject', 'Animation']);
    // The camera frames Mobject, Animation, its note and the listing below the heading, which stays on screen.
    await s.focus([classes.get('Mobject'), classes.get('Animation'), fixed, listing], { margin: 0.5 });

    // Every frame of the tiny scene, seeked and compared with playback, for both kinds of motion.
    const total = run.matches.length;
    const count = (m: Motion) => runs[m].matches.filter(Boolean).length;
    const firstMiss = runs.nudge.matches.indexOf(false) + 1;
    await this.step('check', {
      title: `Seeked frame by frame: ${count('blend')} of ${total} match with blending, ${count('nudge')} with the nudge`,
      line: 'rayner check fails a page on the first seeked frame that differs from playback.',
      caption: `Each of the tiny scene’s ${total} frames is made as a still and compared with the played frame. With blending, all ${total} match. With the nudge, the frames before the dot moves match, and so does the first frame of the move, where both runs have made one nudge; from frame ${firstMiss} on, none does. rayner check makes this comparison for every page: it seeks two frames in every step of every case, the middle and the last, and fails on any difference, so a scene that nudges fails rayner check with a seek mismatch.`,
    });
    await s.clear();
    const cell = 0.27,
      x1 = -6.1;
    const strip = (m: Motion, y: number, label: string) => {
      const g = new Group();
      g.add(
        new Text(`${label}: ${count(m)} of ${total} match`, { fontSize: 0.28, color: ink, anchor: 'start' }).moveTo([x1, y + 0.55], [-1, 0]),
      );
      runs[m].matches.forEach((ok, i) => {
        g.add(
          new Rectangle({
            width: cell * 0.8,
            height: 0.5,
            stroke: ok ? s.good : s.bad,
            strokeWidth: 0.02,
            fill: ok ? s.good : s.bad,
            fillOpacity: ok ? 0.85 : 0.2,
          }).moveTo([x1 + cell * (i + 0.5), y]),
        );
      });
      return g;
    };
    const axis = new Group();
    for (const f of [1, 15, run.seekAt, total]) {
      const x = x1 + cell * (f - 0.5);
      axis.add(new Text(String(f), { fontSize: 0.22, font: 'mono', color: soft }).moveTo([x, -2.15]));
    }
    axis.add(new Text('frame', { fontSize: 0.22, color: soft, anchor: 'end' }).moveTo([x1 - 0.2, -2.15], [1, 0]));
    // The still the story followed, marked across both rows.
    const at = x1 + cell * (run.seekAt - 0.5);
    const marker = new Line([at, 1.45], [at, -1.85], { stroke: accent, strokeWidth: 0.03 });
    const markerLabel = new Text(`the still at t = ${t} s`, { fontSize: 0.22, color: accent }).moveTo([at, 1.7]);
    const key = new Text('filled: seeked frame = played frame · hollow: different', { fontSize: 0.22, color: soft }).moveTo([0, -2.9]);
    await s.enter(strip('blend', 0.4, 'Blending fixed endpoints'), strip('nudge', -1.25, 'A nudge each frame'), axis, marker, markerLabel, key, {
      describe: `Two rows of ${total} cells, one per frame of the tiny scene, each comparing the seeked frame with the played one. Blending: all ${total} match. A nudge each frame: frames 1 to ${firstMiss - 1} match, frames ${firstMiss} to ${total} differ. A line marks frame ${run.seekAt}, the still at t = ${t} s.`,
    });
    this.state.check = { frames: total, matched: { blend: count('blend'), nudge: count('nudge') } };
  }
}
