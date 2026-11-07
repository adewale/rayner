import { Scene, Text, Arrow, Dot, AnimationGroup, Succession, FadeIn } from '../../../src/index.ts';
import type { Choreography, Transition, Diagram, PictureNote, Stage, View } from '../../../explain/index.ts';
import type { ScheduledAnimation } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Machine, view, having, Card } from '../../../explain/index.ts';
import { pkceChallenge, sha256 } from './model.ts';
import { pkceFlow, theftFlow, lanes, readable, signInStart, signInNext, SIGN_IN_EVENTS, VERIFIER, GUESS, type Message, type SignIn, type SignInEvent } from './model.ts';
import { listed } from '../lib/format.ts';
import { CHALLENGE, CODE, NAMES, SENDS, channelMap, laneWords, signInPicture, signInWords, tokenColor, type MessageId } from './picture.ts';
const STYLE = 'github-light';
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
/** A value's first six characters, as the notes say it; the server compares all of them. */
// Six characters keep the attack's note, both prefixes side by side, within one phone close-up.
const prefix = (value: string) => `${value.slice(0, 6)}…`;
/** What a diagram shows besides its source, kept in the state: its marks (with their words) and its notes. */
type Shown = { marks: Record<string, { color: string; as: string }>; notes: PictureNote[] };
const NOTHING_SHOWN: Shown = { marks: {}, notes: [] };
/** What the PKCE steps establish: the verifier and its challenge, what the attack and the exchange get, and the lanes. */
type PkceFacts = {
  verifier: string;
  challenge: string;
  attackerChallenge?: string;
  attackerAccepted?: boolean;
  accepted?: boolean;
  lanes?: ReturnType<typeof lanes>;
  readable?: string[];
};
/** Whether the stolen code got a token; then the PKCE facts; then the sign-in the last step's machine plays. */
type OAuthState = { stolenAccepted: boolean } | PkceFacts | SignIn;
// The derivation's trail and mark, and the card's lit row, are how the secret step shows it: `shown`.
type Derived = { walked: [string, string][]; marked: boolean; lit: string | null };
/** Each sequence diagram's marks and notes, and the derivation's. */
type OAuthShown = { theft?: Shown; seq?: Shown; derive?: Derived };
/** These parts marked in one colour, said with one word. */
const marked = (ids: readonly string[], color: string, as: string) => Object.fromEntries(ids.map((id) => [id, { color, as }]));
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
export default class OAuthExplainer extends Scene<OAuthState, OAuthShown> {
  static meta = {
    sources: ['https://www.rfc-editor.org/rfc/rfc7636', 'https://www.rfc-editor.org/rfc/rfc6749'],
    claims: [
      { says: 'which never passes through the redirect', test: 'model.test.ts: the verifier travels only in the client’s token request' },
      { says: 'gets only the code', test: 'model.test.ts: the verifier travels only in the client’s token request' },
      { says: 'goes only in the client’s own TLS request', test: 'model.test.ts: the verifier travels only in the client’s token request' },
      {
        says: 'in every order of these messages the malicious app never gets a token',
        test: 'model.test.ts: in every order of the sign-in’s messages, only a request without a challenge lets the malicious app get a token',
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
    const stolen = theftFlow(),
      stolenIds = messageIds(stolen);
    const theft = await s.show({ source: sequence(stolen) }, { box: 'full', build: 'frame' });
    const thief = stolenIds.filter((_, i) => stolen[i]!.from === 'M' || stolen[i]!.to === 'M');
    await theft.reveal(stolenIds.filter((id) => !thief.includes(id)));
    await theft.reveal(thief);
    // How each diagram is shown, its marks and notes, is in `shown` under its own name; a view draws them.
    const diagramOf = (d: Diagram, name: 'theft' | 'seq') => s.diagramView(d, (_st, sh) => having(sh, name)[name]);
    const shows = async (v: View, name: 'theft' | 'seq', change: Partial<Shown>) => {
      this.shown[name] = { ...having(this.shown, name)[name], ...change };
      await this.play(v.sync({ runTime: 0.45 }));
    };
    this.shown.theft = NOTHING_SHOWN;
    const theftView = diagramOf(theft, 'theft');
    await shows(theftView, 'theft', {
      marks: marked(thief, s.bad, 'theft'),
      notes: [{ id: thief.at(-1)!, text: 'a token for the wrong app', side: 'below', color: s.bad }],
    });
    // A phone opens on the theft, not on the sign-in above it.
    s.opening(...thief.map((id) => theftView.current.find(id)!));
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
    this.shown = { derive: { walked: [], marked: false, lit: null } satisfies Derived };
    const derived = () => having(this.shown, 'derive').derive;
    const deriveView = s.diagramView(derive, (_st, sh) => {
      const dv = having(sh, 'derive').derive;
      return { marks: { ...derive.trail(dv.walked), ...(dv.marked ? { C: CHALLENGE } : {}) } };
    });
    const values = view(
      this,
      (_st, sh) =>
        new Card(
          this,
          s.palette,
          [
            ['code_verifier', VERIFIER],
            ['SHA-256 (hex)', hex(digest)],
            ['code_challenge', challenge],
          ],
          { at: regionBox('full', { bottom: -3.9, top: -0.4 }), fontSize: 0.27, lit: having(sh, 'derive').derive.lit, key: 'values' },
        ),
      { place: false },
    );
    await s.enter(values, { runTime: 0.35, shift: [0, -0.08] });
    const hops: [string, string][] = [
      ['V', 'H'],
      ['H', 'C'],
    ];
    await derive.walk(hops);
    this.shown.derive = { ...derived(), walked: hops };
    await this.play(deriveView.sync({ runTime: 0.45 }));
    this.shown.derive = { ...derived(), marked: true };
    await this.play(deriveView.sync({ runTime: 0.45 }));
    this.shown.derive = { ...derived(), lit: 'code_challenge' };
    await this.play(values.sync({ runTime: 0.4 }));
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
    const say = (id: string, text: string, color: string = s.palette.ink): PictureNote => ({ id, text, side: 'below', color });
    const seqShown = () => having(this.shown, 'seq').seq;
    let seqView: View | null = null;
    /**
     * Reveal these messages on the live diagram, then show it by its view again with the marks it
     * had, these marked too, and one note under `noted`. The marks and notes go first: the live
     * diagram has none.
     */
    const revealMarked = async (ids: string[], color: string, as: string, note: PictureNote) => {
      const before = seqShown().marks;
      if (seqView) {
        await shows(seqView, 'seq', NOTHING_SHOWN);
        s.liveDiagram(seq);
      }
      await seq.reveal(ids);
      seqView = diagramOf(seq, 'seq');
      await shows(seqView, 'seq', { marks: { ...before, ...marked(ids, color, as) }, notes: [note] });
    };
    this.shown = { seq: NOTHING_SHOWN };
    // Short enough to read whole in one phone close-up.
    await revealMarked([authorize], CHALLENGE, 'carries the challenge', say(authorize, 'challenge + S256; verifier not sent', CHALLENGE));

    await this.step('code', {
      title: 'The redirect carries a short-lived code bound to the challenge',
      line: attacker
        ? 'Predict: the malicious app catches this code again. What happens when it redeems it?'
        : 'An interceptor gets only the code; the verifier is not in it.',
      caption:
        'The server stores the challenge with a short-lived code and redirects the browser back to the client. Because the verifier has not travelled, an app that catches this redirect gets the code and nothing else, and the code still has to be exchanged for an access token.',
    });
    await revealMarked([redirect], CODE, 'carries the code', say(redirect, 'code bound to the challenge', CODE));

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
      const attack = [caught!, guess!, refused!];
      // The server's check, said where it happens: the guess as sent, then the answer.
      await revealMarked(attack, s.bad, 'attack', say(refused!, `S256(guess) = ${prefix(bad)} ≠ ${prefix(challenge)}`, s.bad));
    }

    await this.step('exchange', {
      title: 'The real client redeems the code: S256 of its verifier matches',
      line: attacker
        ? 'The calculation that rejected the guess now finds equal values.'
        : 'The server hashes the verifier and compares it with the stored challenge.',
      caption:
        'The real client sends the code with the verifier it kept. The server computes S256 of the verifier, finds that it equals the challenge stored with the code, and returns an access token, provided its usual checks on the code and the client also pass.',
    });
    const recomputed = pkceChallenge(VERIFIER);
    const accepted = flow.find((m) => m.to === 'C' && m.channel === 'tls')!.text === 'Access token';
    await revealMarked(
      [request, token],
      s.good,
      'accepted',
      say(token, `S256(verifier) = ${prefix(recomputed)} ${recomputed === challenge ? '=' : '≠'} bound challenge`, accepted ? s.good : s.bad),
    );
    this.state.accepted = accepted;

    // 7. The same sign-in redrawn by channel instead of by time: one lane another app can read, one it cannot.
    await this.step('channels', {
      title: 'The code crosses the browser; the verifier does not',
      line: 'Red lane: what another app can read. Green: the client’s own TLS.',
      caption:
        'Drawn by channel instead of by time, the client’s sign-in uses two routes. The challenge and the code pass through the browser and the operating system’s redirect, the red lane, where another app can read them. The verifier, made from 32 random bytes, goes only in the client’s own TLS request to the token endpoint, the green lane, together with the code. Reading the challenge does not help a thief, because finding a verifier whose S256 equals it is computationally infeasible. The protection lasts while the verifier stays secret: an attacker who can read the app’s memory gets the verifier as well as the code, and the server can no longer tell the two apps apart.',
    });
    const map = lanes(flow),
      held = readable(flow);
    this.state.lanes = map;
    this.state.readable = Object.keys(held);
    await s.clear();
    await s.enter(...channelMap(map, s), {
      runTime: 0.5,
      describe: `Two lanes between the client on the left and the auth server on the right. The red, dashed lane is the browser and the redirect, which another app can read: ${laneWords(map.browser)}. The green lane is the client’s own TLS connection to the token endpoint: ${laneWords(map.tls)}. Another app can read ${listed(Object.keys(held))}, and not the code_verifier.`,
    });
    if (attacker) await this.anyOrder(s);
  }

  /**
   * The theft replayed as a machine (lib/pkce.ts: signInNext): the client's request, the redirect to each app and each
   * app's token request, in any order the protocol allows. The run plays the malicious app's head start; rayner check
   * plays every order, and the invariant below holds in each.
   */
  async anyOrder(s: Stage) {
    await this.step('any-order', {
      title: 'Even redeemed first, the stolen code gets invalid_grant',
      line: 'The malicious app catches the redirect first and redeems before the client has the code.',
      caption:
        'Here the malicious app catches the redirect before the client does and sends its token request at once. The server compares S256 of its guess with the challenge stored with the code and answers invalid_grant; in this model the refusal leaves the code unused, so the client’s request with the verifier still gets the token. While the authorization request carries the challenge, in every order of these messages the malicious app never gets a token. Without the challenge, whichever app redeems first gets it, and the other gets invalid_grant, because a code is used once.',
    });
    await s.clear();
    const start = signInStart();
    this.state = { ...start };
    // The sequence diagrams are gone: the machine plays under nothing shown.
    this.shown = {};
    /** The sign-in the machine plays: the state from here on. */
    const signIn = (st: OAuthState) => having(st, 'requested');
    const sheet = view(this, (st) => signInPicture(signIn(st), s), { place: false });
    s.keep(sheet, { describe: () => signInWords(signIn(this.state)) });
    // Checked on every frame, and through every transition from every state rayner check reaches: a code bound to a
    // challenge never gives the malicious app a token, in the model or in the picture.
    this.addInvariant('a code bound to a challenge gives the malicious app no token', (scene) => {
      const st: OAuthState = scene.state;
      if (!('requested' in st) || typeof st.requested !== 'boolean') return false;
      const said = sheet.current.find('sign-in:label:app-answer')?.family().some((m) => m instanceof Text && m.text === 'Access token') ?? false;
      if (st.challenge !== null && (st.app.answer === 'Access token' || said)) return 'the malicious app holds a token for a code bound to a challenge';
      return true;
    });
    await this.play(new FadeIn(sheet, { runTime: 0.4 }));

    const travel = (c: Choreography, id: MessageId, color: string): ScheduledAnimation[] => {
      const message = c.travel(`sign-in:token:${id}`, new Dot({ radius: 0.1, color }), (c.to(`sign-in:msg:${id}`) as Arrow).line, { appear: 0.15, move: 0.7, leave: 0.2 });
      return [
        message.appear,
        new AnimationGroup([message.move, c.enter(`sign-in:msg:${id}`, { create: true }, { runTime: 0.7 })]),
        new AnimationGroup([message.leave, c.enter(`sign-in:label:${id}`, {}, { runTime: 0.3 })]),
      ];
    };
    const machine = new Machine<OAuthState, SignInEvent>(this, {
      start,
      events: SIGN_IN_EVENTS,
      // What the player's buttons say: who sends what.
      labels: {
        AUTHORIZE: 'Authorize, no challenge', AUTHORIZE_S256: 'Authorize with S256', REDIRECT: 'Redirect to the client',
        INTERCEPT: 'App intercepts the redirect', CLIENT_REDEEMS: 'Client redeems the code', APP_REDEEMS: 'App redeems the code',
      },
      next: (st, event) => signInNext(signIn(st), event),
      views: [sheet],
      // A token request travels there and its answer back (2.6 s); any other message travels once (1.4 s).
      runTime: ({ event }) => (event.endsWith('REDEEMS') ? 2.6 : 1.4),
      transition: Object.fromEntries(
        SIGN_IN_EVENTS.map((event) => [
          event,
          (t: Transition<OAuthState, SignInEvent>) => {
            const after = signIn(t.after), c = t.choreograph(sheet);
            // Each message travels from its sender to its receiver as a dot in the colour of what it carries, drawing
            // its arrow; then its label comes in, and the notes under the parties follow.
            const moves = SENDS[event].flatMap((id) => travel(c, id, tokenColor(id, after, s)));
            return new Succession([...moves, c.rest({ runTime: 0.4 })]);
          },
        ]),
      ),
    });
    await this.play(machine.replay(['AUTHORIZE_S256', 'INTERCEPT', 'APP_REDEEMS', 'REDIRECT', 'CLIENT_REDEEMS']));
    // A phone opens on the malicious app's request and the server's refusal.
    s.opening(...['app-request', 'app-answer'].map((id) => sheet.current.find(`sign-in:label:${id}`)!));
  }
}
