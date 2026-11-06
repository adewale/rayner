import { Rectangle, Dot, Circle, Line, Text, Group, VMobject } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';

// How the lantern explainer draws a state: the tiny scene redrawn from a recorded frame, two frames
// side by side, the dot's place at every frame played and seeked, and a strip of cells per motion.

export type Motion = 'blend' | 'nudge';
/** The tiny scene's track, from start to end. */
export const START: Vec = [-6, -3],
  END: Vec = [6, -3];
/** The stage's colours a state is drawn in. */
export type Ink = { ink: string; accent: string; soft: string };
/** The stage's colours for a match and a miss. */
export type Verdict = { good: string; bad: string };

/** The tiny scene's frame as a step records it: the box's centre and size, and the dot's place on the track. */
export interface TinyFrame { box: { center: Vec; width: number; height: number }; dot: number }
/** The tiny scene's look, shared by its own run and by the thumbnails drawn from a recorded frame. */
export const tiny = (ink: string, accent: string, soft: string) => {
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
/** A recorded frame of the tiny scene, with its SVG's fingerprint and length. */
export interface Still { frame: TinyFrame; svg: string; chars: number }
/** Where the story takes its still: the frame number and its time in seconds. */
export interface Seek { frame: number; t: number }
/** The timeline step's state: the dot's x at every frame, played and seeked, for both motions. */
export interface TimelineState {
  timeline: { frames: number; moveStarts: number; played: Record<Motion, number[]>; seeked: Record<Motion, number[]> };
  motion: Motion;
  seek: Seek;
  nudges: { played: number; seeked: number };
}
/** The check step's state: how many seeked frames match playback, and which, for both motions. */
export interface CheckState { check: { frames: number; matched: Record<Motion, number> }; matches: Record<Motion, boolean[]>; seek: Seek }

// Two frames side by side, centred in the stage below the heading.
export const THUMB_X = 3.7,
  THUMB_Y = -0.45;
/** A thumbnail of a recorded frame, redrawn from it; `ghost` outlines where playback has the dot. */
export function thumb({ ink, accent, soft }: Ink, shot: Still | null, cx: number, label: string, ghost?: number) {
  const parts = tiny(ink, accent, soft);
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
}

const W = 5.0,
  H = 2.5,
  bottom = -2.0;
/** One panel of the timeline: the dot's place against the frame, played (a line) and seeked (a dot per frame). */
function panel(st: TimelineState, m: Motion, left: number, heading: string, { ink, accent, soft }: Ink) {
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
}
export function timelinePicture(st: TimelineState, c: Ink) {
  const { ink, accent, soft } = c;
  const blend = panel(st, 'blend', -6.4, 'Blending fixed endpoints', c),
    nudge = panel(st, 'nudge', 1.6, 'A nudge each frame', c);
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
}

const cell = 0.29,
  x1 = -6.5;
/** One row of cells, a cell per frame: filled where the seeked frame is the played one, hollow where it differs. */
function strip(matches: readonly boolean[], y: number, label: string, { ink, good, bad }: Ink & Verdict) {
  const g = new Group();
  g.add(
    new Text(`${label}: ${matches.filter(Boolean).length} of ${matches.length} match`, { fontSize: 0.3, color: ink, anchor: 'start' }).moveTo([x1, y + 0.65], [-1, 0]),
  );
  matches.forEach((ok, i) => {
    g.add(
      new Rectangle({
        width: cell * 0.8,
        height: 0.6,
        stroke: ok ? good : bad,
        strokeWidth: 0.02,
        fill: ok ? good : bad,
        fillOpacity: ok ? 0.85 : 0.2,
      }).moveTo([x1 + cell * (i + 0.5), y]),
    );
  });
  return g;
}
export function checkPicture(st: CheckState, c: Ink & Verdict) {
  const { accent, soft } = c;
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
  return new Group(strip(st.matches.blend, 0.5, 'Blending fixed endpoints', c), strip(st.matches.nudge, -1.2, 'A nudge each frame', c), axis, marker, markerLabel, key);
}
