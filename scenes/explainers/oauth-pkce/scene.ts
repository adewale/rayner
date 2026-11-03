import { Scene } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import { pkceChallenge, sha256 } from '../lib/models.ts';
import { pkceFlow, theftFlow, VERIFIER, GUESS, type Message } from '../lib/pkce.ts';
const STYLE = 'github-light';
// One colour per value, so the reader can follow each across the flow (outcomes use the stage's good and bad).
const CHALLENGE = '#0969da',
  CODE = '#bc4c00';
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
/** A value's first six characters, as the notes say it; the server compares all of them. */
// Six characters keep the attack's note, both prefixes side by side, within one phone close-up.
const prefix = (value: string) => `${value.slice(0, 6)}…`;
const NAMES: Record<string, string> = { C: 'Client', S: 'Auth server', M: 'Malicious app', X: 'Malicious app' };
/**
 * A sequence diagram drawn from the model's messages (lib/pkce.ts); the server's messages are dashed replies. The
 * theft before PKCE calls the malicious app M, so its diagram is told apart from the PKCE flow's, where it is X.
 */
function sequence(messages: Message[]): string {
  const ids = [...new Set(messages.flatMap((m) => [m.from, m.to]))].sort((a, b) => 'CSMX'.indexOf(a) - 'CSMX'.indexOf(b));
  return [
    'sequenceDiagram',
    ...ids.map((id) => ` participant ${id} as ${NAMES[id]}`),
    ...messages.map((m) => ` ${m.from}${m.from === 'S' ? '-->>' : '->>'}${m.to}: ${m.text}`),
  ].join('\n');
}
/** Each message's part id in the drawn diagram: the messages between one pair are numbered in order. */
function messageIds(messages: Message[]): string[] {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const pair = `${m.from}->${m.to}`,
      n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    return `message:${pair}#${n}`;
  });
}
export default class OAuthExplainer extends Scene {
  static meta = {
    id: 'oauth-pkce',
    title: 'Why stealing an authorization code is not enough',
    sources: ['https://www.rfc-editor.org/rfc/rfc7636', 'https://www.rfc-editor.org/rfc/rfc6749'],
    answer: 'Redeeming the code also needs the verifier, which never passes through the redirect',
    checks: [
      {
        question: 'Why does the app not embed one fixed client secret in its program and send that with the token request instead?',
        answer: 'Every installed copy carries the same secret, so anyone can extract it from the program, including the author of the malicious app, and the server could not tell the copies apart. The verifier is made fresh for each sign-in and stays on the device until the client’s own TLS request.',
      },
      {
        question: 'Suppose the malicious app can also read the authorization request, so it holds the challenge E9Melh… as well as the code. Can it now redeem the code?',
        answer: 'No. The server wants a verifier whose S256 equals the challenge. Knowing the challenge does not produce such a verifier: finding one for a verifier made from 32 random bytes is computationally infeasible, so whatever the app sends still gets invalid_grant.',
      },
      {
        question: 'RFC 7636 also defines a plain method, in which the challenge is the verifier itself. Against the app in the previous question, what changes?',
        answer: 'It succeeds. The challenge it read is the verifier, so it can present the code with that verifier and get a token. Plain protects only when the authorization request itself cannot be read, which is why RFC 7636 requires clients that can use S256 to use it (§4.2, §7.2).',
      },
    ],
    claims: [
      { says: 'which never passes through the redirect', test: 'test/explain-pkce.test.ts: the verifier travels only in the client’s token request' },
      { says: 'gets only the code', test: 'test/explain-pkce.test.ts: the verifier travels only in the client’s token request' },
      { says: 'goes only in the client’s own TLS request', test: 'test/explain-pkce.test.ts: the verifier travels only in the client’s token request' },
    ],
  };
  static settings = [
    {
      id: 'attacker',
      label: 'Replay the theft against PKCE',
      default: 'yes',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
  ];
  override async construct() {
    const attacker = settingsOf(this).attacker === 'yes';
    const digest = sha256(VERIFIER),
      challenge = pkceChallenge(VERIFIER),
      s = stage(this, { headingSize: 0.6, style: STYLE });

    // 1. The theft, before any fix: the code alone buys a token.
    await this.step('stolen', {
      title: 'Another app can catch the redirect and redeem its code',
      line: 'Predict: the thief has the code and public request fields. What could stop it?',
      caption:
        'A mobile or desktop app often gets its authorization code back as a redirect to a custom URI scheme. Another app on the device can register the same scheme, and the operating system may hand it the redirect and its code (RFC 7636 §1). This public client has no client secret. The thief knows the ordinary token-request fields, such as the client ID and redirect URI, so presenting the stolen code gets it an access token in this unprotected exchange.',
    });
    const stolen = theftFlow(),
      stolenIds = messageIds(stolen);
    const theft = await s.show({ source: sequence(stolen) }, { box: 'full', build: 'frame' });
    const thief = stolenIds.filter((_, i) => stolen[i]!.from === 'M' || stolen[i]!.to === 'M');
    await theft.reveal(stolenIds.filter((id) => !thief.includes(id)));
    await theft.reveal(thief);
    await theft.mark(thief, { color: s.bad, as: 'theft' });
    await theft.note(thief.at(-1)!, 'a token for the wrong app', { side: 'below', color: s.bad });
    // A phone opens on the theft, not on the sign-in above it.
    s.reading(...thief.map((id) => theft.get(id)));
    this.state = { stolenAccepted: stolen.at(-1)!.text === 'Access token' };

    // 2. The fix: a secret the code is bound to, sent ahead only as its hash.
    await this.step('secret', {
      title: 'Answer: bind the code to a secret the real client keeps',
      line: 'The challenge is the base64url SHA-256 of the verifier.',
      caption:
        'A fixed secret shipped inside the app could be extracted from any copy, so for each sign-in the client makes a fresh random code_verifier and keeps it. Ahead of the redirect it sends the code_challenge instead: the verifier’s SHA-256 in base64url, a method called S256. Redeeming the code also needs the verifier, which never passes through the redirect. The server stores the challenge now and recognizes the right verifier later without having seen it. This is PKCE, Proof Key for Code Exchange; the card uses RFC 7636’s example verifier.',
    });
    await s.clear();
    const derive = await s.show(
      {
        source: 'graph LR\nV[code_verifier] -->|SHA-256| H[32-byte digest]\nH -->|base64url| C[code_challenge]',
      },
      { box: regionBox('full', { bottom: 0, top: 3.15 }) },
    );
    const values = await s.card(
      [
        ['code_verifier', VERIFIER],
        ['SHA-256 (hex)', hex(digest)],
        ['code_challenge', challenge],
      ],
      { at: regionBox('full', { bottom: -3.9, top: -0.4 }), fontSize: 0.27 },
    );
    await derive.walk(
      [
        ['V', 'H'],
        ['H', 'C'],
      ],
      { trail: true },
    );
    await derive.mark(['C'], { color: CHALLENGE });
    await values.mark('code_challenge');
    this.state = { verifier: VERIFIER, challenge };

    const flow = pkceFlow(attacker, VERIFIER, GUESS),
      ids = messageIds(flow);
    /** The diagram id of the first message the predicate picks. */
    const idOf = (pred: (m: Message) => boolean) => ids[flow.findIndex(pred)]!;
    const authorize = idOf((m) => 'code_challenge' in m.carries),
      redirect = idOf((m) => m.to === 'C' && 'code' in m.carries),
      caught = attacker ? idOf((m) => m.to === 'X' && 'code' in m.carries) : undefined,
      guess = attacker ? idOf((m) => m.from === 'X') : undefined,
      refused = attacker ? idOf((m) => m.from === 'S' && m.to === 'X' && m.channel === 'tls') : undefined,
      request = idOf((m) => m.carries.code_verifier === VERIFIER),
      token = idOf((m) => m.from === 'S' && m.to === 'C' && m.channel === 'tls');

    await this.step('authorize', {
      title: 'The authorization request carries the challenge and S256',
      line: 'It goes through the browser, so treat the challenge as public.',
      caption:
        'The client sends the challenge and the S256 method in the authorization request, through the user’s browser. The challenge is treated as public; the verifier stays with the client and is not sent. The user then signs in and consents at the auth server.',
    });
    await s.clear();
    const seq = await s.show({ source: sequence(flow) }, { box: 'full', build: 'frame' });
    /** What a message carries, or what the server makes of it, said on the diagram under its arrow. */
    const say = (id: string, text: string, color: string = s.palette.ink) =>
      seq.note(id, text, { side: 'below', color });
    await seq.reveal([authorize]);
    await seq.mark([authorize], { color: CHALLENGE, as: 'carries the challenge' });
    // Short enough to read whole in one phone close-up.
    await say(authorize, 'challenge + S256; verifier not sent', CHALLENGE);

    await this.step('code', {
      title: 'The redirect carries a short-lived code bound to the challenge',
      line: attacker
        ? 'Predict: the malicious app catches this code again. What happens when it redeems it?'
        : 'An interceptor gets only the code; the verifier is not in it.',
      caption:
        'The server stores the challenge with a short-lived code and redirects the browser back to the client. Because the verifier has not travelled, an app that catches this redirect gets the code and nothing else, and the code still has to be exchanged for an access token.',
    });
    await s.clearOverlays();
    await seq.reveal([redirect]);
    await seq.mark([redirect], { color: CODE, as: 'carries the code' });
    await say(redirect, 'code bound to the challenge', CODE);

    if (attacker) {
      await this.step('attack', {
        title: 'Answer: invalid_grant. The stolen code fails without the verifier',
        line: 'S256 of the guess differs from the challenge bound to the code.',
        caption:
          'The malicious app catches the redirect and its code as before, but the token request now needs a verifier. Lacking it, the app sends a guess. The server computes S256 of the guess, compares it with the challenge stored with the code, finds they differ and answers invalid_grant. The note shows six characters of each; the server compares the whole value.',
      });
      const bad = pkceChallenge(GUESS);
      this.state.attackerChallenge = bad;
      this.state.attackerAccepted = flow.find((m) => m.to === 'X' && m.channel === 'tls')!.text === 'Access token';
      await s.clearOverlays();
      const attack = [caught!, guess!, refused!];
      await seq.reveal(attack);
      await seq.mark(attack, { color: s.bad, as: 'attack' });
      // The server's check, said where it happens: the guess as sent, then the answer.
      await say(refused!, `S256(guess) = ${prefix(bad)} ≠ ${prefix(challenge)}`, s.bad);
    }

    await this.step('exchange', {
      title: 'The real client redeems the code: S256 of its verifier matches',
      line: attacker
        ? 'The calculation that rejected the guess now finds equal values.'
        : 'The server hashes the verifier and compares it with the stored challenge.',
      caption:
        'The real client sends the code with the verifier it kept. The server computes S256 of the verifier, finds that it equals the challenge stored with the code, and returns an access token, provided its usual checks on the code and the client also pass.',
    });
    await s.clearOverlays();
    await seq.reveal([request, token]);
    await seq.mark([request, token], { color: s.good, as: 'accepted' });
    const recomputed = pkceChallenge(VERIFIER);
    const accepted = flow.find((m) => m.to === 'C' && m.channel === 'tls')!.text === 'Access token';
    await say(token, `S256(verifier) = ${prefix(recomputed)} ${recomputed === challenge ? '=' : '≠'} bound challenge`, accepted ? s.good : s.bad);
    this.state.accepted = accepted;

    await this.step('channels', {
      title: 'The code crosses the browser; the verifier does not',
      line: 'Challenge and code pass the browser; the verifier goes by TLS.',
      caption:
        'The challenge and the code pass through the browser and the operating system, where another app can read them. The verifier, made from 32 random bytes, goes only in the client’s own TLS request to the token endpoint. Reading the challenge does not help a thief, because finding a verifier whose S256 equals it is computationally infeasible. The protection lasts while the verifier stays secret: an attacker who can read the app’s memory gets the verifier as well as the code, and the server can no longer tell the two apps apart.',
    });
    await s.clearOverlays();
    await seq.unmark();
    // The marks follow the model's channels: what crosses the browser, and the request that carries the verifier.
    const exposed = ids.filter((id, i) => flow[i]!.channel === 'browser');
    await seq.mark(exposed, { color: s.bad, as: 'readable on the device' });
    await seq.mark([request], { color: s.good, as: 'direct TLS' });
    await say(token, 'The verifier, 32 random bytes, went only by TLS', s.good);
  }
}
