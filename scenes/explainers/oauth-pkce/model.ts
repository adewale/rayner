/**
 * The PKCE exchange as data: which message carries which parameter over which channel, and what the token endpoint
 * answers (RFC 7636 §4.3–4.6, RFC 6749 §4.1). No drawing here; oauth-pkce draws its sequence diagrams from these
 * messages. Tested in test/explain-pkce.test.ts.
 */
import { refuse } from '../../../src/index.ts';
import type { Refusal } from '../../../src/index.ts';


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


/** RFC 7636 appendix B's example verifier (32 random octets, base64url). */
export const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
/** What a thief that never saw the verifier sends in its place. */
export const GUESS = 'attacker-does-not-know-the-original-verifier';
/** RFC 6749 §4.1.2's example authorization code. */
const CODE = 'SplxlOBeZQQYbYS6WxSbIA';

export type Answer = 'Access token' | 'invalid_grant';
export interface Message {
  from: string;
  to: string;
  /** The words on the arrow. */
  text: string;
  /** Through the browser and the operating system's redirect, or the client's own TLS connection to the server. */
  channel: 'browser' | 'tls';
  /** Each parameter the message carries, with its value. */
  carries: Record<string, string>;
}

/**
 * The token endpoint, given the challenge stored with the code (if any) and the verifier presented. Only the PKCE
 * comparison is modelled: the code, client ID and redirect URI are assumed valid.
 */
export function redeem(bound: string | undefined, verifier: string | undefined): Answer {
  // RFC 6749 §4.1.3: a public client authenticates with nothing more than the code.
  if (bound === undefined) return 'Access token';
  // RFC 7636 §4.5 makes code_verifier required; the answer to a request without one is not modelled.
  if (verifier === undefined) throw new Error('A bound code redeemed without a verifier is not modelled');
  // §4.6: S256 of the verifier must equal the stored challenge, else invalid_grant.
  return pkceChallenge(verifier) === bound ? 'Access token' : 'invalid_grant';
}

/** A message as the channel map draws it: its ends, its words and the names of the parameters it carries. */
export interface LaneMessage {
  from: string;
  to: string;
  text: string;
  carries: string[];
}
/** One party's messages, grouped by channel and in order: what crosses the browser and what crosses TLS. */
export function lanes(flow: Message[], party = 'C'): Record<Message['channel'], LaneMessage[]> {
  const lane = (channel: Message['channel']) =>
    flow
      .filter((m) => m.channel === channel && (m.from === party || m.to === party))
      .map(({ from, to, text, carries }) => ({ from, to, text, carries: Object.keys(carries) }));
  return { browser: lane('browser'), tls: lane('tls') };
}
/**
 * Every parameter that crosses the browser channel, with its value: what an app that registers the same URI scheme,
 * or otherwise reads the authorization request and its redirect, can hold (RFC 7636 §1).
 */
export function readable(flow: Message[]): Record<string, string> {
  return Object.assign({}, ...flow.filter((m) => m.channel === 'browser').map((m) => m.carries));
}

/** The theft before PKCE:the malicious app M catches the redirect and redeems the code alone. */
export function theftFlow(): Message[] {
  return [
    { from: 'C', to: 'S', text: 'Authorize request', channel: 'browser', carries: {} },
    { from: 'S', to: 'C', text: 'Redirect with code', channel: 'browser', carries: { code: CODE } },
    { from: 'S', to: 'M', text: 'Redirect via the shared URI scheme', channel: 'browser', carries: { code: CODE } },
    { from: 'M', to: 'S', text: 'Token request: code', channel: 'tls', carries: { code: CODE } },
    { from: 'S', to: 'M', text: redeem(undefined, undefined), channel: 'tls', carries: {} },
  ];
}

/** The PKCE exchange with S256; with an attacker, the malicious app X catches the redirect and sends a guess. */
export function pkceFlow(attacker: boolean, verifier = VERIFIER, guess = GUESS): Message[] {
  const challenge = pkceChallenge(verifier);
  return [
    {
      from: 'C', to: 'S', text: 'Authorize request + code_challenge', channel: 'browser',
      carries: { code_challenge: challenge, code_challenge_method: 'S256' },
    },
    { from: 'S', to: 'C', text: 'Redirect with code', channel: 'browser', carries: { code: CODE } },
    ...(attacker
      ? ([
          { from: 'S', to: 'X', text: 'Redirect via the shared URI scheme', channel: 'browser', carries: { code: CODE } },
          { from: 'X', to: 'S', text: 'Token request: code + a guess', channel: 'tls', carries: { code: CODE, code_verifier: guess } },
          { from: 'S', to: 'X', text: redeem(challenge, guess), channel: 'tls', carries: {} },
        ] satisfies Message[])
      : []),
    { from: 'C', to: 'S', text: 'Token request: code + code_verifier', channel: 'tls', carries: { code: CODE, code_verifier: verifier } },
    { from: 'S', to: 'C', text: redeem(challenge, verifier), channel: 'tls', carries: {} },
  ];
}

