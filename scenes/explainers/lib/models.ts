// Small, explicitly scoped executable models. Scenes consume their results, not hand-entered answers.
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
export class TokenBucket {
  tokens: number;
  lastRefill = 0;
  readonly rate: number;
  readonly capacity: number;
  constructor(rate: number, capacity = 5) {
    this.rate = rate;
    this.capacity = capacity;
    this.tokens = capacity;
  }
  allow(now: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.lastRefill) * this.rate);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
/** One call of allow(): when it came, whether it got 200, the balance it found after refill and what it left. */
export interface BucketCall { at: number; ok: boolean; found: number; after: number }
/**
 * A client's requests through one TokenBucket, a call at a time: the bucket's fields, every call
 * so far, and what the readout reports of them (each response, the balance each left, how many
 * were accepted and which were refused, by name). The balance never leaves 0 to capacity:
 * allow() caps refill with min(capacity, …) and spends only a whole token.
 */
export interface BucketState {
  rate: number; capacity: number;
  tokens: number; lastRefill: number;
  calls: BucketCall[];
  responses: (200 | 429)[]; balances: number[]; allowed: number; rejected: string[];
}
export const bucketStart = (rate: number, capacity = 5): BucketState =>
  ({ rate, capacity, tokens: capacity, lastRefill: 0, calls: [], responses: [], balances: [], allowed: 0, rejected: [] });
/** The next request, arriving at `at`: allow(at) on the bucket the state describes. */
export function bucketRequest(st: BucketState, at: number): BucketState {
  const bucket = new TokenBucket(st.rate, st.capacity);
  Object.assign(bucket, { tokens: st.tokens, lastRefill: st.lastRefill });
  const ok = bucket.allow(at),
    call: BucketCall = { at, ok, found: bucket.tokens + (ok ? 1 : 0), after: bucket.tokens };
  return {
    ...st, tokens: bucket.tokens, lastRefill: bucket.lastRefill,
    calls: [...st.calls, call],
    responses: [...st.responses, ok ? 200 : 429],
    balances: [...st.balances, bucket.tokens],
    allowed: st.allowed + (ok ? 1 : 0),
    rejected: ok ? st.rejected : [...st.rejected, `R${st.calls.length + 1}`],
  };
}
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
export function ringNext(st: RingState, event: RingEvent): RingState | undefined {
  const ring = new RingBuffer<number>(st.data.length);
  Object.assign(ring, { head: st.head, tail: st.tail, length: st.length, data: [...st.data] });
  if (event === 'pop') {
    if (!st.length) return undefined;
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
export interface Shell {
  fs: Record<string, string>;
  steps: number;
}
export function exec(
  shell: Shell,
  stages: readonly (readonly string[])[],
  redirect?: string,
): { shell: Shell; stdout: string } {
  let stdout = '',
    steps = shell.steps;
  for (const [name, ...args] of stages) {
    steps++;
    if (name === 'echo') stdout = args.join(' ') + '\n';
    else if (name === 'tr') stdout = stdout.toUpperCase();
    else if (name === 'cat') stdout = shell.fs[args[0]!] ?? '';
    else throw new Error(`Unknown model command: ${name}`);
  }
  const fs = { ...shell.fs };
  if (redirect) {
    fs[redirect] = stdout;
    stdout = '';
  }
  return { shell: { fs, steps }, stdout };
}
export function sunlight(latitude: number, declination: number): { altitude: number; daylight: number } {
  const rad = Math.PI / 180;
  const cos = -Math.tan(latitude * rad) * Math.tan(declination * rad);
  return {
    altitude: 90 - Math.abs(latitude - declination),
    daylight: cos <= -1 ? 24 : cos >= 1 ? 0 : (24 * Math.acos(cos)) / Math.PI,
  };
}
/**
 * Sunlight on one square metre of flat ground at noon, as a share of what an overhead Sun gives:
 * sin of the noon altitude, and 0 when the Sun is below the horizon. The beam that would cover
 * one square metre with the Sun overhead is spread over 1 / sin(altitude) square metres. The air,
 * which absorbs more at low angles, is left out.
 */
export function noonShare(latitude: number, declination: number): number {
  return Math.max(0, Math.sin((sunlight(latitude, declination).altitude * Math.PI) / 180));
}
/**
 * The length of level ground, in metres along the Sun's direction, that a noon beam one metre
 * across (measured at right angles to its rays) lands on: 1 / sin of the noon altitude, so the
 * share per square metre is 1 / patch. Null when the noon Sun is below the horizon.
 */
export function noonPatch(latitude: number, declination: number): number | null {
  const { altitude } = sunlight(latitude, declination);
  return altitude > 0 ? 1 / Math.sin((altitude * Math.PI) / 180) : null;
}
/**
 * Earth's distance from the Sun in astronomical units on a day of the year (0 = 1 January):
 * R = 1.00014 − 0.01671 cos g − 0.00014 cos 2g (Wikipedia, Position of the Sun), with the mean
 * anomaly g = 360° × (day − 2) / 365, zero at perihelion about 2 days after 1 January, as that
 * article's (N − 2) term puts it.
 */
export function sunDistance(day: number): number {
  const g = (2 * Math.PI * (day - 2)) / 365;
  return 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
}
/** Day of the year (0 = 1 January) of each month's 15th, in a common year. */
export const MID_MONTH = [14, 45, 73, 104, 134, 165, 195, 226, 257, 287, 318, 348] as const;
/** The Sun's declination in degrees, from the usual cosine approximation: −23.44° × cos(360° × (day + 10) / 365). */
export const declinationOn = (day: number) => -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365);
/** Daylight hours on the 15th of each month. */
export function daylightYear(latitude: number): number[] {
  return MID_MONTH.map((day) => Math.round(sunlight(latitude, declinationOn(day)).daylight * 10) / 10);
}

// SHA-256 (FIPS 180-4), used for the RFC 7636 example without host crypto globals.
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];
export function sha256(input: string): Uint8Array {
  const bytes = new TextEncoder().encode(input),
    length = Math.ceil((bytes.length + 9) / 64) * 64,
    data = new Uint8Array(length);
  data.set(bytes);
  data[bytes.length] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(length - 4, bytes.length * 8);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (v: number, n: number) => (v >>> n) | (v << (32 - n));
  for (let o = 0; o < length; o += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!,
        b = w[i - 2]!;
      w[i] =
        w[i - 16]! +
        (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) +
        w[i - 7]! +
        (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, j] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const t1 = j + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!,
        t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      j = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, j].forEach((v, i) => (h[i] = (h[i]! + v) | 0));
  }
  const out = new Uint8Array(32),
    dv = new DataView(out.buffer);
  h.forEach((v, i) => dv.setUint32(i * 4, v));
  return out;
}
export function pkceChallenge(verifier: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
    bytes = sha256(verifier);
  let out = '',
    bits = 0,
    value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += alphabet[(value >>> bits) & 63];
    }
  }
  if (bits) out += alphabet[(value << (6 - bits)) & 63];
  return out;
}
