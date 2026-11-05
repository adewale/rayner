import { Scene, Group, Rectangle, Text, Arrow, Line, Dot, AnimationGroup, Succession, FadeIn, Machine, choreograph, view } from '../../../src/index.ts';
import type { Animation, Mobject, SceneState, Choreography, Transition, ScheduledAnimation } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import { pkceChallenge, sha256 } from '../lib/models.ts';
import { pkceFlow, theftFlow, lanes, readable, signInStart, signInNext, SIGN_IN_EVENTS, VERIFIER, GUESS, type Message, type LaneMessage, type SignIn, type SignInEvent } from '../lib/pkce.ts';
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
      {
        says: 'in every order of these messages the malicious app never gets a token',
        test: 'test/explain-pkce.test.ts: in every order of the sign-in’s messages, only a request without a challenge lets the malicious app get a token',
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
    await theft.mark(thief, { color: s.bad, as: 'theft' });
    await theft.note(thief.at(-1)!, 'a token for the wrong app', { side: 'below', color: s.bad });
    // A phone opens on the theft, not on the sign-in above it.
    s.opening(...thief.map((id) => theft.get(id)));
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
  async anyOrder(s: ReturnType<typeof stage>) {
    await this.step('any-order', {
      title: 'Even redeemed first, the stolen code gets invalid_grant',
      line: 'The malicious app catches the redirect first and redeems before the client has the code.',
      caption:
        'Here the malicious app catches the redirect before the client does and sends its token request at once. The server compares S256 of its guess with the challenge stored with the code and answers invalid_grant; in this model the refusal leaves the code unused, so the client’s request with the verifier still gets the token. While the authorization request carries the challenge, in every order of these messages the malicious app never gets a token. Without the challenge, whichever app redeems first gets it, and the other gets invalid_grant, because a code is used once.',
    });
    await s.clear();
    const start = signInStart();
    this.state = { ...start } as unknown as SceneState;
    const sheet = view(this, (st) => signInPicture(st as unknown as SignIn, s), { place: false });
    s.keep(sheet, { describe: () => signInWords(this.state as unknown as SignIn) });
    // What the picture marks: each server answer, read from state.
    s.emphasise(() => {
      const st = this.state as unknown as SignIn;
      return (['app', 'client'] as const).filter((who) => st[who].answer)
        .map((who) => [`sign-in:label:${who}-answer`, `${who === 'app' ? 'malicious app' : 'client'}: ${st[who].answer}`] as const);
    });
    // Checked on every frame, and through every transition from every state rayner check reaches: a code bound to a
    // challenge never gives the malicious app a token, in the model or in the picture.
    this.addInvariant('a code bound to a challenge gives the malicious app no token', (scene) => {
      const st = scene.state as unknown as SignIn;
      if (typeof st.requested !== 'boolean') return false;
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
    const machine = new Machine<SignIn, SignInEvent>(this, {
      start,
      events: SIGN_IN_EVENTS,
      // What the player's buttons say: who sends what.
      labels: {
        AUTHORIZE: 'Authorize, no challenge', AUTHORIZE_S256: 'Authorize with S256', REDIRECT: 'Redirect to the client',
        INTERCEPT: 'App intercepts the redirect', CLIENT_REDEEMS: 'Client redeems the code', APP_REDEEMS: 'App redeems the code',
      },
      next: signInNext,
      views: [sheet],
      // A token request travels there and its answer back (2.6 s); any other message travels once (1.4 s).
      runTime: ({ event }) => (event.endsWith('REDEEMS') ? 2.6 : 1.4),
      transition: Object.fromEntries(
        SIGN_IN_EVENTS.map((event) => [
          event,
          (t: Transition<SignIn, SignInEvent>) => {
            const { after } = t, c = t.choreograph(sheet);
            // Each message travels from its sender to its receiver as a dot in the colour of what it carries, drawing
            // its arrow; then its label comes in, and the notes under the parties follow.
            const moves = SENDS[event].flatMap((id) => travel(c, id, tokenColor(id, after, s)));
            return new Succession([...moves, c.rest({ runTime: 0.4 })]);
          },
        ]),
      ) as unknown as Record<SignInEvent, (t: Transition<SignIn, SignInEvent>) => Animation>,
    });
    await this.play(machine.replay(['AUTHORIZE_S256', 'INTERCEPT', 'APP_REDEEMS', 'REDIRECT', 'CLIENT_REDEEMS']));
    // A phone opens on the malicious app's request and the server's refusal.
    s.opening(...['app-request', 'app-answer'].map((id) => sheet.current.find(`sign-in:label:${id}`)!));
  }
}

// ---- the sign-in machine's picture ------------------------------------------------------------

type MessageId = 'authorize' | 'redirect' | 'intercept' | 'client-request' | 'client-answer' | 'app-request' | 'app-answer';
/** The messages each event sends, in order. */
const SENDS: Record<SignInEvent, MessageId[]> = {
  AUTHORIZE: ['authorize'],
  AUTHORIZE_S256: ['authorize'],
  REDIRECT: ['redirect'],
  INTERCEPT: ['intercept'],
  CLIENT_REDEEMS: ['client-request', 'client-answer'],
  APP_REDEEMS: ['app-request', 'app-answer'],
};
/** The three lifelines, left to right. */
const X = { C: -4.6, S: 0, M: 4.6 } as const;
const PARTY = { C: 'Client', S: 'Auth server', M: 'Malicious app' } as const;
/** Where each message's arrow runs: fixed, so any order draws each message in its place. */
const ROUTE: Record<MessageId, { from: keyof typeof X; to: keyof typeof X; y: number; lane: 'browser' | 'tls' }> = {
  authorize: { from: 'C', to: 'S', y: 1.0, lane: 'browser' },
  redirect: { from: 'S', to: 'C', y: -0.05, lane: 'browser' },
  intercept: { from: 'S', to: 'M', y: -0.05, lane: 'browser' },
  'client-request': { from: 'C', to: 'S', y: -1.55, lane: 'tls' },
  'app-request': { from: 'M', to: 'S', y: -1.55, lane: 'tls' },
  'client-answer': { from: 'S', to: 'C', y: -2.75, lane: 'tls' },
  'app-answer': { from: 'S', to: 'M', y: -2.75, lane: 'tls' },
};
const LABEL = 0.3;
/** What a piece of a label is coloured as: a value's own colour, plain ink, or the answer's outcome. */
type Tone = 'challenge' | 'code' | 'ink' | 'good' | 'bad';
type Piece = readonly [string, Tone];
const toneColor = (tone: Tone, s: ReturnType<typeof stage>) =>
  ({ challenge: CHALLENGE, code: CODE, ink: s.palette.ink, good: s.good, bad: s.bad })[tone];

/** What each message says in the state it is drawn from (pieces of text and their tones), and why an answer was refused. */
function messageWords(id: MessageId, st: SignIn): { pieces: Piece[]; why?: string } | null {
  const bound = st.challenge !== null;
  const answer = (who: 'client' | 'app', why: string) => {
    const a = st[who].answer;
    return a === null ? null : a === 'Access token' ? { pieces: [[a, 'good']] as Piece[] } : { pieces: [[a, 'bad']] as Piece[], why };
  };
  switch (id) {
    case 'authorize':
      return st.requested ? { pieces: bound ? [['code_challenge (S256)', 'challenge']] : [['authorize request', 'ink']] } : null;
    case 'redirect':
      return st.client.code ? { pieces: [['code', 'code']] } : null;
    case 'intercept':
      return st.app.code ? { pieces: [['code', 'code']] } : null;
    case 'client-request':
      return st.client.answer === null ? null : { pieces: bound ? [['code', 'code'], ['+', 'ink'], ['code_verifier', 'ink']] : [['code', 'code']] };
    case 'app-request':
      return st.app.answer === null ? null : { pieces: bound ? [['code', 'code'], ['+', 'ink'], ['a guess', 'ink']] : [['code', 'code']] };
    case 'client-answer':
      return answer('client', 'code already used');
    case 'app-answer':
      return answer('app', bound ? 'S256(guess) ≠ challenge' : 'code already used');
  }
}
/** The notes under the client and the server: the verifier the client keeps, what the server stored and whether the code is used. */
function notes(st: SignIn): Partial<Record<keyof typeof X, string>> {
  const server = [st.requested ? (st.challenge !== null ? 'stores the challenge' : 'no challenge stored') : null, st.spent ? 'code used' : null].filter(Boolean);
  return { ...(st.challenge !== null ? { C: 'keeps code_verifier' } : {}), ...(server.length ? { S: server.join(' · ') } : {}) };
}
/** A dot in the colour of what a message carries: the challenge, the code, or the answer's outcome. */
function tokenColor(id: MessageId, st: SignIn, s: ReturnType<typeof stage>): string {
  if (id === 'authorize') return st.challenge !== null ? CHALLENGE : s.palette.ink;
  if (id.endsWith('answer')) return st[id.startsWith('app') ? 'app' : 'client'].answer === 'Access token' ? s.good : s.bad;
  return CODE;
}

/**
 * The sign-in drawn from its state: the client, the server and the malicious app as lifelines across a red, dashed
 * browser lane other apps can read and a green TLS lane, each sent message an arrow in its fixed place with what it
 * carries above it (a refusal's reason under it), and notes under the client and the server. Every part is keyed.
 */
function signInPicture(st: SignIn, s: ReturnType<typeof stage>): Group {
  const ink = s.palette.ink, parts: Mobject[] = [];
  const add = (m: Mobject, key: string) => { m.key = key; parts.push(m); };
  const band = (lane: 'browser' | 'tls', top: number, bottom: number, color: string, title: readonly [string, string]) => {
    const rect = new Rectangle({ width: 15.0, height: top - bottom, cornerRadius: 0.12, fill: color, fillOpacity: 0.07, stroke: color, strokeWidth: 0.04 }).moveTo([0, (top + bottom) / 2]);
    if (lane === 'browser') rect.style.dashArray = '0.2 0.12';
    const mid = (top + bottom) / 2;
    add(new Group(
      rect,
      new Text(title[0], { fontSize: 0.32, color, weight: 'bold' }).moveTo([-6.15, mid + 0.22]),
      new Text(title[1], { fontSize: 0.26, color }).moveTo([-6.15, mid - 0.18]),
    ), `sign-in:band:${lane}`);
  };
  band('browser', 1.75, -0.5, s.bad, ['Browser', 'others can read']);
  band('tls', -0.7, -3.75, s.good, ['TLS', 'each app’s own']);
  for (const p of ['C', 'S', 'M'] as const)
    add(new Group(
      new Text(PARTY[p], { fontSize: 0.36, color: ink }).moveTo([X[p], 2.95]),
      new Line([X[p], 2.2], [X[p], -3.85], { stroke: s.soft, strokeWidth: 0.04 }),
    ), `sign-in:party:${p}`);
  for (const [p, text] of Object.entries(notes(st)) as [keyof typeof X, string][])
    add(new Text(text, { fontSize: 0.26, color: s.soft }).moveTo([X[p], 2.5]), `sign-in:note:${p}:${text}`);
  for (const id of Object.keys(ROUTE) as MessageId[]) {
    const words = messageWords(id, st);
    if (!words) continue;
    const { from, to, y } = ROUTE[id], dir = Math.sign(X[to] - X[from]);
    const arrow = new Arrow([X[from] + dir * 0.08, y], [X[to] - dir * 0.08, y], { stroke: ink, strokeWidth: 0.035, tipLength: 0.22, tipWidth: 0.18 });
    // The server's replies are dashed, as in the sequence diagrams.
    if (from === 'S') arrow.line.style.dashArray = '0.16 0.1';
    add(arrow, `sign-in:msg:${id}`);
    const pieces = words.pieces.map(([text, tone]) => new Text(text, { fontSize: LABEL, color: toneColor(tone, s) }));
    pieces.slice(1).forEach((p, i) => p.nextTo(pieces[i]!, [1, 0], 0.12));
    const label = new Group(new Group(...pieces).moveTo([(X[from] + X[to]) / 2, y + 0.32]));
    if (words.why) label.add(new Text(words.why, { fontSize: 0.26, color: s.bad }).moveTo([(X[from] + X[to]) / 2, y - 0.32]));
    add(label, `sign-in:label:${id}`);
  }
  return new Group(...parts);
}

/** The sign-in's picture in words: every message sent, by lane, and the notes under the parties. */
function signInWords(st: SignIn): string {
  const lane = { browser: 'Browser lane', tls: 'TLS lane' };
  const said = (id: MessageId) => {
    const w = messageWords(id, st);
    return w && `${lane[ROUTE[id].lane]}: ${PARTY[ROUTE[id].from]} to ${PARTY[ROUTE[id].to]}, ${w.pieces.map(([t]) => t).join(' ')}${w.why ? ` (${w.why})` : ''}`;
  };
  const sent = (Object.keys(ROUTE) as MessageId[]).map(said).filter(Boolean);
  const under = Object.entries(notes(st)).map(([p, text]) => `Under ${PARTY[p as keyof typeof X]}: ${text}`);
  return [
    'Three lifelines, the client, the auth server and the malicious app, across a red dashed browser lane other apps can read and a green TLS lane',
    ...(sent.length ? sent : ['No message sent yet']),
    ...under,
  ].join('. ') + '.';
}

/** One colour for each parameter's name on the map, so the code reads as the same value in both lanes. */
const NAME_COLOR: Record<string, string> = { code_challenge: CHALLENGE, code: CODE };
/** What a lane's messages carry, in words, for the drawing's description. */
const laneWords = (lane: LaneMessage[]) =>
  lane.map((m) => `${NAMES[m.from]} to ${NAMES[m.to]}, ${m.carries.length ? listed(m.carries) : m.text.toLowerCase()}`).join('; ');
const listed = (names: string[]) => names.slice(0, -1).join(', ') + (names.length > 1 ? ' and ' : '') + names.at(-1);
/**
 * The client's messages from the model, as two lanes between the client and the auth server: the browser lane on top,
 * outlined dashed in the stage's bad colour, and the TLS lane under it in its good colour. Each message is an arrow,
 * with the names of what it carries above it (the challenge's method rides with it as S256); replies are dashed.
 * Narrow enough for a phone's opening to show both lanes whole with every label at 12 px.
 */
function channelMap(map: Record<Message['channel'], LaneMessage[]>, s: ReturnType<typeof stage>) {
  const SIZE = 0.45,
    HALF = 4.5,
    END = 3.9,
    HEIGHT = 2.5,
    GAP = 0.2,
    TOP = 1.8,
    ink = s.palette.ink;
  const label = (text: string, color: string, size = SIZE) => new Text(text, { fontSize: size, color });
  /** A message's parameter names in a row, each in its own colour, joined by plus signs. */
  const carried = (m: LaneMessage, color: string) => {
    const names = m.carries.filter((n) => n !== 'code_challenge_method');
    const parts = names.length
      ? names.flatMap((n, i) => [
          ...(i ? [label('+', ink)] : []),
          label(n === 'code_challenge' && m.carries.includes('code_challenge_method') ? `${n} (S256)` : n, NAME_COLOR[n] ?? color),
        ])
      : [label(m.text.toLowerCase(), ink)];
    parts.slice(1).forEach((p, i) => p.nextTo(parts[i]!, [1, 0], 0.14));
    return new Group(...parts);
  };
  const lane = (key: string, messages: LaneMessage[], top: number, color: string, title: readonly [string, string], dashed: boolean) => {
    const band = new Rectangle({ width: 2 * HALF, height: HEIGHT, cornerRadius: 0.12, fill: color, fillOpacity: 0.07, stroke: color, strokeWidth: 0.04 });
    if (dashed) band.style.dashArray = '0.2 0.12';
    band.moveTo([0, top - HEIGHT / 2]);
    // Two lines, centred between the lifelines so neither crosses them.
    const heading = title.map((words, i) => new Text(words, { fontSize: SIZE, color, weight: 'bold' }).moveTo([0, top - 0.38 - i * 0.5]));
    for (const h of heading) if (h.width() > 2 * END - 0.3) throw new Error(`Lane title too wide for the lifelines: ${title.join(' ')}`);
    const parts: Mobject[] = [band, ...heading];
    messages.forEach((m, i) => {
      // The names sit on the arrow, which breaks around them: a line up to them, an arrow on from them.
      const y = top - 1.62 - i * 0.58,
        names = carried(m, color).moveTo([0, y]),
        gap = names.width() / 2 + 0.15,
        sign = m.to === 'S' ? 1 : -1,
        tail = new Line([-sign * END, y], [-sign * gap, y], { stroke: ink, strokeWidth: 0.035 }),
        head = new Arrow([sign * gap, y], [sign * END, y], { stroke: ink, strokeWidth: 0.035, tipLength: 0.22, tipWidth: 0.18 });
      // The server's replies are dashed, as in the sequence diagrams.
      if (m.from === 'S') for (const piece of [tail, head]) piece.style.dashArray = '0.16 0.1';
      parts.push(tail, head, names);
    });
    const g = new Group(...parts);
    g.key = key;
    return g;
  };
  const party = (name: string, x: number) =>
    new Group(label(name, ink).moveTo([x, TOP + 0.42]), new Line([x, TOP + 0.12], [x, TOP - 2 * HEIGHT - GAP - 0.1], { stroke: s.soft, strokeWidth: 0.04 }));
  return [
    party(NAMES.C!, -END),
    party(NAMES.S!, END),
    lane('pkce-lane-browser', map.browser, TOP, s.bad, ['Browser and redirect:', 'other apps can read it'], true),
    lane('pkce-lane-tls', map.tls, TOP - HEIGHT - GAP, s.good, ['The client’s own TLS', 'to the token endpoint'], false),
  ];
}
