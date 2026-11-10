import { Circle, Group, Line, Polygon, Rectangle } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, RADIUS, STROKE, TICKET, TONE, TYPE,
  addAll, answer, barrier, browserWindow, codeSlip, cookie, person, counter, key, seal, station, stationExit, stationHolds, stop, ticket, words,
} from '../lib/poppy-kit.ts';
import { AGENT, SID } from '../poppy/model.ts';
import { ACCOUNT, ATTACKER, ATTACK_CODE, CODES, PHISH_CODE, joinEffect } from './model.ts';
import type { CodeRecord, SignIn, Visit, World } from './model.ts';

// One state as a picture, drawn with the series' kit. Three actors: your agent on the left (its
// station, holding its seal and its key), the agent's browser in the middle (a window, and under it
// the shelf of cookies it keeps), and example.com on the right (its counter, and behind it the codes
// it has issued). Two roads reach the counter and never meet: the agent's own road along the top,
// which alone ever carries the key, and the browser's short road from the window.
//
// The chapter's object is a ticket torn in two. The paper stub carries the code; the dark half, with
// a cookie on it, is the join cookie the browser keeps. Each code tears along its own zigzag, so a half
// fits only its own stub. The Company's record of a code is its stub on the rack behind the counter:
// a ring where the stamp goes, the agent's seal pressed there once the agent authorizes it (with a
// key beside it when the authorization carried one), the
// cookie half seated against its tear when the right cookie came back with it (its outline, dashed and empty,
// when none came), and a barrier when the
// submission was refused. Which half is missing reads from the row.
//
// Colour is the kit's and keeps its meanings: WAX is the agent's seal and stamp, PEWTER the attacker's,
// BRASS a key, and nothing brass ever enters the browser. Every label is at least TYPE.small.

export const PALETTE = KIT_PALETTE;
/** What the scene shows apart from the state: the world or the table of logins, and whether the attacker is on stage. */
export type Shown = { attacker: boolean };
export const SHOWN_START: Shown = { attacker: false };

