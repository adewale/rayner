import { Scene, Rectangle, Dot, FadeIn, Transform, Animation } from '../../../src/index.ts';
import { toSvgString, renderAt, StringSink } from '../../../src/output.ts';
import type { Box, Mobject, Vec } from '../../../src/index.ts';
import { stage, regionBox, settingsOf, answerOf, view, having } from '../../../explain/index.ts';
import type { Diagram, PictureNote, ExplainerMeta } from '../../../explain/index.ts';
import { START, END, tiny, timelinePicture, checkPicture, playedLabel, seekedLabel, playedPicture, seekPicture, rulerPicture, sinkNote } from './picture.ts';
import type { Motion, TinyFrame, Still, Seek, TimelineState, CheckState } from './picture.ts';
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

/** The still the story asks about: t = 1 s, halfway through the dot's one-second move. */
const SEEK_T = 1;
const MOVE_TIME = 1,
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
function demoScene(ink: string, emphasis: string, soft: string, motion: Motion, nudges: Nudge[]) {
  const parts = tiny(ink, emphasis, soft);
  return class SeekDemo extends Scene<{}, {}> {
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
/** FNV-1a, so the reader can compare two frames by a short fingerprint. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
// This explainer's model is Rayner's own engine: the tiny scene runs through src/scene.ts and renderAt.
// Its limits: a still skips the earlier frames only in a scene without updaters and without a Succession
// in play; those take a slower seek that computes every frame before t, and are outside the pictured
// comparison. "Sinks only read the frame" is a promise about Rayner's own sinks, not a caller's custom
// sink. And the two motions give the same played frame at t = 1 s, so the comparison there isolates
// seeking; elsewhere their played paths differ (the blend eases, the nudge moves evenly).
/**
 * Run the tiny scene with one kind of motion: played from zero, frame by frame; seeked straight to
 * SEEK_T, as renderAt makes a still; and seeked to every other frame, as rayner check seeks, to
 * compare each with the played frame.
 */
async function runDemo(ink: string, emphasis: string, soft: string, motion: Motion) {
  const nudges: Nudge[] = [];
  const Demo = demoScene(ink, emphasis, soft, motion, nudges);
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

// How the classes are shown, apart from their source: the links walked, the notes and what stays
// undimmed. That is `shown`, not the model; the diagram's view draws it, and each change is a sync.
type ClassesShown = { walked: [string, string][]; notes: PictureNote[]; dim: string[] | null };
/** After the staged steps: the frame the still seeks to, and the scene time of each frame. */
type LanternState = { frameAtSeek?: number; ruler?: { fps: number; times: number[] } };
/** The pipeline's walked links, and how the classes are shown. */
type LanternShown = { flowWalked?: [string, string][]; classes?: ClassesShown };

export default class LanternExplainer extends Scene<LanternState, LanternShown> {
  static meta = {
    sources: [
      'https://github.com/ivarvong/lantern',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/src/scene.ts',
      'https://github.com/adewale/rayner/blob/main/src/scene.ts',
      'https://github.com/adewale/rayner/blob/main/src/animation.ts',
    ],
    // Each rule the steps state about every run, frame, sink or page, and the test that holds it.
    claims: [
      {
        says: 'unless the scene has updaters or is playing a Succession, skips computing the frames before t',
        test: 'model.test.ts: seek: unless the scene has updaters, a still computes no frame before t',
      },
      {
        says: 'counts frames 1–29 without computing them',
        test: 'model.test.ts: seek: unless the scene has updaters, a still computes no frame before t',
      },
      {
        says: 'the nudged dot never passes its first step',
        test: "test/explain-fidelity.test.ts: every authored scenario exposes the program's answers at step boundaries",
      },
      {
        says: 'Frame 30 is t = 1.00 s in every run',
        test: 'model.test.ts: clock: frame k is t = k / fps in every run, whatever the sink’s pace',
      },
      {
        says: 'Rayner’s sinks only read the frame',
        test: 'model.test.ts: sinks only read a frame: after each of Rayner’s sinks takes it',
      },
      {
        says: 'by an amount set only by how far through its run time the animation is',
        test: 'model.test.ts: an animation blends its start and end by its elapsed share of its run time alone',
      },
      {
        says: 'in every step of every scenario it seeks one frame midway and one just before the step ends',
        test: 'test/explain-gates.test.ts: rayner check seeks two frames in each step of every scenario',
      },
      {
        says: 'in a scene with updaters, a still computes every frame before t',
        test: 'model.test.ts: seek: in a scene with updaters a still computes every frame before t',
      },
    ],
  } satisfies ExplainerMeta;
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
    const answer = answerOf(this);
    const motion = settingsOf(this).motion as Motion;
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.look.ink,
      emphasis = s.look.emphasis,
      soft = s.look.soft;
    const c = s.look;

    // The tiny scene with both kinds of motion: this scenario's, and the other one the last step compares.
    const runs = {
      blend: await runDemo(ink, emphasis, soft, 'blend'),
      nudge: await runDemo(ink, emphasis, soft, 'nudge'),
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
    const t = SEEK_T.toFixed(2);
    const how =
      motion === 'blend'
        ? 'Rayner’s animate.moveTo moves the dot by blending its start and end.'
        : `A nudge, as a game loop would make it, shifts the dot 1/${FPS} of the track per computed frame.`;
    /** Where the story takes its still: frame 30, t = 1 s. */
    const at: Seek = { frame: run.seekAt, t: SEEK_T };

    // The dot's position at every frame, played and seeked, for both kinds of motion side by side.
    const total = run.matches.length,
      moveStarts = runs.nudge.playedX.findIndex((x) => x !== START[0]) + 1;

    await s.steps([
      {
        id: 'played',
        title: `Played, the dot is halfway at t = ${t} s`,
        line: `A still at t = ${SEEK_T} s skips computing frames 1–${run.seekAt - 1}. Where is its dot?`,
        caption: `A direct link opens a later picture without playing the earlier steps, so Rayner makes that picture as a still. Here a box fades in, then a dot moves along a track. ${how} Playback has the dot halfway at t = ${SEEK_T} s. To make the still, Rayner re-runs the scene and counts frames 1–${run.seekAt - 1} without computing them. Predict where the still’s dot will be before you go on.`,
        // The played frame, and where the still will be taken; what the still shows is not yet known.
        state: { at, played },
        describe: (st) =>
          `Left: the tiny scene ${playedLabel(st.at)}, the dot halfway along its track, fingerprint ${st.played.svg}. Right: an empty frame marked with a question mark, ${seekedLabel(st.at)}.`,
        draw: (st) => playedPicture(st, c),
      },
      {
        id: 'seek',
        title: match
          ? `The still matches: the same SVG, fingerprint ${print}`
          : `The still differs: SVG ${seekPrint}, the dot ${run.seekedMoves} nudge along`,
        line: match
          ? 'Blending works the dot out from the time alone.'
          : `Played, the dot made ${run.playedMoves} nudges by t = ${SEEK_T} s; seeked, it made ${run.seekedMoves}.`,
        caption: match ? `The pictures match because animate.moveTo calculates position from elapsed time and fixed endpoints. It does not need the earlier dot positions. ${answer}.` : `The still makes ${run.seekedMoves} nudge while playback has made ${run.playedMoves}. A nudge adds to the previous position, so skipping calculations loses the accumulated moves. The box still matches because its size is calculated from fixed endpoints. ${answer}.`,
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
        draw: (st) => seekPicture(st, c),
      },
      {
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
        draw: (st) => timelinePicture(st, c),
        opening: ['lantern-timeline-nudge-played', 'lantern-timeline-nudge-seeked'],
      },
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
    // The links walked are how the pipeline is shown, not the model: they live in `shown`, and the
    // pipeline is shown by a view that draws them as a trail.
    this.shown.flowWalked = [];
    const flowView = s.diagramView(flow, (_st, sh) => ({ marks: flow.trail(having(sh, 'flowWalked').flowWalked) }));
    const paced: [string, string][] = [
      ['Clock', 'Browser'],
      ['Clock', 'Trace'],
    ];
    await flow.walk(paced, { parallel: true });
    this.shown.flowWalked = paced;
    await this.play(flowView.sync());
    // Frame times from the scene's own fps; two sinks pace the same frames differently.
    this.state.frameAtSeek = run.seekAt;
    this.state.ruler = { fps: this.fps, times: Array.from({ length: 9 }, (_, n) => (n * 1000) / this.fps) };
    // The scene time of each frame the state records, and when each sink takes it.
    const ruler = view(this, (st) => rulerPicture(having(st, 'ruler').ruler.times, RULER_TOP, c), { place: false });
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
    this.shown.classes = { walked: [], notes: [], dim: null } satisfies ClassesShown;
    const drawClasses = (_st: LanternState, sh: LanternShown) => {
      const c = having(sh, 'classes').classes;
      return { marks: classes.trail(c.walked), notes: c.notes, dim: c.dim };
    };
    const classesView = s.diagramView(classes, drawClasses);
    const showClasses = async (change: Partial<ClassesShown>) => {
      this.shown.classes = { ...having(this.shown, 'classes').classes, ...change };
      await this.play(classesView.sync());
    };
    for (const hop of [
      ['Scene', 'Mobject'],
      ['Scene', 'Animation'],
      ['Scene', 'Sink'],
    ] as [string, string][]) {
      await classes.walk([hop]);
      await showClasses({ walked: [...having(this.shown, 'classes').classes.walked, hop] });
    }
    // What the sink does with a frame, beside it: it reads; it never changes a mobject.
    const sinkBox = classes.get('Sink').box()!;
    const reads = sinkNote(sinkBox, soft);
    await s.enter(reads, { describe: 'Beside Sink: it reads each frame and changes nothing.' });
    // src/animation.ts:1-3 and 79-83: begin() copies the starting mobject; every frame blends two fixed endpoints.
    await this.step('begin', {
      title: 'An animation fixes its endpoints when it begins',
      line: `At t = ${SEEK_T} s the blend is halfway, however many frames ran before.`,
      caption: `begin() copies the starting object. Each frame blends that copy with a fixed end by an amount set only by how far through its run time the animation is. Halfway through the duration therefore means halfway between the endpoints. In contrast, dot.shift(step) adds to the position accumulated by earlier frames.`,
    });
    await s.clearOverlays();
    await showClasses({ walked: [] });
    await showClasses({ notes: [{ id: 'Animation', text: 'endpoints fixed at begin()', side: 'below' }] });
    const fixed = classesView.current.family().find((m) => m.key === 'note:Animation')!;
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
      { at: [anim[2] + 0.25, anim[1], anim[2] + 4.2, mob[3]], size: 0.19 },
    );
    // Scene and Sink fade, so nothing behind the heading competes with it once the camera moves in.
    await showClasses({ dim: ['Mobject', 'Animation'] });
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
    await s.steps([
      {
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
        draw: (st) => checkPicture(st, c),
      },
    ]);
  }
}
