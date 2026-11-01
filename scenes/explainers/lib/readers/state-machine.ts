import { Group } from '../../../../src/index.ts';
import { reduceSession, sessionAttempt } from '../models.ts';
import { flow, label, tile } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(which: string): ReaderFrame[] {
  const event = which === 'success' ? 'OPENED' : 'ERROR',
    next = reduceSession('connecting', event);
  const closed = which === 'success' ? reduceSession(next, 'CLOSE') : next;
  const rejected = sessionAttempt(closed, 'OPENED');
  return [
    {
      id: 'reader-path',
      title: 'What can this event change?',
      line: 'A transition needs both the current state and the event.',
      caption: `CONNECT moves idle to connecting. In that state, ${event} moves the session to ${next}. The same event in another state can have a different result because the reducer looks up both state and event.`,
      values: { event, next },
      draw: (s) =>
        new Group(
          flow(s, ['idle', 'connecting', next]),
          label('CONNECT', -2.55, 2.25, s.emphasis, 0.65),
          label(event, 2.55, 2.25, s.emphasis, 0.65),
          label('Current state + event → next state', 0, -1.8, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-reject',
      title: 'Can a late OPENED reopen it?',
      line: 'closed has no OPENED transition.',
      caption: `${which === 'success' ? 'CLOSE moves open to closed' : 'ERROR moves connecting to closed'}. A later OPENED has no closed:OPENED transition, so the reducer throws InvalidTransition. The state remains closed.`,
      values: { state: 'closed', event: 'OPENED', result: rejected },
      draw: (s) =>
        new Group(
          label(which === 'success' ? 'CLOSE → closed' : 'ERROR → closed', 0, 2.65, s.palette.ink, 0.7),
          tile('closed', -4.7, 1, 3.8, 1.3, s, { active: true }),
          tile('OPENED', 0, 1, 3.8, 1.3, s),
          tile('closed', 4.7, 1, 3.8, 1.3, s, { active: true }),
          label('×', 2.35, 1, s.bad, 1),
          label(rejected.error!, 0, -1.4, s.bad, 0.8, 'rejection'),
          label('State stays closed', 0, -2.8, s.palette.ink, 0.7),
        ),
    },
  ];
}
