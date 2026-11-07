import { Group, Rectangle, Text, Arrow, Line } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { keyedParts, emphasised } from '../../../explain/drawing.ts';
import { listed } from '../lib/format.ts';
import type { Message, LaneMessage, SignIn, SignInEvent } from './model.ts';

// One colour per value, so the reader can follow each across the flow (outcomes use the stage's good and bad).
export const CHALLENGE = '#0969da',
  CODE = '#bc4c00';
export const NAMES: Record<string, string> = { C: 'Client', S: 'Auth server', M: 'Malicious app', X: 'Malicious app' };

// ---- the sign-in machine's picture ------------------------------------------------------------

export type MessageId = 'authorize' | 'redirect' | 'intercept' | 'client-request' | 'client-answer' | 'app-request' | 'app-answer';
/** The messages each event sends, in order. */
export const SENDS: Record<SignInEvent, MessageId[]> = {
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
const toneColor = (tone: Tone, s: Stage) =>
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
export function tokenColor(id: MessageId, st: SignIn, s: Stage): string {
  if (id === 'authorize') return st.challenge !== null ? CHALLENGE : s.palette.ink;
  if (id.endsWith('answer')) return st[id.startsWith('app') ? 'app' : 'client'].answer === 'Access token' ? s.good : s.bad;
  return CODE;
}

/**
 * The sign-in drawn from its state: the client, the server and the malicious app as lifelines across a red, dashed
 * browser lane other apps can read and a green TLS lane, each sent message an arrow in its fixed place with what it
 * carries above it (a refusal's reason under it), and notes under the client and the server. Every part is keyed.
 */
export function signInPicture(st: SignIn, s: Stage): Group {
  const ink = s.palette.ink, { add, group } = keyedParts();
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
    // Each server answer is emphasis the phone's close-ups visit first and review holds to the caption.
    if (id === 'client-answer' || id === 'app-answer') {
      const who = id === 'app-answer' ? 'app' : 'client';
      emphasised(label, `${who === 'app' ? 'malicious app' : 'client'}: ${st[who].answer}`);
    }
    add(label, `sign-in:label:${id}`);
  }
  return group();
}

/** The sign-in's picture in words: every message sent, by lane, and the notes under the parties. */
export function signInWords(st: SignIn): string {
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
export const laneWords = (lane: LaneMessage[]) =>
  lane.map((m) => `${NAMES[m.from]} to ${NAMES[m.to]}, ${m.carries.length ? listed(m.carries) : m.text.toLowerCase()}`).join('; ');
/**
 * The client's messages from the model, as two lanes between the client and the auth server: the browser lane on top,
 * outlined dashed in the stage's bad colour, and the TLS lane under it in its good colour. Each message is an arrow,
 * with the names of what it carries above it (the challenge's method rides with it as S256); replies are dashed.
 * Narrow enough for a phone's opening to show both lanes whole with every label at 12 px.
 */
export function channelMap(map: Record<Message['channel'], LaneMessage[]>, s: Stage) {
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
