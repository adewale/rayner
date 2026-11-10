import { Circle, Group, Line, Polygon, Rectangle, Text } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { AGENT, COMPANY, OPERATIONS, SID, THIEF, USER_IDS, ruleOf } from './model.ts';
import type { Channel, Exchange, Scope, World } from './model.ts';

// One state as a picture, drawn as a line map. The agent is a station on the left; the lanes its
// poppy.json opened run from it to stops at the Company's counter on the right. The last request is
// a ticket on its lane. It carries a wax seal (the Session header: who is asking) and, when the
// request is signed in, a brass key (the access token: what the account allows), cut with one tooth
// for each scope the User approved. A ticket that was accepted rests on its stop; one that was
// refused rests before a barrier. Under the map, what was asked and what came back. Right, what
// the Company knows, as a ledger, and the two marks named.
//
// Three colours carry meaning and nothing else does: poppy red is the agent's seal, brass is a key,
// and white is what is in use. Outcomes are said by position, by the barrier and in words, so red is
// never also "refused". Protocol literals (hosts, IDs, status codes) are set in the mono face.
//
// Every label is at least 0.56 units high, 12.5 px on a 358 px stage: a phone shows the whole
// picture, and while a reader presses events it shows nothing else, so no label may depend on a
// close-up to be read. The scene draws no heading, so the picture has the stage's full height.
// The request's method and path, and the rule of the draft that decided the answer, are in the
// picture's words (sayWorld) rather than drawn.

const PHRASE: Record<number, string> = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };
const scopesOf = (scopes: readonly Scope[]) => scopes.join(' ');
/** Scopes in the few characters a row has. */
const briefly = (scopes: readonly Scope[]) => (scopes.length > 1 ? 'read+write' : 'read only');
/** The stage's own colours: a navy ground, warm white ink, poppy red for the seal, steel for what is idle. */
export const PALETTE = { paper: '#13203b', ink: '#f3efe6', accent: '#ef4b34', muted: '#62749c' } as const;
/** Brass, for a key; and the grey of a seal that is not the agent's. */
const BRASS = '#e3a92f', OTHER_SEAL = '#aeb6c9';

