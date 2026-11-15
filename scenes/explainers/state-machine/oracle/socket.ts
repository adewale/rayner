// The oracle: Node's own WebSocket (the global one, undici in Node 24), driven against a local server that
// answers only when told. The server is the smallest one the tests need: it holds the opening handshake
// until `accept`, records the text frames it receives, and answers a close frame only when told. What
// the tests compare is the client: its readyState, whether send() threw, its open and close events, and
// which messages reached the server.
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** One connection the server holds: the upgrade request's key, its socket, and the frames it has read. */
interface Held { key: string; socket: Duplex; texts: string[]; closeFrames: number; ended: Promise<void> }

/** A WebSocket server on 127.0.0.1 that accepts and answers close only when the test says so. */
export class HeldServer {
  private server: Server;
  private waiting: ((held: Held) => void)[] = [];
  private held: Held[] = [];
  url = '';
  constructor() {
    this.server = createServer();
    this.server.on('upgrade', (req, socket: Duplex) => {
      let ended!: () => void;
      const held: Held = { key: String(req.headers['sec-websocket-key']), socket, texts: [], closeFrames: 0, ended: new Promise((done) => (ended = done)) };
      socket.on('error', () => {});
      socket.on('close', () => ended());
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        // Client frames are masked; the tests send short texts, so a length fits in the second byte.
        while (buf.length >= 6) {
          const opcode = buf[0]! & 0x0f, length = buf[1]! & 0x7f;
          if (length > 125) throw new Error('the test server reads only short frames');
          if (buf.length < 6 + length) break;
          const mask = buf.subarray(2, 6), payload = Buffer.from(buf.subarray(6, 6 + length)).map((b, i) => b ^ mask[i % 4]!);
          buf = buf.subarray(6 + length);
          if (opcode === 0x1) held.texts.push(Buffer.from(payload).toString('utf8'));
          if (opcode === 0x8) held.closeFrames++;
        }
      });
      this.held.push(held);
      this.waiting.shift()?.(held);
    });
  }
  async listen(): Promise<void> {
    await new Promise<void>((done) => this.server.listen(0, '127.0.0.1', done));
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    this.url = `ws://127.0.0.1:${address.port}`;
  }
  /** The next connection's upgrade request, once it has arrived. */
  next(): Promise<Held> {
    return new Promise((done) => this.waiting.push(done));
  }
  /** Accept the handshake: the 101 response with the key's answer (RFC 6455, section 4.2.2). */
  accept(held: Held): void {
    const answer = createHash('sha1').update(held.key + GUID).digest('base64');
    if (!held.socket.destroyed)
      held.socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${answer}\r\n\r\n`);
  }
  /** Answer the client's close frame with the server's own (no status code), then end the connection. */
  answerClose(held: Held): void {
    if (!held.socket.destroyed) held.socket.end(Buffer.from([0x88, 0x00]));
  }
  async close(): Promise<void> {
    for (const h of this.held) h.socket.destroy();
    await new Promise((done) => this.server.close(done));
  }
}

/** What the real socket showed after one event. */
export interface Seen {
  /** ws.readyState after the event. */
  ready: number;
  /** The name of the error send() or close() threw, if one did. */
  threw: string | null;
  /** Whether the open event, and the close event, fired during the event. */
  opened: boolean;
  closed: boolean;
  /** The close event's wasClean, when it fired. */
  clean: boolean | null;
  /** How many of the messages sent so far the server received, counted once the connection has ended. */
  delivered: number;
}

/** Wait for `fired` to become true, or give up after two seconds. */
async function until(fired: () => boolean): Promise<boolean> {
  for (let i = 0; i < 200 && !fired(); i++) await new Promise((done) => setTimeout(done, 10));
  return fired();
}

/**
 * Run `events` on a new WebSocket against `server`, from the moment its handshake request reaches the
 * server, and say what the socket showed after each. Each send() sends its own text, so once the
 * connection has ended (closed here if the events left it open or closing) each message is known to
 * have reached the server or not.
 */
export async function drive(server: HeldServer, events: readonly string[]): Promise<Seen[]> {
  const arriving = server.next();
  const ws = new WebSocket(server.url);
  let opens = 0, closes = 0, clean: boolean | null = null;
  ws.addEventListener('open', () => opens++);
  ws.addEventListener('close', (e) => { closes++; clean = e.wasClean; });
  const held = await arriving;
  const seen: Omit<Seen, 'delivered'>[] = [], sentAt: number[] = [];
  for (const [i, event] of events.entries()) {
    const [o, c] = [opens, closes];
    let threw: string | null = null;
    try {
      if (event === 'send()') { sentAt.push(i); ws.send(`message ${i}`); }
      else if (event === 'close()') ws.close();
      else if (event === 'server accepts') { server.accept(held); await until(() => opens > o || closes > c); }
      else if (event === 'server answers close()') { server.answerClose(held); await until(() => closes > c); }
      else throw new Error(`no such event: ${event}`);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      threw = error.name;
    }
    seen.push({ ready: ws.readyState, threw, opened: opens > o, closed: closes > c, clean: closes > c ? clean : null });
  }
  // End the connection so every frame the client sent has reached the server. A socket still connecting
  // is accepted first, so a message refused before open would show up here if it had been kept for later.
  if (ws.readyState === WebSocket.CONNECTING) {
    server.accept(held);
    await until(() => opens > 0);
  }
  if (ws.readyState === WebSocket.OPEN) ws.close();
  if (ws.readyState === WebSocket.CLOSING) server.answerClose(held);
  if (!(await until(() => closes > 0))) throw new Error(`the socket did not close after ${events.join(', ')}`);
  await held.ended;
  const got = new Set(held.texts);
  return seen.map((s, i) => ({ ...s, delivered: sentAt.filter((at) => at <= i && got.has(`message ${at}`)).length }));
}

/** The two programs the page opens with, run as written; each returns what the server received and what threw. */
export async function program(server: HeldServer, which: 'connecting' | 'closing'): Promise<{ threw: string | null; received: string[]; clean: boolean | null }> {
  const arriving = server.next();
  const ws = new WebSocket(server.url);
  let threw: string | null = null, clean: boolean | null = null;
  ws.addEventListener('close', (e) => (clean = e.wasClean));
  if (which === 'connecting') {
    try {
      ws.send('hi');
    } catch (error) {
      threw = (error as DOMException).name;
    }
  } else {
    ws.onopen = () => {
      try {
        ws.send('hi');
        ws.close();
        ws.send('bye');
      } catch (error) {
        threw = (error as DOMException).name;
      }
    };
  }
  const held = await arriving;
  server.accept(held);
  if (which === 'closing') await until(() => held.closeFrames > 0);
  if (ws.readyState !== WebSocket.CLOSED) {
    if (ws.readyState === WebSocket.OPEN) ws.close();
    server.answerClose(held);
  }
  await held.ended;
  await until(() => clean !== null);
  return { threw, received: [...held.texts], clean };
}
