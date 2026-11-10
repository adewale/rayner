import { Group, Line, Rectangle, keyed } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, STROKE, TICKET, TONE, TYPE,
  addAll, aiMark, barrier, codeSlip, key, lane, laneRoute, ledger, person, seal, sheet, station, stationExit, stationHolds, ticket, words,
} from '../lib/poppy-kit.ts';
import { AGENT, COMPANY, OPERATIONS, SID, THIEF, USER_IDS, ruleOf } from './model.ts';
import type { Channel, Exchange, Scope, World } from './model.ts';

// One state as a picture, drawn with the series' kit as a line map. Left of the counter is the
// agent's side: its station, holding its wax seal and, under it, the key it holds (or the empty
// slot for one). Four lanes leave the station as a bundle and fan out to stops on the Company's
// counter, a shopfront with a window for each lane and the shop's name on its sign; behind it, the
// ledger of what the Company knows. Before the agent has read poppy.json there are no lanes: a
// dashed way ends at a barrier before shuttered windows. The last request is a ticket on its lane,
// stamped with a seal and, when it carries an access token, a key with one tooth per scope.
// Accepted, it rests docked at its stop; refused, it stands short of the counter before a barrier.
//
// Under the map, on the agent's side, what it asked and the one object that step is about, named
// where it first matters (the errand, poppy.json, the seal, the code, the key...); on the Company's
// side, its answer, set large. Lane names sit above their lines, so a ticket travelling a lane
// passes under its name rather than over it.
//
// Colours are the kit's, each with one meaning (WAX the agent's seal, BRASS a key, PEWTER another's
// seal, INK what is in use, STEEL what is idle); outcomes are said by position, the barrier and
// words. Every label is at least TYPE.small (0.56 units, 12.5 px on a 358 px phone stage), so a
// phone shows the whole picture as one view. The request's method and path, and the rule of the
// draft that decided the answer, are in the picture's words (sayWorld) rather than drawn.

const PHRASE: Record<number, string> = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };
const scopesOf = (scopes: readonly Scope[]) => scopes.join(' ');
/** Scopes in the few characters a row has. */
const briefly = (scopes: readonly Scope[]) => (scopes.length > 1 ? 'read+write' : 'read only');
/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;

/** The lanes of the wire: the three channels a poppy.json lists, and the Company's sign-in page. */
export const LANES = ['api', 'web', 'chat', 'sign-in'] as const;
export type Lane = (typeof LANES)[number];
const LANE_NAME: Record<Lane, string> = { api: 'API', web: 'Website', chat: 'Chat', 'sign-in': 'Sign-in' };
const lane_ = (channel: Channel): Lane => channel;

/** The words under the map: who asked for what; the answer's number, its phrase and what it meant; and the lane it went by. */
export type Report = { asked: string; number: string | null; phrase: string; outcome: string; lane: Lane | null; delivered: boolean };
export function reportOf(w: World): Report | null {
  const last: Exchange | null = w.last;
  if (!last) return null;
  if (last.kind === 'discover') return { asked: 'agent: read poppy.json', number: '200', phrase: 'OK', outcome: `${last.channels.length} channels + sign-in`, lane: null, delivered: true };
  if (last.kind === 'sign-in') return { asked: 'you: sign in', number: null, phrase: 'Approved', outcome: `cut for ${briefly(last.granted)}`, lane: 'sign-in', delivered: true };
  if (last.kind === 'revoke') return { asked: 'agent: sign out', number: '200', phrase: 'OK', outcome: 'access has ended', lane: 'sign-in', delivered: true };
  const { status, needs, error } = last.answer, ok = status === OPERATIONS[last.op].ok;
  return {
    asked: `${last.by === 'thief' ? 'thief' : 'agent'}: ${{ cart: 'add to cart', browse: 'browse the site', chat: 'ask about sizes', order: 'see the order', exchange: 'exchange the jacket' }[last.op]}`,
    number: String(status),
    phrase: PHRASE[status]!,
    outcome: ok
      ? { cart: 'added to the cart', browse: 'browser joins Session', chat: 'an AI answers: yes', order: 'here is order 1042', exchange: 'exchange is made' }[last.op]
      : status === 401 ? `needs ${needs}` : status === 403 ? `lacks ${needs}` : (error ?? 'refused'),
    lane: lane_(OPERATIONS[last.op].channel),
    delivered: ok,
  };
}