/** The lanes of the wire: the three channels a poppy.json lists, and the Company's sign-in page. */
export const LANES = ['api', 'web', 'chat', 'sign-in'] as const;
export type Lane = (typeof LANES)[number];
const LANE_NAME: Record<Lane, string> = { api: 'API', web: 'Website', chat: 'Chat', 'sign-in': 'Sign-in' };
const lane = (channel: Channel): Lane => channel;

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
    lane: lane(OPERATIONS[last.op].channel),
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
  const wire = w.found ? 'Four lanes run from the agent to the Company: API, Website, Chat and Sign-in.' : 'No lane runs from the agent to the Company yet.';
  const sent = !last ? 'Nothing has been sent.'
    : last.kind === 'discover' ? `The agent read the Company’s poppy.json, which lists ${last.channels.length} channels and where to sign in.`
    : last.kind === 'sign-in' ? `You signed in on the Company’s own page and approved ${scopesOf(last.granted)}; a key went to the agent.`
    : last.kind === 'revoke' ? 'The agent revoked its refresh token, and its key is gone.'
    : `${last.by === 'thief' ? 'A thief' : 'The agent'} sent ${OPERATIONS[last.op].method} ${OPERATIONS[last.op].path} on the ${LANE_NAME[lane(OPERATIONS[last.op].channel)]} lane, with a seal signed by ${last.by === 'thief' ? THIEF.name : AGENT.name} and ${
        last.token ? (last.by === 'thief' ? 'the agent’s copied key' : `a key for ${scopes}`) : 'no key'
      }; the Company answered ${last.answer.status}${last.answer.error ? ` ${last.answer.error}` : ''}${last.answer.needs ? `, naming ${last.answer.needs}` : ''}, and the ticket ${
        last.answer.status === OPERATIONS[last.op].ok ? 'rests on its stop at the Company’s counter' : 'stopped at a barrier before it'
      }.`;
  const known = w.started
    ? `The Company knows ${AGENT.name}, User ID ${USER_IDS[COMPANY.domain]} and Session ${SID}, whose cart ${w.cart ? 'holds the medium' : 'is empty'}; the account is ${
        w.linked === 'yes' ? `linked for ${scopes}` : w.linked === 'no' ? 'not linked' : 'signed out'
      }.`
    : 'The Company knows nothing yet.';
  return `${wire} ${sent} ${known} The agent holds its seal and ${w.grant ? `a key for ${scopes}` : 'no key'}. The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

// The map's geometry, shared with the scene's transitions.
const LEFT = -7.75, RIGHT = 7.75;
/** The agent's station, where every lane starts. */
const STATION = { x: -6.35, y: 2.25, r: 1.2 };
const FAN_X = STATION.x + STATION.r + 0.2;
export const LANE_Y: Record<Lane, number> = { api: 3.6, web: 2.6, chat: 1.6, 'sign-in': 0.6 };
/** Where each lane ends: its stop at the Company's counter. */
export const STOP_X = 0.38;
/** Where a lane, having fanned out from the agent, turns level. */
export const levelAt = (on: Lane): [number, number] => levelAtY(LANE_Y[on]);
/** The same, for a lane known by its height. */
export const levelAtY = (y: number): [number, number] => [FAN_X + 0.6 * Math.abs(y - STATION.y), y];
/** Where a ticket rests on its lane: on its stop when delivered, before the barrier when refused. */
export const ticketAt = (on: Lane, delivered: boolean): [number, number] => [delivered ? STOP_X : -1.0, LANE_Y[on]];
/** Where a thief's ticket comes from: under the map, away from the agent. */
export const THIEF_FROM: [number, number] = [-2.9, -0.35];
/** Where the Company's poppy.json sets off from, and where the agent takes it in. */
export const DOCUMENT_ROUTE: [[number, number], [number, number]] = [[STOP_X - 0.5, STATION.y], [FAN_X + 0.4, STATION.y]];

const SMALL = 0.56, BODY = 0.6, TITLE = 0.66;
/** Where the lanes' names start, on their level runs. */
const NAME_X = -3.7;

/** A wax seal: a scalloped disc with a pressed ring, or, for a seal that is not the agent's, a plain star. */
function seal(centre: [number, number], radius: number, colour: string, ground: string, other = false): Group {
  const lobes = 12, steps = other ? 16 : lobes * 10;
  const edge = Array.from({ length: steps }, (_, k): [number, number] => {
    const a = (k / steps) * 2 * Math.PI, r = other ? (k % 2 ? radius * 0.72 : radius) : radius * (0.93 + 0.07 * Math.cos(lobes * a));
    return [centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)];
  });
  return new Group(
    new Polygon(edge, { fill: colour, stroke: 'none' }),
    new Circle({ radius: radius * 0.56, fill: 'none', stroke: ground, strokeWidth: radius * 0.1 }).moveTo(centre),
    new Circle({ radius: radius * 0.2, fill: ground, stroke: 'none' }).moveTo(centre),
  );
}

/** A key, bow to the left: a ring, a shaft and one tooth for each scope it was cut for. */
function key(centre: [number, number], size: number, teeth: number, colour: string): Group {
  const length = 2.2 * size, bow = 0.42 * size, x0 = centre[0] - length / 2, y = centre[1];
  return new Group(
    new Circle({ radius: bow - 0.09 * size, fill: 'none', stroke: colour, strokeWidth: 0.18 * size }).moveTo([x0 + bow, y]),
    new Rectangle({ width: length - 2 * bow + 0.06 * size, height: 0.18 * size, fill: colour, stroke: 'none' }).moveTo([x0 + bow + length / 2 - 0.03 * size, y]),
    ...Array.from({ length: teeth }, (_, i) => new Rectangle({ width: 0.2 * size, height: 0.36 * size, fill: colour, stroke: 'none' }).moveTo([x0 + length - 0.1 * size - i * 0.38 * size, y - 0.26 * size])),
  );
}

/** The poppy.json as a sheet of paper, for the transition that carries it to the agent. */
export function documentToken(s: Stage): Mobject {
  const { ink, paper } = s.look;
  const sheet = new Rectangle({ width: 0.9, height: 1.15, fill: ink, stroke: 'none', cornerRadius: 0.06 });
  const lines = [0.3, 0.05, -0.2].map((y, i) => new Line([-0.28, y], [i === 2 ? 0.05 : 0.28, y], { stroke: paper, strokeWidth: 0.07 }));
  return new Group(sheet, ...lines);
}

/** The state as its picture: the line map and the last answer on the left, what the Company knows on the right. */
export function drawWorld(w: World, s: Stage): Group {
  const { ink, soft, emphasis: poppy, raised, paper, muted } = s.look, shaping = s.scene.textShaping;
  const parts = keyedParts();
  const text = (id: string, value: string, at: [number, number], o: { size: number; color?: string; bold?: boolean; mono?: boolean; end?: boolean; middle?: boolean }) =>
    parts.add(
      new Text(value, { fontSize: o.size, color: o.color ?? ink, shaping, anchor: o.end ? 'end' : o.middle ? 'middle' : 'start', ...(o.bold ? { weight: 'bold' as const } : {}), ...(o.mono ? { font: 'mono' as const } : {}) })
        .moveTo(at, [o.end ? 1 : o.middle ? 0 : -1, 0]),
      id,
    );
  const last = w.last, report = reportOf(w), request = last?.kind === 'request' ? last : null, teeth = w.approves.length;

  // The agent's station: its seal always, and its key once the User has had one cut.
  parts.add(new Circle({ radius: STATION.r, fill: raised, stroke: ink, strokeWidth: 0.14 }).moveTo([STATION.x, STATION.y]), 'agent:station');
  parts.add(seal([STATION.x, STATION.y], 0.72, poppy, paper), 'agent:seal');
  text('agent:name', 'your agent', [STATION.x, 0.6], { size: SMALL, middle: true });
  const hook: [number, number] = [STATION.x, -0.15];
  parts.add(key(hook, 0.95, teeth, muted), 'agent:key:slot').setOpacity(0.38);
  if (w.grant) {
    const held = parts.add(key(hook, 0.95, teeth, BRASS), 'agent:key');
    if (last?.kind === 'sign-in') emphasised(held, `changed: the agent now holds a key for ${scopesOf(w.approves)}`);
  }

  // The Company's counter, the lanes poppy.json opened, and a stop where each lane meets the counter.
  parts.add(new Rectangle({ width: 0.24, height: 4.0, fill: ink, stroke: 'none', cornerRadius: 0.05 }).moveTo([STOP_X + 0.5, (LANE_Y.api + LANE_Y['sign-in']) / 2]), 'edge');
  if (w.found)
    for (const name of LANES) {
      const y = LANE_Y[name], active = report?.lane === name, [bend] = levelAt(name);
      const line = new Line([STATION.x + STATION.r, STATION.y], [FAN_X, STATION.y], { stroke: active ? ink : muted, strokeWidth: active ? 0.16 : 0.1, fill: 'none' });
      line.addLineTo([bend, y]).addLineTo([STOP_X, y]);
      parts.add(line, `lane:${name}:line`);
      // The lane's name is set on the line, signage fashion, on a plate of the ground's colour.
      const label = new Text(LANE_NAME[name], { fontSize: SMALL, color: active ? ink : soft, shaping, anchor: 'start', ...(active ? { weight: 'bold' as const } : {}) }).moveTo([NAME_X, y], [-1, 0]);
      parts.add(new Rectangle({ width: label.width() + 0.4, height: 0.84, fill: paper, stroke: 'none' }).moveTo([NAME_X + label.width() / 2, y]), `lane:${name}:plate`);
      parts.add(label, `lane:${name}:name`);
      parts.add(new Circle({ radius: 0.2, fill: paper, stroke: active ? ink : muted, strokeWidth: 0.1 }).moveTo([STOP_X, y]), `lane:${name}:stop`);
    }
  else text('lane:none', 'no way in yet', [(FAN_X + STOP_X) / 2, STATION.y], { size: BODY, color: soft, middle: true });

  // The last request, as a ticket on its lane: a seal, and a key when it carried a token.
  if (request && report?.lane) {
    const [x, y] = ticketAt(report.lane, report.delivered), thief = request.by === 'thief', wide = request.token;
    if (!report.delivered) parts.add(new Rectangle({ width: 0.18, height: 0.92, fill: ink, stroke: 'none', cornerRadius: 0.04 }).moveTo([0.0, y]), 'barrier');
    const plate = new Rectangle({ width: wide ? 1.7 : 0.9, height: 0.74, cornerRadius: 0.16, fill: ink, stroke: paper, strokeWidth: 0.07 }).moveTo([x, y]);
    const stamp = seal([wide ? x - 0.5 : x, y], 0.26, thief ? OTHER_SEAL : poppy, thief ? paper : ink, thief);
    parts.add(new Group(plate, stamp, ...(wide ? [key([x + 0.3, y + 0.04], 0.4, teeth, '#b07a12')] : [])), 'ticket');
  }

  // Under the map: what was asked, the answer's number, and what it meant.
  parts.add(new Line([LEFT, -0.85], [RIGHT, -0.85], { stroke: muted, strokeWidth: 0.03 }), 'divider');
  if (report) {
    text('answer:asked', report.asked, [LEFT, -1.5], { size: BODY, color: soft });
    if (report.number) text('answer:code', report.number, [LEFT, -3.0], { size: 1.5, mono: true, bold: true });
    else parts.add(key([LEFT + 1.25, -2.95], 1.1, last?.kind === 'sign-in' ? last.granted.length : teeth, BRASS), 'answer:key');
    emphasised(text('answer:phrase', report.phrase, [LEFT + 3.2, -2.62], { size: 0.74, bold: true }), `the answer: ${report.number ?? ''} ${report.phrase}, ${report.outcome}`);
    text('answer:outcome', report.outcome, [LEFT + 3.2, -3.42], { size: BODY, color: report.delivered ? ink : soft });
  } else text('answer:code', 'nothing sent yet', [LEFT, -2.6], { size: TITLE, color: soft });

  // Right: what the Company knows, as a ledger. The row the last request changed carries a marker.
  const r = 1.45, verified = request && request.by === 'agent' && request.answer.error !== 'invalid_session' ? request : null;
  text('company:title', 'The Company knows', [r, 3.75], { size: 0.62, bold: true });
  knownBy(w).forEach(([label, value], i) => {
    const y = 2.8 - i * 0.92, quiet = ['none yet', 'not met yet', 'not linked'].includes(value);
    const changed = !!verified && (label === 'account' ? verified.token : label === 'session' && verified.op === 'cart');
    parts.add(new Line([r, y + 0.46], [RIGHT, y + 0.46], { stroke: muted, strokeWidth: 0.03 }), `company:${label}:rule`);
    text(`company:${label}:label`, label, [r, y], { size: SMALL, color: soft });
    const shown = text(`company:${label}:value`, value, [RIGHT, y], { size: SMALL, color: quiet ? soft : ink, end: true, mono: !quiet });
    if (changed) {
      emphasised(shown, `changed: ${label} is now ${value}`);
      const tip = shown.center()[0]! - shown.width() / 2 - 0.3;
      parts.add(new Polygon([[tip - 0.24, y + 0.17], [tip, y], [tip - 0.24, y - 0.17]], { fill: BRASS, stroke: 'none' }), `company:${label}:mark`);
    }
  });

  // The two marks, named: what each proof says.
  parts.add(seal([r + 0.5, -2.05], 0.44, poppy, paper), 'legend:seal');
  text('legend:seal:name', 'Session header', [r + 1.3, -1.75], { size: BODY, bold: true });
  text('legend:seal:says', 'who is asking', [r + 1.3, -2.42], { size: SMALL, color: soft });
  parts.add(key([r + 0.5, -3.42], 0.42, teeth, BRASS), 'legend:key');
  text('legend:key:name', 'Access token', [r + 1.3, -3.15], { size: BODY, bold: true });
  text('legend:key:says', 'what you allow', [r + 1.3, -3.82], { size: SMALL, color: soft });
  return parts.group();
}
