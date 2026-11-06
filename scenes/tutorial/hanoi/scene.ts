import { Scene, Machine, view } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { MOVES, finished, next, solve, start, type Move, type Tower } from './model.ts';
import { drawTower, sayTower } from './picture.ts';

// The title, answer and check questions come from script.md's intent header.
export default class Hanoi extends Scene<Tower> {
  static meta = { id: 'hanoi', sources: ['https://en.wikipedia.org/wiki/Tower_of_Hanoi'] };
  static settings = [{ id: 'disks', label: 'Disks', default: '3', options: [{ value: '3', label: '3' }, { value: '4', label: '4' }] }];
  override state = start(3);

  override async construct() {
    const n = Number(settingsOf(this).disks), moves = solve(n), few = (moves.length - 1) / 2;
    const smaller = n === 3 ? 'disks 1 and 2' : `disks 1 to ${n - 1}`, first = moves[0]!.at(-1);
    this.state = start(n);
    const s = stage(this, { headingSize: 0.54 });
    const tower = view(this, (t: Tower) => drawTower(t, n, { ...s.palette, emphasis: s.emphasis }));
    // Once the tower is on C the story ends, so the reader's own moves start again from A.
    const machine = new Machine<Tower, Move>(this, { start: start(n), events: MOVES, next, views: [tower],
      end: (t) => (finished(t, n) ? 'the tower is on C' : undefined) });

    await this.step('start', { title: 'Carry the tower from A to C', line: 'Predict: how few moves can do it?',
      caption: `Move one disk at a time, from the top of a peg onto an empty peg or a larger disk. How few moves carry all ${n} disks from A to C? There is a way to know without trying them all.` });
    await s.enter(tower, { describe: () => sayTower(this.state) });
    s.keepOpening(tower);

    await this.step('clear', { title: `Disk ${n} needs the others out of the way`, line: 'So the smaller tower moves twice and the largest disk once.',
      caption: `Disk ${n} cannot move while a disk sits on it, and it needs C empty to land there, because it is the largest disk. So ${smaller} first stack on B, the spare peg: the same puzzle one size smaller, solved in ${few} moves. They will have to come back on top afterwards.` });
    await this.play(machine.replay(moves.slice(0, few)));

    await this.step('largest', { title: `Disk ${n} moves once`, line: `${few + 1} moves so far. Disk 1 went first to ${first}.`,
      caption: `Disk ${n} goes straight to the empty C, and will not need to move again. Look back at the first move: disk 1 went to ${first}. Each smaller tower inside the plan heads for the other peg from the tower around it, so with three disks disk 1 starts toward C, and with four toward B.` });
    await this.play(machine.replay([moves[few]!]));

    await this.step('solved', { title: `Answer: ${moves.length} moves`, line: `${few} + 1 + ${few}: the smaller tower twice, the largest disk once.`,
      caption: `The smaller tower climbs back onto disk ${n}: ${few} more moves, ${moves.length} in all, and no route is shorter. Three disks take 7 moves and four take 15. Now carry it yourself: your moves start from the full tower on A, and a move the rules forbid is refused, with the reason.` });
    await this.play(machine.replay(moves.slice(few + 1)));
  }
}