const PHRASE: Record<number, string> = { 200: 'OK', 204: 'No Content', 303: 'See Other', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden' };
/** A code as the stage prints it: the four characters after bc_. The caption and the words give it whole. */
export const shortCode = (code: string) => code.slice(3, 7);
const teethOf = (signIn: SignIn) => (signIn === 'signed in' ? 3 : signIn === 'signed out' ? 0 : 2);

// ---------------------------------------------------------------------------------------------
// Geometry, shared with the scene's transitions.

const STATION: Vec = [-6.3, 2.45];
const STATION_R = 0.95;
const HOLDS = stationHolds(STATION, STATION_R);
/** Where the agent holds its seal: where its requests are stamped and set off. */
export const SEAL_AT: Vec = HOLDS.seal;
/** The counter's face, where both roads end. */
export const COUNTER_X = 2.1;
/** The agent's road: its height, and where it leaves the station. */
export const ROAD_A = 3.25;
export const ROAD_A_FROM: Vec = stationExit(STATION, STATION_R, ROAD_A - STATION[1]);
/** The browser's window and its road. */
const WIN: Vec = [-1.85, 1.2];
const WIN_W = 5.9, WIN_H = 3.0;
const WIN_R = WIN[0] + WIN_W / 2;
export const ROAD_B = 1.0;
export const ROAD_B_FROM: Vec = [WIN_R, ROAD_B];
/** Where the page shows its code, and where the cookie shelf holds the join cookie and the Session's cookie. */
export const PAGE_AT: Vec = [WIN[0], 0.85];
const SHELF_Y = -1.4;
export const JOIN_AT: Vec = [-1.75, SHELF_Y + 0.53];
export const SESSION_AT: Vec = [-1.75, SHELF_Y + 0.47];
/** The rack behind the counter: its left edge and the rows' heights. */
const RACK_X = 2.75;
const ROW_Y = [2.8, 1.5, 0.2, -1.1] as const;
/** A slip's height in the window and on the shelves; a record's on the rack, larger, since the tear is the point. */
const SLIP_H = 0.95, ROW_H = 1.2;
const STUB_W = 3.3;
/** A cookie half's width at a slip height. */
const halfW = (h: number) => 0.85 * h / SLIP_H;
const HALF_W = halfW(SLIP_H);
/** The barrier on the agent's road, and where a ticket rests there. */
const BARRIER_X = COUNTER_X - 0.45;
const ticketAt = (delivered: boolean): Vec => [delivered ? COUNTER_X - 0.17 - TICKET.width / 2 : BARRIER_X - 0.28 - TICKET.width / 2, ROAD_A];
/** The attacker's browser, lower right, and where its cookie half rests in it. */
const EVIL: Vec = [4.65, -2.95];
export const EVIL_HALF_AT: Vec = [EVIL[0] - 1.75, EVIL[1] - 0.45];
/** Where a code that came in a message rests: beside the agent, outside its station. */
export const MESSAGE_AT: Vec = [-6.35, -0.15];
/** Where that message comes from: just outside the attacker's browser, along the bottom of the stage. */
export const MESSAGE_FROM: Vec = [1.05, -2.95];
/** The browser window's edges, and the column just right of it where things go between the road and the shelf. */
export const WIN_LEFT = WIN[0] - WIN_W / 2;
export const WIN_RIGHT = WIN[0] + WIN_W / 2;
export const SIDE_X = WIN_RIGHT + 0.4;
/** Where the agent's reading line leaves its station. */
export const READ_FROM: Vec = [STATION[0] + STATION_R * Math.cos(-0.45), STATION[1] + STATION_R * Math.sin(-0.45)];
/** The height at which the attacker's things leave its browser for the counter, under the rack; and where its forged stub starts. */
export const ATTACK_Y = -1.55;
export const EVIL_OUT: Vec = [EVIL[0] - WIN_W / 2 - 0.35, EVIL[1] + 0.2];
/** The column just left of the attacker's browser, where its things leave it. */
export const EVIL_SIDE_X = EVIL[0] - WIN_W / 2 - 0.35;

// ---------------------------------------------------------------------------------------------
// The torn ticket.

/** The zigzag along which a code's ticket was torn: x offsets down the tear, one profile per code. */
function tear(code: string): number[] {
  const seed = [...code].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7);
  return Array.from({ length: 7 }, (_, k) => (k % 2 ? 0.16 : 0) + 0.05 * ((seed >> k) % 3));
}
/** The tear's points from the top of the ticket to its bottom, at x `edge`, scaled with the slip's height `h`. */
const tearPoints = (code: string, edge: number, top: number, h: number): Vec[] =>
  tear(code).map((dx, k, all): Vec => [edge - (dx * h) / SLIP_H, top - (k * h) / (all.length - 1)]);

/**
 * The stub: paper, the code printed on it in mono bold, its right edge torn along the code's zigzag.
 * `at` is the centre of its whole rectangle. With `stampRoom`, the printing moves right of a place
 * for the stamp.
 */
export function stub(s: Stage, { at, code, width, stampRoom = false, h = SLIP_H }: { at: Vec; code: string; width: number; stampRoom?: boolean; h?: number }): Group {
  const [x, y] = at, l = x - width / 2, r = x + width / 2, t = y + h / 2, b = y - h / 2, k = RADIUS.ticket;
  const outline: Vec[] = [[l + k, t], ...tearPoints(code, r, t, h), [l + k, b], [l, b + k], [l, t - k]];
  const text = words(s, shortCode(code), { mono: true, bold: true, color: TONE.print, at: stampRoom ? [l + 0.95, y] : [x - 0.1, y], align: stampRoom ? 'start' : 'middle' });
  return new Group(new Polygon(outline, { fill: TONE.paper, stroke: 'none' }), text);
}

/** The cookie half: the dark part of the ticket, its left edge torn along the code's zigzag, a cookie on it. `left` is its tear's straight line. */
export function cookieHalf(s: Stage, { left, y, code, h = SLIP_H }: { left: number; y: number; code: string; h?: number }): Group {
  const t = y + h / 2, b = y - h / 2, r = left + halfW(h), k = RADIUS.ticket;
  const outline: Vec[] = [...tearPoints(code, left, t, h), [r - k, b], [r, b + k], [r, t - k], [r - k, t]];
  return new Group(
    new Polygon(outline, { fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine }),
    cookie(s, { at: [left + halfW(h) / 2 + 0.03, y], r: 0.28 * h / SLIP_H }),
  );
}

