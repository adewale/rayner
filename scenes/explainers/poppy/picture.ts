import { Circle, Group, Line, Polygon, Rectangle, Text } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { AGENT, COMPANY, OPERATIONS, SID, THIEF, USER_IDS, ruleOf } from './model.ts';
import type { Channel, Exchange, Scope, World } from './model.ts';

// One state as a picture. Left, the wire: the agent, the lanes its poppy.json opened to the
// Company, and the last request as a packet on its lane. The packet carries a round seal (the
// Session header: who is asking) and, when the request is signed in, a diamond key (the access
// token: what the account allows). A packet that was accepted rests against the Company's edge;
// one that was refused rests short of it. Under the wire, what was asked and what came back.
// Right, what the Company knows, and the two marks named.
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
/** The colour of the key, the mark of an access token: an amber that reads on the stage's paper. */
export const KEY_COLOUR = '#9a6700';

type Tone = 'good' | 'bad' | 'plain';
/** The lanes of the wire: the three channels a poppy.json lists, and the Company's sign-in page. */
export const LANES = ['api', 'web', 'chat', 'sign-in'] as const;
export type Lane = (typeof LANES)[number];
const LANE_NAME: Record<Lane, string> = { api: 'API', web: 'Website', chat: 'Chat', 'sign-in': 'Sign-in' };
const lane = (channel: Channel): Lane => channel;

/** The words under the wire: who asked for what, and what came back; and the lane it went by. */
export type Report = { asked: string; code: string; outcome: string; tone: Tone; lane: Lane | null; delivered: boolean };
export function reportOf(w: World): Report | null {
  const last: Exchange | null = w.last;
  if (!last) return null;
  if (last.kind === 'discover') return { asked: 'Agent: read poppy.json', code: '200 OK', outcome: `${last.channels.length} channels + sign-in`, tone: 'good', lane: null, delivered: true };
  if (last.kind === 'sign-in') return { asked: 'You: sign in', code: 'Approved', outcome: `key: ${briefly(last.granted)}`, tone: 'good', lane: 'sign-in', delivered: true };
  if (last.kind === 'revoke') return { asked: 'Agent: sign out', code: '200 OK', outcome: 'access has ended', tone: 'plain', lane: 'sign-in', delivered: true };
  const { status, needs, error } = last.answer, ok = status === OPERATIONS[last.op].ok;
  return {
    asked: `${last.by === 'thief' ? 'Thief' : 'Agent'}: ${{ cart: 'add to cart', browse: 'browse the site', chat: 'ask about sizes', order: 'see the order', exchange: 'exchange jacket' }[last.op]}`,
    code: `${status} ${PHRASE[status]}`,
    outcome: ok
      ? { cart: 'added to the cart', browse: 'browser joins Session', chat: 'an AI answers: yes', order: 'here is order 1042', exchange: 'exchange is made' }[last.op]
      : status === 401 ? `needs ${needs}` : status === 403 ? `lacks ${needs}` : (error ?? 'refused'),
    tone: ok ? 'good' : 'bad',
    lane: lane(OPERATIONS[last.op].channel),
    delivered: ok,
  };
}

