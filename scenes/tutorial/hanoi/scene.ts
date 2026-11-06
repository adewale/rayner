import { Scene, Group, Rectangle, Text, Machine, view, lerpColor } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { MOVES, next, solve, start, type Move, type Tower } from './model.ts';

const key = <T extends object>(part: T, name: string) => Object.assign(part, { key: name });
const say = (t: Tower) => t.pegs.map((p, i) => `${'ABC'[i]}: ${p.join(', ') || 'empty'}`).join('; ');

export default class Hanoi extends Scene<Tower> {
  static meta = {
    id: 'hanoi',
    title: 'How few moves can carry a tower to another peg?',
    answer: 'the smaller tower moves twice and the largest disk once',
    checks: [
      { question: 'Suppose the tower must end on B instead. Where must disks 1 and 2 be when disk 3 moves?', answer: 'On C: disk 3 needs B empty to land there, so the smaller tower waits on the other peg.' },
      { question: 'How few moves carry five disks, and why?', answer: '31: the four-disk tower moves twice, 15 moves each time, and disk 5 moves once.' },
    ],
  };
  static settings = [{ id: 'disks', label: 'Disks', default: '3', options: [{ value: '3', label: '3' }, { value: '4', label: '4' }] }];
  override state = start(3);

  override async construct() {
    const n = Number(settingsOf(this).disks), moves = solve(n), few = (moves.length - 1) / 2;
    const smaller = n === 3 ? 'disks 1 and 2' : `disks 1 to ${n - 1}`;
    this.state = start(n);
    const s = stage(this);
    const { ink, paper } = s.palette;
    // A floor wider than any arrangement, so the frame holds still; then each peg, its letter, and its
    // disks bottom first. A disk keeps its key, so a move slides it.
    const floor = () => key(new Rectangle({ width: 13, height: 0.08, stroke: 'none', fill: ink }).moveTo([0, -1.6]), 'floor');
    const draw = ({ pegs }: Tower) => new Group(floor(), ...pegs.flatMap((disks, p) => {
      const x = (p - 1) * 4.2;
      return [
        key(new Rectangle({ width: 0.12, height: 0.55 * n + 0.7, stroke: 'none', fill: ink }).moveTo([x, -1.6 + (0.55 * n + 0.7) / 2]), `peg:${p}`),
        key(new Text('ABC'[p]!, { fontSize: 0.5, color: ink }).moveTo([x, -2.2]), `letter:${p}`),
        ...disks.flatMap((d, i) => [
          key(new Rectangle({ width: 0.8 + 0.75 * d, height: 0.5, stroke: ink, strokeWidth: 0.04, fill: lerpColor(paper, s.emphasis, 0.25 + 0.15 * d) })
            .moveTo([x, -1.3 + 0.55 * i]), `disk:${d}`),
          key(new Text(String(d), { fontSize: 0.36, color: ink }).moveTo([x, -1.3 + 0.55 * i]), `number:${d}`),
        ]),
      ];
    }));
    const tower = view(this, draw);
    const machine = new Machine<Tower, Move>(this, { start: start(n), events: MOVES, next, views: [tower] });

    await this.step('start', { title: 'Carry the tower from A to C', line: 'Predict: how few moves can do it?',
      caption: `Move one disk at a time, from the top of a peg onto an empty peg or a larger disk. How few moves carry all ${n} disks from A to C?` });
    await s.enter(tower, { describe: () => `Pegs, bottom disk first. ${say(this.state)}` });

    await this.step('clear', { title: `Disk ${n} needs the others out of the way`, line: `So the smaller tower moves twice and the largest disk once.`,
      caption: `Disk ${n} cannot move while a disk sits on it, and it needs C empty to land there, because it is the largest disk. So ${smaller} first stack on B, the spare peg: the same puzzle one size smaller, solved in ${few} moves. They will have to come back on top afterwards.` });
    await this.play(machine.replay(moves.slice(0, few)));

    await this.step('largest', { title: `Disk ${n} moves once`, line: `${few + 1} moves so far.`,
      caption: `With C empty, disk ${n} goes straight there. It will not need to move again.` });
    await this.play(machine.replay([moves[few]!]));

    await this.step('solved', { title: `Answer: ${moves.length} moves`, line: `${few} + 1 + ${few}: the smaller tower twice, the largest disk once.`,
      caption: `The smaller tower climbs back onto disk ${n}: ${few} more moves, ${moves.length} in all, and no route is shorter. Three disks take 7 moves and four take 15. Press the moves and try to beat it; a move the rules forbid is refused, with the reason.` });
    await this.play(machine.replay(moves.slice(few + 1)));
  }
}
