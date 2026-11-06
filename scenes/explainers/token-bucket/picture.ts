import { Axes, Circle, Cross, Group, Rectangle, Text } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { keyedParts } from '../../../explain/drawing.ts';
import type { BucketCall as Call, BucketState } from './model.ts';

/** The stage's colours the pictures are drawn in. */
export type Ink = { ink: string; soft: string; muted: string; paper: string; accent: string; good: string; bad: string };

export const fmt = (n: number) => n.toFixed(1);
export const name = (i: number) => 'R' + (i + 1);
/** Before the first call, the bucket is full at time 0. */
export const startOf = (capacity: number) => ({ at: 0, after: capacity });

/**
 * The balance between the previous call and this one, as allow() would
 * compute it at each moment: what the last call left plus
 * (now − lastRefill) × rate, capped at `capacity`. Straight, with a corner where the
 * cap is reached; it ends at what this call found.
 */
export function climb(prev: { at: number; after: number }, call: Call, rate: number, capacity: number): [number, number][] {
  const points: [number, number][] = [[prev.at, prev.after]];
  if (prev.after + (call.at - prev.at) * rate > capacity + 1e-9)
    points.push([prev.at + (capacity - prev.after) / rate, capacity]);
  points.push([call.at, call.found]);
  return points;
}
/** When a climb from `prev` to `call` reached the capacity, where min(capacity, …) took over; null when it stayed under. */
export const cappedAt = (prev: { at: number; after: number }, call: Call, rate: number, capacity: number) =>
  prev.after + (call.at - prev.at) * rate > capacity + 1e-9 ? prev.at + (capacity - prev.after) / rate : null;
/** Drop repeated points; a line needs two distinct ones. */
export const distinct = (points: [number, number][]) =>
  points.filter((p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1]);
/** A stretch of the balance line on the chart's axes; null when it has fewer than two distinct points. */
export const balanceLine = (axes: Axes, points: [number, number][], color: string, width = 0.045) => {
  const p = distinct(points);
  return p.length < 2 ? null : axes.lineGraph(p, { color, strokeWidth: width });
};

// ---- request chips: one per call, filled in as each answer comes back. The answer is all a
// chip holds, large enough to read on a phone in the whole picture, since a reader's press can
// change any of the ten; each request's name and arrival time are written around its box.
const PITCH = 1.46;
export const CHIP_Y = 2.3;
export const chipX = (i: number) => (i - 4.5) * PITCH;

/** Request `i`'s box: dashed and empty while it waits, then its answer in the good or bad colour. */
export function drawRequest(i: number, result: boolean | null, { ink, soft, muted, paper, good, bad }: Ink): Group {
  const color = result == null ? muted : result ? good : bad;
  const box = new Rectangle({
    width: 1.3,
    height: 0.95,
    cornerRadius: 0.1,
    fill: result == null ? paper : color,
    fillOpacity: result == null ? 1 : 0.22,
    stroke: color,
    strokeWidth: result == null ? 0.02 : 0.035,
    ...(result == null ? { dashArray: '0.08 0.06' } : {}),
  });
  const answer = new Text(result == null ? '…' : result ? '200' : '429', {
    fontSize: 0.58,
    font: 'mono',
    weight: 'bold',
    color: result == null ? soft : ink,
  }).moveTo([0, 0]);
  const request = new Group(box, answer).moveTo([chipX(i), CHIP_Y]);
  request.key = `request:${name(i)}`;
  return request;
}
/** Each request's arrival time above its box and its name below. */
export function drawArrivals(times: readonly number[], { soft }: Pick<Ink, 'soft'>) {
  const arrivals = times.map((t, i) => new Text('t = ' + t, { fontSize: 0.2, color: soft }).moveTo([chipX(i), CHIP_Y + 0.72]));
  arrivals.forEach((time, i) => { time.key = `arrival:${name(i)}`; });
  const names = times.map((_, i) => Object.assign(new Text(name(i), { fontSize: 0.2, color: soft }).moveTo([chipX(i), CHIP_Y - 0.66]), { key: `name:${name(i)}` }));
  return { times: arrivals, names };
}

