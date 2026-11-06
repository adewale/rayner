import { Scene, Group, Rectangle, Text, Machine, view } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import { MOVES, next, start, type Move, type Tower } from './model.ts';

export default class Hanoi extends Scene<Tower> {
  static meta = {
    id: 'hanoi',
    title: 'How few moves can carry a tower to another peg?',
    answer: 'Three disks need seven moves',
    checks: [{ question: 'Why must the largest disk move exactly once?', answer: 'It can only move onto an empty peg, and the other two disks must be stacked on the third peg first.' }],
  };
  override state = start();

  override async construct() {
    const s = stage(this);
    const { ink } = s.palette;
    const draw = ({ pegs }: Tower) => new Group(
      ...pegs.flatMap((disks, p) => [
        Object.assign(new Rectangle({ width: 0.12, height: 2.6, stroke: 'none', fill: ink }).moveTo([(p - 1) * 4.2, -0.3]), { key: `peg:${p}` }),
        Object.assign(new Text('ABC'[p]!, { fontSize: 0.5, color: ink }).moveTo([(p - 1) * 4.2, -2.2]), { key: `label:${p}` }),
        ...disks.map((d, i) => Object.assign(
          new Rectangle({ width: 0.9 + 0.9 * d, height: 0.5, stroke: ink, strokeWidth: 0.04, fill: s.emphasis, fillOpacity: 0.25 + 0.2 * d })
            .moveTo([(p - 1) * 4.2, -1.3 + 0.55 * i]), { key: `disk:${d}` })),
      ]));
    const tower = view(this, draw);
    const machine = new Machine<Tower, Move>(this, { start: start(), events: MOVES, next, views: [tower] });

    await this.step('start', {
      title: 'Carry the tower from A to C',
      line: 'Predict: how few moves can do it?',
      caption: 'Move one disk at a time, and never put a disk on a smaller one.',
    });
    await s.enter(tower, { describe: () => `Pegs A, B and C: ${this.state.pegs.map(p => p.join(' ') || 'empty').join('; ')}` });

    await this.step('solved', {
      title: 'Answer: seven moves',
      line: 'Three disks need seven moves. Press a move: a refused one says why.',
      caption: 'Three disks need seven moves: carry the top two to B, move disk 3 to C, then carry the two onto it.',
    });
    await this.play(machine.replay(['A→C', 'A→B', 'C→B', 'A→C', 'B→A', 'B→C', 'A→C']));
  }
}