/** The outline of a cookie half that did not come: dashed STEEL along the code's tear, nothing inside. */
function missingHalf(code: string, left: number, y: number, h = SLIP_H): Polygon {
  const t = y + h / 2, b = y - h / 2, r = left + halfW(h), k = RADIUS.ticket;
  return new Polygon([...tearPoints(code, left, t, h), [r - k, b], [r, b + k], [r, t - k], [r - k, t]], { fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.line, dashArray: '0.14 0.09' });
}

/** The Company's record of a code, as one row of the rack: its keyed parts. */
function row(s: Stage, parts: ReturnType<typeof keyedParts>, record: CodeRecord, y: number) {
  const id = `row:${shortCode(record.code)}`, l = RACK_X, edge = l + STUB_W;
  parts.add(stub(s, { at: [l + STUB_W / 2, y], code: record.code, width: STUB_W, stampRoom: true, h: ROW_H }), `${id}:stub`);
  const stampAt: Vec = [l + 0.5, y];
  const g = record.authorized;
  if (g) {
    parts.add(seal(s, { at: stampAt, r: 0.36, foreign: g.agent !== AGENT.clientId }), `${id}:stamp`);
    if (g.account) parts.add(key(s, { at: [l + 2.66, y + 0.04], size: 0.3, teeth: g.scopes.length, onPaper: true }), `${id}:key`);
  } else parts.add(new Circle({ radius: 0.31, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.line, dashArray: '0.12 0.08' }).moveTo(stampAt), `${id}:ring`);
  if (record.seated) parts.add(cookieHalf(s, { left: edge, y, code: record.code, h: ROW_H }), `${id}:half`);
  // Submitted without its cookie: the place where the half should have fitted, outlined and empty.
  else if (record.submitted) parts.add(missingHalf(record.code, edge, y, ROW_H), `${id}:gap`);
  if (record.submitted && !record.joined) parts.add(barrier(s, { at: [edge + halfW(ROW_H) + 0.32, y], height: 1.1 }), `${id}:barrier`);
}

// ---------------------------------------------------------------------------------------------
// Words.

/** The answer block's words for the last event: who asked for what, and what came back. */
type Report = { asked: string; number: string; meaning: string; mono?: boolean };
function reportOf(w: World): Report | null {
  const last = w.last;
  if (!last) return null;
  switch (last.event) {
    case 'fetch': return { asked: 'agent: fetch a help page', number: String(last.status), meaning: 'signed out, no key' };
    case 'load': return { asked: 'browser: open the join page', number: String(last.status), meaning: 'a code and a cookie' };
    case 'authorize': {
      const a = last.answer;
      return {
        asked: `agent: authorize ${shortCode(last.code)}`, number: String(a.status),
        meaning: a.status === 204 ? (last.withToken ? `stamped: account ${ACCOUNT}` : 'stamped: no account') : a.status === 403 ? 'needs browser-sign-in' : 'code refused',
      };
    }
    case 'submit': return { asked: `browser: submit ${shortCode(last.code)}`, number: String(last.answer.status), meaning: last.answer.status === 303 ? 'joined the Session' : 'no agent stamped it' };
    case 'browse': return { asked: 'browser: open /orders', number: String(last.status), meaning: last.visit.via === 'session' ? `as account ${last.visit.account}` : 'Session, signed out' };
    case 'forge': return { asked: `${ATTACKER.site}: post ${shortCode(last.code)}`, number: String(last.answer.status), meaning: 'no cookie came' };
    case 'phish': return { asked: `attacker: submit ${shortCode(last.code)}`, number: String(last.answer.status), meaning: 'no agent stamped it' };
  }
}

