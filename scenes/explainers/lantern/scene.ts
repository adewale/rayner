import { Scene, Rectangle, Dot, Circle, Line, Text, Group, VMobject, FadeIn, Transform, Animation, view } from '../../../src/index.ts';
import { toSvgString, renderAt, StringSink } from '../../../src/output.ts';
import type { Box, Mobject, Vec } from '../../../src/index.ts';
import { stage, regionBox, settingsOf } from '../../../explain/index.ts';
import { keyed } from '../../../explain/drawing.ts';
import { stagedStep } from '../../../explain/index.ts';
import type { Diagram } from '../../../explain/index.ts';
const STYLE = 'hand-drawn';

/**
 * The box to fit a Mermaid canvas into so that its boxes, not the blank margin Mermaid leaves around
 * them, fill `region`. `canvas` is the captured canvas size and `content` the boxes' extent, both in
 * the snapshot's pixels; `inside` clips the margin back to the region and checks the fit held.
 */
function bleed(region: Box, canvas: [number, number], content: Box): Box {
  const k = Math.min((region[2] - region[0]) / (content[2] - content[0]), (region[3] - region[1]) / (content[3] - content[1]));
  const left = (region[0] + region[2]) / 2 - ((content[0] + content[2]) / 2) * k,
    top = (region[1] + region[3]) / 2 + ((content[1] + content[3]) / 2) * k;
  // The diagram insets its artwork 0.12 from the box it is given.
  return [left - 0.12, top - canvas[1] * k - 0.12, left + canvas[0] * k + 0.12, top + 0.12];
}
function inside(d: Diagram, ids: string[], region: Box, clip: Box) {
  d.root.clipBox = clip;
  for (const id of ids) {
    const b = d.get(id).box()!;
    if (b[0] < region[0] - 0.1 || b[1] < region[1] - 0.1 || b[2] > region[2] + 0.1 || b[3] > region[3] + 0.1)
      throw new Error(`${id} at ${b.map((v) => v.toFixed(2))} is outside ${region}: recapture the canvas and content sizes`);
  }
}
/**
 * A camera view in which the stage's content area, below the heading, starts at `top` and holds `t`,
 * so that whatever lies above `top` passes under the heading's band.
 */
function viewUnder(top: number, t: Box): Box {
  // The content area below the heading, and the stage, in home units (explain/stage.ts).
  const [l, b, r, u] = [-7.55, -4.25, 7.55, 3.25];
  const z = Math.min((r - l) / (t[2] - t[0]), (u - b) / (top - t[1]));
  const hw = 8 / z,
    hh = 4.5 / z,
    cx = (t[0] + t[2]) / 2 - (l + r) / 2 / z,
    cy = top - u / z;
  if (z <= 1 || cy - hh < -4.5 - 1e-6 || Math.abs(cx) + hw > 8 + 1e-6)
    throw new Error(`No view below the heading from y = ${top.toFixed(2)} holds ${t.map((v) => v.toFixed(2))} on the stage`);
  return [cx - hw, cy - hh, cx + hw, cy + hh];
}
// Tighter spacing than Mermaid's default, so the boxes and their labels fill more of the stage.
const CLASSES =
  '---\nconfig:\n  class:\n    nodeSpacing: 32\n    rankSpacing: 12\n---\nclassDiagram\n direction LR\n class Scene {\n construct()\n play()\n step()\n }\n class Mobject {\n points\n style\n }\n class Animation {\n interpolate()\n }\n class Sink {\n frame()\n }\n Scene --> Mobject : owns\n Scene --> Animation : plays\n Scene --> Sink : emits';
const FLOW =
  '---\nconfig:\n  flowchart:\n    rankSpacing: 24\n    nodeSpacing: 16\n---\ngraph LR\nAuthor[Native Scene] --> Clock[Fixed dt loop]\nClock --> Browser[Browser sink]\nClock --> SVG[SVG frames]\nClock --> Trace[State trace]\nSVG --> PNG[PNG stills]';

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

