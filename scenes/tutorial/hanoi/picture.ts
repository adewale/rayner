import { Group, Rectangle, Text, lerpColor, keyed } from '../../../src/index.ts';
import type { Tower } from './model.ts';

/** The stage's colours a tower is drawn in. */
export type Ink = { ink: string; paper: string; emphasis: string };

/**
 * One arrangement of `n` disks: a floor wider than any arrangement (so the frame holds still), then
 * each peg, its letter, and its disks bottom first, numbered. A disk keeps its key, so a move slides it.
 */
export function drawTower({ pegs }: Tower, n: number, { ink, paper, emphasis }: Ink): Group {
  const peg = 0.55 * n + 0.7;
  return new Group(
    keyed(new Rectangle({ width: 10, height: 0.08, stroke: 'none', fill: ink }).moveTo([0, -1.6]), 'floor'),
    ...pegs.flatMap((disks, p) => {
      const x = (p - 1) * 3.3;
      return [
        keyed(new Rectangle({ width: 0.12, height: peg, stroke: 'none', fill: ink }).moveTo([x, -1.6 + peg / 2]), `peg:${p}`),
        keyed(new Text('ABC'[p]!, { fontSize: 0.5, color: ink }).moveTo([x, -2.2]), `letter:${p}`),
        ...disks.flatMap((d, i) => [
          keyed(new Rectangle({ width: 0.6 + 0.6 * d, height: 0.5, stroke: ink, strokeWidth: 0.04, fill: lerpColor(paper, emphasis, 0.25 + 0.15 * d) })
            .moveTo([x, -1.3 + 0.55 * i]), `disk:${d}`),
          keyed(new Text(String(d), { fontSize: 0.42, color: ink }).moveTo([x, -1.3 + 0.55 * i]), `number:${d}`),
        ]),
      ];
    }),
  );
}

/** The arrangement in words, for a reader who cannot see the picture. */
export const sayTower = ({ pegs }: Tower) =>
  `Pegs, bottom disk first. ${pegs.map((p, i) => `${'ABC'[i]}: ${p.join(', ') || 'empty'}`).join('; ')}`;
