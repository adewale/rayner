// The state-machine explainer's model: a WebSocket client as Node 24 runs it (its global WebSocket, undici
// 7.30.1 when written, which follows the WHATWG WebSockets standard). The socket is a machine of four
// readyStates; send() never moves it, and what send() does depends only on the state it finds:
// CONNECTING throws InvalidStateError, OPEN queues the message, CLOSING and CLOSED return without
// sending and without an error. close() moves OPEN to CLOSING and does nothing in CLOSING or CLOSED.
// The server's two answers, accepting the handshake and answering the close frame, are the other arrows.
// Its limits, each beside the rule it qualifies below: close() before the socket opens is past the story
// (Node 24 then fires error and close at once and reports readyState CLOSING); a server that closes first,
// errors, binary data, bufferedAmount and timing are left out; the page counts at most two messages.
// model.test.ts drives Node's own WebSocket through every state this machine reaches and compares.
import { refuse, isRefusal } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';

/** The four readyStates, in their numeric order (WebSocket.CONNECTING is 0, CLOSED is 3). */
export const READY = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const;
export type Ready = (typeof READY)[number];

/** What the reader's program calls, then what the server does. */
export const SOCKET_EVENTS = ['send()', 'close()', 'server accepts', 'server answers close()'] as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[number];

/** What an event did, in the reader's words. */
export const RESULT = {
  threw: 'throws InvalidStateError',
  sent: 'sends the message',
  quiet: 'returns, sends nothing',
  opened: 'fires open',
  closing: 'sends a close frame',
  failed: 'fails the connection',
  nothing: 'does nothing',
  closed: 'fires close',
} as const;
export type Result = (typeof RESULT)[keyof typeof RESULT];

/** Which part of send() an event ran: its throw, its return, or the line that queues the message. */
export type Branch = 'throw' | 'return' | 'queue';

export type SocketState = {
  ready: Ready;
  /** The last event and what it did. */
  event: SocketEvent | null;
  result: Result | null;
  /** The part of send() the last event ran, when it was a send(). */
  branch: Branch | null;
  /** Messages the server has received. */
  delivered: number;
  /** Every link the socket travelled, as 'from:to', in order. */
  travelled: string[];
};

/** A socket just made with new WebSocket(url): the handshake is under way. */
export const socketStart = (): SocketState => ({ ready: 'CONNECTING', event: null, result: null, branch: null, delivered: 0, travelled: [] });

/** The most messages this page counts. */
export const MOST = 2;

const moved = (st: SocketState, event: SocketEvent, ready: Ready, result: Result): SocketState => ({
  ...st, ready, event, result, branch: null, travelled: [...st.travelled, `${st.ready}:${ready}`],
});

/**
 * The socket after `event`, or the refusal, with its reason, of an event that cannot happen in this state.
 * send() is checked first in CONNECTING, which throws; only OPEN gets past its second check.
 */
export function socketNext(st: SocketState, event: SocketEvent): SocketState | Refusal {
  switch (event) {
    case 'send()':
      if (st.ready === 'CONNECTING') return { ...st, event, result: RESULT.threw, branch: 'throw' };
      if (st.ready !== 'OPEN') return { ...st, event, result: RESULT.quiet, branch: 'return' };
      return { ...st, event, result: RESULT.sent, branch: 'queue', delivered: st.delivered + 1 };
    case 'close()':
      if (st.ready === 'OPEN') return moved(st, event, 'CLOSING', RESULT.closing);
      // Before the socket opens, close() fails the connection: past this page's story (socketBound).
      if (st.ready === 'CONNECTING') return moved(st, event, 'CLOSING', RESULT.failed);
      return { ...st, event, result: RESULT.nothing, branch: null };
    case 'server accepts':
      if (st.ready !== 'CONNECTING') return refuse(`the socket is ${st.ready}, and the server accepts the handshake once, while it is CONNECTING`);
      return moved(st, event, 'OPEN', RESULT.opened);
    case 'server answers close()':
      if (st.ready === 'CLOSED') return refuse('the socket is CLOSED: the closing handshake is over');
      if (st.ready !== 'CLOSING') return refuse(`the socket is ${st.ready}, so there is no close() to answer`);
      return moved(st, event, 'CLOSED', RESULT.closed);
  }
}

/** Where the story stops though the socket would go on. */
export function socketBound(st: SocketState, event: SocketEvent): string | undefined {
  if (event === 'close()' && st.ready === 'CONNECTING') return 'this page closes a socket only once it has opened';
  if (event === 'send()' && st.ready === 'OPEN' && st.delivered >= MOST) return `this page counts ${MOST} messages, and a third is sent the same way`;
  return undefined;
}

/** The socket after `events`, each of which must be taken. */
export function socketReplay(events: readonly SocketEvent[], from: SocketState = socketStart()): SocketState {
  return events.reduce((st, event) => {
    const after = socketNext(st, event);
    if (isRefusal(after)) throw new Error(`${event} refused: ${after.reason}`);
    return after;
  }, from);
}

/**
 * Lines of Node 24's WebSocket.prototype.send, as WebSocket.prototype.send.toString() gives them (undici
 * 7.30.1, bundled), shown with long statements broken over lines so each fits a phone's close-up and the parts not shown as "…".
 * Each entry is one shown line; `join` marks a line that continues the statement above it.
 */
export const SEND_CODE: readonly { text: string; join?: true }[] = [
  { text: 'send(data) {' },
  { text: '  …' },
  { text: '  if (isConnecting(' },
  { text: '        this.#handler.readyState)) {', join: true },
  { text: '    throw new DOMException(' },
  { text: '      "Sent before connected.",', join: true },
  { text: '      "InvalidStateError");', join: true },
  { text: '  }' },
  { text: '  if (!isEstablished(' },
  { text: '        this.#handler.readyState)', join: true },
  { text: '      || isClosing(', join: true },
  { text: '        this.#handler.readyState)) {', join: true },
  { text: '    return;' },
  { text: '  }' },
  { text: '  …' },
  { text: '    this.#sendQueue.add(buffer, () => {' },
];
/** The shown lines each branch of send() covers, by index into SEND_CODE. */
export const BRANCH_LINES: Record<Branch, readonly number[]> = { throw: [4, 5, 6], return: [12], queue: [15] };

/** The statements SEND_CODE shows, each on one line as the source has it, with "…" where lines are left out. */
export function sendStatements(): string[] {
  const out: string[] = [];
  for (const { text, join } of SEND_CODE) {
    if (join) out[out.length - 1] = `${out.at(-1)!}${out.at(-1)!.endsWith('(') ? '' : ' '}${text.trim()}`;
    else out.push(text.trim());
  }
  return out;
}
