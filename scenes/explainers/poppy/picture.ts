import type { Group, Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, TICKET, TONE, TYPE,
  addAll, answer, barrier, counter, key, lane, laneRoute, ledger, seal, sheet, station, stationExit, ticket, words,
} from '../lib/poppy-kit.ts';
import { AGENT, COMPANY, OPERATIONS, SID, THIEF, USER_IDS, ruleOf } from './model.ts';
import type { Channel, Exchange, Scope, World } from './model.ts';

// One state as a picture, drawn with the series' kit as a line map. Left of the counter is the
// agent's side: its station, holding its wax seal, and under it the key it holds (or the empty
// slot for one). Four lanes leave the station as a bundle and fan out to stops on the Company's
// counter. The last request is a ticket on its lane, stamped with a seal and, when it carries an
// access token, with a key cut with one tooth per scope. Accepted, it rests docked at its stop;
// refused, it stands short of the counter before a barrier. Behind the counter, on the right, the
// ledger of what the Company knows. Under the map, on the agent's side, the answer that came back;
// on the Company's side, the two marks named.
//
// Colours are the kit's, each with one meaning (WAX the agent's seal, BRASS a key, PEWTER another's
// seal, INK what is in use, STEEL what is idle); outcomes are said by position, the barrier and
// words. Every label is at least TYPE.small (0.56 units, 12.5 px on a 358 px phone stage), so a
// phone shows the whole picture as one view. The request's method and path, and the rule of the
// draft that decided the answer, are in the picture's words (sayWorld) rather than drawn.

const PHRASE: Record<number, string> = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };
const scopesOf = (scopes: readonly Scope[]) => scopes.join(' ');
/** Scopes in the few characters a row has. */
const briefly = (scopes: readonly Scope[]) => (scopes.length > 1 ? 'read + write' : 'read only');
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
/** The agent's station: centre and radius. */
const STATION: Vec = [-6.2, 2.4];
const STATION_R = 0.9;
/** Where the station's bundle of lanes ends and they fan out. */
const TRUNK_X = -5.0;
/** Each lane's level run, and its place in the bundle leaving the station. */
export const LANE_Y: Record<Lane, number> = { api: 3.75, web: 2.85, chat: 1.95, 'sign-in': 1.05 };
const BUNDLE: Record<Lane, number> = { api: 0.33, web: 0.11, chat: -0.11, 'sign-in': -0.33 };
/** The counter's face, where every lane ends at its stop. */
export const STOP_X = 0.5;
/** Where the lanes' names start, on their level runs. */
const NAME_X = -4.35;
/** The ledger's left edge, behind the counter. */
const LEDGER_X = 1.45;
/** The corners of a lane, from the station to its stop. */
export const routeOf = (on: Lane): Vec[] => laneRoute({ from: stationExit(STATION, STATION_R, BUNDLE[on]), trunk: TRUNK_X, y: LANE_Y[on], to: STOP_X });
/** The barrier's place on a lane: just short of the counter. */
const BARRIER_X = STOP_X - 0.36;
/** Where a ticket rests on its lane: docked at its stop when delivered, before the barrier when refused. */
export const ticketAt = (on: Lane, delivered: boolean): Vec => [delivered ? STOP_X - 0.17 - TICKET.width / 2 : BARRIER_X - 0.14 - 0.12 - TICKET.width / 2, LANE_Y[on]];
/** Where the agent's key hangs, under its name. */
export const KEY_AT: Vec = [STATION[0], 0.15];
/** The seal at the station: where a request is stamped and sets off. */
export const SEAL_AT: Vec = STATION;
/** Where a thief's ticket comes from: below the lanes, off the agent's network. */
export const THIEF_FROM: Vec = [ticketAt('api', false)[0], 0.15];
/** Where the Company's poppy.json sets off from, and where the agent takes it in. */
export const DOCUMENT_ROUTE: [Vec, Vec] = [[STOP_X - 0.7, STATION[1]], [STATION[0] + 0.6, STATION[1]]];
/** The route a key takes from the Company's sign-in stop to the agent's hook, and back. */
export const keyRoute = (): Vec[] => {
  const [, , bend, stop] = routeOf('sign-in');
  return [stop!, [bend![0], bend![1]], [bend![0], KEY_AT[1]], KEY_AT];
};