/** The tiny scene's frame as a step records it: the box's centre and size, and the dot's place on the track. */
interface TinyFrame { box: { center: Vec; width: number; height: number }; dot: number }
/** The tiny scene's look, shared by its own run and by the thumbnails drawn from a recorded frame. */
const tiny = (ink: string, accent: string, soft: string) => {
  const look = { stroke: ink, strokeWidth: 0.14, fill: accent, fillOpacity: 0.35 };
  return {
    track: () =>
      new Group(
        new Line(START, END, { stroke: soft, strokeWidth: 0.08 }),
        ...[START, [0, -3] as Vec, END].map((p) => new Line([p[0], p[1] - 0.45], [p[0], p[1] + 0.45], { stroke: soft, strokeWidth: 0.08 })),
      ),
    box: (width: number, height: number, center: Vec) => new Rectangle({ width, height, ...look }).moveTo(center),
    dot: (x: number) => new Dot({ radius: 0.55, color: ink }).moveTo([x, START[1]]),
  };
};
/** A tiny native scene, run inside this one: a box grows, and a dot crosses a track. */
function demoScene(ink: string, accent: string, soft: string, motion: Motion, nudges: Nudge[]) {
  const parts = tiny(ink, accent, soft);
  return class SeekDemo extends Scene {
    override async construct() {
      const box = parts.box(3, 2.4, [-4.5, 1.6]);
      const dot = parts.dot(START[0]);
      await this.play(new FadeIn(parts.track()), new FadeIn(box), new FadeIn(dot), { runTime: 0.5 });
      const move =
        motion === 'blend'
          ? dot.animate.moveTo(END)
          : new Nudge(dot, [(END[0] - START[0]) / (MOVE_TIME * FPS), 0]);
      if (move instanceof Nudge) nudges.push(move);
      await this.play(new Transform(box, parts.box(9, 3.6, [1.5, 1.4])), move, {
        runTime: MOVE_TIME,
      });
    }
  };
}
/** What a frame of the tiny scene shows, read from its mobjects: the box's centre and size, and the dot's x. */
function frameOf(mobs: readonly Mobject[]): TinyFrame {
  const box = mobs.find((m) => m instanceof Rectangle),
    dot = mobs.find((m) => m instanceof Dot);
  if (mobs.length !== 3 || !box || !dot) throw new Error('The tiny scene shows a track, a box and a dot');
  const [x0, y0, x1, y1] = box.box()!;
  return { box: { center: [(x0 + x1) / 2, (y0 + y1) / 2], width: x1 - x0, height: y1 - y0 }, dot: dot.center()[0] };
}
/** A recorded frame of the tiny scene, with its SVG's fingerprint and length. */
interface Still { frame: TinyFrame; svg: string; chars: number }
/** Where the story takes its still: the frame number and its time in seconds. */
interface Seek { frame: number; t: number }
/** The timeline step's state: the dot's x at every frame, played and seeked, for both motions. */
interface TimelineState {
  timeline: { frames: number; moveStarts: number; played: Record<Motion, number[]>; seeked: Record<Motion, number[]> };
  motion: Motion;
  seek: Seek;
  nudges: { played: number; seeked: number };
}
/** The check step's state: how many seeked frames match playback, and which, for both motions. */
interface CheckState { check: { frames: number; matched: Record<Motion, number> }; matches: Record<Motion, boolean[]>; seek: Seek }
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
  /** The dot's x at each frame, played and seeked: what the timeline step plots. */
  const playedX: number[] = [],
    seekedX: number[] = [];
  let playedFrame: Mobject[] = [],
    playedMoves = 0;
  await new Demo({
    async frame(s: Scene) {
      frames[s.frameCount] = toSvgString(s);
      if (s.frameCount > 0) playedX[s.frameCount] = dotX(s);
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
    seekedX.push(dotX(await renderAt(Demo, f / FPS, sink)));
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
    /** The dot's x at frames 1 to the last, played and seeked. */
    playedX: playedX.slice(1),
    seekedX,
  };
}
/** The dot's x on a frame of the tiny scene, to three places, with -0 as 0. */
function dotX(s: Scene): number {
  const dot = s.mobjects.find((m) => m instanceof Dot);
  if (!dot) throw new Error(`No dot on frame ${s.frameCount}`);
  return +dot.center()[0].toFixed(3) + 0;
}
/** The script's one-sentence answer, stated in the seek step. */
const ANSWER =
  'A still re-runs the scene on the same fixed clock and, unless the scene has updaters or is playing a Succession, skips computing the frames before t, so it matches playback whenever each frame depends on the time alone, and can miss when a frame depends on how many frames ran before it';

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
    // Each rule the steps state about every run, frame, sink or page, and the test that holds it.
    claims: [
      {
        says: 'unless the scene has updaters or is playing a Succession, skips computing the frames before t',
        test: 'test/explain-lantern.test.ts: seek: unless the scene has updaters, a still computes no frame before t',
      },
      {
        says: 'counts frames 1–29 without computing them',
        test: 'test/explain-lantern.test.ts: seek: unless the scene has updaters, a still computes no frame before t',
      },
      {
        says: 'the nudged dot never passes its first step',
        test: "test/explain-fidelity.test.ts: every authored scenario exposes the program's answers at step boundaries",
      },
      {
        says: 'Frame 30 is t = 1.00 s in every run',
        test: 'test/explain-lantern.test.ts: clock: frame k is t = k / fps in every run, whatever the sink’s pace',
      },
      {
        says: 'Rayner’s sinks only read the frame',
        test: 'test/explain-lantern.test.ts: sinks only read a frame: after each of Rayner’s sinks takes it',
      },
      {
        says: 'by an amount set only by how far through its run time the animation is',
        test: 'test/explain-lantern.test.ts: an animation blends its start and end by its elapsed share of its run time alone',
      },
      {
        says: 'in every step of every scenario it seeks one frame midway and one just before the step ends',
        test: 'test/explain-gates.test.ts: rayner check seeks two frames in each step of every scenario',
      },
      {
        says: 'in a scene with updaters, a still computes every frame before t',
        test: 'test/explain-lantern.test.ts: seek: in a scene with updaters a still computes every frame before t',
      },
    ],
    checks: [
      {
        question:
          'In the nudge version, the fade-in is stretched from 0.5 s to 1 s, so the move runs from t = 1 s to 2 s and the scene has 60 frames. Does the still at t = 1 s now match playback, and which is the first frame whose still differs?',
        answer:
          'The still at t = 1 s matches: frame 30 is now the last frame of the fade, and neither run has nudged the dot yet. The first frame that differs is 32. Frame 31 opens the move, and the seek and playback have each made one nudge there; by frame 32 playback has made two and the seek still one.',
      },
      {
        question:
          'Another version moves the dot by the change in time since the last frame it computed: x += distance × (α − α at the last frame). Does its still at t = 1 s match playback?',
        answer:
          'Yes. begin() computes α = 0, the skipped frames are never computed, and the frame at t = 1 s adds the whole change from 0 to 0.5 in one go, so the dot is halfway, as in playback. Keeping state is allowed, as long as the frame comes out the same however many frames ran before it.',
      },
      {
        question:
          'You write a typing animation: each computed frame appends the next character of a 60-character sentence, over a 2-second run at 30 fps. What does a still taken 1 s into that run show, and what change makes it match playback?',
        answer:
          'Playback has computed 30 frames by then and shows 30 characters; the still computes only the frame at t and shows about one. Show the first round(60 × α) characters instead, where α is the elapsed share of the run: each frame then depends on the time alone, and both show 30 characters at the midpoint.',
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
    const parts = tiny(ink, accent, soft);

    // The tiny scene with both kinds of motion: this scenario's, and the other one the last step compares.
    const runs = {
      blend: await runDemo(ink, accent, soft, 'blend'),
      nudge: await runDemo(ink, accent, soft, 'nudge'),
    };
    const run = runs[motion];
    const match = run.played === run.seeked;
    // The captions below say which way each scenario comes out; refuse to say it if the engine disagrees.
    if (runs.blend.played !== runs.blend.seeked || runs.nudge.played === runs.nudge.seeked)
      throw new Error('Blending must match playback and the nudge must not; the seek step would be false');
    if (runs.blend.played !== runs.nudge.played)
      throw new Error('Played, both scenes must give the same frame at t; the first step says so');
    if (run.seekAt !== run.seekAt || run.firstComputed !== run.seekAt || run.computedBefore !== 0)
      throw new Error('A seek must compute no frame before t and land on the played frame number');
    if (run.seekAt !== run.seekedAt) throw new Error('A seek must land on the played frame number');
    const print = fingerprint(run.played),
      seekPrint = fingerprint(run.seeked);
    /** A frame of the tiny scene as the steps record it: what it shows, and its SVG's fingerprint and length. */
    const still = (frame: Mobject[], svg: string): Still => ({ frame: frameOf(frame), svg: fingerprint(svg), chars: svg.length });
    const played = still(run.playedFrame, run.played),
      seeked = still(run.seekedFrame, run.seeked);
    // Two frames side by side, centred in the stage below the heading.
    const THUMB_X = 3.7,
      THUMB_Y = -0.45;
    /** A thumbnail of a recorded frame, redrawn from it; `ghost` outlines where playback has the dot. */
    const thumb = (shot: Still | null, cx: number, label: string, ghost?: number) => {
      const w = 6.6,
        k = w / 16;
      const box = new Rectangle({ width: w, height: (w * 9) / 16, stroke: ink, strokeWidth: 0.02, cornerRadius: 0.04 });
      const items: Mobject[] = [box];
      if (shot) {
        const { box: b, dot } = shot.frame;
        const art = new Group(parts.track(), parts.box(b.width, b.height, b.center), parts.dot(dot));
        art.scale(k, { aboutPoint: [0, 0] });
        for (const m of art.family()) m.style.strokeWidth *= k;
        items.push(art);
        // Where playback has the dot, drawn as an outline over a still that has it elsewhere.
        if (ghost !== undefined)
          items.push(new Circle({ radius: 0.55 * k + 0.04, stroke: accent, strokeWidth: 0.04, fill: 'none' }).moveTo([ghost * k, START[1] * k]));
      } else items.push(new Text('?', { fontSize: 0.9, color: soft, weight: 'bold' }));
      const g = new Group(...items).moveTo([cx, THUMB_Y]);
      const title = new Text(label, { fontSize: 0.3, color: ink }).moveTo([cx, THUMB_Y + (w * 9) / 32 + 0.4]);
      const out: Mobject[] = [g, title];
      if (shot)
        out.push(new Text(`svg ${shot.svg} · ${shot.chars} chars`, { fontSize: 0.26, font: 'mono', color: soft }).moveTo([cx, THUMB_Y - (w * 9) / 32 - 0.4]));
      return new Group(...out);
    };
    const t = SEEK_T.toFixed(2);
    const playedLabel = (at: Seek) => `played: frame ${at.frame}, t = ${at.t.toFixed(2)} s`,
      seekedLabel = (at: Seek) => `seeked: frames 1–${at.frame - 1} only counted`;
    const how =
      motion === 'blend'
        ? 'Rayner’s animate.moveTo moves the dot by blending its start and end.'
        : `A nudge, as a game loop would make it, shifts the dot 1/${FPS} of the track per computed frame.`;
    /** Where the story takes its still: frame 30, t = 1 s. */
    const at: Seek = { frame: run.seekAt, t: SEEK_T };

    // The dot's position at every frame, played and seeked, for both kinds of motion side by side.
    const total = run.matches.length,
      moveStarts = runs.nudge.playedX.findIndex((x) => x !== START[0]) + 1;
    const W = 5.0,
      H = 2.5,
      bottom = -2.0;
    /** One panel of the timeline: the dot's place against the frame, played (a line) and seeked (a dot per frame). */
    const panel = (st: TimelineState, m: Motion, left: number, heading: string) => {
      const { frames: count, moveStarts: starts } = st.timeline;
      const fx = (f: number) => left + (f / count) * W,
        py = (x: number) => bottom + ((x - START[0]) / (END[0] - START[0])) * H;
      const frame = new Group(
        new Line([left, bottom], [left + W, bottom], { stroke: soft, strokeWidth: 0.025 }),
        new Line([left, bottom], [left, bottom + H], { stroke: soft, strokeWidth: 0.025 }),
      );
      const words = new Group(
        new Text(heading, { fontSize: 0.32, color: ink, weight: m === st.motion ? 'bold' : 'normal' }).moveTo([left + W / 2, bottom + H + 0.5]),
        new Text('end', { fontSize: 0.26, color: soft, anchor: 'end' }).moveTo([left - 0.15, py(END[0])], [1, 0]),
        new Text('start', { fontSize: 0.26, color: soft, anchor: 'end' }).moveTo([left - 0.15, py(START[0])], [1, 0]),
      );
      for (const f of [1, starts, st.seek.frame, count]) {
        frame.add(new Line([fx(f), bottom], [fx(f), bottom - 0.1], { stroke: soft, strokeWidth: 0.025 }));
        words.add(new Text(String(f), { fontSize: 0.26, font: 'mono', color: soft }).moveTo([fx(f), bottom - 0.32]));
      }
      // The still the story followed.
      const marker = new Line([fx(st.seek.frame), bottom], [fx(st.seek.frame), bottom + H], { stroke: accent, strokeWidth: 0.025 });
      marker.style.dashArray = '0.12 0.1';
      const playedLine = new VMobject({ stroke: ink, strokeWidth: 0.045, fill: 'none' });
      st.timeline.played[m].forEach((x, i) => (i ? playedLine.addLineTo([fx(i + 1), py(x)]) : playedLine.startNewPath([fx(1), py(x)])));
      const stills = new Group(...st.timeline.seeked[m].map((x, i) => new Dot({ radius: 0.065, color: accent }).moveTo([fx(i + 1), py(x)])));
      return { frame, words, marker, played: playedLine, seeked: stills, fx, py };
    };
    const timelinePicture = (st: TimelineState) => {
      const blend = panel(st, 'blend', -6.4, 'Blending fixed endpoints'),
        nudge = panel(st, 'nudge', 1.6, 'A nudge each frame');
      // On a phone the step opens on the nudge's panel, where the two runs part.
      nudge.played.key = 'lantern-timeline-nudge-played';
      nudge.seeked.key = 'lantern-timeline-nudge-seeked';
      // At the still the story followed, how far apart the nudge's two runs are.
      const x = nudge.fx(st.seek.frame);
      const notes = new Group(
        new Text(`played: ${st.nudges.played} nudges`, { fontSize: 0.26, color: ink, anchor: 'end' }).moveTo(
          [x - 0.15, nudge.py(st.timeline.played.nudge[st.seek.frame - 1]!) + 0.25],
          [1, 0],
        ),
        new Text(`seeked: ${st.nudges.seeked} nudge`, { fontSize: 0.26, color: accent, anchor: 'start' }).moveTo(
          [x + 0.15, nudge.py(st.timeline.seeked.nudge[st.seek.frame - 1]!) + 0.3],
          [-1, 0],
        ),
        new Text('frame', { fontSize: 0.26, color: soft }).moveTo([0, bottom - 0.32]),
      );
      return new Group(blend.frame, nudge.frame, blend.marker, nudge.marker, new Group(blend.played, nudge.played), new Group(blend.seeked, nudge.seeked), blend.words, nudge.words, notes);
    };

    await s.steps([
      stagedStep({
        id: 'played',
        title: `Played, the dot is halfway at t = ${t} s`,
        line: `A still at t = ${SEEK_T} s skips computing frames 1–${run.seekAt - 1}. Where is its dot?`,
        caption: `A direct link opens a later picture without playing the earlier steps, so Rayner makes that picture as a still. Here a box fades in, then a dot moves along a track. ${how} Playback has the dot halfway at t = ${SEEK_T} s. To make the still, Rayner re-runs the scene and counts frames 1–${run.seekAt - 1} without computing them. Predict where the still’s dot will be before you go on.`,
        // The played frame, and where the still will be taken; what the still shows is not yet known.
        state: { at, played },
        describe: (st) =>
          `Left: the tiny scene ${playedLabel(st.at)}, the dot halfway along its track, fingerprint ${st.played.svg}. Right: an empty frame marked with a question mark, ${seekedLabel(st.at)}.`,
        draw: (st) => new Group(thumb(st.played, -THUMB_X, playedLabel(st.at)), thumb(null, THUMB_X, seekedLabel(st.at))),
      }),
      stagedStep({
        id: 'seek',
        title: match
          ? `The still matches: the same SVG, fingerprint ${print}`
          : `The still differs: SVG ${seekPrint}, the dot ${run.seekedMoves} nudge along`,
        line: match
          ? 'Blending works the dot out from the time alone.'
          : `Played, the dot made ${run.playedMoves} nudges by t = ${SEEK_T} s; seeked, it made ${run.seekedMoves}.`,
        caption: match ? `The pictures match because animate.moveTo calculates position from elapsed time and fixed endpoints. It does not need the earlier dot positions. ${ANSWER}.` : `The still makes ${run.seekedMoves} nudge while playback has made ${run.playedMoves}. A nudge adds to the previous position, so skipping calculations loses the accumulated moves. The box still matches because its size is calculated from fixed endpoints. ${ANSWER}.`,
        state: {
          seek: { motion, match, played: print, seeked: seekPrint, playedMoves: run.playedMoves, seekedMoves: run.seekedMoves },
          at,
          stills: { played, seeked },
        },
        describe: (st) =>
          st.seek.match
            ? `Two frames of the tiny scene at t = ${st.at.t.toFixed(2)} s, played and seeked, both with the dot halfway and the fingerprint ${st.seek.played}.`
            : `Two frames of the tiny scene at t = ${st.at.t.toFixed(2)} s: played, with the dot halfway (${st.seek.played}); seeked, with the dot near the start of its track and an outline where playback has it (${st.seek.seeked}).`,
        // The two frames, the still's with an outline where playback has the dot when they differ.
        draw: (st) =>
          new Group(
            thumb(st.stills.played, -THUMB_X, playedLabel(st.at)),
            thumb(st.stills.seeked, THUMB_X, seekedLabel(st.at), st.seek.match ? undefined : st.stills.played.frame.dot),
            new Text(st.seek.match ? '=' : '≠', { fontSize: 0.7, color: accent, weight: 'bold' }).moveTo([0, THUMB_Y]),
          ),
      }),
      stagedStep({
        id: 'timeline',
        title: 'Seeked frame by frame, the nudged dot never passes its first step',
        line: 'Line: where playback has the dot. Dots: a still taken at each frame.',
        caption: `Each panel plots the dot’s place on its track against the frame number, for all ${total} frames of the tiny scene. The line is playback; each dot is a separate still, seeked to that frame. Through the fade, frames 1–${moveStarts - 1}, the dot has not moved and the two agree. From frame ${moveStarts} the dot moves: played, the blend eases in and out and the nudge climbs evenly, and both are halfway at frame ${run.seekAt}, where the story took its still. A blended dot is placed by the frame’s time, so in this scene each still lands on playback’s line. A nudged still computes one frame of the move and makes one nudge, so its dots stay at the first step while playback climbs a nudge a frame. This scenario’s panel, on the ${motion === 'blend' ? 'left' : 'right'}, has the bold title.`,
        state: {
          timeline: {
            frames: total,
            moveStarts,
            played: { blend: runs.blend.playedX, nudge: runs.nudge.playedX },
            seeked: { blend: runs.blend.seekedX, nudge: runs.nudge.seekedX },
          },
          // This scenario's panel has the bold title; the nudge's two runs at the still are counted beside it.
          motion,
          seek: at,
          nudges: { played: runs.nudge.playedMoves, seeked: runs.nudge.seekedMoves },
        } satisfies TimelineState,
        describe: (st) =>
          `Two plots of the dot’s place on its track, start to end, against frames 1 to ${st.timeline.frames}. Each has a line for playback and a dot for a still seeked to each frame. Blending fixed endpoints: every dot sits on the line. A nudge each frame: the dots follow the line through frame ${st.timeline.moveStarts}, then stay one nudge from the start while the line climbs to the end; at frame ${st.seek.frame} playback has made ${st.nudges.played} nudges and the still ${st.nudges.seeked}.`,
        draw: (st) => timelinePicture(st),
        opening: ['lantern-timeline-nudge-played', 'lantern-timeline-nudge-seeked'],
      }),
    ]);

    await this.step('clock', {
      title: `Frame ${run.seekAt} is t = ${t} s in every run`,
      line: `Scene time is the frame number × 1/${this.fps} s, however fast the frames are taken.`,
      caption: `The receiver of a frame is called a sink. A browser sink waits between frames; a trace sink can take them immediately. That changes how fast the output arrives, not the scene’s clock: both reach t = ${SEEK_T} s at frame ${run.seekAt}. The target time therefore identifies the same frame even when earlier pictures are skipped.`,
    });
    await s.clear();
    // The pipeline spans the stage above the timeline, which starts at RULER_TOP. Canvas and box
    // extents in pixels are the snapshot's.
    const RULER_TOP = -1.55;
    const flowAt: Box = [-7.35, RULER_TOP + 0.2, 7.35, 2.95];
    const flow = await s.show({ source: FLOW }, { box: bleed(flowAt, [606.6, 222.7], [40, 40, 566.6, 182.7]) });
    inside(flow, ['Author', 'Browser', 'Trace', 'PNG'], flowAt, regionBox('top', { bottom: RULER_TOP }));
    await flow.walk(
      [
        ['Clock', 'Browser'],
        ['Clock', 'Trace'],
      ],
      { parallel: true, trail: true },
    );
    // Frame times from the scene's own fps; two sinks pace the same frames differently.
    this.state.frameAtSeek = run.seekAt;
    this.state.ruler = { fps: this.fps, times: Array.from({ length: 9 }, (_, n) => (n * 1000) / this.fps) };
    const x0 = -2.85,
      pitch = 1.25;
    const axisY = RULER_TOP - 0.4,
      timeY = axisY - 0.4,
      browserY = timeY - 0.85,
      traceY = browserY - 0.8;
    const lane = (label: string, y: number) =>
      new Text(label, { fontSize: 0.28, color: s.soft, anchor: 'start' }).moveTo([-7.3, y], [-1, 0]);
    // The scene time of each frame the state records, and when each sink takes it.
    const ruler = view(
      this,
      (st) => {
        const { times } = (st as unknown as { ruler: { fps: number; times: number[] } }).ruler;
        const g = new Group();
        g.add(
          lane('scene time (ms)', timeY),
          lane('browser sink, wall clock', browserY),
          lane('trace sink, wall clock', traceY),
          new Line([x0 - 0.25, axisY], [x0 + pitch * (times.length - 1) + 0.25, axisY], { stroke: ink, strokeWidth: 0.025 }),
        );
        times.forEach((ms, n) => {
          const x = x0 + n * pitch;
          g.add(
            new Line([x, axisY + 0.14], [x, axisY - 0.14], { stroke: ink, strokeWidth: 0.025 }),
            new Text(ms.toFixed(0), { fontSize: 0.26, font: 'mono', color: ink }).moveTo([x, timeY]),
            new Dot({ radius: 0.11, color: accent }).moveTo([x, browserY]),
            new Dot({ radius: 0.11, color: accent }).moveTo([x0 + n * 0.28, traceY]),
          );
        });
        return keyed(g, 'lantern-ruler');
      },
      { place: false },
    );
    await s.enter(ruler);

    await this.step('objects', {
      title: 'A frame is the shapes on stage, as the playing animations left them',
      line: `Once the still reaches frame ${run.seekAt}, the playing animation decides where the dot is.`,
      caption: `A Scene owns the shapes and text, called mobjects, and its animations change them. Rayner’s sinks only read the frame. The output cannot reconstruct missing nudges: the dot’s position must already be right when the animation hands over that frame.`,
    });
    await s.clear();
    // The classes fill the stage's height, left of centre, with the sink's note beside them.
    const classesAt: Box = [-6.1, -3.55, 1.0, 2.95];
    const classes = await s.show({ source: CLASSES }, { box: bleed(classesAt, [397.786, 370.7], [40, 40, 358, 331]) });
    inside(classes, ['Scene', 'Mobject', 'Animation', 'Sink'], classesAt, regionBox('full', { right: classesAt[2] + 0.3 }));
    await classes.walk([['Scene', 'Mobject']], { trail: true });
    await classes.walk([['Scene', 'Animation']], { trail: true });
    await classes.walk([['Scene', 'Sink']], { trail: true });
    // What the sink does with a frame, beside it: it reads; it never changes a mobject.
    const sinkBox = classes.get('Sink').box()!;
    const reads = new Text('reads each frame; changes nothing', { fontSize: 0.28, color: soft, anchor: 'start' }).moveTo(
      [sinkBox[2] + 0.35, (sinkBox[1] + sinkBox[3]) / 2],
      [-1, 0],
    );
    await s.enter(reads, { describe: 'Beside Sink: it reads each frame and changes nothing.' });
    // src/animation.ts:1-3 and 79-83: begin() copies the starting mobject; every frame blends two fixed endpoints.
    await this.step('begin', {
      title: 'An animation fixes its endpoints when it begins',
      line: `At t = ${SEEK_T} s the blend is halfway, however many frames ran before.`,
      caption: `begin() copies the starting object. Each frame blends that copy with a fixed end by an amount set only by how far through its run time the animation is. Halfway through the duration therefore means halfway between the endpoints. In contrast, dot.shift(step) adds to the position accumulated by earlier frames.`,
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
      { at: [anim[2] + 0.25, anim[1], anim[2] + 4.2, mob[3]], fontSize: 0.19 },
    );
    // Scene and Sink fade, so nothing behind the heading competes with it once the camera moves in.
    await classes.dim(['Mobject', 'Animation']);
    // The camera frames Scene and the two links this step is about, Mobject, Animation, its note and the
    // listing below the heading, which stays on screen. Sink, above Mobject, passes under the heading
    // whole, so the frame cuts no box.
    const sink = classes.get('Sink').box()!;
    const subject = [classes.get('Scene'), classes.get('Mobject'), classes.get('Animation'), fixed, listing].map((m) => m.box()!);
    await s.focus(
      viewUnder(sink[1] - 0.02, [
        Math.min(...subject.map((b) => b[0])) - 0.08,
        Math.min(...subject.map((b) => b[1])) - 0.15,
        Math.max(...subject.map((b) => b[2])) + 0.08,
        mob[3],
      ]),
      { exact: true },
    );

    // Every frame of the tiny scene, seeked and compared with playback, for both kinds of motion.
    const count = (m: Motion) => runs[m].matches.filter(Boolean).length;
    const firstMiss = runs.nudge.matches.indexOf(false) + 1;
    const cell = 0.29,
      x1 = -6.5;
    /** One row of cells, a cell per frame: filled where the seeked frame is the played one, hollow where it differs. */
    const strip = (matches: readonly boolean[], y: number, label: string) => {
      const g = new Group();
      g.add(
        new Text(`${label}: ${matches.filter(Boolean).length} of ${matches.length} match`, { fontSize: 0.3, color: ink, anchor: 'start' }).moveTo([x1, y + 0.65], [-1, 0]),
      );
      matches.forEach((ok, i) => {
        g.add(
          new Rectangle({
            width: cell * 0.8,
            height: 0.6,
            stroke: ok ? s.good : s.bad,
            strokeWidth: 0.02,
            fill: ok ? s.good : s.bad,
            fillOpacity: ok ? 0.85 : 0.2,
          }).moveTo([x1 + cell * (i + 0.5), y]),
        );
      });
      return g;
    };
    const checkPicture = (st: CheckState) => {
      const axis = new Group();
      for (const f of [1, 15, st.seek.frame, st.check.frames]) {
        const x = x1 + cell * (f - 0.5);
        axis.add(new Text(String(f), { fontSize: 0.26, font: 'mono', color: soft }).moveTo([x, -2.05]));
      }
      axis.add(new Text('frame', { fontSize: 0.26, color: soft, anchor: 'end' }).moveTo([x1 - 0.2, -2.05], [1, 0]));
      // The still the story followed, marked across both rows.
      const x = x1 + cell * (st.seek.frame - 0.5);
      const marker = new Line([x, 1.7], [x, -1.75], { stroke: accent, strokeWidth: 0.03 });
      const markerLabel = new Text(`the still at t = ${st.seek.t.toFixed(2)} s`, { fontSize: 0.26, color: accent }).moveTo([x, 1.95]);
      const key = new Text('filled: seeked frame = played frame · hollow: different', { fontSize: 0.26, color: soft }).moveTo([0, -2.85]);
      return new Group(strip(st.matches.blend, 0.5, 'Blending fixed endpoints'), strip(st.matches.nudge, -1.2, 'A nudge each frame'), axis, marker, markerLabel, key);
    };
    await s.steps([
      stagedStep({
        id: 'check',
        title: `Seeked frame by frame: ${count('blend')} of ${total} match with blending, ${count('nudge')} with the nudge`,
        line: 'rayner check fails a page on the first seeked frame that differs from playback.',
        caption: `The strips compare each of those ${total} stills with its played frame, the whole SVG, box and dot together. Blending agrees throughout; the nudge first differs at frame ${firstMiss}. rayner check samples less: in every step of every scenario it seeks one frame midway and one just before the step ends. A mismatch fails the check, but agreement at those two times proves nothing about the times between them. An updater follows a different path: in a scene with updaters, a still computes every frame before t.`,
        state: {
          check: { frames: total, matched: { blend: count('blend'), nudge: count('nudge') } },
          // Whether each frame's still is the played frame, for both kinds of motion: the cells.
          matches: { blend: runs.blend.matches, nudge: runs.nudge.matches },
          seek: at,
        } satisfies CheckState,
        describe: (st) => {
          const { frames, matched } = st.check,
            miss = st.matches.nudge.indexOf(false) + 1;
          return `Two rows of ${frames} cells, one per frame of the tiny scene, each comparing the seeked frame with the played one. Blending: ${matched.blend === frames ? `all ${frames}` : `${matched.blend} of ${frames}`} match. A nudge each frame: frames 1 to ${miss - 1} match, frames ${miss} to ${frames} differ. A line marks frame ${st.seek.frame}, the still at t = ${st.seek.t.toFixed(2)} s.`;
        },
        draw: (st) => checkPicture(st),
      }),
    ]);
  }
}
