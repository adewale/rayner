import { Group, Line, Rectangle, Text, keyed } from '../../../src/index.ts';
import { DAY, FIXED_INTERVAL, LIFETIMES } from './model.ts';
import type { LifetimeKey, Rule } from './model.ts';
import { percent } from '../lib/format.ts';

/** The stage's colours the pictures are drawn in. */
export type Ink = { ink: string; emphasis: string; bad: string; soft: string };

/** Gantt dates and the year's axis: hour 0 is the first certificate's notBefore, 1 March 2028 00:00 UTC. */
export const BASE = Date.UTC(2028, 2, 1);
export const stamp = (hours: number) => new Date(BASE + hours * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
export const days = (hours: number) => +(hours / DAY).toFixed(1);
/** A share of a lifetime as a whole percentage. */
export const pct = (x: number) => percent(x, { digits: 0, rounding: 'Math.round' });

// ---- the margin: certificates lined up at expiry, each with the 30-day rule's due point -----------

/** One certificate in the margin picture: its lifetime, the 30-day rule's due point from notBefore, and 30 days' share of its life. */
export interface MarginRow { lifetime: LifetimeKey; hours: number; due: number; share: number }
export const named = (k: LifetimeKey) => `${LIFETIMES[k].label.replace(/ (day|hour)s$/, '-$1')} certificate`;
/** Where the due point falls, in the words each row prints and the caption says. */
export const marginWords = (r: MarginRow) => (r.due < 0 ? `due ${days(-r.due)} days before issue` : `due at day ${days(r.due)}`);
export const ofLife = (share: number, k: LifetimeKey) => {
  const life = `a ${LIFETIMES[k].label.replace(/ (day|hour)s$/, '-$1')} life`;
  return share >= 1 ? `${+share.toFixed(1)} times ${life}` : `${pct(share)} of ${life}`;
};

/**
 * The margin rows: each certificate a bar from issue to expiry, drawn to one time scale and lined up at
 * expiry, with a red 30-day bracket counted back from its right-hand end; where the bracket's tick lies
 * left of a bar, the certificate is due from issue. The rows are the phone's opening, so their words are
 * large enough to read when the rows fill a narrow stage; the words left of the bars, each row's share of
 * its life, wait for the close-up tour. The time scale is the 90-day certificate's, the same in every scenario.
 */
export function drawMargin(marginRows: MarginRow[], { ink, emphasis, bad, soft }: Ink): Group {
  const XE = 6.5,
    perHour = 7.2 / LIFETIMES['90d'].hours,
    xOfExpiry = (fromExpiry: number) => XE + fromExpiry * perHour;
  const size = 0.32;
  const row = (r: MarginRow, y: number) => {
    const left = xOfExpiry(-r.hours),
      dueX = xOfExpiry(-FIXED_INTERVAL),
      yb = y - 0.4;
    const bar = new Rectangle({
      width: XE - left,
      height: 0.34,
      fill: emphasis,
      fillOpacity: 0.2,
      stroke: emphasis,
      strokeWidth: 0.025,
    }).moveTo([(left + XE) / 2, y]);
    const name = new Text(named(r.lifetime), { fontSize: size, color: ink, weight: 'bold', anchor: 'end' }).moveTo(
      [XE, y + 0.5],
      [1, 0],
    );
    const bracket = new Group(
      new Line([dueX, yb], [XE, yb], { stroke: bad, strokeWidth: 0.03 }),
      new Line([XE, yb - 0.08], [XE, yb + 0.08], { stroke: bad, strokeWidth: 0.03 }),
      new Line([dueX, y + 0.2], [dueX, yb - 0.08], { stroke: bad, strokeWidth: 0.04 }),
      new Text('30 days', { fontSize: size, color: bad }).moveTo([(dueX + XE) / 2, yb - 0.33]),
      new Text(marginWords(r), { fontSize: size, color: bad, anchor: 'end' }).moveTo([dueX - 0.15, yb], [1, 0]),
    );
    return new Group(bar, name, bracket);
  };
  const ys = marginRows.length === 1 ? [1.6] : [2.45, 0.78];
  const subjects = marginRows.map((r, i) => keyed(row(r, ys[i]!), `margin:${r.lifetime}`));
  const shares = marginRows.map((r, i) =>
    new Text(`30 days is ${ofLife(r.share, r.lifetime)}`, {
      fontSize: 0.24,
      color: soft,
      anchor: 'end',
    }).moveTo([xOfExpiry(-LIFETIMES['90d'].hours) - 0.35, ys[i]!], [1, 0]),
  );
  return keyed(new Group(...subjects, ...shares), 'margin');
}

// ---- the year: a strip per rule over one axis ----------------------------------------------------

/** One rule's runs over the window: when each certificate was issued, which runs were refused, and the axis it is drawn to. */
export interface YearRun { rule: Rule; issued: number[]; refused: number[]; lifetime: LifetimeKey; window: number }
const X0 = -6.6,
  X1 = 6.0,
  AXIS_Y = -1.9;
const xIn = (run: YearRun) => (hours: number) => X0 + ((X1 - X0) * hours) / run.window;

/** The time axis under the strips: days in March for 160-hour certificates, otherwise the months of a year. */
export function drawAxis(run: YearRun, { soft }: Pick<Ink, 'soft'>): Group {
  const xOf = xIn(run),
    marks: [number, string][] = [];
  if (run.lifetime === '160h') for (let d = 0; d <= 14; d += 2) marks.push([d * DAY, stamp(d * DAY).slice(8, 10) + ' Mar']);
  else
    for (let m = 0; m <= 12; m += 1) {
      const hours = (Date.UTC(2028, 2 + m, 1) - BASE) / 3600e3;
      if (hours <= run.window) marks.push([hours, new Date(BASE + hours * 3600e3).toUTCString().slice(8, 11)]);
    }
  return new Group(
    new Line([X0, AXIS_Y], [X1, AXIS_Y], { stroke: soft, strokeWidth: 0.02 }),
    ...marks.flatMap(([h, label]) => [
      new Line([xOf(h), AXIS_Y], [xOf(h), AXIS_Y - 0.1], { stroke: soft, strokeWidth: 0.02 }),
      new Text(label, { fontSize: 0.22, color: soft }).moveTo([xOf(h), AXIS_Y - 0.32]),
    ]),
  );
}

/**
 * One rule's strip at height `y`, named `name`: a tick at each certificate's issue (the first grey, each
 * later one a renewal), a short red mark at each refused run, and the counts at the right.
 * (A gantt of overlapping certificates piles their labels into the label column.)
 */
export function drawStrip(run: YearRun, y: number, name: string, { ink, emphasis, bad, soft }: Ink): Group {
  const xOf = xIn(run);
  const ticks = run.issued.map((t, i) =>
    new Rectangle({ width: 0.07, height: 0.62, fill: i ? emphasis : soft, stroke: 'none' }).moveTo([xOf(t), y]),
  );
  const refusals = run.refused.map((t) =>
    new Rectangle({ width: 0.07, height: 0.26, fill: bad, stroke: 'none' }).moveTo([xOf(t), y - 0.52]),
  );
  const base = new Line([X0, y - 0.31], [X1, y - 0.31], { stroke: soft, strokeWidth: 0.015 });
  const title = new Text(name, { fontSize: 0.26, color: ink, weight: 'bold', anchor: 'start' }).moveTo([X0, y + 0.62], [-1, 0]);
  const total = new Text(`${run.issued.length - 1}`, { fontSize: 0.4, color: ink, weight: 'bold' }).moveTo([X1 + 0.75, y + 0.12]);
  const unit = new Group(
    new Text('renewals', { fontSize: 0.2, color: soft }).moveTo([X1 + 0.75, y - 0.25]),
    ...(run.refused.length
      ? [new Text(`${run.refused.length} refused`, { fontSize: 0.2, color: bad }).moveTo([X1 + 0.75, y - 0.55])]
      : []),
  );
  return new Group(base, ...ticks, ...refusals, title, total, unit);
}
