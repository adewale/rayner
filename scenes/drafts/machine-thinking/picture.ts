import { Group, Polygon, Circle, Line, keyed } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label, TYPE, STROKE } from '../../../explain/drawing.ts';
import { ANSWER, IDEAS, PAIN, RUN, SLOPE, felt, machineSays, riseToAnswer, type Ball, type State } from './model.ts';

/** Where each idea sits across the stage, and the scale from a spot's height to stage units. */
const X = [-5.8, -2.2, 1.3, 5.0];
const SCALE = 0.32;
const LEFT = -7.5, RIGHT = 7.5;
/** The bottom of each lane: yours on top, the machine's below. */
const BASE = { you: 0.3, machine: -4.1 } as const;
const RADIUS = 0.22;

/** A spot's height as a y on its lane. */
const y = (lane: keyof typeof BASE, h: number) => BASE[lane] + h * SCALE;

/** The ground's outline: flat shoulders past the end ideas, and an eased curve between ideas, so each idea sits in a dip. */
function ground(heights: readonly number[], lane: keyof typeof BASE): [number, number][] {
  const pts: [number, number][] = [[LEFT, y(lane, heights[0]!)]];
  for (let i = 0; i < heights.length - 1; i++)
    for (let k = 0; k < 12; k++) {
      const t = k / 12, e = (1 - Math.cos(Math.PI * t)) / 2;
      pts.push([X[i]! + (X[i + 1]! - X[i]!) * t, y(lane, heights[i]! + (heights[i + 1]! - heights[i]!) * e)]);
    }
  pts.push([X.at(-1)!, y(lane, heights.at(-1)!)], [RIGHT, y(lane, heights.at(-1)!)]);
  return pts;
}

/** An open line through the points. */
function polyline(pts: [number, number][], style: ConstructorParameters<typeof Line>[2]) {
  const l = new Line(pts[0], pts[1], style);
  for (const p of pts.slice(2)) l.addLineTo(p);
  return l;
}

function slope(s: Stage, heights: readonly number[], lane: keyof typeof BASE) {
  const top = ground(heights, lane);
  return keyed(new Polygon([[LEFT, BASE[lane]], ...top, [RIGHT, BASE[lane]]], { fill: s.look.soft, fillOpacity: 0.55, stroke: s.look.ink, strokeWidth: STROKE.fine }), `${lane}:slope`);
}

function ball(s: Stage, b: Ball, lane: keyof typeof BASE, fill: string) {
  return keyed(new Circle({ radius: RADIUS, fill, stroke: s.look.ink, strokeWidth: STROKE.fine }).moveTo([X[b.at]!, y(lane, b.heights[b.at]!) + RADIUS]), `${lane}:ball`);
}

