import { Group, Polygon, Rectangle, VMobject, keyed } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, PLATE_HEIGHT, SPACE, TICKET, TONE, TYPE,
  addAll, barrier, certificate, clock, counter, key, lane, laneRoute, ledger, person, seal, sheet, station, stationExit, stationHolds, ticket, words,
} from '../lib/poppy-kit.ts';
import { SID } from '../poppy/model.ts';
import { MCP_URL, OPS, opFor, pending, sayReply, temptation } from './model.ts';
import type { Fix, Reply, Trouble, World } from './model.ts';

// One state as a picture, on the series' kit. The top band is chapter 1's line map: the agent's
// station on the left, three lanes (the OpenAPI service, the MCP server, and the sign-in desk where
// keys are cut) to the Company's counter, and behind the counter the ledger of what the Company
// knows about this Session. The last request is a ticket on its lane. A refused one stands before a
// barrier, and the Company hands back a slip: a paper tag with the status number, the part of the
// ticket that number is about (the key, the seal, the version, the pace) and the error code. Along
// the bottom runs the agent's remedy rail, six objects. When the agent answers, the one remedy it
// applied lights, the remedy a careless agent would reach for is struck through, and the panel
// under the ledger says why that one would have failed; the ticket, sent again, rests docked.
//
// Colours are the kit's, each with one meaning: WAX the agent's seal, BRASS a key, INK what is in
// use, STEEL what is idle. Outcomes are said by position (docked or stopped at a barrier), the slip
// and the rail, never by a red or green. Every word is at least TYPE.small (0.56 units).
//
// What the shown panel adds: step 5's "what if Session errors were 401", drawn from `shown.whatIf`.

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;
/** What is shown apart from the model: whether the panel under the ledger shows the 401 counterfactual. */
export type Shown = { whatIf?: boolean };

/** The lanes: the two API types a Company can list, and the sign-in desk where keys are cut. */
export const LANES = ['api', 'mcp', 'sign-in'] as const;
export type Lane = (typeof LANES)[number];
const LANE_NAME: Record<Lane, string> = { api: 'API', mcp: 'MCP', 'sign-in': 'Sign-in' };
const laneOfTrouble = (t: Trouble): Lane => (OPS[opFor(t)].service === 'mcp' ? 'mcp' : 'api');

/** The remedies on the rail, in order, with their one-word names. */
export const RAIL: readonly Fix[] = ['refresh', 'sign-in', 'fix', 'new-session', 'reread', 'wait'];
export const FIX_NAME: Record<Fix, string> = { refresh: 'Refresh', 'sign-in': 'Sign in', fix: 'Re-sign', 'new-session': 'New Session', reread: 'Re-read', wait: 'Wait' };
/** What a refusal's number is about: the part of the ticket, or the pace. */
const ABOUT: Record<Trouble, string> = { expire: 'the key', 'read-only': 'the key', delegation: 'the seal', end: 'the seal', 'old-copy': 'the version', 'too-fast': 'the pace', mcp: 'the key' };
/** Why the tempting remedy fails, in the words a panel 6 units wide holds. The draft's full reason is in the description. */
const WHY_NOT: Record<Trouble, string> = {
  expire: 'a refresh is enough', 'read-only': 'it cannot add a scope', delegation: 'the same seal fails', end: 'the key is fine',
  'old-copy': 'read poppy.json first', 'too-fast': 'the pace is the problem', mcp: 'a refresh will do',
};
const WHAT: Record<Trouble, string> = { expire: 'exchange', 'read-only': 'exchange', delegation: 'exchange', end: 'exchange', 'old-copy': 'exchange', 'too-fast': 'exchange', mcp: 'sizing call' };
const PHRASE: Record<number, string> = { 200: 'OK' };

