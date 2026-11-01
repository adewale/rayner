import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/oauth-pkce.ts';
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
  };
  static settings = [
    {
      id: 'attacker',
      label: 'Show an attacker',
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

    await readerFirst(this, s, readerFrames(attacker));
    await this.step('secret', {
      detail: true,
      title: 'The client keeps the verifier and sends only its challenge',
      line: 'The challenge is the base64url SHA-256 of the verifier.',
      caption:
        'PKCE protects public clients, such as mobile and desktop apps, which cannot keep a client secret. The client generates a random verifier, and the S256 challenge is the base64url SHA-256 of it. The card starts from RFC 7636’s example verifier.',
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
      detail: true,
      title: 'The authorization request carries the challenge and S256',
      line: 'The request carries the challenge and S256, never the verifier.',
      caption:
        'The client sends the challenge and the S256 method in the authorization request, through the user’s browser, as the note under it says, while the verifier stays with the client and is not sent. The user then signs in and consents at the auth server.',
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
      detail: true,
      title: 'The redirect carries a short-lived code bound to the challenge',
      line: 'An interceptor gets only the code; the verifier is not in it.',
      caption:
        'The server stores the challenge with a short-lived code and redirects the browser back to the client. Because the verifier never travelled, anyone who intercepts this redirect gets only the code, which must still be exchanged for an access token.',
    });
    await s.clearOverlays();
    await seq.reveal(['message:S->C#0']);
    await seq.mark(['message:S->C#0'], { color: CODE, as: 'carries the code' });
    await say('message:S->C#0', 'code bound to the challenge', CODE);

    if (attacker) {
      await this.step('attack', {
        detail: true,
        title: 'A stolen code fails without the verifier',
        line: 'S256 of the guess differs from the challenge: invalid_grant.',
        caption:
          'Another app on the device registered the client’s custom URI scheme, so the operating system handed it the redirect and its code (RFC 7636 §1). It has to guess the verifier; S256 of the guess does not match the bound challenge, so the server answers invalid_grant.',
      });
      const bad = pkceChallenge(GUESS);
      this.state.attackerChallenge = bad;
      this.state.attackerAccepted = bad === challenge;
      await s.clearOverlays();
      await seq.reveal(['message:S->X#0', 'message:X->S#0', 'message:S->X#1']);
      await seq.mark(['message:S->X#0', 'message:X->S#0', 'message:S->X#1'], { color: s.bad, as: 'attack' });
      // The server's check, said where it happens: the guess as sent, then the answer.
      await say('message:S->X#1', 'S256(guess) ≠ bound challenge', s.bad);
    }

    await this.step('exchange', {
      detail: true,
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
    await say('message:S->C#1', `S256(verifier) ${accepted ? '=' : '≠'} bound challenge`, accepted ? s.good : s.bad);
    this.state.accepted = accepted;

    await this.step('channels', {
      detail: true,
      title: 'The verifier never travels where the code does',
      line: 'Challenge and code pass the browser; the verifier goes by TLS.',
      caption:
        'The challenge and the code pass through the browser and the operating system, where another app can read them. The verifier, 32 random bytes, goes only in the client’s own TLS request to the token endpoint. S256 cannot be reversed, so the challenge and the code alone cannot be exchanged.',
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
