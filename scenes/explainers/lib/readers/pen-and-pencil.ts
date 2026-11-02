import { Group, VMobject, Circle, Line } from '../../../../src/index.ts';
import type { Vec } from '../../../../src/index.ts';
import { hand, HAND, FREEHAND, freehand, rng, deviation, boxPolygon } from '../pen-and-pencil.ts';
import type { Pt, Box } from '../pen-and-pencil.ts';
import { label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';

/** The two drawings the plate compares: the first in grey, the second in ink. */
export const SEEDS = { first: 1967, second: 7 } as const;
export const GREY = '#6f6a66';
const BAND = '#69a9cf';
const DASHED = '#c0584a';
/** The stage is 16 units wide, so a page 1280 px wide draws a unit 80 px long. */
export const PX_PER_UNIT = 1280 / 16;
export const px = (units: number) => `${(units * PX_PER_UNIT).toFixed(1)} px`;

/** Four period boxes in a row, as a layout would place them; their names sit at the centres. */
const NAMES = ['Dusk', 'Midnight', 'Small hours', 'Dawn'];
const W = 3,
  H = 1.1,
  PITCH = 3.55,
  X0 = -7.1,
  TOP = 1.2;
const laid: Box[] = NAMES.map((_, i) => [X0 + i * PITCH, TOP - H, X0 + i * PITCH + W, TOP]);

/**
 * The four boxes drawn by a hand that places its own strokes: each side starts where the last one
 * ended, and the pen moves on to the next box from where it lifted. Every box is drawn left to right.
 */
function freeBoxes(seed: number): Pt[][] {
  const moves: Pt[] = [];
  NAMES.forEach((_, i) => {
    moves.push([W, 0], [0, -H], [-W, 0], [0, H]);
    if (i < NAMES.length - 1) moves.push([PITCH, 0]);
  });
  const corners = freehand([X0, TOP], moves, FREEHAND, rng(seed + 3));
  // Five corners per box (the fifth closes it, or nearly), then one pen-up move.
  return NAMES.map((_, i) => corners.slice(i * 5, i * 5 + 5));
}
const offset = (a: readonly Pt[], b: readonly Pt[]) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1])));

