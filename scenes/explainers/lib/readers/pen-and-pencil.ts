import { Group, VMobject } from '../../../../src/index.ts';
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
      caption: `First the failure, as a model. Suppose the hand draws the four period boxes itself: each side starts where the last one ended, up to ${FREEHAND.angle}° and ${FREEHAND.length * 100}% off, and the pen moves on to the next box from where it lifted. Every error is carried into every later corner. Two drawings with different seeds put the same box as much as ${worst.toFixed(2)} units apart, about ${px(worst)} on a page 1280 px wide, so names laid out once no longer line up with the boxes drawn round them.`,
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
      caption: `The blue band is a route fixed before any ink: its corners and its ends. The same simulated hand, a spring shaken by tremor, draws both strokes along it. Neither strays more than ${stray.toFixed(3)} units, about ${px(stray)}, and the two drawings lie within ${between.toFixed(3)} units of each other, so the hand still makes every wobble but no longer decides where anything goes. The fix for the drifting boxes is to lay the chart out first and let the hand only trace it, so a new drawing changes the strokes but never the boxes.`,
      values: { seed, stray, between, target, ink: seed === SEEDS.first ? ink.first : ink.second },
      draw: (s) =>
        new Group(
          path(target, BAND, 0.32, 0.45),
          path(ink.first, GREY, 0.04, 0.9),
          path(ink.second, s.palette.ink, 0.04),
          label('Blue: the route the layout fixed', 0, 2.55, s.palette.ink, 0.62),
          label(`Two drawings, within ${stray.toFixed(3)} units of it`, 0, -2.9, s.palette.ink, 0.62),
        ),
    },
  ];
}