/** What the Company knows, row by row: only what verified requests have told it. */
export function knownBy(w: World): [string, string][] {
  return [
    ['agent', w.started ? AGENT.name : 'not met yet'],
    ['user ID', w.started ? USER_IDS[COMPANY.domain] : 'not met yet'],
    ['session', w.started ? (w.cart ? '1 in cart' : 'cart empty') : 'none yet'],
    ['account', w.linked === 'yes' ? briefly(w.approves) : w.linked === 'no' ? 'not linked' : 'signed out'],
  ];
}

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World): string {
  const last = w.last, scopes = scopesOf(w.approves), rule = ruleOf(last);
  const wire = w.found ? 'Four lanes run from the agent to the Company’s counter: API, Website, Chat and Sign-in.' : 'No lane runs from the agent to the Company yet.';
  const sent = !last ? 'Nothing has been sent.'
    : last.kind === 'discover' ? `The agent read the Company’s poppy.json, which lists ${last.channels.length} channels and where to sign in.`
    : last.kind === 'sign-in' ? `You signed in on the Company’s own page and approved ${scopesOf(last.granted)}; a key went to the agent.`
    : last.kind === 'revoke' ? 'The agent revoked its refresh token and handed its key back.'
    : `${last.by === 'thief' ? 'A thief' : 'The agent'} sent ${OPERATIONS[last.op].method} ${OPERATIONS[last.op].path} on the ${LANE_NAME[lane_(OPERATIONS[last.op].channel)]} lane, with a seal signed by ${last.by === 'thief' ? THIEF.name : AGENT.name} and ${
        last.token ? (last.by === 'thief' ? 'the agent’s copied key' : `a key for ${scopes}`) : 'no key'
      }; the Company answered ${last.answer.status}${last.answer.error ? ` ${last.answer.error}` : ''}${last.answer.needs ? `, naming ${last.answer.needs}` : ''}, and the ticket ${
        last.answer.status === OPERATIONS[last.op].ok ? 'rests docked at its stop on the Company’s counter' : 'stands before a barrier, short of the counter'
      }.`;
  const known = w.started
    ? `The Company knows ${AGENT.name}, User ID ${USER_IDS[COMPANY.domain]} and Session ${SID}, whose cart ${w.cart ? 'holds the medium' : 'is empty'}; the account is ${
        w.linked === 'yes' ? `linked for ${scopes}` : w.linked === 'no' ? 'not linked' : 'signed out'
      }.`
    : 'The Company knows nothing yet.';
  return `${wire} ${sent} ${known} The agent holds its seal and ${w.grant ? `a key for ${scopes}` : 'no key'}. The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

// The map's geometry, shared with the scene's transitions.
/** Each lane's level run, 1.1 apart so a name above one line clears a token riding the next. */
export const LANE_Y: Record<Lane, number> = { api: 3.15, web: 2.05, chat: 0.95, 'sign-in': -0.15 };
/** The agent's station: centre and radius, level with the middle of the lanes. */
const STATION: Vec = [-6.3, 1.5];
const STATION_R = 1.0;
/** Where the station's bundle of lanes ends and they fan out, and how steeply. */
const TRUNK_X = -4.75;
const FAN = 0.3;
const BUNDLE: Record<Lane, number> = { api: 0.33, web: 0.11, chat: -0.11, 'sign-in': -0.33 };
/** The counter's face, where every lane ends at its stop. */
export const STOP_X = 0.62;
/** The counter's extent, under the shop's sign. */
const COUNTER_TOP = 3.47, COUNTER_BOTTOM = -0.65;
/** Where the lanes' names start, above their level runs. */
const NAME_X = -4.2;
/** The ledger's left edge, behind the counter, and its top. */
const LEDGER_X = 1.62, LEDGER_TOP = 3.8;
/** The bottom band: the agent's side starts at the margin, the Company's at the ledger. */
const BAND_TOP = -1.15;
/** The corners of a lane, from the station to its stop. */
export const routeOf = (on: Lane): Vec[] => laneRoute({ from: stationExit(STATION, STATION_R, BUNDLE[on]), trunk: TRUNK_X, y: LANE_Y[on], to: STOP_X, fan: FAN });
/** The barrier's place on a lane: just short of the counter. */
const BARRIER_X = STOP_X - 0.45;
/** Where a ticket rests on its lane: docked at its stop when delivered, before the barrier when refused. */
export const ticketAt = (on: Lane, delivered: boolean): Vec => [delivered ? STOP_X - 0.17 - TICKET.width / 2 : BARRIER_X - 0.14 - 0.14 - TICKET.width / 2, LANE_Y[on]];
/** Where the agent holds its seal (where a request is stamped and sets off) and its key. */
const HOLDS = stationHolds(STATION, STATION_R);
export const SEAL_AT: Vec = HOLDS.seal;
export const KEY_AT: Vec = HOLDS.key;
/** Where a thief's ticket comes from: below the lanes, off the agent's network. */
export const THIEF_FROM: Vec = [ticketAt('api', false)[0], -0.8];
/** Where the Company's poppy.json sets off from (its counter, level with the agent) and where the agent takes it in. */
export const DOCUMENT_ROUTE: [Vec, Vec] = [[STOP_X - 0.55, STATION[1]], [STATION[0] + 0.45, STATION[1] + 0.1]];
/** The route a key takes from the Company's sign-in stop into the agent's station, and back. */
export const keyRoute = (): Vec[] => {
  const [from, trunk, bend, stop] = routeOf('sign-in');
  return [stop!, bend!, trunk!, from!, KEY_AT];
};

/** The poppy.json, as a sheet of paper, for the transition that carries it to the agent. */
export function documentToken(s: Stage): Mobject {
  return sheet(s, { width: 0.9, height: 1.15, lines: 3 });
}

/**
 * The Company's shopfront, chapter 1's own: a counter (RAISED, its face a heavy INK band) with a
 * window behind each lane's stop, shuttered until the agent has read poppy.json, and the shop's
 * sign on top: "example.com" printed on an INK board that runs on over the ledger, which it heads.
 */
function shopfront(s: Stage, open: boolean, lit: Lane | null): Mobject[] {
  const h = COUNTER_TOP - COUNTER_BOTTOM, cy = (COUNTER_TOP + COUNTER_BOTTOM) / 2;
  const name = words(s, COMPANY.domain, { mono: true, bold: true, color: TONE.print });
  const boardW = name.width() + 0.56, boardY = LEDGER_TOP;
  const windows = LANES.flatMap((on) => {
    const y = LANE_Y[on], x = STOP_X + 0.36;
    const pane = new Rectangle({ width: 0.3, height: 0.6, fill: open ? (lit === on ? TONE.ink : TONE.ground) : TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.hair * 1.4, cornerRadius: 0.03 }).moveTo([x, y]);
    const slats = open ? [] : [-0.18, -0.06, 0.06, 0.18].map((dy) => new Rectangle({ width: 0.22, height: 0.05, fill: TONE.steel, stroke: 'none' }).moveTo([x, y + dy]));
    return [pane, ...slats];
  });
  const front = new Group(
    new Rectangle({ width: 0.6, height: h, fill: TONE.raised, stroke: 'none', cornerRadius: 0.04 }).moveTo([STOP_X + 0.3, cy]),
    new Rectangle({ width: 0.12, height: h, fill: TONE.ink, stroke: 'none', cornerRadius: 0.04 }).moveTo([STOP_X + 0.06, cy]),
    ...windows,
    new Rectangle({ width: 0.72, height: 0.1, fill: TONE.ink, stroke: 'none', cornerRadius: 0.03 }).moveTo([STOP_X + 0.3, COUNTER_BOTTOM + 0.05]),
  );
  const board = new Group(
    new Rectangle({ width: boardW, height: 0.68, fill: TONE.ink, stroke: 'none', cornerRadius: 0.06 }).moveTo([STOP_X - 0.1 + boardW / 2, boardY]),
    name.moveTo([STOP_X - 0.1 + 0.28, boardY], [-1, 0]),
  );
  return [keyedAs(front, 'counter'), keyedAs(board, 'counter:sign')];
}
const keyedAs = <T extends Mobject>(m: T, k: string): T => keyed(m, k);

/** What the step is about, set under the map on the agent's side: one object, its name and a gloss. */
type Exhibit = { mark: (s: Stage, at: Vec) => Mobject; name: string; gloss: string; mono?: boolean };
function exhibitOf(w: World): Exhibit {
  const last = w.last, teeth = w.approves.length;
  if (!last) return { mark: (s, at) => person(s, { at }), name: 'Your errand', gloss: 'swap the jacket' };
  if (last.kind === 'discover') return { mark: (s, at) => documentToken(s).moveTo(at), name: 'poppy.json', gloss: 'lists the ways in', mono: true };
  if (last.kind === 'sign-in') return { mark: (s, at) => key(s, { at, teeth: last.granted.length }), name: 'Access token', gloss: 'what you allow' };
  if (last.kind === 'revoke') return { mark: (s, at) => key(s, { at, teeth, ghost: true }), name: 'Key handed back', gloss: 'Session goes on' };
  if (last.by === 'thief') return { mark: (s, at) => seal(s, { at, r: 0.55, foreign: true }), name: 'A stranger’s seal', gloss: 'by thief.example' };
  if (last.op === 'cart') return { mark: (s, at) => seal(s, { at, r: 0.55 }), name: 'Session header', gloss: 'who is asking' };
  if (last.op === 'browse') return { mark: (s, at) => codeSlip(s, { at, code: 'K7Q2' }), name: 'One-time code', gloss: 'browser joins' };
  if (last.op === 'chat') return { mark: (s, at) => aiMark(s, { at, size: 1.4 }), name: 'Company Agent', gloss: 'marked as an AI' };
  if (!last.token) return { mark: (s, at) => key(s, { at, teeth, ghost: true }), name: 'No access token', gloss: 'seal alone: who' };
  return { mark: (s, at) => ticket(s, { at, keyTeeth: teeth }), name: 'Seal and key', gloss: last.answer.status === 200 ? 'who, and what' : 'key lacks a tooth' };
}

/** The state as its picture: the line map, what was sent and why it matters, and the Company's answer. */
export function drawWorld(w: World, s: Stage): Group {
  const parts = keyedParts();
  const last = w.last, report = reportOf(w), request = last?.kind === 'request' ? last : null, teeth = w.approves.length;

  // The agent's station, holding its seal and, under it, its key or the empty slot for one; its name over it.
  const agent = station(s, { at: STATION, r: STATION_R, keyTeeth: w.grant ? teeth : 0 }).map((m) => (m.key === 'agent:name' ? m.moveTo([STATION[0], STATION[1] + STATION_R + 0.45]) : m));
  const held = agent.find((m) => m.key === 'agent:key');
  if (held && last?.kind === 'sign-in') emphasised(held, `changed: the agent now holds a key for ${scopesOf(w.approves)}`);
  addAll(parts, agent);

  // The Company's shopfront; the lanes poppy.json opened, or, before it, a way that ends at a barrier.
  const delivered = report?.lane && report.delivered ? report.lane : null;
  addAll(parts, shopfront(s, w.found, request ? delivered : null));
  if (w.found)
    for (const name of LANES) {
      const [from, , , end] = routeOf(name);
      addAll(parts, lane(s, { id: name, name: LANE_NAME[name], y: LANE_Y[name], from: from!, trunk: TRUNK_X, to: end![0], nameX: NAME_X, fan: FAN, nameAt: 'above', active: report?.lane === name, reached: report?.lane === name && report.delivered }));
    }
  else {
    const y = STATION[1];
    parts.add(new Line([STATION[0] + STATION_R + 0.12, y], [BARRIER_X - 0.3, y], { stroke: TONE.steel, strokeWidth: STROKE.line, dashArray: '0.16 0.14', fill: 'none' }), 'door:way');
    parts.add(barrier(s, { at: [BARRIER_X, y] }), 'door:barrier');
    parts.add(words(s, 'no way in yet', { at: [(TRUNK_X + STOP_X) / 2 - 0.4, y + 0.55], size: TYPE.label, color: TONE.soft, align: 'middle' }), 'door:words');
  }

  // The last request, as a ticket on its lane: a seal, and a key when it carried a token.
  if (request && report?.lane) {
    const at = ticketAt(report.lane, report.delivered);
    if (!report.delivered) parts.add(barrier(s, { at: [BARRIER_X, at[1]] }), 'barrier');
    parts.add(ticket(s, { at, foreign: request.by === 'thief', keyTeeth: request.token ? teeth : null }), 'ticket');
  }

  // Under the map, on the agent's side: what was asked, and the one object this step is about.
  const shown = exhibitOf(w), markAt: Vec = [MARGIN.left + 1.1, BAND_TOP - 2.27];
  parts.add(words(s, report ? report.asked : 'you ask your agent', { at: [MARGIN.left, BAND_TOP], color: TONE.soft }), 'exhibit:asked');
  parts.add(shown.mark(s, markAt), 'exhibit:mark');
  parts.add(words(s, shown.name, { at: [MARGIN.left + 2.55, markAt[1] + 0.37], bold: true, mono: !!shown.mono }), 'exhibit:name');
  parts.add(words(s, shown.gloss, { at: [MARGIN.left + 2.55, markAt[1] - 0.37], color: TONE.soft }), 'exhibit:gloss');

  // On the Company's side, under its ledger: the answer, large. Before anything is sent, the question it will ask.
  const ax = LEDGER_X, numberY = BAND_TOP - 0.4, phraseY = numberY - 1.48, meaningY = phraseY - 0.82;
  if (!report) {
    parts.add(words(s, '?', { at: [ax - 0.06, numberY], size: TYPE.display, mono: true, bold: true }), 'answer:code');
    parts.add(words(s, 'Who is asking?', { at: [ax, phraseY], size: TYPE.title, bold: true }), 'answer:phrase');
    parts.add(words(s, 'a stranger at the door', { at: [ax, meaningY] }), 'answer:meaning');
  } else {
    if (report.number !== null) parts.add(words(s, report.number, { at: [ax - 0.06, numberY], size: TYPE.display, mono: true, bold: true }), 'answer:code');
    else parts.add(key(s, { at: [ax + 1.25, numberY + 0.05], size: 1.25, teeth: last?.kind === 'sign-in' ? last.granted.length : teeth }), 'answer:key');
    emphasised(parts.add(words(s, report.phrase, { at: [ax, phraseY], size: TYPE.title, bold: true }), 'answer:phrase'), `the answer: ${report.number ?? ''} ${report.phrase}, ${report.outcome}`);
    parts.add(words(s, report.outcome, { at: [ax, meaningY], mono: /^[a-z_]+$/.test(report.outcome) }), 'answer:meaning');
  }

  // Behind the counter, headed by the shop's sign: what the Company knows. The row the last request changed carries a change bar.
  const verified = request && request.by === 'agent' && request.answer.error !== 'invalid_session' ? request : null;
  addAll(parts, ledger(s, knownBy(w).map(([label, value]) => ({
    label, value,
    quiet: ['none yet', 'not met yet', 'not linked'].includes(value),
    changed: !!verified && (label === 'account' ? verified.token : label === 'session' && verified.op === 'cart'),
  })), { at: [LEDGER_X, LEDGER_TOP], width: MARGIN.right - LEDGER_X, title: 'knows', key: 'company', rowGap: 0.8 }).filter((m) => m.key !== 'company:title'));
  parts.add(words(s, 'knows', { at: [STOP_X - 0.1 + boardWidth(s) + 0.28, LEDGER_TOP], bold: true }), 'company:title');
  return parts.group();
}

/** The width of the shop's sign board. */
const boardWidth = (s: Stage) => words(s, COMPANY.domain, { mono: true, bold: true }).width() + 0.56;