const sayVisit = (v: Visit) => (v.via === 'session' ? `signed in to account ${v.account} with the scopes ${v.scopes!.join(', ')}` : v.account ? `logged in as ${v.account} by its own login` : 'not logged in');
const sayRecord = (r: CodeRecord) =>
  `${r.code}: ${r.authorized ? `stamped by ${r.authorized.agent === AGENT.clientId ? 'your agent' : 'the attacker'} for Session ${r.authorized.sid}${r.authorized.account ? `, account ${r.authorized.account}` : ', no account'}` : 'not stamped'}${
    r.submitted ? (r.joined ? ', submitted with its cookie and joined' : r.seated ? ', submitted with its cookie and refused' : ', submitted without its cookie and refused') : ''}`;

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World, shown: Shown): string {
  const key = teethOf(w.signIn) ? `its key with ${teethOf(w.signIn)} teeth${w.dropped ? ', which it has stopped sending after the 403' : ''}` : 'no key';
  const page = w.page ? `The browser shows the join page with code ${w.page}.` : w.browser.session ? 'The browser shows the website.' : w.last?.event === 'submit' ? 'The browser shows an error page.' : 'The browser shows no page of the website yet.';
  const shelf = `Its cookies: ${w.browser.join ? `a join cookie (${w.browser.join})` : 'no join cookie'}, ${w.browser.session ? `the Session’s cookie for ${w.browser.session.grant.sid}${w.browser.session.grant.account ? ` acting for account ${w.browser.session.grant.account}` : ', signed out'}` : 'no Session cookie'}.`;
  const records = w.company.codes.filter((r) => shown.attacker || (r.code !== ATTACK_CODE && r.code !== PHISH_CODE));
  const rack = records.length ? `example.com’s codes: ${records.map(sayRecord).join('; ')}.` : 'example.com has issued your agent no code yet.';
  const evil = shown.attacker ? ` The attacker’s browser keeps the cookie of code ${PHISH_CODE}.` : '';
  const last = w.last;
  const sent = !last ? 'Nothing has been sent.'
    : last.event === 'fetch' ? `The agent fetched ${'/help/exchanges'} with its own client, with its seal and no key: ${last.status}, signed out.`
    : last.event === 'load' ? `The browser loaded the join page: ${last.status}, a code on the page and a cookie on its shelf.`
    : last.event === 'authorize' ? `The agent sent ${last.code} on its own road, with its seal${last.withToken ? ' and its key' : ' and no key'}: ${last.answer.status}${last.answer.error ? ` ${last.answer.error}` : ''}${last.answer.needs ? `, naming ${last.answer.needs}` : ''}.`
    : last.event === 'submit' ? `The browser submitted ${last.code}: ${last.answer.status === 303 ? '303, and the Session’s cookie came back' : `400, ${last.answer.failed.join('; ')}`}.`
    : last.event === 'browse' ? `The browser opened /orders: ${last.status}, ${sayVisit(last.visit)}.`
    : last.event === 'forge' ? `A page on ${ATTACKER.site} made the agent’s browser post ${last.code}: 400, ${last.answer.status === 400 ? last.answer.failed.join('; ') : ''}.`
    : `A message gave the agent ${last.code}; it declined, since ${last.declined}. The attacker’s browser submitted it: 400, ${last.answer.status === 400 ? last.answer.failed.join('; ') : ''}.`;
  const yours = shown.attacker ? '' : ' Your own browser, lower right, is never joined.';
  return `Your agent holds its seal and ${key}. ${page} ${shelf} ${rack}${evil}${yours} ${sent}`;
}

// ---------------------------------------------------------------------------------------------
// The world.