// The map's geometry, shared with the scene's transitions.
const STATION: Vec = [-6.45, 3.15];
const STATION_R = 0.8;
const TRUNK_X = -5.25;
const FAN = 0.45;
export const LANE_Y: Record<Lane, number> = { api: 3.7, mcp: 2.95, 'sign-in': 2.2 };
const BUNDLE: Record<Lane, number> = { api: 0.22, mcp: -0.2, 'sign-in': -0.42 };
export const STOP_X = 0.62;
const NAME_X = -4.85;
const LEDGER_X = 1.45;
const BARRIER_X = STOP_X - 0.45;
export const routeOf = (on: Lane): Vec[] => laneRoute({ from: stationExit(STATION, STATION_R, BUNDLE[on]), trunk: TRUNK_X, y: LANE_Y[on], to: STOP_X, fan: FAN });
export const ticketAt = (on: Lane, docked: boolean): Vec => [docked ? STOP_X - 0.17 - TICKET.width / 2 : BARRIER_X - 0.28 - TICKET.width / 2, LANE_Y[on]];
const HOLDS = stationHolds(STATION, STATION_R);
export const SEAL_AT: Vec = HOLDS.seal;
export const KEY_AT: Vec = HOLDS.key;
/** Where the agent hangs a key cut for the MCP server: under the lanes, beside its station. */
export const MCP_KEY_AT: Vec = [-3.75, 1.55];
/** A key's way from the Company's sign-in stop back along the sign-in lane to the agent. */
export const keyRoute = (): Vec[] => { const [from, trunk, bend, end] = routeOf('sign-in'); return [end!, bend!, trunk!, from!]; };
/** Where a new copy of poppy.json sets off (the Company's counter) and where the agent takes it in. */
export const DOCUMENT_ROUTE: Vec[] = [[STOP_X - 0.6, 1.4], [STATION[0] + 0.3, STATION[1] - 0.2]];
/** Where a new delegation comes from: the agent's own systems, under its station. */
export const DELEGATION_ROUTE: Vec[] = [[STATION[0], 1.0], SEAL_AT];

// The slip and the panels below the map.
const SLIP = { left: MARGIN.left, right: -0.45, top: 1.2, bottom: -1.55 };
const OUTCOME_Y = -2.0;
const PANEL_Y = [-0.25, -0.85] as const;
const RAIL_Y = -3.1, RAIL_LABEL_Y = -3.86;

/** The poppy.json, as a sheet of paper, for the transition that carries a fresh copy to the agent. */
export const documentToken = (s: Stage): Mobject => sheet(s, { width: 0.9, height: 1.15, lines: 3 });
/** A delegation, for the transition that brings the agent a new one. */
export const delegationToken = (s: Stage): Mobject => certificate(s, { width: 1.2, height: 0.86 });

/** A filled polygon. */
const poly = (points: Vec[], colour: string) => new Polygon(points, { fill: colour, stroke: 'none' });

/**
 * A key cut for one service: the kit's key with a square plate round its bow, so it reads as a
 * different key at a glance (a key for the MCP server's door only). Same size and teeth as `key`.
 */
export function serviceKey(s: Stage, { at, size, teeth, onPaper = false }: { at: Vec; size: number; teeth: number; onPaper?: boolean }): Group {
  const bow: Vec = [at[0] - 0.66 * size, at[1]], o = 0.4 * size, i = 0.17 * size, colour = onPaper ? TONE.brassDeep : TONE.brass;
  const plate = new VMobject({ fill: colour, stroke: 'none', fillRule: 'evenodd' });
  const square = (h: number): Vec[] => [[bow[0] - h, bow[1] - h], [bow[0] + h, bow[1] - h], [bow[0] + h, bow[1] + h], [bow[0] - h, bow[1] + h]];
  for (const pts of [square(o), square(i)]) { plate.startNewPath(pts[0]!); for (const p of pts.slice(1)) plate.addLineTo(p); plate.closePath(); }
  return new Group(key(s, { at, size, teeth, onPaper }), plate);
}

