import { Group, Line } from '../../../../src/index.ts';
import { hand, HAND, rng, deviation } from '../pen-and-pencil.ts';
import { label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(seed: number): ReaderFrame[] {
  const target: [number, number][] = [
      [-6, 1],
      [-2, 1],
      [-2, -1.5],
      [3, -1.5],
      [3, 1],
      [6, 1],
    ],
    ink = hand(target, HAND, rng(seed)),
    stray = deviation(ink, target);
  return [
    {
      id: 'reader-separate',
      title: 'Fix the route first; the hand only follows it',
      line: 'Blue band: the route the layout fixed. Dark line: the hand’s stroke along it.',
      caption: `The trick, on one line: lay the chart out first and let the hand only trace it, so a new drawing changes the strokes but never the boxes. The blue route fixes the corners and the ends. A simulated hand, a spring shaken by tremor, draws the dark stroke along it and strays at most ${stray.toFixed(3)} units, so the stroke stays inside the band. Another seed gives another stroke on the same route.`,
      values: { seed, stray, target, ink },
      draw: (s) => {
        const path = (points: readonly (readonly [number, number])[], color: string, width: number, opacity = 1) =>
          new Group(
            ...points
              .slice(1)
              .map((q, i) => new Line(points[i]!, q, { stroke: color, strokeWidth: width, strokeOpacity: opacity, lineCap: 'round' })),
          );
        return new Group(
          path(target, '#69a9cf', 0.32, 0.45),
          path(ink, s.palette.ink, 0.04),
          label('Blue: the route the layout fixed', 0, 2.55, s.palette.ink, 0.62),
          label(`Dark: the hand’s stroke, within ${stray.toFixed(3)} of it`, 0, -2.9, s.palette.ink, 0.62),
        );
      },
    },
  ];
}
