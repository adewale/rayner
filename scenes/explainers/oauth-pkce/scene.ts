import { Scene } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import { pkceChallenge, sha256 } from '../lib/models.ts';
const STYLE = 'github-light';
// RFC 7636 appendix B's example verifier; everything derived from it is computed below.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const GUESS = 'attacker-does-not-know-the-original-verifier';
// One colour per value, so the reader can follow each across the flow (outcomes use the stage's good and bad).
const CHALLENGE = '#0969da',
  CODE = '#bc4c00';
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
/** A value's first eight characters, as the notes say it; the server compares all of them. */
// Six characters keep the attack's note, both prefixes side by side, within one phone close-up.
const prefix = (value: string) => `${value.slice(0, 6)}…`;
/**
 * The theft PKCE answers (RFC 7636 §1): a public client has no secret, so without PKCE the code
 * alone buys a token. The malicious app is M here, so this diagram is told apart from the PKCE flow's.
 */
const STOLEN = [
  'sequenceDiagram',
  ' participant C as Client',
  ' participant S as Auth server',
  ' participant M as Malicious app',
  ' C->>S: Authorize request',
  ' S-->>C: Redirect with code',
  ' S-->>M: Redirect via the shared URI scheme',
  ' M->>S: Token request: code',
  ' S-->>M: Access token',
].join('\n');
function sequence(attacker: boolean): string {
  return [
    'sequenceDiagram',
    ' participant C as Client',
    ' participant S as Auth server',
    ...(attacker ? [' participant X as Malicious app'] : []),
    ' C->>S: Authorize request + code_challenge',
    ' S-->>C: Redirect with code',
    ...(attacker
      ? [
          ' S-->>X: Redirect via the shared URI scheme',
          ' X->>S: Token request: code + a guess',
          ' S-->>X: invalid_grant',
        ]
      : []),
    ' C->>S: Token request: code + code_verifier',
    ' S-->>C: Access token',
  ].join('\n');
}
export default class OAuthExplainer extends Scene {
  static meta = {
    id: 'oauth-pkce',
    title: 'Why stealing an authorization code is not enough',
    sources: ['https://www.rfc-editor.org/rfc/rfc7636', 'https://www.rfc-editor.org/rfc/rfc6749'],
    // The script's answer and check questions (script.md); check holds the secret step to stating the answer.
    answer: 'Redeeming the code also needs the verifier, which never passes through the redirect',
    checks: [
      {
        question: 'Without PKCE, does redeeming the intercepted code require a secret held by the public client?',
        answer: 'No. The attacker still supplies ordinary token-request fields, such as the client ID and matching redirect URI, but these are not client-held secrets. In this exchange the stolen code is enough to impersonate the client.',
      },
      {
        question: 'The thief sends the stolen code with a guessed verifier. What does the server compute, and what does it answer?',
        answer: 'The base64url SHA-256 of the guess. It differs from the challenge bound to the code, so the server answers invalid_grant.',
      },
      {
        question: 'RFC 7636’s example verifier is dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk. Which challenge is bound to the code?',
        answer: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM, the base64url encoding of the verifier’s SHA-256.',
      },
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
    const theft = await s.show({ source: STOLEN }, { box: 'full', build: 'frame' });
    const thief = ['message:S->M#0', 'message:M->S#0', 'message:S->M#1'];
    await theft.reveal(['message:C->S#0', 'message:S->C#0']);
    await theft.reveal(thief);
    await theft.mark(thief, { color: s.bad, as: 'theft' });
    await theft.note('message:S->M#1', 'a token for the wrong app', { side: 'below', color: s.bad });
    // A phone opens on the theft, not on the sign-in above it.
    s.reading(...thief.map((id) => theft.get(id)));
    this.state = { stolenAccepted: true };

    // 2. The fix: a secret the code is bound to, sent ahead only as its hash.
    await this.step('secret', {
      title: 'Answer: bind the code to a secret only the real client holds',
      line: 'The challenge is the base64url SHA-256 of the verifier.',
      caption:
        'A fixed secret distributed inside the app can be extracted, so for each sign-in the client instead makes a fresh random code_verifier and keeps it. It sends ahead only the code_challenge, the verifier’s SHA-256 in base64url, a method called S256. Redeeming the code also needs the verifier, which never passes through the redirect. The server can store the challenge now and recognize the right verifier later without learning the secret in advance. The card uses RFC 7636’s example verifier.',
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

    await this.step('authorize', {
      title: 'The authorization request carries the challenge and S256',
      line: 'It goes through the browser, so treat the challenge as public.',
      caption:
        'The client sends the challenge and the S256 method in the authorization request, through the user’s browser. The challenge is treated as public; the verifier stays with the client and is not sent. The user then signs in and consents at the auth server.',
    });
    await s.clear();
    const seq = await s.show({ source: sequence(attacker) }, { box: 'full', build: 'frame' });
    /** What a message carries, or what the server makes of it, said on the diagram under its arrow. */
    const say = (id: string, text: string, color: string = s.palette.ink) =>
      seq.note(id, text, { side: 'below', color });
    await seq.reveal(['message:C->S#0']);
    await seq.mark(['message:C->S#0'], { color: CHALLENGE, as: 'carries the challenge' });
    // Short enough to read whole in one phone close-up.
    await say('message:C->S#0', 'challenge + S256; verifier not sent', CHALLENGE);

    await this.step('code', {
      title: 'The redirect carries a short-lived code bound to the challenge',
      line: attacker
        ? 'Predict: the malicious app catches this code again. What happens when it redeems it?'
        : 'An interceptor gets only the code; the verifier is not in it.',
      caption:
        'The server stores the challenge with a short-lived code and redirects the browser back to the client. Because the verifier never travelled, anyone who intercepts this redirect gets only the code, which must still be exchanged for an access token.',
    });
    await s.clearOverlays();
    await seq.reveal(['message:S->C#0']);
    await seq.mark(['message:S->C#0'], { color: CODE, as: 'carries the code' });
    await say('message:S->C#0', 'code bound to the challenge', CODE);

    if (attacker) {
      await this.step('attack', {
        title: 'Answer: invalid_grant. The stolen code fails without the verifier',
        line: 'S256 of the guess differs from the challenge bound to the code.',
        caption:
          'The malicious app gets the redirect and its code as before, but now the token request must carry a verifier too. It can only guess one; S256 of the guess does not match the challenge bound to the code, so the server answers invalid_grant. The displayed prefixes differ already; the server checks the full challenge, not just the prefix.',
      });
      const bad = pkceChallenge(GUESS);
      this.state.attackerChallenge = bad;
      this.state.attackerAccepted = bad === challenge;
      await s.clearOverlays();
      await seq.reveal(['message:S->X#0', 'message:X->S#0', 'message:S->X#1']);
      await seq.mark(['message:S->X#0', 'message:X->S#0', 'message:S->X#1'], { color: s.bad, as: 'attack' });
      // The server's check, said where it happens: the guess as sent, then the answer.
      await say('message:S->X#1', `S256(guess) = ${prefix(bad)} ≠ ${prefix(challenge)}`, s.bad);
    }

    await this.step('exchange', {
      title: 'The token endpoint returns a token only when S256(verifier) matches',
      line: 'The real verifier hashes to the bound challenge, so they match.',
      caption:
        'The real client sends the code with the original verifier. The server computes S256 of the verifier, finds that it matches the challenge stored with the code, and returns an access token once its usual code and client checks also pass.',
    });
    await s.clearOverlays();
    await seq.reveal(['message:C->S#1', 'message:S->C#1']);
    await seq.mark(['message:C->S#1', 'message:S->C#1'], { color: s.good, as: 'accepted' });
    const recomputed = pkceChallenge(VERIFIER);
    const accepted = recomputed === challenge;
    await say('message:S->C#1', `S256(verifier) = ${prefix(recomputed)} ${accepted ? '=' : '≠'} bound challenge`, accepted ? s.good : s.bad);
    this.state.accepted = accepted;

    await this.step('channels', {
      title: 'The verifier never travels where the code does',
      line: 'Challenge and code pass the browser; the verifier goes by TLS.',
      caption:
        'The challenge and the code pass through the browser and the operating system, where another app can read them. The verifier, made from 32 random bytes, goes only in the client’s own TLS request to the token endpoint. Finding a verifier that matches its S256 challenge is computationally infeasible, so catching the redirect does not give the thief a practical way to redeem the code. This protection depends on keeping the verifier secret.',
    });
    await s.clearOverlays();
    await seq.unmark();
    await seq.mark(['message:C->S#0', 'message:S->C#0', ...(attacker ? ['message:S->X#0'] : [])], {
      color: s.bad,
      as: 'readable on the device',
    });
    await seq.mark(['message:C->S#1'], { color: s.good, as: 'direct TLS' });
    await say('message:S->C#1', 'The verifier, 32 random bytes, went only by TLS', s.good);
  }
}
