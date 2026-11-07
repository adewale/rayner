import test from 'node:test';
import { isRefusal } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { DOOR_EVENTS, doorNext, doorStart, type Door, type DoorEvent } from './model.ts';

/** What `event` does to a door in state `door`: the door it leaves, or the reason it is refused. */
const after = (door: Door, event: DoorEvent) => {
  const next = doorNext({ door }, event);
  return isRefusal(next) ? `refused: ${next.reason}` : next.door;
};

test('an open door closes, a closed door locks or opens, and a locked door only unlocks', () => {
  const table = (['open', 'closed', 'locked'] as const).map((door) => DOOR_EVENTS.map((e) => after(door, e)));
  assert.deepEqual(table, [
    ['refused: the door is open already', 'closed', 'refused: an open door cannot lock, so close it first', 'refused: the door is open, not locked'],
    ['open', 'refused: the door is closed already', 'locked', 'refused: the door is closed, not locked'],
    ['refused: the door is locked, so unlock it first', 'refused: the door is closed and locked already', 'refused: the door is locked already', 'closed'],
  ]);
});

test('from the open door, every state is reached, and every state has an event to press', () => {
  const seen = new Set<Door>([doorStart().door]);
  for (const queue = [doorStart().door]; queue.length; ) {
    const door = queue.shift()!;
    for (const e of DOOR_EVENTS) {
      const next = doorNext({ door }, e);
      if (!isRefusal(next) && !seen.has(next.door)) { seen.add(next.door); queue.push(next.door); }
    }
  }
  assert.deepEqual([...seen].sort(), ['closed', 'locked', 'open']);
  for (const door of seen) assert.ok(DOOR_EVENTS.some((e) => !isRefusal(doorNext({ door }, e))), door);
});
