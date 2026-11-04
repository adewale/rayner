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