/**
 * One sign-in as a machine: the client's authorization request (with or without a challenge), the redirect that
 * brings the code back to the client, the same redirect caught by the malicious app, and each app's token request
 * with the server's answer. The order is the network's and the device's, so any order the protocol allows can
 * happen; `signInNext` refuses what it does not allow. The state is who holds what, not the order that got there.
 */
export type SignInEvent = 'AUTHORIZE' | 'AUTHORIZE_S256' | 'REDIRECT' | 'INTERCEPT' | 'CLIENT_REDEEMS' | 'APP_REDEEMS';
export const SIGN_IN_EVENTS: readonly SignInEvent[] = ['AUTHORIZE', 'AUTHORIZE_S256', 'REDIRECT', 'INTERCEPT', 'CLIENT_REDEEMS', 'APP_REDEEMS'];
/** What one app holds: the code, once a redirect brought it, and the server's answer to its token request. */
export interface Holder {
  code: boolean;
  answer: Answer | null;
}
export interface SignIn {
  /** Whether the client has sent its authorization request (one per sign-in). */
  requested: boolean;
  /** The code_challenge that request carried, which the server stores with the code; null without one. */
  challenge: string | null;
  client: Holder;
  app: Holder;
  /** Whether the server has issued a token for the code: RFC 6749 §4.1.2 lets a code be used once. */
  spent: boolean;
}

/** Before the sign-in: nothing sent, nobody holds the code. */
export function signInStart(): SignIn {
  return { requested: false, challenge: null, client: { code: false, answer: null }, app: { code: false, answer: null }, spent: false };
}

/**
 * The token endpoint for one app's request: invalid_grant for a code already used (RFC 6749 §4.1.2), otherwise
 * `redeem`. The client sends its verifier when its request carried a challenge; the malicious app, which never saw
 * the verifier, sends a guess in its place, and sends the code alone when no challenge was stored. A refused request
 * leaves the code unused, as pkceFlow assumes when the client redeems after the guess.
 */
function answerFor(state: SignIn, who: 'client' | 'app'): Answer {
  if (state.spent) return 'invalid_grant';
  const bound = state.challenge ?? undefined;
  return redeem(bound, bound === undefined ? undefined : who === 'client' ? VERIFIER : GUESS);
}

/**
 * The sign-in's next state, or a refusal saying what the protocol does not allow: a second authorization request, a
 * redirect before there is a code or delivered twice to the same app, and a token request from an app without the
 * code or from one that already has its answer.
 */
export function signInNext(state: SignIn, event: SignInEvent): SignIn | Refusal {
  const named = { client: 'the client', app: 'the malicious app' } as const;
  switch (event) {
    case 'AUTHORIZE':
    case 'AUTHORIZE_S256':
      if (state.requested) return refuse('the client has sent its authorization request already, and a sign-in sends one');
      return { ...state, requested: true, challenge: event === 'AUTHORIZE_S256' ? pkceChallenge(VERIFIER) : null };
    case 'REDIRECT':
    case 'INTERCEPT': {
      const who = event === 'REDIRECT' ? 'client' : 'app';
      if (!state.requested) return refuse('there is no code to redirect yet: the client has not sent its authorization request');
      if (state[who].code) return refuse(who === 'client' ? 'the redirect has brought the code to the client already' : 'the malicious app has caught the redirect already');
      return { ...state, [who]: { ...state[who], code: true } };
    }
    case 'CLIENT_REDEEMS':
    case 'APP_REDEEMS': {
      const who = event === 'CLIENT_REDEEMS' ? 'client' : 'app';
      if (!state[who].code) return refuse(`${named[who]} has no code to redeem: no redirect has brought it one`);
      if (state[who].answer !== null) return refuse(`${named[who]} has redeemed the code already, and the server answered ${state[who].answer}`);
      const answer = answerFor(state, who);
      return { ...state, [who]: { ...state[who], answer }, spent: state.spent || answer === 'Access token' };
    }
  }
}
