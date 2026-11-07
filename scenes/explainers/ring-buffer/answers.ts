// The script's check answers, computed from the model: rayner check holds script.md's to these.
import { RingBuffer } from './model.ts';
import { arrayQueue } from './picture.ts';
import { grouped } from '../lib/format.ts';

const ring = new RingBuffer<number>(5);
for (let v = 1; v <= 5; v++) ring.push(v);
ring.pop();
ring.pop();
ring.push(6);
ring.push(7);
const out = [ring.pop(), ring.pop(), ring.pop()],
  slot8 = ring.tail;
ring.push(8);
const left = Array.from({ length: ring.length }, (_, k) => ring.data[(ring.head + k) % ring.capacity]!);
const carry = { out, slot8, head: ring.head, left };
const eight = new RingBuffer<number>(8);
for (let v = 1; v <= 8; v++) eight.push(v);
const full8 = eight.snapshot();
for (let v = 1; v <= 8; v++) eight.pop();
const empty8 = eight.snapshot();
let queue = Array.from({ length: 1000 }, (_, i) => i + 1),
  arrayMoves = 0;
while (queue.length) {
  const step = arrayQueue(queue);
  arrayMoves += step.moved;
  queue = step.after;
}

export const checks = {
  1: () =>
    `The pops return ${carry.out.join(', ')}, and head wraps to slot ${carry.head}. Tail is still at slot ${carry.slot8}, so 8 goes there. Reading from head gives ${carry.left.join(', ')}: the order comes from head, not from the slot numbers.`,
  2: () =>
    `Both are at slot ${empty8.head}, just where they were when it was full (head ${full8.head}, tail ${full8.tail}). Only length, ${empty8.length} now against ${full8.length} then, tells empty from full.`,
  3: () =>
    `The array makes ${grouped(arrayMoves)}: each pop copies every value still behind the front, 999, then 998, down to 0. The ring makes none, because a pop moves only head.`,
};
