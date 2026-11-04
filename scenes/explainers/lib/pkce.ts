/**
 * The PKCE exchange as data: which message carries which parameter over which channel, and what the token endpoint
 * answers (RFC 7636 §4.3–4.6, RFC 6749 §4.1). No drawing here; oauth-pkce draws its sequence diagrams from these
 * messages. Tested in test/explain-pkce.test.ts.
 */
import { pkceChallenge } from './models.ts';

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
 * The sign-in's next state, or undefined for what the protocol refuses: a second authorization request, a redirect
 * before there is a code or delivered twice to the same app, and a token request from an app without the code or
 * from one that already has its answer.
 */
export function signInNext(state: SignIn, event: SignInEvent): SignIn | undefined {
  switch (event) {
    case 'AUTHORIZE':
    case 'AUTHORIZE_S256':
      if (state.requested) return undefined;
      return { ...state, requested: true, challenge: event === 'AUTHORIZE_S256' ? pkceChallenge(VERIFIER) : null };
    case 'REDIRECT':
    case 'INTERCEPT': {
      const who = event === 'REDIRECT' ? 'client' : 'app';
      if (!state.requested || state[who].code) return undefined;
      return { ...state, [who]: { ...state[who], code: true } };
    }
    case 'CLIENT_REDEEMS':
    case 'APP_REDEEMS': {
      const who = event === 'CLIENT_REDEEMS' ? 'client' : 'app';
      if (!state[who].code || state[who].answer !== null) return undefined;
      const answer = answerFor(state, who);
      return { ...state, [who]: { ...state[who], answer }, spent: state.spent || answer === 'Access token' };
    }
  }
}