/** Both lanes: the slope, its ball, and what each lane reads out. */
export function drawLanes(st: State, s: Stage, { readout }: { readout: boolean }): Group {
  const parts = [
    keyed(label(s, 'You', { at: [LEFT + 0.1, 2.8], align: 'start', size: TYPE.label, bold: true }), 'you:title'),
    slope(s, st.you.heights, 'you'),
    ...IDEAS.map((idea, i) => keyed(label(s, idea, { at: [X[i]!, -0.2], size: TYPE.small }), `idea:${i}`)),
    keyed(label(s, 'Machine', { at: [LEFT + 0.1, -0.95], align: 'start', size: TYPE.label, bold: true }), 'machine:title'),
    slope(s, st.machine.heights, 'machine'),
  ];
  // The slope as it was, where yours has worn lower.
  if (st.you.heights.some((h, i) => h !== SLOPE[i]))
    parts.push(
      keyed(polyline(ground(SLOPE, 'you'), { fill: 'none', stroke: s.look.muted, strokeWidth: STROKE.fine, dashArray: '0.08 0.1' }), 'you:before'),
      keyed(label(s, 'worn 0.6 lower', { at: [-1.2, 2.8], size: TYPE.small, color: s.look.muted }), 'you:worn'),
    );
  // A painful answer, as the person feels it: its ground raised by the pain.
  if (st.feeling === 'painful') {
    const raised = y('you', felt(st.you.heights, st.feeling, ANSWER));
    parts.push(
      keyed(new Line([X[ANSWER]!, y('you', st.you.heights[ANSWER]!)], [X[ANSWER]!, raised], { stroke: s.look.bad, strokeWidth: STROKE.line, dashArray: '0.18 0.12' }), 'you:pain-rise'),
      keyed(new Line([X[ANSWER - 1]!, y('you', st.you.heights[ANSWER - 1]!)], [X[ANSWER]!, raised], { stroke: s.look.bad, strokeWidth: STROKE.line, dashArray: '0.18 0.12' }), 'you:pain-line'),
      keyed(label(s, `pain +${PAIN}`, { at: [X[ANSWER]! + 1.4, raised - 0.55], size: TYPE.small, color: s.look.bad }), 'you:pain'),
    );
  }
  if (st.you.stopped && st.you.at !== ANSWER)
    parts.push(keyed(label(s, `rise to the answer: ${riseToAnswer(st.you, st.feeling)}`, { at: [RIGHT - 0.1, 2.8], align: 'end', size: TYPE.small }), 'you:rise'));
  if (readout)
    parts.push(keyed(label(s, `pushes: ${st.machine.pushes} of ${RUN}`, { at: [RIGHT - 0.1, -0.95], align: 'end', size: TYPE.small }), 'machine:pushes'));
  const says = machineSays(st.machine.at, st.feeling);
  if (says) parts.push(keyed(label(s, says, { at: [RIGHT - 0.1, -2.2], align: 'end', size: TYPE.small }), 'machine:says'));
  parts.push(ball(s, st.you, 'you', s.look.emphasis), ball(s, st.machine, 'machine', s.look.ink));
  return new Group(...parts);
}

/** The comparison the explainer ends on. */
export const COMPARE = [
  ['', 'You', 'Machine'],
  ['Moved by', 'saving energy', 'being run'],
  ['Feelings', 'steer the ball', 'are only words'],
  ['Stops when', 'nothing is lower', 'the run ends'],
  ['After a throw', 'worn grooves', 'no change'],
] as const;

export function drawCompare(s: Stage): Group {
  const cols = [-7.3, -2.4, 2.8];
  return new Group(
    ...COMPARE.flatMap((row, r) => row.map((cell, c) =>
      cell ? keyed(label(s, cell, { at: [cols[c]!, 2.4 - r * 1.25], align: 'start', size: r === 0 || c === 0 ? TYPE.label : TYPE.small, bold: r === 0 || c === 0 }), `compare:${r}:${c}`) : null,
    ).filter((m): m is NonNullable<typeof m> => m !== null)),
    ...[1, 2, 3, 4].map((r) => keyed(new Line([-7.4, 2.4 - r * 1.25 + 0.62], [7.4, 2.4 - r * 1.25 + 0.62], { stroke: s.look.rule, strokeWidth: STROKE.hair }), `compare:rule:${r}`)),
  );
}

/** The picture in words, for a reader who cannot see it. */
export function sayLanes(st: State): string {
  const where = (b: Ball) => IDEAS[b.at];
  const you = `Your ball is at ${where(st.you)}${st.you.stopped ? `, stopped: ${st.you.stopped}` : ''}.`;
  const pain = st.feeling === 'painful' ? ` I'm the cause feels ${PAIN} higher to you than its ground.` : '';
  const machine = `The machine's ball is at ${where(st.machine)} after ${st.machine.pushes} of ${RUN} pushes${st.machine.stopped ? `, stopped: ${st.machine.stopped}` : ''}.`;
  const says = machineSays(st.machine.at, st.feeling);
  const worn = st.you.heights.some((h, i) => h !== SLOPE[i]) ? ' Your slope is worn 0.6 lower where your ball rolled before; the machine\'s is unchanged.' : '';
  return `Throw ${st.throw}. ${you}${pain} ${machine}${says ? ` ${says}.` : ''}${worn}`;
}

export const sayCompare = () =>
  COMPARE.slice(1).map(([what, you, machine]) => `${what}: you, ${you}; the machine, ${machine}`).join('. ') + '.';