/** The poppy.json, as a sheet of paper, for the transition that carries it to the agent. */
export function documentToken(s: Stage): Mobject {
  return sheet(s, { width: 0.9, height: 1.15, lines: 3 });
}

/** The state as its picture: the line map and the last answer on the agent's side; the Company's ledger behind its counter. */
export function drawWorld(w: World, s: Stage): Group {
  const parts = keyedParts();
  const last = w.last, report = reportOf(w), request = last?.kind === 'request' ? last : null, teeth = w.approves.length;

  // The agent's station, holding its seal; under its name, its key, or the empty slot for one.
  addAll(parts, station(s, { at: STATION, r: STATION_R }));
  parts.add(key(s, { at: KEY_AT, size: 0.85, teeth, ghost: true }), 'agent:key:slot');
  if (w.grant) {
    const held = parts.add(key(s, { at: KEY_AT, size: 0.85, teeth }), 'agent:key');
    if (last?.kind === 'sign-in') emphasised(held, `changed: the agent now holds a key for ${scopesOf(w.approves)}`);
  }

  // The Company's counter, and the lanes poppy.json opened, each ending at its stop on the counter's face.
  addAll(parts, counter(s, { x: STOP_X, top: MARGIN.top, bottom: 0.55 }));
  if (w.found)
    for (const name of LANES) {
      const [from, , , end] = routeOf(name);
      addAll(parts, lane(s, { id: name, name: LANE_NAME[name], y: LANE_Y[name], from: from!, trunk: TRUNK_X, to: end![0], nameX: NAME_X, active: report?.lane === name }));
    }
  else parts.add(words(s, 'no way in yet', { at: [(TRUNK_X + STOP_X) / 2, STATION[1]], size: TYPE.label, color: TONE.soft, align: 'middle' }), 'lane:none');

  // The last request, as a ticket on its lane: a seal, and a key when it carried a token.
  if (request && report?.lane) {
    const at = ticketAt(report.lane, report.delivered);
    if (!report.delivered) parts.add(barrier(s, { at: [BARRIER_X, at[1]] }), 'barrier');
    parts.add(ticket(s, { at, foreign: request.by === 'thief', keyTeeth: request.token ? teeth : null }), 'ticket');
  }

  // Under the map, on the agent's side: what was asked, and what came back.
  if (report)
    addAll(parts, answer(s, {
      at: [MARGIN.left, -1.25], asked: report.asked, number: report.number, keyTeeth: last?.kind === 'sign-in' ? last.granted.length : teeth,
      phrase: report.phrase, meaning: report.outcome, emphasis: `the answer: ${report.number ?? ''} ${report.phrase}, ${report.outcome}`,
    }));
  else parts.add(words(s, 'nothing sent yet', { at: [MARGIN.left, -2.6], size: TYPE.label, color: TONE.soft }), 'answer:code');

  // Behind the counter: what the Company knows. The row the last request changed carries a change bar.
  const verified = request && request.by === 'agent' && request.answer.error !== 'invalid_session' ? request : null;
  addAll(parts, ledger(s, knownBy(w).map(([label, value]) => ({
    label, value,
    quiet: ['none yet', 'not met yet', 'not linked'].includes(value),
    changed: !!verified && (label === 'account' ? verified.token : label === 'session' && verified.op === 'cart'),
  })), { at: [LEDGER_X, 3.85], width: MARGIN.right - LEDGER_X, title: 'The Company knows', key: 'company' }));

  // The two marks, named, under the ledger: what each proof says.
  const markX = LEDGER_X + 0.5, textX = LEDGER_X + 1.3;
  parts.add(seal(s, { at: [markX, -1.55], r: 0.44 }), 'legend:seal');
  parts.add(words(s, 'Session header', { at: [textX, -1.27], size: TYPE.label, bold: true }), 'legend:seal:name');
  parts.add(words(s, 'who is asking', { at: [textX, -1.87], color: TONE.soft }), 'legend:seal:says');
  parts.add(key(s, { at: [markX, -3.13], size: 0.5, teeth }), 'legend:key');
  parts.add(words(s, 'Access token', { at: [textX, -2.85], size: TYPE.label, bold: true }), 'legend:key:name');
  parts.add(words(s, 'what you allow', { at: [textX, -3.45], color: TONE.soft }), 'legend:key:says');
  return parts.group();
}
