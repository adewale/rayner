import { refuse } from '../../../src/index.ts';
import type { Refusal } from '../../../src/index.ts';

export type Move = 'A→B' | 'A→C' | 'B→A' | 'B→C' | 'C→A' | 'C→B';
export const MOVES: readonly Move[] = ['A→B', 'A→C', 'B→A', 'B→C', 'C→A', 'C→B'];
/** Each peg's disks, bottom first; disk 1 is the smallest. */
export type Tower = { pegs: number[][] };

/** `n` disks on peg A, the largest at the bottom. */
export const start = (n: number): Tower => ({ pegs: [Array.from({ length: n }, (_, i) => n - i), [], []] });

/** The tower after `move`, or the rule that refuses it. */
export function next({ pegs }: Tower, move: Move): Tower | Refusal {
  const [from, to] = ['ABC'.indexOf(move[0]!), 'ABC'.indexOf(move[2]!)];
  const disk = pegs[from]!.at(-1), under = pegs[to]!.at(-1);
  if (disk === undefined) return refuse(`peg ${move[0]} is empty`);
  if (under !== undefined && under < disk) return refuse(`disk ${disk} cannot sit on the smaller disk ${under}`);
  return { pegs: pegs.map((p, i) => (i === from ? p.slice(0, -1) : i === to ? [...p, disk] : p)) };
}

/** Carry the top `n` disks: the `n − 1` above go to the spare peg, disk `n` moves, then they follow it. */
export function solve(n: number, from = 'A', to = 'C', spare = 'B'): Move[] {
  if (n === 0) return [];
  return [...solve(n - 1, from, spare, to), `${from}→${to}` as Move, ...solve(n - 1, spare, to, from)];
}

/** Whether all `n` disks are on C, where the story ends. */
export const finished = (t: Tower, n: number) => t.pegs[2]!.length === n;
