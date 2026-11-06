// The ring-buffer explainer's model: a ring buffer of fixed capacity: pushes, pops, and the refusals of a full or empty ring.
// It is one design among several: it tracks length to tell full from empty (both have head === tail), and a
// push into a full ring throws Full and changes nothing, where other ring buffers overwrite the oldest value.
// Single-threaded: no concurrent producers or consumers, no memory ordering. Checked against a reference
// queue in model.test.ts.
import { refuse } from '../../../src/index.ts';
import type { Refusal } from '../../../src/index.ts';
export class Full extends Error {}
export class RingBuffer<T> {
  data: (T | null)[];
  head = 0;
  tail = 0;
  length = 0;
  readonly capacity: number;
  constructor(capacity: number) {
    this.capacity = capacity;
    this.data = Array(capacity).fill(null);
  }
  push(value: T) {
    if (this.length === this.capacity) throw new Full('Full');
    this.data[this.tail] = value;
    this.tail = (this.tail + 1) % this.capacity;
    this.length++;
  }
  pop(): T {
    if (!this.length) throw new Error('Empty');
    const value = this.data[this.head]!;
    this.data[this.head] = null;
    this.head = (this.head + 1) % this.capacity;
    this.length--;
    return value;
  }
  snapshot() {
    return { head: this.head, tail: this.tail, length: this.length, data: [...this.data] };
  }
}
export function ringStory(which: string) {
  const ring = new RingBuffer<number>(5),
    events: { operation: string; result: ReturnType<RingBuffer<number>['snapshot']>; error?: string }[] = [];
  const push = (n: number) => {
    try {
      ring.push(n);
      events.push({ operation: `push ${n}`, result: ring.snapshot() });
    } catch (error) {
      if (!(error instanceof Full)) throw error;
      events.push({ operation: `push ${n}`, result: ring.snapshot(), error: 'Full' });
    }
  };
  for (let i = 1; i <= 5; i++) push(i);
  if (which === 'wrap') {
    ring.pop();
    ring.pop();
    events.push({ operation: 'pop twice', result: ring.snapshot() });
    push(6);
    push(7);
  } else {
    push(6);
    push(7);
  }
  return events;
}
/**
 * A ring a reader can drive: push (the next value, 1 upward) and pop, one at a time, on the
 * RingBuffer above. Beside the buffer it records what the picture needs: the operation and its
 * result, the slots it outlined, the values in the tray under the ring (a run of pops, or of
 * refused pushes, adds to the tray; anything else starts it afresh) and which slots are being
 * reused. A pop of an empty ring, or a push past 9, is refused (undefined).
 */
export interface RingState {
  head: number; tail: number; length: number; data: (number | null)[];
  /** Slots that have held a value, and slots holding a value written into a slot used before. */
  used: boolean[]; reused: boolean[];
  /** The value the next push hands the buffer. */
  next: number;
  operation: string | null; error: string | null; returned: number[] | null;
  marks: { slot: number; kind: 'push' | 'pop' | 'refused' }[];
  tray: { label: string; values: number[]; refused: boolean } | null;
}
export type RingEvent = 'push' | 'pop';
export function ringStart(capacity: number): RingState {
  const empty = () => Array<boolean>(capacity).fill(false);
  return { head: 0, tail: 0, length: 0, data: Array(capacity).fill(null), used: empty(), reused: empty(), next: 1, operation: null, error: null, returned: null, marks: [], tray: null };
}
/** The ring after one event, or the model's refusal: a pop of an empty ring has nothing to take. */
export function ringNext(st: RingState, event: RingEvent): RingState | Refusal {
  const ring = new RingBuffer<number>(st.data.length);
  Object.assign(ring, { head: st.head, tail: st.tail, length: st.length, data: [...st.data] });
  if (event === 'pop') {
    if (!st.length) return refuse('the ring is empty, so pop has no value to take');
    const slot = ring.head, value = ring.pop();
    const run = st.operation === 'pop';
    return {
      ...st, ...ring.snapshot(),
      reused: st.reused.map((r, i) => r && i !== slot),
      operation: 'pop', error: null, returned: [value],
      marks: run ? [...st.marks, { slot, kind: 'pop' }] : [{ slot, kind: 'pop' }],
      tray: { label: 'popped:', values: run && st.tray && !st.tray.refused ? [...st.tray.values, value] : [value], refused: false },
    };
  }
  const value = st.next, slot = ring.tail;
  try {
    ring.push(value);
  } catch (error) {
    if (!(error instanceof Full)) throw error;
    return {
      ...st, next: value + 1, operation: `push ${value}`, error: 'Full', returned: null,
      marks: [{ slot, kind: 'refused' }],
      tray: { label: 'refused, Full:', values: st.tray?.refused ? [...st.tray.values, value] : [value], refused: true },
    };
  }
  return {
    ...st, ...ring.snapshot(), next: value + 1,
    used: st.used.map((u, i) => u || i === slot),
    reused: st.reused.map((r, i) => (i === slot ? st.used[slot]! : r)),
    operation: `push ${value}`, error: null, returned: null,
    marks: [{ slot, kind: 'push' }],
  };
}