/** The slip the Company hands back with a refused ticket: paper, torn along its foot, the number, what it is about, and the code. */
function slip(s: Stage, reply: Reply, trouble: Trouble, waited: boolean): Mobject[] {
  const { left: l, right: r, top: t, bottom: b } = SLIP, w = r - l, teeth = Math.round(w / 0.18), tear: Vec[] = [];
  for (let i = 0; i <= teeth; i++) tear.push([r - (i * w) / teeth, b + (i % 2 ? 0.08 : 0)]);
  const out: Mobject[] = [];
  const paper = new Group(poly([[l, t], [r, t], ...tear], TONE.paper));
  out.push(keyedPart(paper, 'slip:paper'));
  const number = words(s, String(reply.status), { at: [l + SPACE.m - 0.06, 0.4], size: TYPE.display, mono: true, bold: true, color: TONE.print });
  out.push(keyedPart(emphasised(number, `the Company's answer: ${sayReply(reply)}, about ${ABOUT[trouble]}`), 'slip:number'));
  const aboutX = l + SPACE.m + number.width() + SPACE.m;
  out.push(keyedPart(words(s, 'about', { at: [aboutX, 0.72], color: TONE.print }), 'slip:about'));
  const about = words(s, ABOUT[trouble], { at: [aboutX, 0.06], bold: true, color: TONE.print });
  out.push(keyedPart(about, 'slip:part'));
  const code = reply.status === 429 ? `Retry-After: ${reply.retryAfter}` : reply.error ?? '';
  out.push(keyedPart(words(s, code, { at: [l + SPACE.m, -1.12], mono: true, bold: true, color: TONE.print }), 'slip:code'));
  if (reply.status === 429) out.push(keyedPart(clock(s, { at: [aboutX + about.width() + SPACE.m + 0.38, 0.35], r: 0.38, remaining: waited ? 0 : 1 }), 'slip:clock'));
  return out;
}
const keyedPart = <T extends Mobject>(m: T, k: string): T => keyed(m, k);

/** One remedy on the rail, drawn as an object of the subject's world: centre (x, RAIL_Y), about 0.8 high. */
function remedyObject(s: Stage, fix: Fix, x: number): Group {
  const y = RAIL_Y;
  switch (fix) {
    case 'refresh': {
      // A key under a turning arrow: the same key, cut again.
      const c: Vec = [x, y - 0.05], pts: Vec[] = [];
      for (let k = 0; k <= 14; k++) { const a = Math.PI * (0.15 + 0.7 * (k / 14)); pts.push([c[0] + 0.42 * Math.cos(a), c[1] + 0.42 * Math.sin(a)]); }
      for (let k = 14; k >= 0; k--) { const a = Math.PI * (0.15 + 0.7 * (k / 14)); pts.push([c[0] + 0.34 * Math.cos(a), c[1] + 0.34 * Math.sin(a)]); }
      const tip: Vec = [c[0] + 0.38 * Math.cos(Math.PI * 0.15), c[1] + 0.38 * Math.sin(Math.PI * 0.15)];
      return new Group(poly(pts, TONE.ink), poly([[tip[0] - 0.13, tip[1] + 0.02], [tip[0] + 0.13, tip[1] + 0.02], [tip[0] + 0.02, tip[1] - 0.14]], TONE.ink), key(s, { at: [x + 0.05, y - 0.12], size: 0.36, teeth: 2 }));
    }
    case 'sign-in':
      return person(s, { at: [x, y + 0.02], size: 0.72 });
    case 'fix': {
      // The seal, signed again: a pen nib laid on it.
      const nib: Vec[] = [[x + 0.08, y - 0.06], [x + 0.46, y + 0.28], [x + 0.36, y + 0.4], [x - 0.0, y + 0.06]];
      return new Group(seal(s, { at: [x - 0.12, y - 0.04], r: 0.34 }), poly(nib, TONE.ink), poly([[x + 0.08, y - 0.06], [x - 0.05, y - 0.16], [x - 0.0, y + 0.06]], TONE.ink));
    }
    case 'new-session': {
      // A fresh seal, with a plus: a Session that did not exist before.
      const p: Vec = [x + 0.36, y + 0.3];
      return new Group(seal(s, { at: [x - 0.06, y - 0.04], r: 0.34 }),
        new Rectangle({ width: 0.3, height: 0.08, fill: TONE.ink, stroke: 'none' }).moveTo(p), new Rectangle({ width: 0.08, height: 0.3, fill: TONE.ink, stroke: 'none' }).moveTo(p));
    }
    case 'reread':
      return sheet(s, { at: [x, y], width: 0.62, height: 0.8, lines: 1 });
    case 'wait': {
      // An hourglass.
      const h = 0.36, wd = 0.27;
      return new Group(
        new Rectangle({ width: 0.66, height: 0.08, fill: TONE.ink, stroke: 'none', cornerRadius: 0.03 }).moveTo([x, y + h + 0.04]),
        new Rectangle({ width: 0.66, height: 0.08, fill: TONE.ink, stroke: 'none', cornerRadius: 0.03 }).moveTo([x, y - h - 0.04]),
        poly([[x - wd, y + h], [x + wd, y + h], [x + 0.03, y], [x - 0.03, y]], TONE.ink),
        poly([[x - 0.03, y], [x + 0.03, y], [x + wd, y - h], [x - wd, y - h]], TONE.ink),
      );
    }
  }
}

