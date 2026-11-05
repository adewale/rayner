import { Group } from '../../../../src/index.ts';
import { reduceSession, sessionAttempt } from '../models.ts';
import { flow, label, tile } from '../reader-drawing.ts';
import type { StagedStep } from '../../../../explain/index.ts';
import { staged } from '../staged.ts';

/** The scene's one-sentence answer, which the reject step states in both histories. */
export const ANSWER =
  'The reducer accepts an event only in a state that has a row for it, so a late OPENED cannot reopen a closed session';

export function frames(which: string): StagedStep[] {
  const event = which === 'success' ? 'OPENED' : 'ERROR',
    next = reduceSession('connecting', event);
  const closed = which === 'success' ? reduceSession(next, 'CLOSE') : next;
  const rejected = sessionAttempt(closed, 'OPENED');
  const ended = which === 'success' ? 'CLOSE moves open to closed' : `ERROR already moved connecting to ${closed}`;
  return [
    staged({
      id: 'reader-path',
      title: 'Should a late OPENED reopen a closed session?',
      line: `Predict: the session ends in ${closed}, then an OPENED arrives. What happens?`,
      caption: `A session connects in two moves: CONNECT takes it from idle to connecting, and the network’s reply, OPENED or ERROR, decides where it goes next. Here the reply is ${event}, which moves it to ${next}${which === 'success' ? ', and later CLOSE moves it to closed' : ''}. Then a reply from an earlier attempt turns up: OPENED. Read on its own, OPENED means open. Should the session reopen? The code that decides is a reducer: a function given the current state and an event, which returns the next state.`,
      state: { event, next },
      draw: (st, s) =>
        new Group(
          flow(s, ['idle', 'connecting', st.next]),
          label('CONNECT', -2.55, 2.25, s.emphasis, 0.65),
          label(st.event, 2.55, 2.25, s.emphasis, 0.65),
          label('Current state + event → next state', 0, -1.8, s.palette.ink, 0.7),
        ),
    }),
    staged({
      id: 'reader-reject',
      title: 'Answer: no. Closed has no row for OPENED',
      line: 'The reducer looks up the current state and the event together.',
      caption: `${ANSWER}. ${ended}. The reducer then looks up the pair closed:OPENED, finds no row and throws InvalidTransition, an error, so the state stays closed.`,
      // `via`: the event that closed the session before the late OPENED.
      state: { state: closed, event: 'OPENED', result: rejected, via: which === 'success' ? 'CLOSE' : event },
      draw: (st, s) =>
        new Group(
          label(`${st.via} → ${st.state}`, 0, 2.65, s.palette.ink, 0.7),
          tile(st.state, -4.7, 1, 3.8, 1.3, s, { active: true }),
          tile(st.event, 0, 1, 3.8, 1.3, s),
          // The rejected event leaves the state where it was.
          tile(st.result.state ?? st.state, 4.7, 1, 3.8, 1.3, s, { active: true }),
          label('×', 2.35, 1, s.bad, 1),
          label(st.result.error!, 0, -1.4, s.bad, 0.8, 'rejection'),
          label(`State stays ${st.state}`, 0, -2.8, s.palette.ink, 0.7),
        ),
    }),
  ];
}