/** What the Company knows, row by row: only what verified requests have told it. */
export function knownBy(w: World): [string, string][] {
  return [
    ['Agent', w.started ? AGENT.name : 'not met yet'],
    ['User ID', w.started ? USER_IDS[COMPANY.domain] : 'not met yet'],
    ['Session', w.started ? (w.cart ? '1 in cart' : 'cart empty') : 'none yet'],
    ['Account', w.linked === 'yes' ? briefly(w.approves) : w.linked === 'no' ? 'not linked' : 'signed out'],
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
      }; the Company answered ${last.answer.status}${last.answer.error ? ` ${last.answer.error}` : ''}${last.answer.needs ? `, naming ${last.answer.needs}` : ''}, and the packet ${
        last.answer.status === OPERATIONS[last.op].ok ? 'rests at the Company’s edge' : 'stopped short of it'
      }.`;
  const known = w.started
    ? `The Company knows ${AGENT.name}, User ID ${USER_IDS[COMPANY.domain]} and Session ${SID}, whose cart ${w.cart ? 'holds the medium' : 'is empty'}; the account is ${
        w.linked === 'yes' ? `linked for ${scopes}` : w.linked === 'no' ? 'not linked' : 'signed out'
      }.`
    : 'The Company knows nothing yet.';
  return `${wire} ${sent} ${known} The agent holds its seal and ${w.grant ? `a key for ${scopes}` : 'no key'}. The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

// The wire's geometry, shared with the scene's transitions.
const TOP = 4.2, BOTTOM = -4.2, LEFT = -7.75;
/** The agent's box, and the Company's edge the lanes end on. */
const AGENT_BOX = { left: LEFT, right: -5.25, top: 4.05, bottom: -0.75 };
export const EDGE_X = -0.02;
const LANE_Y: Record<Lane, number> = { api: 3.05, web: 1.9, chat: 0.75, 'sign-in': -0.4 };
/** Where a packet rests on its lane: against the Company's edge when delivered, short of it when refused. */
export const packetAt = (on: Lane, delivered: boolean): [number, number] => [delivered ? -0.98 : -1.9, LANE_Y[on]];
/** Where a thief's packet comes from: above the lanes, outside the agent. */
export const THIEF_FROM_Y = 4.05;
/** Where the lanes leave the agent. */
export const LANE_START = AGENT_BOX.right + 0.55;
/** Where the Company's poppy.json sets off from, and where the agent takes it in. */
export const DOCUMENT_ROUTE: [[number, number], [number, number]] = [[EDGE_X - 0.6, 1.65], [AGENT_BOX.right + 0.6, 1.65]];

const LABEL = 0.62, ROW = 0.66, TITLE = 0.7, HALF = 7.3, PAD = 0.28;

const diamond = (centre: [number, number], half: number, style: object) =>
  new Polygon([[centre[0], centre[1] + half], [centre[0] + half, centre[1]], [centre[0], centre[1] - half], [centre[0] - half, centre[1]]], style);

/** The poppy.json as a sheet of paper, for the transition that carries it to the agent. */
export function documentToken(s: Stage): Mobject {
  const { ink, paper, soft } = s.look;
  const sheet = new Rectangle({ width: 0.8, height: 1.0, stroke: ink, strokeWidth: 0.05, fill: paper, cornerRadius: 0.06 });
  const lines = [0.25, 0, -0.25].map((y) => new Line([-0.24, y], [0.24, y], { stroke: soft, strokeWidth: 0.05 }));
  return new Group(sheet, ...lines);
}

/** The state as its picture: the wire and the last exchange on the left, what the Company knows on the right. */
export function drawWorld(w: World, s: Stage): Group {
  const { ink, soft, good, bad, emphasis, raised, rule: hairline, paper, muted } = s.look, shaping = s.scene.textShaping;
  const parts = keyedParts();
  const tone = (t: Tone) => (t === 'good' ? good : t === 'bad' ? bad : ink);
  const text = (key: string, value: string, at: [number, number], o: { size: number; color?: string; bold?: boolean; end?: boolean; middle?: boolean }) =>
    parts.add(
      new Text(value, { fontSize: o.size, color: o.color ?? ink, shaping, anchor: o.end ? 'end' : o.middle ? 'middle' : 'start', ...(o.bold ? { weight: 'bold' as const } : {}) }).moveTo(at, [o.end ? 1 : o.middle ? 0 : -1, 0]),
      key,
    );
  const panel = (key: string, left: number, right: number, top: number, bottom: number, o: { stroke?: string; fill?: string; fillOpacity?: number; strokeWidth?: number } = {}) =>
    parts.add(
      new Rectangle({ width: right - left, height: top - bottom, stroke: o.stroke ?? hairline, strokeWidth: o.strokeWidth ?? 0.04, fill: o.fill ?? raised, fillOpacity: o.fillOpacity ?? 1, cornerRadius: 0.18 }).moveTo([(left + right) / 2, (top + bottom) / 2]),
      key,
    );

  const last = w.last, report = reportOf(w), request = last?.kind === 'request' ? last : null;

  // The agent: its seal always, and its key once the User has approved one.
  const ax = (AGENT_BOX.left + AGENT_BOX.right) / 2;
  panel('agent:box', AGENT_BOX.left, AGENT_BOX.right, AGENT_BOX.top, AGENT_BOX.bottom);
  text('agent:name', 'Agent', [ax, AGENT_BOX.top - 0.55], { size: LABEL, bold: true, middle: true });
  parts.add(new Circle({ radius: 0.5, fill: emphasis, stroke: 'none' }).moveTo([ax, 2.05]), 'agent:seal');
  const slot = parts.add(diamond([ax, 0.4], 0.62, { fill: 'none', stroke: hairline, strokeWidth: 0.05 }), 'agent:key:slot');
  slot.style.dashArray = '0.16 0.12';
  if (w.grant) {
    const key = parts.add(diamond([ax, 0.4], 0.62, { fill: KEY_COLOUR, stroke: 'none' }), 'agent:key');
    if (last?.kind === 'sign-in') emphasised(key, `changed: the agent now holds a key for ${scopesOf(w.approves)}`);
  }

  // The Company's edge, coloured by how the last request fared, and the lanes poppy.json opened.
  const edge = report && report.lane && report.lane !== 'sign-in' ? tone(report.tone) : soft;
  parts.add(new Rectangle({ width: 0.2, height: AGENT_BOX.top - AGENT_BOX.bottom, fill: edge, stroke: 'none', cornerRadius: 0.1 }).moveTo([EDGE_X + 0.1, (AGENT_BOX.top + AGENT_BOX.bottom) / 2]), 'edge');
  if (w.found)
    for (const name of LANES) {
      const y = LANE_Y[name], active = report?.lane === name;
      parts.add(new Line([AGENT_BOX.right, y], [EDGE_X, y], { stroke: active ? ink : muted, strokeWidth: active ? 0.07 : 0.04 }), `lane:${name}:line`);
      text(`lane:${name}:name`, LANE_NAME[name], [AGENT_BOX.right + 0.3, y + 0.48], { size: 0.56, color: active ? ink : soft });
    }
  else text('lane:none', 'no way in yet', [(AGENT_BOX.right + EDGE_X) / 2, 1.65], { size: LABEL, color: soft, middle: true });

  // The last request, as a packet on its lane: a seal, and a key when it carried a token.
  if (request && report?.lane) {
    const [x, y] = packetAt(report.lane, report.delivered), thief = request.by === 'thief';
    const pill = new Rectangle({ width: request.token ? 1.8 : 1.1, height: 0.8, cornerRadius: 0.4, fill: paper, stroke: report.delivered ? ink : bad, strokeWidth: 0.07 }).moveTo([x, y]);
    const seal = new Circle({ radius: 0.25, fill: thief ? bad : emphasis, stroke: 'none' }).moveTo([request.token ? x - 0.36 : x, y]);
    const packet = new Group(pill, seal, ...(request.token ? [diamond([x + 0.38, y], 0.29, { fill: KEY_COLOUR, stroke: 'none' })] : []));
    parts.add(packet, 'packet');
  }

  // Under the wire: what was asked, and what came back.
  const strip = { left: LEFT, right: LEFT + HALF, top: -1.2, bottom: BOTTOM };
  if (report) {
    const colour = tone(report.tone), plain = report.tone === 'plain';
    emphasised(panel('answer:box', strip.left, strip.right, strip.top, strip.bottom, { stroke: colour, fill: plain ? raised : colour, fillOpacity: plain ? 1 : 0.1, strokeWidth: 0.08 }), `the answer: ${report.code}, ${report.outcome}`);
    text('answer:asked', report.asked, [strip.left + PAD, -1.78], { size: LABEL, color: soft });
    text('answer:code', report.code, [strip.left + PAD, -2.68], { size: 0.78, bold: true, color: colour });
    text('answer:outcome', report.outcome, [strip.left + PAD, -3.6], { size: ROW });
  } else {
    panel('answer:box', strip.left, strip.right, strip.top, strip.bottom, { fill: paper }).style.dashArray = '0.22 0.16';
    text('answer:code', 'Nothing sent yet', [strip.left + PAD, -2.7], { size: 0.7, color: soft });
  }

  // Right: what the Company knows. A value the last request changed is drawn in the emphasis colour and marked.
  const r = 0.45, pitch = 1.14, verified = request && request.by === 'agent' && request.answer.error !== 'invalid_session' ? request : null;
  text('company:title', 'The Company knows', [r, TOP - 0.4], { size: TITLE, bold: true });
  panel('company:panel', r, r + HALF, TOP - 0.92, TOP - 0.92 - 4 * pitch - 0.08);
  knownBy(w).forEach(([label, value], i) => {
    const y = TOP - 0.92 - 0.61 - i * pitch, quiet = ['none yet', 'not met yet', 'not linked'].includes(value);
    const changed = !!verified && (label === 'Account' ? verified.token : label === 'Session' && verified.op === 'cart');
    text(`company:${label}:label`, label, [r + PAD, y], { size: ROW, color: soft });
    const shown = text(`company:${label}:value`, value, [r + HALF - PAD, y], { size: ROW, color: quiet ? soft : changed ? emphasis : ink, end: true });
    if (changed) emphasised(shown, `changed: ${label} is now ${value}`);
  });

  // The two marks, named: what each proof says.
  parts.add(new Circle({ radius: 0.3, fill: emphasis, stroke: 'none' }).moveTo([r + 0.45, -2.35]), 'legend:seal');
  text('legend:seal:name', 'Session header: who', [r + 1.05, -2.35], { size: LABEL });
  parts.add(diamond([r + 0.45, -3.45], 0.36, { fill: KEY_COLOUR, stroke: 'none' }), 'legend:key');
  text('legend:key:name', 'Access token: what', [r + 1.05, -3.45], { size: LABEL });
  return parts.group();
}