export function frames(seed: number): ReaderFrame[] {
  // The failure: both drawings place their own boxes, and the boxes drift apart.
  const free = { first: freeBoxes(SEEDS.first), second: freeBoxes(SEEDS.second) };
  const apart = NAMES.map((_, i) => offset(free.first[i]!, free.second[i]!));
  // The laid-out corners in the order the hand draws them: top left, top right, bottom right, bottom left, top left.
  const closed = (b: Box): Pt[] => [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]], [b[0], b[3]]];
  const fromLayout = NAMES.map((_, i) => Math.max(offset(free.first[i]!, closed(laid[i]!)), offset(free.second[i]!, closed(laid[i]!))));
  const freeInk = {
    first: free.first.map((b) => hand(b, HAND, rng(SEEDS.first))),
    second: free.second.map((b) => hand(b, HAND, rng(SEEDS.second))),
  };
  // The fix: one route, fixed first, traced by both drawings.
  const target: Pt[] = [
    [-6, 1],
    [-2, 1],
    [-2, -1.5],
    [3, -1.5],
    [3, 1],
    [6, 1],
  ];
  const ink = { first: hand(target, HAND, rng(SEEDS.first)), second: hand(target, HAND, rng(SEEDS.second)) };
  const stray = Math.max(deviation(ink.first, target), deviation(ink.second, target));
  const between = Math.max(deviation(ink.first, ink.second), deviation(ink.second, ink.first));
  // Where the two drawings are furthest apart: the second drawing's point furthest from the first.
  const far = ink.second.reduce(
    (best, p) => {
      const d = deviation([p], ink.first);
      return d > best.d ? { p, d } : best;
    },
    { p: ink.second[0]!, d: -1 },
  );
  /** The inset: a window LENS units either side of that point, magnified ZOOM times, drawn at INSET. */
  const LENS = 0.025,
    ZOOM = 36,
    INSET: Pt = [0.5, -0.2];
  const lensed = (points: readonly Pt[]): Pt[][] => {
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (const q of points) {
      const dx = q[0] - far.p[0],
        dy = q[1] - far.p[1];
      if (Math.hypot(dx, dy) <= LENS) run.push([INSET[0] + dx * ZOOM, INSET[1] + dy * ZOOM]);
      else if (run.length) runs.push(run), (run = []);
    }
    if (run.length) runs.push(run);
    return runs.filter((r) => r.length > 1);
  };
  const near = far.d;
  // The picture shows the dark line inside the wide grey one everywhere; refuse to draw it otherwise.
  if (between > 0.06 - 0.0175) throw new Error(`The two drawings are ${between} apart, wider than the grey line shows`);
  // One path per polyline: a hand's stroke has hundreds of points.
  const path = (points: readonly Pt[], color: string, width: number, opacity = 1, dash?: string) => {
    const vm = new VMobject({ stroke: color, strokeWidth: width, strokeOpacity: opacity, fill: 'none', lineCap: 'round', lineJoin: 'round' });
    vm.startNewPath(points[0]! as Vec);
    for (const q of points.slice(1)) vm.addLineTo(q as Vec);
    if (dash) vm.style.dashArray = dash;
    return vm;
  };
  const worst = Math.max(...apart);
  return [
    {
      id: 'reader-drift',
      title: 'If the hand places the boxes, a second drawing moves them',
      line: 'Grey: the first drawing. Dark: the second. Dashed: where the boxes belong.',
      caption: `Each imperfect move changes where the next one begins, so every error is carried into every later corner. Across four boxes the small deviations accumulate: two seeds place the same box as much as ${worst.toFixed(2)} units apart. Could the pen wobble without deciding the next box’s position?`,
      values: { apart: apart.map((d) => Number(d.toFixed(3))), fromLayout: fromLayout.map((d) => Number(d.toFixed(3))) },
      draw: (s) =>
        new Group(
          ...laid.map((b) => path([...boxPolygon(b), boxPolygon(b)[0]!], DASHED, 0.03, 0.8, '0.12 0.1')),
          ...freeInk.first.map((l) => path(l, GREY, 0.045, 0.9)),
          ...freeInk.second.map((l) => path(l, s.palette.ink, 0.045)),
          ...NAMES.map((n, i) => label(n, (laid[i]![0] + laid[i]![2]) / 2, (laid[i]![1] + laid[i]![3]) / 2, s.palette.ink, 0.42)),
          label(`Up to ${worst.toFixed(2)} units apart: the boxes moved`, 0, -2.3, s.palette.ink, 0.56),
        ),
    },
    {
      id: 'reader-separate',
      title: 'With the route fixed first, two drawings stay on it',
      line: 'Blue band: the route the layout fixed. Grey and dark: two drawings of it.',
      caption: `The route now fixes the corners before drawing. A simulated pen follows it like a mass pulled by a damped spring, and the next stroke starts from its own fixed mark. The magnifier shows different ink near the same route. The fix, in this hand model: lay the chart out first and let the hand only trace it, so a new drawing changes each stroke’s wobble and leaves every box where the layout put it.`,
      values: { seed, stray, between, target, ink: seed === SEEDS.first ? ink.first : ink.second },
      draw: (s) => {
        const lens = new Circle({ radius: LENS * ZOOM, stroke: s.soft, strokeWidth: 0.025, fill: s.palette.paper, fillOpacity: 1 }).moveTo(INSET as Vec);
        const spot = new Circle({ radius: 0.09, stroke: s.soft, strokeWidth: 0.025 }).moveTo(far.p as Vec);
        const lead = new Line(far.p as Vec, [INSET[0], INSET[1] - LENS * ZOOM] as Vec, { stroke: s.soft, strokeWidth: 0.02 });
        lead.style.dashArray = '0.06 0.05';
        return new Group(
          path(target, BAND, 0.32, 0.45),
          path(ink.first, GREY, 0.12, 0.55),
          path(ink.second, s.palette.ink, 0.035),
          spot,
          lead,
          lens,
          ...lensed(ink.first).map((r) => path(r, GREY, 0.07, 0.8)),
          ...lensed(ink.second).map((r) => path(r, s.palette.ink, 0.035)),
          label('Blue: the route the layout fixed', 0, 2.55, s.palette.ink, 0.62),
          label(`×${ZOOM}: ${near.toFixed(3)} apart`, INSET[0], INSET[1] + LENS * ZOOM + 0.42, s.palette.ink, 0.62),
          label(`Two drawings, within ${stray.toFixed(3)} units of it`, 0, -2.9, s.palette.ink, 0.62),
        );
      },
    },
  ];
}