/** The rail's slots: each remedy's centre, spaced by the width of its name so the six fill the stage. */
function railSlots(s: Stage): number[] {
  const widths = RAIL.map((f) => Math.max(words(s, FIX_NAME[f], { bold: true }).width(), 0.9));
  const gap = (MARGIN.right - MARGIN.left - widths.reduce((a, b) => a + b, 0)) / (RAIL.length - 1);
  let x = MARGIN.left;
  return widths.map((w) => { const c = x + w / 2; x += w + gap; return c; });
}
/** Where a remedy sits on the rail: its object's centre. */
export const railAt = (s: Stage, fix: Fix): Vec => [railSlots(s)[RAIL.indexOf(fix)]!, RAIL_Y];

/** The ledger's rows: what the Company knows about this Session and the account. */
function knownBy(w: World): { label: string; value: string; quiet?: boolean; changed?: boolean }[] {
  const last = w.last, refusedNow = pending(w);
  const ended = refusedNow && last!.trouble === 'end', newly = !!last?.fix && (last.fix === 'new-session' || last.fix === 'reread');
  const readOnly = refusedNow && last!.trouble === 'read-only';
  return [
    { label: 'session', value: ended ? 'ended' : w.cart ? SID : 'a new one', changed: ended || newly },
    { label: 'cart', value: w.cart ? '1 in cart' : 'empty', quiet: !w.cart, changed: newly },
    { label: 'account', value: readOnly ? 'read only' : 'read+write', changed: readOnly || (last?.fix === 'sign-in') },
  ];
}

