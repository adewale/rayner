import { refuse } from '../../../src/index.ts';
import type { Refusal } from '../../../src/index.ts';

// A door that can be opened, closed, locked and unlocked: the model a machine drives. It is pure
// and draws nothing, so its test can check every state and every refusal.

export type Door = 'open' | 'closed' | 'locked';
export type DoorEvent = 'open' | 'close' | 'lock' | 'unlock';
/** Every event, in the order the player shows its buttons. */
export const DOOR_EVENTS: readonly DoorEvent[] = ['open', 'close', 'lock', 'unlock'];
export type DoorState = { door: Door };

/** Where the door starts: open. */
export const doorStart = (): DoorState => ({ door: 'open' });

/**
 * The door after `event`, or the model's refusal with its reason, written to follow the event's
 * name ("open: the door is locked, so unlock it first").
 */
export function doorNext(state: DoorState, event: DoorEvent): DoorState | Refusal {
  const { door } = state;
  switch (event) {
    case 'open':
      if (door === 'locked') return refuse('the door is locked, so unlock it first');
      return door === 'closed' ? { door: 'open' } : refuse('the door is open already');
    case 'close':
      return door === 'open' ? { door: 'closed' } : refuse(`the door is ${door === 'locked' ? 'closed and locked' : 'closed'} already`);
    case 'lock':
      if (door === 'open') return refuse('an open door cannot lock, so close it first');
      return door === 'closed' ? { door: 'locked' } : refuse('the door is locked already');
    case 'unlock':
      return door === 'locked' ? { door: 'closed' } : refuse(`the door is ${door}, not locked`);
  }
}
