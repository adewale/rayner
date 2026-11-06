import { refuse } from '../../../src/index.ts';
import type { Refusal } from '../../../src/index.ts';

export type Move = 'A→B' | 'A→C' | 'B→A' | 'B→C' | 'C→A' | 'C→B';
export const MOVES: readonly Move[] = ['A→B', 'A→C', 'B→A', 'B→C', 'C→A', 'C→B'];
/** Each peg's disks, bottom first; disk 3 is the largest. */
export type Tower = { pegs: number[][] };

export const start = (): Tower => ({ pegs: [[3, 2, 1], [], []] });
const peg = (name: string) => 'ABC'.indexOf(name);

/** The tower after `move`, or why the move is refused. */
export function next({ pegs }: Tower, move: Move): Tower | Refusal {
  const [from, to] = [peg(move[0]!), peg(move[2]!)];
  const disk = pegs[from]!.at(-1), under = pegs[to]!.at(-1);
  if (disk === undefined) return refuse(`peg ${move[0]} is empty`);
  if (under !== undefined && under < disk) return refuse(`disk ${disk} cannot sit on the smaller disk ${under}`);
  return { pegs: pegs.map((p, i) => (i === from ? p.slice(0, -1) : i === to ? [...p, disk] : p)) };
}