/** The state as its picture: agent, browser and Company, the rack of codes, and the last answer. */
export function drawWorld(w: World, s: Stage, shown: Shown): Group {
  const parts = keyedParts(), last = w.last, report = reportOf(w), teeth = teethOf(w.signIn);

  // Your agent: its station, with its seal and its key (or the empty slot for one).
  addAll(parts, station(s, { at: STATION, r: STATION_R, keyTeeth: teeth }));
  // The agent reads its own browser's page: a dotted line from the station to the window.
  parts.add(new Line(READ_FROM, [WIN[0] - WIN_W / 2, 1.95], { stroke: TONE.steel, strokeWidth: STROKE.line, dashArray: '0.16 0.12' }), 'reads');

  // The Company's counter, and the two roads that reach it.
  addAll(parts, counter(s, { x: COUNTER_X, top: MARGIN.top, bottom: -1.75 }));
  const agentRoad = last?.event === 'fetch' || last?.event === 'authorize';
  const agentReached = last?.event === 'fetch' || (last?.event === 'authorize' && last.answer.status === 204);
  // The agent's road carries no name on it: its tickets travel the whole of it, and a name there would be run over.
  parts.add(new Line(ROAD_A_FROM, [COUNTER_X, ROAD_A], { stroke: agentRoad ? TONE.ink : TONE.steel, strokeWidth: agentRoad ? STROKE.bold : STROKE.line }), 'lane:agent:line');
  parts.add(stop(s, { at: [COUNTER_X, ROAD_A], active: agentReached }), 'lane:agent:stop');
  const browserRoad = !!last && ['load', 'submit', 'browse', 'forge'].includes(last.event);
  parts.add(new Line(ROAD_B_FROM, [COUNTER_X, ROAD_B], { stroke: browserRoad ? TONE.ink : TONE.steel, strokeWidth: browserRoad ? STROKE.bold : STROKE.line }), 'road:browser');
  parts.add(stop(s, { at: [COUNTER_X, ROAD_B], active: browserRoad }), 'road:browser:stop');

  // The agent's last request on its road: docked at the counter, or before a barrier.
  if (last?.event === 'fetch' || last?.event === 'authorize') {
    const delivered = last.event === 'fetch' || last.answer.status === 204, at = ticketAt(delivered);
    if (!delivered) parts.add(barrier(s, { at: [BARRIER_X, ROAD_A] }), 'barrier');
    parts.add(ticket(s, { at, keyTeeth: last.event === 'authorize' && last.withToken ? teeth : null }), 'ticket');
  }

  // The agent's browser: its window, and what its page shows.
  parts.add(browserWindow(s, { at: WIN, width: WIN_W, height: WIN_H, lines: w.page || w.browser.session || last?.event === 'submit' ? 0 : 3 }), 'browser');
  if (w.page) {
    parts.add(stub(s, { at: PAGE_AT, code: w.page, width: 2.3 }), 'page:stub');
    parts.add(new Rectangle({ width: 1.5, height: 0.36, fill: TONE.steel, stroke: 'none', cornerRadius: 0.18 }).moveTo([PAGE_AT[0], 0.0]), 'page:button');
  } else if (w.browser.session) {
    const g = w.browser.session.grant, signedIn = !!g.account;
    parts.add(words(s, signedIn ? `account ${g.account}` : 'signed out', { at: [WIN[0] - 2.5, 0.95], size: TYPE.label, bold: true }), 'page:who');
    parts.add(words(s, 'Session', { at: [WIN[0] - 2.5, 0.15], color: TONE.soft }), 'page:session');
    parts.add(words(s, g.sid, { at: [WIN[0] - 2.5 + words(s, 'Session').width() + 0.2, 0.15], color: TONE.soft, mono: true }), 'page:sid');
  } else if (last?.event === 'submit') parts.add(words(s, 'error page', { at: [WIN[0], 0.6], size: TYPE.label, color: TONE.soft, align: 'middle' }), 'page:error');

  // Its cookie shelf: the join cookie half until a join clears it (a failed one leaves it), the Session's cookie once joined.
  parts.add(new Rectangle({ width: WIN_W - 0.3, height: 0.1, fill: TONE.steel, stroke: 'none', cornerRadius: 0.05 }).moveTo([WIN[0], SHELF_Y]), 'shelf');
  parts.add(words(s, 'cookies', { at: [WIN[0] - WIN_W / 2 + 0.15, SHELF_Y + 0.42], color: TONE.soft }), 'shelf:name');
  const open = w.company.codes.find((r) => r.cookie === w.browser.join);
  if (open) parts.add(cookieHalf(s, { left: JOIN_AT[0] - HALF_W / 2, y: JOIN_AT[1], code: open.code }), 'shelf:join');
  if (w.browser.session) {
    parts.add(new Group(cookie(s, { at: SESSION_AT, r: 0.44 }), seal(s, { at: [SESSION_AT[0] - 0.04, SESSION_AT[1] - 0.04], r: 0.2 })), 'shelf:session');
  }

  // Behind the counter: the codes example.com issued, as the stubs it keeps.
  parts.add(words(s, 'example.com', { at: [RACK_X, 3.85], mono: true, bold: true }), 'rack:title');
  const records = w.company.codes.filter((r) => shown.attacker || (r.code !== ATTACK_CODE && r.code !== PHISH_CODE));
  const ordered = [...records.filter((r) => r.code !== ATTACK_CODE && r.code !== PHISH_CODE), ...records.filter((r) => r.code === ATTACK_CODE || r.code === PHISH_CODE)];
  if (!ordered.length) parts.add(words(s, 'no codes yet', { at: [RACK_X, ROW_Y[0]], size: TYPE.label, color: TONE.soft }), 'rack:none');
  ordered.forEach((r, i) => row(s, parts, r, ROW_Y[i]!));

  // A code that came in a message: it lies outside the station, declined.
  if (last?.event === 'phish') {
    parts.add(codeSlip(s, { at: MESSAGE_AT, code: shortCode(last.code) }), 'message');
    parts.add(words(s, 'declined', { at: [MESSAGE_AT[0], MESSAGE_AT[1] - 0.82], color: TONE.soft, align: 'middle' }), 'message:note');
  }

  // Lower right: the attacker's browser once it is on stage; before that, what the stamps mean.
  if (shown.attacker) {
    parts.add(browserWindow(s, { at: EVIL, width: 5.9, height: 2.2, host: ATTACKER.site, lines: 0 }), 'evil');
    parts.add(words(s, 'cookies', { at: [EVIL_HALF_AT[0] + 0.75, EVIL_HALF_AT[1]], color: TONE.soft }), 'evil:shelf');
    // A browser sends a copy of a cookie and keeps it: the half stays on its shelf.
    if (w.attacker.join) parts.add(cookieHalf(s, { left: EVIL_HALF_AT[0] - HALF_W / 2, y: EVIL_HALF_AT[1], code: PHISH_CODE }), 'evil:half');
  } else {
    // Your own browser: on the same website, never joined; the agent joins only a browser it controls (6).
    parts.add(browserWindow(s, { at: EVIL, width: 5.9, height: 2.2, lines: 0 }), 'yours');
    parts.add(person(s, { at: [EVIL[0] - 2.05, EVIL[1] - 0.5], size: 0.62 }), 'yours:person');
    parts.add(words(s, 'your browser', { at: [EVIL[0] - 1.45, EVIL[1] - 0.45], color: TONE.soft }), 'yours:name');
    // Right under the rows, so the marks are named beside the stubs that carry them.
    const y0 = ROW_Y[1] + 0.1; // the story shows at most one row before the attacker comes, so the legend never moves
    parts.add(seal(s, { at: [RACK_X + 0.5, y0], r: 0.32 }), 'legend:stamp');
    parts.add(words(s, 'agent stamped', { at: [RACK_X + 1.1, y0], color: TONE.soft }), 'legend:stamp:name');
    parts.add(new Circle({ radius: 0.28, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.line, dashArray: '0.12 0.08' }).moveTo([RACK_X + 0.5, y0 - 0.85]), 'legend:ring');
    parts.add(words(s, 'not stamped', { at: [RACK_X + 1.1, y0 - 0.85], color: TONE.soft }), 'legend:ring:name');
  }

  // Under the browser: what was asked, and what came back.
  if (report)
    addAll(parts, answer(s, {
      at: [MARGIN.left, -1.82], asked: report.asked, number: report.number, phrase: PHRASE[Number(report.number)]!, meaning: report.meaning,
      emphasis: `the answer: ${report.number} ${PHRASE[Number(report.number)]}, ${report.meaning}`,
    }));
  else parts.add(words(s, 'nothing sent yet', { at: [MARGIN.left, -3.0], size: TYPE.label, color: TONE.soft }), 'answer:code');
  return parts.group();
}

