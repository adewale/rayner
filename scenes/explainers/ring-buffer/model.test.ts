import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../lib/pbt.ts';
import { RingBuffer, Full, ringStory, ringStart, ringNext } from './model.ts';

test('ring wraps into freed slots and Full changes no state', () => {
  assert.deepEqual(ringStory('wrap').at(-1)!.result, { head: 2, tail: 2, length: 5, data: [6, 7, 3, 4, 5] });
  const full = ringStory('full');
  assert.deepEqual(full[5]!.result, full[4]!.result);
  assert.deepEqual(full[6]!.result, full[4]!.result);
  assert.equal(full[5]!.error, 'Full');
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 24 }),
    fc.array(fc.oneof(fc.constant({ kind: 'pop' as const }), fc.integer().map((value) => ({ kind: 'push' as const, value }))), { maxLength: 80 }),
    (capacity, commands) => {
      const ring = new RingBuffer<number>(capacity);
      const reference: number[] = [];
      for (const command of commands) {
        const before = ring.snapshot();
        if (command.kind === 'pop') {
          if (reference.length) assert.equal(ring.pop(), reference.shift());
          else {
            assert.throws(() => ring.pop(), /^Error: Empty$/);
            assert.deepEqual(ring.snapshot(), before);
          }
        } else if (reference.length === capacity) {
          assert.throws(() => ring.push(command.value), Full);
          assert.deepEqual(ring.snapshot(), before);
        } else {
          ring.push(command.value);
          reference.push(command.value);
        }
        assert.equal(ring.length, reference.length);
        assert.ok(ring.head >= 0 && ring.head < capacity && ring.tail >= 0 && ring.tail < capacity);
        assert.deepEqual(Array.from({ length: ring.length }, (_, i) => ring.data[(ring.head + i) % capacity]), reference);
      }
      // Drain even traces ending in pushes, so the tail's complete FIFO order is observed.
      while (reference.length) assert.equal(ring.pop(), reference.shift());
      assert.throws(() => ring.pop(), /^Error: Empty$/);
    },
  ), params(300));
});

test('the ring machine refuses a pop of an empty ring, saying so, and takes a push to a full ring as Full', () => {
  assert.deepEqual({ ...ringNext(ringStart(4), 'pop') }, { reason: 'the ring is empty, so pop has no value to take' });
  const full = [1, 2, 3, 4].reduce((st) => ringNext(st, 'push') as ReturnType<typeof ringStart>, ringStart(4));
  assert.equal((ringNext(full, 'push') as ReturnType<typeof ringStart>).error, 'Full');
});