/** The state as its picture. */
export function drawWorld(w: World, shown: Shown, s: Stage): Group {
  const parts = keyedParts(), last = w.last, refused = pending(w), answered = !!last?.fix;
  const onLane = last ? laneOfTrouble(last.trouble) : null, docked = !!last && !refused;
  const teeth = refused && last!.trouble === 'read-only' ? 1 : 2;

  // The agent's station, with its seal and the key it holds; and, once cut, its key for the MCP server.
  addAll(parts, station(s, { at: STATION, r: STATION_R, keyTeeth: teeth }));
  if (w.mcpKey) {
    parts.add(serviceKey(s, { at: MCP_KEY_AT, size: 0.5, teeth: 2 }), 'agent:mcp-key');
    parts.add(words(s, 'for MCP', { at: [MCP_KEY_AT[0] + 0.85, MCP_KEY_AT[1]], color: TONE.soft }), 'agent:mcp-key:name');
  }

  // The counter, and the lanes to it.
  addAll(parts, counter(s, { x: STOP_X, top: MARGIN.top, bottom: 1.75 }));
  for (const name of LANES) {
    const [from, , , end] = routeOf(name);
    addAll(parts, lane(s, { id: name, name: LANE_NAME[name], y: LANE_Y[name], from: from!, trunk: TRUNK_X, to: end![0], nameX: NAME_X, active: onLane === name, reached: onLane === name && docked }));
  }

  // The last request: a ticket on its lane, with its version tab, and the mark of what was wrong with it.
  if (last && onLane) {
    const at = ticketAt(onLane, docked), l = at[0] - TICKET.width / 2;
    if (refused) parts.add(barrier(s, { at: [BARRIER_X, at[1]] }), 'barrier');
    const mcpTicket = last.trouble === 'mcp' && docked;
    parts.add(ticket(s, { at, keyTeeth: teeth }), 'ticket');
    if (mcpTicket) parts.add(serviceKey(s, { at: [l + 1.46, at[1] + 0.05], size: 0.52, teeth: 2, onPaper: true }), 'ticket:key');
    if (refused && last.trouble === 'expire') parts.add(clock(s, { at: [l + 1.12, at[1] + 0.05], r: 0.24, remaining: 0 }), 'ticket:mark');
    if (refused && last.trouble === 'delegation') {
      const c: Vec = [l + 0.4, at[1]];
      parts.add(poly([[c[0] - 0.05, c[1] + 0.3], [c[0] + 0.06, c[1] + 0.08], [c[0] - 0.06, c[1] - 0.02], [c[0] + 0.07, c[1] - 0.3], [c[0] + 0.01, c[1] - 0.02], [c[0] + 0.12, c[1] + 0.08], [c[0] + 0.02, c[1] + 0.3]], TONE.ground), 'ticket:mark');
    }
    const version = refused && last.trouble === 'old-copy' ? '0.3' : '0.4';
    const v = words(s, version, { mono: true, bold: true, color: TONE.print, align: 'middle', at: [l - 0.04 - 0.55, at[1]] });
    parts.add(new Rectangle({ width: 1.1, height: PLATE_HEIGHT, fill: TONE.paper, stroke: 'none', cornerRadius: 0.05 }).moveTo([l - 0.04 - 0.55, at[1]]), 'ticket:tab');
    parts.add(emphasised(v, `the request's Poppy-Version: ${version}`), 'ticket:tab:version');
  }

  // Under the map, on the agent's side: the slip the Company handed back, and what came of the send after it.
  if (!last) parts.add(words(s, 'nothing sent yet', { at: [MARGIN.left, 0], size: TYPE.label, color: TONE.soft }), 'slip:none');
  else if (last.reply.status >= 400) addAll(parts, slip(s, last.reply, last.trouble, answered));
  else {
    parts.add(words(s, String(last.reply.status), { at: [MARGIN.left - 0.06, 0.4], size: TYPE.display, mono: true, bold: true }), 'slip:number');
    parts.add(words(s, PHRASE[last.reply.status] ?? '', { at: [MARGIN.left + 3.3, 0.35], size: TYPE.title, bold: true }), 'slip:about');
    parts.add(words(s, `sizes from ${new URL(MCP_URL).host}`, { at: [MARGIN.left, -1.12], mono: true }), 'slip:code');
  }
  if (answered && last!.again) {
    const again = words(s, `sent again: ${last!.again.status} ${PHRASE[last!.again.status] ?? ''}`, { at: [MARGIN.left, OUTCOME_Y], bold: true });
    parts.add(emphasised(again, `sent again after ${FIX_NAME[last!.fix!]}: ${sayReply(last!.again)}`), 'outcome');
  }

  // Behind the counter: what the Company knows.
  addAll(parts, ledger(s, knownBy(w), { at: [LEDGER_X, 3.85], width: MARGIN.right - LEDGER_X, title: 'The Company knows', key: 'company', rowGap: 0.8 }));

  // Under the ledger: what to predict, why the tempting remedy would fail, or the 401 counterfactual.
  const panel = (first: string, second: string, quiet = false) => {
    parts.add(words(s, first, { at: [LEDGER_X, PANEL_Y[0]], bold: !quiet, color: quiet ? TONE.soft : TONE.ink }), 'panel:head');
    parts.add(words(s, second, { at: [LEDGER_X, PANEL_Y[1]], color: TONE.soft }), 'panel:body');
  };
  const tempting = temptation(w);
  if (shown.whatIf) {
    parts.add(words(s, 'An OAuth library', { at: [LEDGER_X, PANEL_Y[0]], bold: true }), 'panel:head');
    parts.add(words(s, '400', { at: [LEDGER_X, -0.95], mono: true, bold: true }), 'panel:400');
    parts.add(key(s, { at: [LEDGER_X + 1.5, -0.95], size: 0.42, teeth: 2 }), 'panel:400:key');
    parts.add(words(s, 'keeps the key', { at: [LEDGER_X + 2.15, -0.95] }), 'panel:400:says');
    parts.add(words(s, '401', { at: [LEDGER_X, -1.65], mono: true, bold: true }), 'panel:401');
    parts.add(key(s, { at: [LEDGER_X + 1.5, -1.65], size: 0.42, teeth: 2, ghost: true }), 'panel:401:key');
    parts.add(emphasised(words(s, 'throws it away', { at: [LEDGER_X + 2.15, -1.65] }), 'a 401 would make an OAuth library discard a good token'), 'panel:401:says');
  } else if (refused) panel('Which remedy fits?', 'the slip says', false);
  else if (answered && tempting) panel(`Why not ${FIX_NAME[tempting.fix]}?`, WHY_NOT[last!.trouble]);
  else if (last && !refused) panel('No refusal', 'the MCP key fits');

  // The agent's remedies, along the bottom: the one applied lit, the tempting one struck through.
  const slots = railSlots(s);
  RAIL.forEach((fix, i) => {
    const x = slots[i]!, lit = answered && last!.fix === fix, struck = answered && tempting?.fix === fix;
    const object = parts.add(remedyObject(s, fix, x), `rail:${fix}`);
    if (!lit) object.setFill(TONE.steel);
    const label = parts.add(words(s, FIX_NAME[fix], { at: [x, RAIL_LABEL_Y], align: 'middle', bold: lit, color: lit ? TONE.ink : TONE.soft }), `rail:${fix}:name`);
    if (lit) {
      emphasised(label, `the remedy applied: ${FIX_NAME[fix]}`);
      parts.add(new Rectangle({ width: label.width(), height: 0.07, fill: TONE.ink, stroke: 'none', cornerRadius: 0.02 }).moveTo([x, RAIL_LABEL_Y - 0.38]), `rail:${fix}:mark`);
    }
    if (struck) parts.add(poly([[x - 0.5, RAIL_Y - 0.42], [x - 0.42, RAIL_Y - 0.5], [x + 0.5, RAIL_Y + 0.42], [x + 0.42, RAIL_Y + 0.5]], TONE.ink), `rail:${fix}:strike`);
  });
  return parts.group();
}

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World, shown: Shown): string {
  const last = w.last, refused = pending(w);
  const map = 'Three lanes run from the agent to the Company’s counter: the API, the MCP server, and Sign-in.';
  const holds = `The agent holds its seal and a key for ${refused && last!.trouble === 'read-only' ? 'orders:read only' : 'orders:read and orders:write'}${w.mcpKey ? ', and a second key, cut for the MCP server only' : ''}.`;
  const sent = !last ? 'Nothing has been sent.'
    : refused ? `The agent sent the ${WHAT[last.trouble]} on the ${LANE_NAME[laneOfTrouble(last.trouble)]} lane after this: ${troubleWords(last.trouble)}. The ticket stands before a barrier, and the Company handed back a slip: ${sayReply(last.reply)}, about ${ABOUT[last.trouble]}${last.reply.retryAfter ? `, Retry-After ${last.reply.retryAfter} seconds` : ''}${last.reply.needs ? `, naming ${last.reply.needs}` : ''}${last.reply.resourceMetadata ? `, with resource_metadata ${last.reply.resourceMetadata}` : ''}. The agent has not answered yet.`
    : last.fix ? `After this: ${troubleWords(last.trouble)}, the ${WHAT[last.trouble]} was refused with ${sayReply(last.reply)}, about ${ABOUT[last.trouble]}. The agent answered with ${FIX_NAME[last.fix]} and sent it again: ${sayReply(last.again!)}; the ticket rests docked at its stop.`
    : `The agent sent the ${WHAT[last.trouble]} with its key for the MCP server: ${sayReply(last.reply)}, no refusal; the ticket rests docked at its stop.`;
  const t = temptation(w);
  const why = last?.fix && t ? ` On the remedy rail, ${FIX_NAME[last.fix]} is lit and ${FIX_NAME[t.fix]} is struck through: ${FIX_NAME[t.fix]} would fail, because ${t.reason}.` : refused ? ' The remedy rail is idle: which remedy fits is for you to predict.' : '';
  const known = `The Company knows Session ${w.cart ? SID : 'a new one'}${refused && last!.trouble === 'end' ? ', which it has ended' : ''}, whose cart ${w.cart ? 'holds the medium' : 'is empty: the old cart stayed with the old Session'}.`;
  const whatIf = shown.whatIf ? ' Beside it: an OAuth library keeps the key on a 400, and would throw a good key away on a 401.' : '';
  return `${map} ${holds} ${sent}${why} ${known}${whatIf}`;
}

function troubleWords(t: Trouble): string {
  return {
    expire: 'its access token expired', 'read-only': 'you had approved only orders:read', delegation: 'the delegation behind its seal expired',
    end: 'the Company ended the Session', 'old-copy': 'it used an old copy of poppy.json and sent version 0.3', 'too-fast': 'it sent too many requests too fast',
    mcp: 'it asked the MCP server with its everyday key',
  }[t];
}