// ---------------------------------------------------------------------------------------------
// The table of logins (6): what a join does to a login the browser already had.

type Cell = { tag: string | null; scoped: boolean };
const ROWS: { before: string | null; key: string | null }[] = [
  { before: null, key: null }, { before: null, key: 'A' }, { before: 'A', key: null }, { before: 'B', key: 'A' },
];
const cellOf = (v: Visit): Cell => ({ tag: v.account, scoped: v.via === 'session' });
const COLUMN_X = [-5.55, -1.95, 1.75, 5.45] as const;
const TABLE_ROW_Y = [2.45, 0.95, -0.55, -2.05] as const;

/** A small browser window holding an account tag, or nothing: a login, or none. */
function miniWindow(s: Stage, at: Vec, cell: Cell, label?: string): Group {
  const [x, y] = at, w = 2.5, h = 1.15;
  const items: Mobject[] = [
    new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.panel }).moveTo(at),
    new Rectangle({ width: w - 0.06, height: STROKE.hair, fill: TONE.rule, stroke: 'none' }).moveTo([x, y + h / 2 - 0.3]),
    ...[0, 1, 2].map((i) => new Circle({ radius: 0.05, fill: TONE.steel, stroke: 'none' }).moveTo([x - w / 2 + 0.2 + i * 0.16, y + h / 2 - 0.15])),
  ];
  const text = label ?? cell.tag;
  if (text) items.push(words(s, text, { at: [x - (cell.scoped ? 0.45 : 0), y - 0.12], size: TYPE.label, mono: true, bold: true, align: 'middle' }));
  else items.push(words(s, 'none', { at: [x, y - 0.12], color: TONE.soft, align: 'middle' }));
  if (cell.scoped) items.push(key(s, { at: [x + 0.55, y - 0.12], size: 0.36, teeth: 3 }));
  return new Group(...items);
}

