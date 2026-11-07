import { keyed } from '../../../explain/drawing.ts';
import { Rectangle, Text, Group, Circle, Cross, Line, Arrow } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { counted } from '../lib/format.ts';

/** The stage's colours these pictures are drawn in. */
export type Ink = { ink: string; soft: string; good: string; bad: string; emphasis: string };

/** One rate's ten requests as a step records them: each answer (200 or 429), and the tokens R10 finds. */
export interface RateRun { rate: number; offered: boolean; responses: number[]; found: number }
/** The opening steps' state: the offered rates' answers, each rate's run, and the rate the page never built. */
export interface SentenceState { offered: { rate: number; r10: number }[]; runs: RateRun[]; pending: { rate: number } }
/** A setting as a scene declares it. */
interface Setting { id: string; label: string; default: string; options: { value: string; label: string }[] }
/** The token bucket's rate setting, each scenario it makes with R10's answer there, and where two links land. */
export interface Choice {
  setting: Setting;
  scenarios: { rate: string; r10: number; default: boolean }[];
  links: { asked: string; opens: string; refused?: string }[];
}
/** The 'fork' step on the page: seconds moving, seconds still, and the words its caption holds. */
export interface Timing { motion: number; held: number; words: number }
export const perSecond = (r: number) => `${counted(r, 'token')} a second`;

// The rows of answers: a column per request, R10's last, and a row per rate.
const pitch = 0.82,
  x0 = -2.9,
  labelX = -7.4;
const rowY = (i: number) => 1.15 - i * 1.05;
/** The x of the last request's column, R10's. */
const lastX = (requests: number) => x0 + pitch * (requests - 1);

/** One rate's row of answers, drawn from its run: a circle for 200, a cross for 429, and what R10 finds. */
function rateRow(run: RateRun, i: number, c: Ink) {
  const g = new Group();
  const y = rowY(i);
  g.add(
    new Text(run.offered ? perSecond(run.rate) : `${perSecond(run.rate)}, not offered`, {
      fontSize: 0.26,
      color: run.offered ? c.ink : c.bad,
      anchor: 'start',
    }).moveTo([labelX, y], [-1, 0]),
  );
  run.responses.forEach((code, j) => {
    const ok = code === 200;
    const circle = new Circle({ radius: 0.2, stroke: ok ? c.good : c.bad, strokeWidth: 0.05 }).moveTo([x0 + j * pitch, y]);
    const mark: Mobject = ok ? circle : new Cross(circle, { stroke: c.bad, strokeWidth: 0.05 });
    mark.key = `call:${run.rate}:R${j + 1}`;
    g.add(mark);
  });
  const accepted = run.responses.at(-1) === 200;
  g.add(
    new Text(`R10 finds ${run.found.toFixed(1)}`, { fontSize: 0.24, font: 'mono', color: accepted ? c.ink : c.bad, anchor: 'start' }).moveTo(
      [lastX(run.responses.length) + 0.75, y],
      [-1, 0],
    ),
  );
  g.key = `rate:${run.rate}`;
  return g;
}
/** The outline round R10's column, down through `rows` rows. */
const column = (rows: number, requests: number, c: Ink) =>
  new Rectangle({ width: 0.62, height: rows * 1.05 + 0.5, stroke: c.emphasis, strokeWidth: 0.04, cornerRadius: 0.1 }).moveTo([
    lastX(requests),
    2.05 - (rows * 1.05 + 0.5) / 2 + 0.25,
  ]);

/** The offered rates' rows, R10's column outlined, with the header and the key. */
export function drawOffered(st: SentenceState, c: Ink): Group {
  const offered = st.runs.filter((r) => r.offered);
  const header = new Group();
  offered[0]!.responses.forEach((_, i) =>
    header.add(new Text(`R${i + 1}`, { fontSize: 0.26, color: c.ink }).moveTo([x0 + i * pitch, 2.05])),
  );
  header.add(new Text('Request', { fontSize: 0.26, color: c.soft, anchor: 'start' }).moveTo([labelX, 2.05], [-1, 0]));
  const key = new Text('circle: 200, accepted · cross: 429, refused · a request needs 1 token', { fontSize: 0.22, color: c.soft }).moveTo([0, -3.2]);
  return new Group(
    keyed(header, 'fork-header'),
    ...offered.map((r, i) => rateRow(r, i, c)),
    keyed(column(offered.length, offered[0]!.responses.length, c), 'fork-r10'),
    keyed(key, 'fork-key'),
  );
}

/** Under the offered rates, the rate the page never built: a question mark until its run is in the state, then its row. */
export function drawUnbuilt(st: SentenceState, requests: number, c: Ink): Mobject {
  const { runs: all, pending } = st;
  const slow = all.find((r) => !r.offered);
  const offered = all.filter((r) => r.offered).length;
  if (slow) return rateRow(slow, offered, c).shift([0, -0.25]);
  return keyed(
    new Group(
      new Text(`${perSecond(pending.rate)}, not offered`, { fontSize: 0.26, color: c.soft, anchor: 'start' }).moveTo([labelX, rowY(offered) - 0.25], [-1, 0]),
      new Text('?', { fontSize: 0.5, color: c.soft, weight: 'bold' }).moveTo([lastX(requests), rowY(offered) - 0.25]),
    ),
    'fork-pending',
  );
}

/**
 * The scenarios the setting makes, the slot a 0.1 scenario would fill, and where each link lands: a
 * listed rate's link points at its scenario; the refused one points at the empty slot and falls back
 * along the left side to the default scenario.
 */
