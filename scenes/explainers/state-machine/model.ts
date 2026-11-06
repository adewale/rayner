// The state-machine explainer's model: a WebSocket session as a reducer: its states, events, and the transition each event makes or the error it throws.
class InvalidTransition extends Error {
  constructor() {
    super('InvalidTransition');
  }
}
export function reduceSession(state: string, event: string): string {
  const next: Record<string, string> = {
    'idle:CONNECT': 'connecting',
    'connecting:OPENED': 'open',
    'connecting:ERROR': 'closed',
    'open:CLOSE': 'closed',
  };
  const result = next[`${state}:${event}`];
  if (!result) throw new InvalidTransition();
  return result;
}
export function sessionAttempt(state: string, event: string): { state?: string; error?: string } {
  try {
    return { state: reduceSession(state, event) };
  } catch (error) {
    if (!(error instanceof InvalidTransition)) throw error;
    return { error: error.message };
  }
}
/**
 * A session a reader can drive: each event goes to reduceSession from the state the session is
 * in. A pair with a row moves the session and records the row it read and the link it travelled;
 * a pair with none throws InvalidTransition, recorded as `invalid`, and the session stays.
 * No event is refused: the throw is what the explainer shows.
 */
export interface SessionState {
  session: string;
  event: string | null;
  returns: string | null;
  invalid: { state?: string; error?: string } | null;
  /** The row the reducer read for the last event that had one, as 'state:EVENT'. */
  row: string | null;
  /** Every link travelled, as 'from:to:EVENT', in order. */
  travelled: string[];
}
export const SESSION_EVENTS = ['CONNECT', 'OPENED', 'ERROR', 'CLOSE'] as const;
export type SessionEvent = (typeof SESSION_EVENTS)[number];
export const sessionStart = (): SessionState => ({ session: 'idle', event: null, returns: null, invalid: null, row: null, travelled: [] });
export function sessionNext(st: SessionState, event: SessionEvent): SessionState {
  const attempt = sessionAttempt(st.session, event);
  if (attempt.error) return { ...st, event, returns: attempt.error, invalid: attempt, row: null };
  return { session: attempt.state!, event, returns: attempt.state!, invalid: null, row: `${st.session}:${event}`, travelled: [...st.travelled, `${st.session}:${attempt.state}:${event}`] };
}