/** The spec's table as four rows of windows, computed from the model's joinEffect. */
export function drawLogins(s: Stage): Group {
  const parts = keyedParts();
  ['before', 'join', 'while joined', 'sign-in ends'].forEach((head, i) => parts.add(words(s, head, { at: [COLUMN_X[i]!, 3.75], bold: true, align: 'middle' }), `logins:head:${i}`));
  ROWS.forEach((r, i) => {
    const y = TABLE_ROW_Y[i]!, effect = joinEffect(r.before, r.key);
    parts.add(miniWindow(s, [COLUMN_X[0], y], { tag: r.before, scoped: false }, i === 3 ? 'A or B' : undefined), `logins:${i}:before`);
    parts.add(ticket(s, { at: [COLUMN_X[1], y], keyTeeth: r.key ? 3 : null }), `logins:${i}:join`);
    parts.add(miniWindow(s, [COLUMN_X[2], y], cellOf(effect.whileJoined)), `logins:${i}:while`);
    parts.add(miniWindow(s, [COLUMN_X[3], y], cellOf(effect.afterSignInEnds)), `logins:${i}:after`);
  });
  parts.add(words(s, 'a key replaces the old login; no key leaves it', { at: [0, -3.55], color: TONE.soft, align: 'middle' }), 'logins:rule');
  return parts.group();
}

export function sayLogins(): string {
  const say = (v: Visit) => (v.via === 'session' ? `signed in to ${v.account} with the token’s scopes` : v.account ? `logged in as ${v.account}` : 'not logged in');
  return `What a join does to a login the browser already had, row by row. ${ROWS.map((r, i) => {
    const e = joinEffect(r.before, r.key);
    return `${i + 1}: before, ${i === 3 ? 'logged in as A or B' : r.before ? `logged in as ${r.before}` : 'not logged in'}; a join ${r.key ? `with a key for ${r.key}` : 'without a key'}; while joined, ${say(e.whileJoined)}; when the Session’s sign-in ends, ${say(e.afterSignInEnds)}.`;
  }).join(' ')}`;
}

/** Codes and Session, for the scene's words. */
export const OWN_CODE = CODES[2];
export { SID };