/**
 * Each call's climb, its drop when it spent a token, its dot, and the tags on the calls the captions name,
 * on the chart's axes; `last` is the index of the schedule's last request, whose cap note the captions name.
 */
export function drawChart(st: BucketState, axes: Axes, { rate, capacity, last }: { rate: number; capacity: number; last: number }, { accent, good, bad }: Ink): Group {
  const pic = keyedParts(), add = (m: Mobject | null, key: string) => { if (m) pic.add(m, key); };
  const notes: Mobject[] = [];
  st.calls.forEach((call, i) => {
    const prev = st.calls[i - 1] ?? startOf(capacity);
    add(balanceLine(axes, climb(prev, call, rate, capacity), accent), `balance:refill:${name(i)}`);
    add(call.ok ? balanceLine(axes, [[call.at, call.found], [call.at, call.after]], accent) : null, `balance:spend:${name(i)}`);
    const dot = axes.dot(call.at, call.found, { radius: 0.085, color: call.ok ? good : bad });
    add(dot, `balance:found:${name(i)}`);
    // Refused calls are named by their dot; R7, the predicted call, also shows what it found.
    if (i === 6)
      // R7: centred above its dot, between the climb into it and the climb out.
      add(new Text(`${name(i)}: ${fmt(call.found)}`, { fontSize: 0.22, color: call.ok ? good : bad }).moveTo([dot.center()[0], dot.center()[1] + 0.32], [0, 0]), 'balance:found:R7:value');
    else if (!call.ok)
      // Refused: above and to the left, since the line climbs away to the right.
      add(new Text(name(i), { fontSize: 0.2, color: bad }).moveTo([dot.center()[0] - 0.12, dot.center()[1] + 0.28], [1, 0]), `balance:tag:${name(i)}`);
    // The flat run along five is the refill min(5, …) threw away; say so where it is.
    const full = cappedAt(prev, call, rate, capacity);
    if (full != null) {
      const [x, y] = axes.c2p((full + call.at) / 2, capacity);
      const note = new Text('full: min(5, …)', { fontSize: 0.2, color: accent }).moveTo([x, y + 0.24]);
      note.key = i === last ? 'balance:cap:note' : `balance:cap:note:${name(i)}`;
      notes.push(note);
    }
  });
  return new Group(...pic.group().children, ...notes);
}

/**
 * The closing comparison: a row per refill rate, a circle for each 200 and a cross for each 429, request
 * numbers along the top, and this scenario's row outlined. Large, so a phone reader sees all three rates together.
 */
export function drawComparison(rows: readonly (readonly [number, readonly number[]])[], chosen: number, count: number, { ink, accent, good, bad }: Ink): Group {
  const picture = new Group();
  const first = -3.7,
    pitch = 1.12;
  for (let i = 0; i < count; i++)
    picture.add(new Text(String(i + 1), { fontSize: 0.7, color: ink }).moveTo([first + i * pitch, 2.5]));
  for (const [row, [r, responses]] of rows.entries()) {
    const y = 1.05 - row * 1.65;
    picture.add(new Text(`${r} / s`, { fontSize: 0.7, color: ink }).moveTo([-6.25, y]));
    if (r === chosen)
      picture.add(
        new Rectangle({
          width: 14.4,
          height: 1.3,
          cornerRadius: 0.12,
          stroke: accent,
          strokeWidth: 0.05,
        }).moveTo([0, y]),
      );
    for (const [i, response] of responses.entries()) {
      const circle = new Circle({
        radius: 0.24,
        stroke: response === 200 ? good : bad,
        strokeWidth: 0.06,
      }).moveTo([first + i * pitch, y]);
      const mark = response === 200 ? circle : new Cross(circle, { stroke: bad, strokeWidth: 0.06 });
      mark.key = `result:${r}:R${i + 1}:${response}`;
      picture.add(mark);
    }
  }
  picture.add(new Text('Request', { fontSize: 0.7, color: ink }).moveTo([-6.0, 2.5]));
  picture.add(new Text('Circle: 200     Cross: 429', { fontSize: 0.7, color: ink }).moveTo([0, -3.8]));
  return picture;
}
