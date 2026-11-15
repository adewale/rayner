import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../explain/index.ts';
import { HeldServer, drive, program } from './oracle/socket.ts';
import type { Seen } from './oracle/socket.ts';
import { READY, RESULT, SOCKET_EVENTS, socketStart, socketNext, socketBound, socketReplay, sendStatements } from './model.ts';
import type { SocketEvent, SocketState } from './model.ts';

// The oracle is Node's own WebSocket, run live each time this test runs, against oracle/socket.ts's server.
const server = new HeldServer();
before(() => server.listen());
after(() => server.close());

/** The two places the page's machines start: a new socket, and an open one that has sent one message. */
const STARTS: [string, SocketEvent[]][] = [['a new socket', []], ['an open socket that has sent one message', ['server accepts', 'send()']]];

/** Every state the live step's buttons reach from `prefix`, with the shortest events that reach it. */
function reachable(prefix: SocketEvent[]): { events: SocketEvent[]; state: SocketState }[] {
  const start = { ...socketReplay(prefix), event: null, result: null, branch: null };
  const seen = new Map<string, { events: SocketEvent[]; state: SocketState }>([[JSON.stringify(start), { events: [], state: start }]]);
  for (const queue = [...seen.values()]; queue.length; ) {
    const { events, state } = queue.shift()!;
    for (const event of SOCKET_EVENTS) {
      const next = socketNext(state, event);
      if (isRefusal(next) || socketBound(state, event)) continue;
      const key = JSON.stringify(next);
      if (!seen.has(key)) {
        const found = { events: [...events, event], state: next };
        seen.set(key, found);
        queue.push(found);
      }
    }
  }
  return [...seen.values()];
}

/** What Node's socket should have shown after each of `events`, by the model. */
function expected(events: readonly SocketEvent[]): Seen[] {
  let st = socketStart();
  return events.map((event) => {
    st = socketReplay([event], st);
    return {
      ready: READY.indexOf(st.ready),
      threw: st.result === RESULT.threw ? 'InvalidStateError' : null,
      opened: st.result === RESULT.opened,
      closed: st.result === RESULT.closed,
      clean: st.result === RESULT.closed ? true : null,
      delivered: st.delivered,
    };
  });
}

test('Node’s own WebSocket does what the model says, in every state the live step reaches and for every event from it', async () => {
  let runs = 0;
  for (const [, prefix] of STARTS)
    for (const { events, state } of reachable(prefix))
      for (const event of SOCKET_EVENTS) {
        if (isRefusal(socketNext(state, event)) || socketBound(state, event)) continue;
        const run = [...prefix, ...events, event];
        assert.deepEqual(await drive(server, run), expected(run), run.join(', '));
        runs++;
      }
  assert.ok(runs >= 60, `${runs} runs`);
});

test('the machines reach 23 states from a new socket and 14 from an open one', () => {
  assert.equal(reachable(STARTS[0]![1]).length, 23);
  assert.equal(reachable(STARTS[1]![1]).length, 14);
});

test('send() throws InvalidStateError only in CONNECTING, and returns without sending in CLOSING and CLOSED', async () => {
  const sendIn = (prefix: SocketEvent[]) => socketReplay([...prefix, 'send()']);
  assert.equal(sendIn([]).result, RESULT.threw);
  assert.equal(sendIn(['server accepts']).result, RESULT.sent);
  assert.equal(sendIn(['server accepts', 'close()']).result, RESULT.quiet);
  assert.equal(sendIn(['server accepts', 'close()', 'server answers close()']).result, RESULT.quiet);
  // The same four, on Node's socket: the error, its name, and what the server got.
  const real = await drive(server, ['send()', 'server accepts', 'send()', 'close()', 'send()', 'server answers close()', 'send()']);
  assert.deepEqual(real.map((s) => [s.ready, s.threw, s.delivered]), [
    [0, 'InvalidStateError', 0], [1, null, 0], [1, null, 1], [2, null, 1], [2, null, 1], [3, null, 1], [3, null, 1],
  ]);
});

