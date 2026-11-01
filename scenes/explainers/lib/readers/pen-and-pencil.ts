import { Group, Line, Rectangle, Text } from '../../../../src/index.ts';
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
      title: 'Can a hand-drawn line keep its layout?',
      line: 'Fix the route first; vary the stroke second.',
      caption: `The blue route fixes the corners and endpoints. The damped-spring hand adds seeded tremor, keeping the dark stroke within ${stray.toFixed(3)} scene units of that route. Changing the seed varies the ink while preserving the route.`,
      values: { seed, stray, target, ink },
      draw: (s) => {
        const path = (points: readonly (readonly [number, number])[], color: string, width: number) =>
          new Group(...points.slice(1).map((q, i) => new Line(points[i]!, q, { stroke: color, strokeWidth: width })));
        return new Group(
          path(target, '#69a9cf', 0.08),
          path(ink, s.palette.ink, 0.04),
          label('Fixed route + simulated stroke', 0, 2.7, s.palette.ink, 0.7),
          label('The corners belong to the layout', 0, -3, s.soft, 0.7),
        );
      },
    },
    {
      id: 'reader-labels',
      title: 'What should the pen leave alone?',
      line: 'Reserve the word’s space before adding decoration.',
      caption:
        'The blue box reserves space for Midnight. Decoration stays outside it, keeping hatching and stroke wobble away from the letters. The final timeline applies the same separation to its labels.',
      values: { label: 'Midnight', reserved: true },
      draw: (s) => {
        const word = new Text('Midnight', { fontSize: 1, color: s.palette.ink }).moveTo([0, 0.6]),
          box = word.box()!;
        const g = new Group(
          new Rectangle({
            width: box[2] - box[0] + 0.5,
            height: box[3] - box[1] + 0.5,
            fill: 'none',
            stroke: '#69a9cf',
            strokeWidth: 0.035,
          }).moveTo([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]),
          word,
          label('Reserved for the label', 0, 2.7, s.soft, 0.7),
        );
        for (const y of [-2, -1.6, -1.2])
          g.add(new Line([-6.5, y], [6.5, y + 0.5], { stroke: s.soft, strokeWidth: 0.035 }));
        return g;
      },
    },
  ];
}