export function drawChoice(choice: Choice, c: Ink): Group {
  const { setting, scenarios: built, links: asked } = choice;
  const [listed, refusedLink] = asked as [Choice['links'][number], Choice['links'][number]];
  const W = 3.1,
    H = 0.68,
    pitch = 0.8,
    top = 1.3;
  const y = (i: number) => top - i * pitch;
  const slotY = y(built.length);
  const left = -W / 2,
    right = W / 2;
  const two = (a: string, b: string, at: number, color: string, colorB = c.soft) =>
    new Group(
      new Text(a, { fontSize: 0.28, color, anchor: 'start' }).moveTo([left + 0.18, at + 0.15], [-1, 0]),
      new Text(b, { fontSize: 0.25, color: colorB, anchor: 'start' }).moveTo([left + 0.18, at - 0.16], [-1, 0]),
    );
  const scenarios = new Group();
  built.forEach((o, i) => {
    scenarios.add(
      new Rectangle({ width: W, height: H, stroke: o.default ? c.emphasis : c.ink, strokeWidth: o.default ? 0.05 : 0.025, cornerRadius: 0.08 }).moveTo([0, y(i)]),
      two(perSecond(Number(o.rate)), `R10: ${o.r10}, checked`, y(i), c.ink, o.r10 === 200 ? c.good : c.bad),
    );
  });
  // Where a 0.1 scenario would sit: the build made none.
  const slot = new Rectangle({ width: W, height: H, stroke: c.bad, strokeWidth: 0.03, cornerRadius: 0.08, fill: 'none' }).moveTo([0, slotY]);
  slot.style.dashArray = '0.14 0.1';
  scenarios.add(slot, two(`${perSecond(Number(refusedLink.asked))}`, 'no scenario: never built', slotY, c.bad, c.bad));
  scenarios.key = 'fork-choice-scenarios';
  // The setting's name labels the column, beside its first scenario, clear of the fallback's path below.
  const heading = new Group(
    new Text(setting.label, { fontSize: 0.3, color: c.ink, weight: 'bold', anchor: 'end' }).moveTo([left - 0.3, top + 0.16], [1, 0]),
    new Text(`${built.length} scenarios`, { fontSize: 0.26, color: c.soft, anchor: 'end' }).moveTo([left - 0.3, top - 0.17], [1, 0]),
  );
  // Links come in from the right.
  const arrow = (from: number, to: number, at: number, color: string) =>
    new Arrow([from, at], [to, at], { stroke: color, strokeWidth: 0.04, tipLength: 0.22, tipWidth: 0.2 });
  const linkX = right + 1.5;
  const link = (text: string, at: number, color: string) =>
    new Group(
      new Text(text, { font: 'mono', fontSize: 0.3, color, anchor: 'start' }).moveTo([linkX + 0.15, at], [-1, 0]),
      arrow(linkX, right + 0.08, at, color),
    );
  const index = (rate: string) => built.findIndex((o) => o.rate === rate);
  const four = link(`?rate=${listed.asked}`, y(index(listed.opens)), c.ink);
  const unknown = link(`?rate=${refusedLink.asked}`, slotY, c.bad);
  const defaultY = y(built.findIndex((o) => o.default));
  const tag = new Text('the default scenario', { fontSize: 0.3, color: c.emphasis, anchor: 'start' }).moveTo([right + 0.3, defaultY], [-1, 0]);
  // Refused, the link falls back along the left side to the default scenario.
  const back = left - 0.5,
    to = y(index(refusedLink.opens));
  const redirect = new Group(
    new Line([left - 0.05, slotY], [back, slotY], { stroke: c.emphasis, strokeWidth: 0.04 }),
    new Line([back, slotY], [back, to], { stroke: c.emphasis, strokeWidth: 0.04 }),
    arrow(back, left - 0.08, to, c.emphasis),
  );
  redirect.key = 'fork-choice-fallback';
  const refusal = new Group(
    new Text(String(refusedLink.refused), { fontSize: 0.28, color: c.bad }).moveTo([0, slotY - H / 2 - 0.4]),
    new Text('so the page opens the default scenario', { fontSize: 0.28, color: c.emphasis }).moveTo([0, slotY - H / 2 - 0.8]),
  );
  return new Group(heading, scenarios, tag, four, unknown, redirect, refusal);
}

/** One bar per phase of the 'fork' step, to scale: moving, then still under its caption. */
export function drawTimeline(t: Timing, c: Ink): Group {
  const unit = 11 / (t.motion + t.held),
    bx = -5.5,
    y = -2.85;
  const phase = (from: number, len: number, fill: string, label: string, key: string) => {
    const bar = new Rectangle({ width: len * unit, height: 0.55, fill, fillOpacity: 0.85, stroke: 'none' }).moveTo([
      bx + (from + len / 2) * unit,
      y,
    ]);
    const text = new Text(label, { fontSize: 0.24, color: c.ink }).moveTo([bx + (from + len / 2) * unit, y - 0.6]);
    return keyed(new Group(bar, text), key);
  };
  return new Group(
    keyed(
      new Text(`Step 'fork' on the page: ${(t.motion + t.held).toFixed(1)} s`, {
        fontSize: 0.26,
        color: c.ink,
        weight: 'bold',
      }).moveTo([0, -1.85]),
      'timing:title',
    ),
    phase(0, t.motion, c.emphasis, `moving: ${t.motion.toFixed(1)} s`, 'timing:moving'),
    phase(t.motion, t.held, c.soft, `still, caption of ${t.words} words: ${t.held.toFixed(1)} s`, 'timing:still'),
  );
}