test('the page’s two opening programs, run as written on Node’s WebSocket', async () => {
  // const ws = new WebSocket(url); ws.send("hi");
  assert.deepEqual(await program(server, 'connecting'), { threw: 'InvalidStateError', received: [], clean: true });
  // ws.onopen = () => { ws.send("hi"); ws.close(); ws.send("bye"); };
  assert.deepEqual(await program(server, 'closing'), { threw: null, received: ['hi'], clean: true });
});

// What close() before open fires differs between Node 24 releases, by the undici they bundle: during
// close(), then once the failed connection settles. Each order lists the undici releases it was seen on;
// a release listed must fire its own order, and any release must fire one of these, or this test fails.
const CLOSE_BEFORE_OPEN = [
  { seen: ['7.8.0'], during: ['close at 3'], after: ['close at 3', 'error at 3', 'close at 3'] }, // Node 24.0.0
  { seen: ['7.30.1', '7.30.2'], during: ['error at 3', 'close at 3'], after: ['error at 3', 'close at 3'] }, // Node 24.22.1; CI's Node 24
];

test('close() before open fails the connection at once in Node 24, in an order that differs by release, which is why the page stops short of it', async () => {
  assert.equal(socketBound(socketStart(), 'close()'), 'this page closes a socket only once it has opened');
  const undici = process.versions.undici ?? '';
  const ws = new WebSocket(server.url);
  const fired: string[] = [];
  for (const e of ['open', 'error', 'close']) ws.addEventListener(e, () => fired.push(`${e} at ${ws.readyState}`));
  ws.close();
  // Every release run reports CLOSING, as the model's replay of the bounded event does.
  assert.equal(ws.readyState, READY.indexOf(socketReplay(['close()']).ready));
  const during = [...fired];
  await new Promise((resolve) => setTimeout(resolve, 250));
  const seen = { during, after: fired };
  const recorded = CLOSE_BEFORE_OPEN.find((order) => order.seen.includes(undici));
  if (recorded) assert.deepEqual(seen, { during: recorded.during, after: recorded.after }, `undici ${undici}`);
  else assert.ok(CLOSE_BEFORE_OPEN.some((o) => JSON.stringify({ during: o.during, after: o.after }) === JSON.stringify(seen)),
    `undici ${undici} fired ${JSON.stringify(during)} during close() and ${JSON.stringify(fired)} in all, an order not recorded in CLOSE_BEFORE_OPEN`);
});

test('the send() the code panel prints is the send() Node runs', () => {
  const source = WebSocket.prototype.send.toString().split('\n').map((l) => l.trim());
  let at = 0;
  for (const statement of sendStatements()) {
    if (statement === '…') continue;
    const found = source.indexOf(statement, at);
    assert.ok(found >= at, `send() has "${statement}" after line ${at}`);
    at = found + 1;
  }
  // Nothing is left out between the two checks and the return.
  const throwAt = source.indexOf('throw new DOMException("Sent before connected.", "InvalidStateError");');
  assert.equal(source[throwAt + 2], 'if (!isEstablished(this.#handler.readyState) || isClosing(this.#handler.readyState)) {');
  assert.equal(source[throwAt + 3], 'return;');
});

test('each refusal and bound says why, in the reader’s words', () => {
  const open = socketReplay(['server accepts']), closing = socketReplay(['server accepts', 'close()']);
  const reason = (st: SocketState, event: SocketEvent) => {
    const r = socketNext(st, event);
    return isRefusal(r) ? r.reason : null;
  };
  assert.equal(reason(open, 'server accepts'), 'the socket is OPEN, and the server accepts the handshake once, while it is CONNECTING');
  assert.equal(reason(open, 'server answers close()'), 'the socket is OPEN, so there is no close() to answer');
  assert.equal(reason(socketStart(), 'server answers close()'), 'the socket is CONNECTING, so there is no close() to answer');
  assert.equal(reason(socketReplay(['server accepts', 'close()', 'server answers close()']), 'server answers close()'), 'the socket is CLOSED: the closing handshake is over');
  assert.equal(reason(closing, 'close()'), null);
  assert.equal(socketReplay(['close()'], closing).result, RESULT.nothing);
  assert.equal(socketBound(socketReplay(['server accepts', 'send()', 'send()']), 'send()'), 'this page counts 2 messages, and a third is sent the same way');
});
