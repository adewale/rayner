import { Circle, Group, Line, Polygon, Rectangle, VMobject, keyed } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, PLATE_HEIGHT, SPACE, STROKE, TICKET, TONE, TYPE,
  addAll, barrier, certificate, clock, counter, key, lane, laneRoute, person, seal, sheet, station, stationExit, stationHolds, ticket, words,
} from '../lib/poppy-kit.ts';
import { SID } from '../poppy/model.ts';
import { OPS, opFor, pending, sayReply, temptation } from './model.ts';
import type { Fix, Reply, Trouble, World } from './model.ts';

// One state as a picture, on the series' kit. The chapter is about the parts of one request, so
// the request is the hero: chapter 1's ticket drawn large on a single lane from the agent's station
// to the Company's counter, its three parts set apart: the wax seal on the stub (the Session
// header), the key in the body (the access token) and a paper tag hanging under it (Poppy-Version).
// A refused ticket stands before a barrier, and the Company hands back a slip: torn from a pad, the
// status number, the part it is about, the error code. A leader runs from the slip to that part and
// rings it, so the number points at what was wrong. The MCP server's lane appears only for a call
// to it. Along the bottom, the agent's remedy rail: idle remedies drawn in outline, the one applied
// in its true colours, the tempting wrong one struck through; under the quiet ledger, on the right,
// the focus: why that wrong one would have failed.
//
// Colours are the kit's, each with one meaning: WAX the agent's seal, BRASS a key, INK what is in
// use, STEEL what is idle. No red or green says how a request fared: position does (docked, or
// stopped at a barrier), and the slip. Every word is at least TYPE.small (0.56 units).

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;
/** What is shown apart from the model: whether the panel under the ledger shows the 401 counterfactual. */
export type Shown = { whatIf?: boolean };

export type Lane = 'api' | 'mcp';
const laneOfTrouble = (t: Trouble): Lane => (OPS[opFor(t)].service === 'mcp' ? 'mcp' : 'api');

/** The remedies on the rail, in order, with their one-word names. */
export const RAIL: readonly Fix[] = ['refresh', 'sign-in', 'fix', 'new-session', 'reread', 'wait'];
export const FIX_NAME: Record<Fix, string> = { refresh: 'Refresh', 'sign-in': 'Sign in', fix: 'Re-sign', 'new-session': 'New Session', reread: 'Re-read', wait: 'Wait' };
/** What a refusal's number is about: a part of the ticket, or the pace. */
type Part = 'key' | 'seal' | 'tab' | 'clock';
const PART: Record<Trouble, Part> = { expire: 'key', 'read-only': 'key', delegation: 'seal', end: 'seal', 'old-copy': 'tab', 'too-fast': 'clock', mcp: 'key' };
const ABOUT: Record<Part, string> = { key: 'the key', seal: 'the seal', tab: 'the version', clock: 'the pace' };
/** Why the tempting remedy fails, in the words the right-hand panel holds. The draft's full reason is in the description. */
const WHY_NOT: Record<Trouble, string> = {
  expire: 'a refresh is enough', 'read-only': 'it adds no scope', delegation: 'the same seal fails', end: 'the key is fine',
  'old-copy': 're-read comes first', 'too-fast': 'only time helps', mcp: 'a refresh will do',
};
const WHAT: Record<Trouble, string> = { expire: 'exchange', 'read-only': 'exchange', delegation: 'exchange', end: 'exchange', 'old-copy': 'exchange', 'too-fast': 'exchange', mcp: 'sizing call' };

// Geometry, shared with the scene's transitions.
const STATION: Vec = [-6.55, 3.0];
const STATION_R = 0.72;
/** The lane in use: one lane, or, for a call to the MCP server, the MCP lane under an idle API lane. */
const laneY = (on: Lane | null, mcpShown: boolean): number => (mcpShown ? (on === 'mcp' ? 2.85 : 3.92) : 3.0);
const EXIT_DY = (on: Lane, mcpShown: boolean) => (mcpShown ? (on === 'mcp' ? -0.15 : 0.3) : 0);
export const STOP_X = 1.15;
const NAME_X = -5.45;
const BARRIER_X = STOP_X - 0.45;
const LEDGER_X = 2.15;
/** The hero ticket: chapter 1's ticket at this scale. */
const BIG = 1.9;
const TW = TICKET.width * BIG, TH = TICKET.height * BIG;
export const routeOf = (on: Lane, mcpShown: boolean): Vec[] =>
  laneRoute({ from: stationExit(STATION, STATION_R, EXIT_DY(on, mcpShown)), trunk: STATION[0] + STATION_R + 0.1, y: laneY(on, mcpShown), to: STOP_X, fan: 0.45 });
export const ticketAt = (y: number, docked: boolean): Vec => [docked ? STOP_X - 0.17 - TW / 2 : BARRIER_X - 0.28 - TW / 2, y];
const HOLDS = stationHolds(STATION, STATION_R);
export const SEAL_AT: Vec = HOLDS.seal;
export const KEY_AT: Vec = HOLDS.key;
/** Where a request sets off: on its lane, its ticket clear of the station. */
export const launchAt = (y: number): Vec => [NAME_X + 1.3 + TW / 2, y];
/** Where the agent hangs a key cut for the MCP server: under its station. */
export const MCP_KEY_AT: Vec = [STATION[0], 1.22];
/** Where the Company's clock stands, at the foot of its counter, for a rate limit. */
const CLOCK_AT: Vec = [STOP_X, 0.2];
const CLOCK_R = 0.38;
/** A key's way from the Company's counter back along the lane into the agent's station. */
export const keyRoute = (y: number): Vec[] => [[STOP_X, y], [STATION[0] + STATION_R, y], KEY_AT];
/** A fresh poppy.json's way, from the counter to the agent. */
export const documentRoute = (y: number): Vec[] => [[STOP_X - 0.5, y], [STATION[0] + 0.3, STATION[1] - 0.1]];
/** Where a new delegation (or a fresh seal) comes from: the agent's own systems, off the stage above its station. */
export const DELEGATION_ROUTE: Vec[] = [[MARGIN.left, 4.3], SEAL_AT];

// The slip and the panels below the map.
const SLIP = { left: MARGIN.left, right: -0.4, top: 0.72, bottom: -1.92 };
const OUTCOME_Y = -2.32;
const RAIL_Y = -3.42, RAIL_LABEL_Y = -4.08;

/** The poppy.json, as a sheet of paper, for the transition that carries a fresh copy to the agent. */
export const documentToken = (s: Stage): Mobject => sheet(s, { width: 0.9, height: 1.15, lines: 3 });
/** A delegation, for the transition that brings the agent a new one. */
export const delegationToken = (s: Stage): Mobject => certificate(s, { width: 1.2, height: 0.86 });
/** The Company's clock at the counter, for a rate limit: full while the agent must wait, empty once it has. */
export const paceClock = (s: Stage, remaining: number): Mobject => clock(s, { at: CLOCK_AT, r: CLOCK_R, remaining: Math.max(remaining, 0.004) });

const poly = (points: Vec[], colour: string) => new Polygon(points, { fill: colour, stroke: 'none' });
const keyedPart = <T extends Mobject>(m: T, k: string): T => keyed(m, k);

/** A key cut for one service: the kit's key with a square plate round its bow, so it reads as a different key at a glance. */
export function serviceKey(s: Stage, { at, size, teeth, onPaper = false }: { at: Vec; size: number; teeth: number; onPaper?: boolean }): Group {
  const bow: Vec = [at[0] - 0.66 * size, at[1]], o = 0.4 * size, i = 0.17 * size, colour = onPaper ? TONE.brassDeep : TONE.brass;
  const plate = new VMobject({ fill: colour, stroke: 'none', fillRule: 'evenodd' });
  const square = (h: number): Vec[] => [[bow[0] - h, bow[1] - h], [bow[0] + h, bow[1] - h], [bow[0] + h, bow[1] + h], [bow[0] - h, bow[1] + h]];
  for (const pts of [square(o), square(i)]) { plate.startNewPath(pts[0]!); for (const p of pts.slice(1)) plate.addLineTo(p); plate.closePath(); }
  return new Group(key(s, { at, size, teeth, onPaper }), plate);
}

/** Where each part of a hero ticket centred at `at` sits, and the box a ring round it takes. */
function partsOf(at: Vec): Record<'seal' | 'key' | 'tab', { at: Vec; w: number; h: number }> {
  const [x, y] = at;
  return {
    seal: { at: [x + (-TICKET.width / 2 + 0.4) * BIG, y], w: 1.25, h: 1.25 },
    key: { at: [x + (-TICKET.width / 2 + 0.8 + 0.66) * BIG, y + 0.05 * BIG], w: 2.25, h: 0.95 },
    tab: { at: [x + TW / 2 - 0.62, y - TH / 2 - 0.7], w: 1.24, h: PLATE_HEIGHT },
  };
}

/**
 * The hero ticket: the kit's ticket, scaled up, so its seal and its key read as objects; marks of
 * what is wrong drawn on it (an expired key's empty clock, a cracked seal); and its version tag,
 * hung under its body on a cord. Keyed `ticket` (the ticket and its marks) and `ticket:tab`, `ticket:tab:version`.
 */
function heroTicket(s: Stage, at: Vec, o: { teeth: number; mcpKey: boolean; expired: boolean; cracked: boolean; version: string }): Mobject[] {
  const p = partsOf(at), body: Mobject[] = [ticket(s, { at, keyTeeth: o.teeth }).scale(BIG, { aboutPoint: at })];
  if (o.mcpKey) body.push(serviceKey(s, { at: p.key.at, size: 0.52 * BIG, teeth: 2, onPaper: true }));
  if (o.expired) body.push(clock(s, { at: [p.key.at[0] - 0.62, p.key.at[1]], r: 0.36, remaining: 0 }));
  if (o.cracked) {
    const [cx, cy] = p.seal.at;
    body.push(poly([[cx - 0.08, cy + 0.56], [cx + 0.1, cy + 0.16], [cx - 0.1, cy - 0.02], [cx + 0.12, cy - 0.56], [cx + 0.02, cy - 0.04], [cx + 0.2, cy + 0.14], [cx + 0.03, cy + 0.56]], TONE.ground));
  }
  const tag = p.tab.at, top = at[1] - TH / 2;
  const tab = new Group(
    new Rectangle({ width: 0.05, height: top - (tag[1] + p.tab.h / 2) + 0.04, fill: TONE.paperLine, stroke: 'none' }).moveTo([tag[0], (top + tag[1] + p.tab.h / 2) / 2]),
    new Rectangle({ width: p.tab.w, height: p.tab.h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS_TAG }).moveTo(tag),
    new Circle({ radius: 0.06, fill: TONE.ground, stroke: 'none' }).moveTo([tag[0], tag[1] + p.tab.h / 2 - 0.13]),
  );
  const v = words(s, o.version, { at: [tag[0], tag[1] - 0.06], mono: true, bold: true, color: TONE.print, align: 'middle' });
  return [keyedPart(new Group(...body), 'ticket'), keyedPart(tab, 'ticket:tab'), keyedPart(emphasised(v, `the request's Poppy-Version: ${o.version}`), 'ticket:tab:version')];
}
const RADIUS_TAG = 0.08;

/** The slip the Company hands back with a refused ticket: torn from a pad along its top edge, the number large, what it is about, and the code. */
function slip(s: Stage, reply: Reply, part: Part): Mobject[] {
  const { left: l, right: r, top: t, bottom: b } = SLIP, w = r - l, teeth = Math.round(w / 0.2), tear: Vec[] = [];
  for (let i = 0; i <= teeth; i++) tear.push([l + (i * w) / teeth, t - (i % 2 ? 0.1 : 0)]);
  const k = 0.08;
  const paper = new Group(
    poly([...tear, [r, b + k], [r - k, b], [l + k, b], [l, b + k]], TONE.paper),
    new Rectangle({ width: w - 2 * SPACE.m, height: STROKE.hair, fill: TONE.paperLine, stroke: 'none' }).moveTo([(l + r) / 2, -1.1]),
  );
  const number = words(s, String(reply.status), { at: [l + SPACE.m - 0.06, -0.22], size: TYPE.display, mono: true, bold: true, color: TONE.print });
  const aboutX = l + SPACE.m + number.width() + SPACE.l;
  const code = reply.status === 429 ? `Retry-After: ${reply.retryAfter}` : reply.error ?? '';
  return [
    keyedPart(paper, 'slip:paper'),
    keyedPart(emphasised(number, `the Company's answer: ${sayReply(reply)}, about ${ABOUT[part]}`), 'slip:number'),
    keyedPart(words(s, 'about', { at: [aboutX, 0.06], color: TONE.print }), 'slip:about'),
    keyedPart(words(s, ABOUT[part], { at: [aboutX, -0.56], bold: true, color: TONE.print }), 'slip:part'),
    keyedPart(words(s, code, { at: [l + SPACE.m, -1.56], mono: true, bold: true, color: TONE.print }), 'slip:code'),
  ];
}

/**
 * The slip's pointer: a leader from the slip's top edge to the part it is about, and a ring round
 * that part (PRINT on paper, where INK would vanish; INK round the clock on the ground).
 */
function pointer(at: Vec, part: Part): Mobject[] {
  const box = partsOf(at)[part === 'clock' ? 'key' : part];
  const target = part === 'clock' ? { at: CLOCK_AT, w: 2 * CLOCK_R + 0.3, h: 2 * CLOCK_R + 0.3 } : part === 'tab' ? { ...box, w: box.w + 0.28, h: box.h + 0.24 } : box;
  const [tx, ty] = target.at, bottom = ty - target.h / 2;
  const fromX = Math.min(Math.max(tx, SLIP.left + 0.5), SLIP.right - 0.3), from: Vec = [fromX, SLIP.top + 0.02];
  const ringColour = part === 'clock' ? TONE.ink : TONE.print;
  const ring = part === 'clock' || part === 'seal'
    ? new Circle({ radius: target.w / 2, fill: 'none', stroke: ringColour, strokeWidth: STROKE.line }).moveTo(target.at)
    : new Rectangle({ width: target.w, height: target.h, fill: 'none', stroke: ringColour, strokeWidth: STROKE.line, cornerRadius: target.h / 2 }).moveTo(target.at);
  // The leader stops at the ticket's lower edge (or the ring), where it meets the paper.
  const end: Vec = part === 'tab' || part === 'clock' ? [tx, bottom] : [tx, at[1] - TH / 2];
  const start: Vec = part === 'clock' ? [SLIP.right + 0.02, CLOCK_AT[1]] : from;
  const stopAt: Vec = part === 'clock' ? [tx - target.w / 2, ty] : end;
  const leader = new Line(start, stopAt, { stroke: TONE.ink, strokeWidth: STROKE.fine });
  return [keyedPart(leader, 'slip:leader'), keyedPart(new Circle({ radius: 0.07, fill: TONE.ink, stroke: 'none' }).moveTo(stopAt), 'slip:leader:end'), keyedPart(ring, 'slip:ring')];
}

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

/** The ledger's rows, kept to two: the Session and its cart, what a new Session leaves behind. */
function knownBy(w: World): { label: string; value: string; quiet?: boolean; changed?: boolean }[] {
  const last = w.last, ended = pending(w) && last!.trouble === 'end', newly = !!last?.fix && (last.fix === 'new-session' || last.fix === 'reread');
  return [
    { label: 'session', value: ended ? 'ended' : w.cart ? SID : 'a new one', changed: ended || newly },
    { label: 'cart', value: w.cart ? '1 in cart' : 'empty', quiet: !w.cart, changed: newly },
  ];
}

/** The state as its picture. */
export function drawWorld(w: World, shown: Shown, s: Stage): Group {
  const parts = keyedParts(), last = w.last, refused = pending(w), answered = !!last?.fix;
  const on = last ? laneOfTrouble(last.trouble) : null, docked = !!last && !refused, mcpShown = on === 'mcp';
  const teeth = refused && last!.trouble === 'read-only' ? 1 : 2;

  // The agent's station, with its seal and the key it holds; and, once cut, its key for the MCP server.
  addAll(parts, station(s, { at: STATION, r: STATION_R, keyTeeth: teeth }));
  if (w.mcpKey) {
    parts.add(serviceKey(s, { at: MCP_KEY_AT, size: 0.45, teeth: 2 }), 'agent:mcp-key');
    parts.add(words(s, 'for MCP', { at: [MCP_KEY_AT[0] + 0.75, MCP_KEY_AT[1]], color: TONE.soft }), 'agent:mcp-key:name');
  }

  // The counter, and the lane to it: one lane, or for a call to the MCP server the MCP lane under the idle API lane.
  addAll(parts, counter(s, { x: STOP_X, top: MARGIN.top, bottom: 1.95 }));
  for (const id of (mcpShown ? ['api', 'mcp'] : ['api']) as Lane[]) {
    const [from, , , end] = routeOf(id, mcpShown);
    // Keyed apart in the two layouts, so the scene cross-fades the lanes when the MCP lane comes or goes.
    addAll(parts, lane(s, { id: mcpShown ? `mcp-${id}` : id, name: id === 'api' ? 'API' : 'MCP', y: laneY(id, mcpShown), from: from!, trunk: STATION[0] + STATION_R + 0.1, to: end![0], nameX: NAME_X, active: on === id, reached: on === id && docked }));
  }

  // The request: the hero ticket on its lane, before a barrier when refused, docked when accepted.
  const at = last && on ? ticketAt(laneY(on, mcpShown), docked) : null;
  if (last && at) {
    if (refused) parts.add(barrier(s, { at: [BARRIER_X, at[1]], height: TH + 0.2 }), 'barrier');
    addAll(parts, heroTicket(s, at, {
      teeth, mcpKey: last.trouble === 'mcp' && docked, expired: refused && last.trouble === 'expire', cracked: refused && last.trouble === 'delegation',
      version: refused && last.trouble === 'old-copy' ? '0.3' : '0.4',
    }));
  }
  if (last?.reply.status === 429) parts.add(paceClock(s, answered ? 0 : 1), 'slip:clock');

  // Under the map: the slip the Company handed back, pointing at what was wrong, and what came of the send after it.
  if (!last) parts.add(words(s, 'nothing sent yet', { at: [MARGIN.left, -0.6], size: TYPE.label, color: TONE.soft }), 'slip:none');
  else if (last.reply.status >= 400 && at) {
    addAll(parts, slip(s, last.reply, PART[last.trouble]));
    addAll(parts, pointer(at, PART[last.trouble]));
  } else {
    parts.add(words(s, String(last.reply.status), { at: [MARGIN.left - 0.06, -0.22], size: TYPE.display, mono: true, bold: true }), 'slip:number');
    parts.add(words(s, 'OK', { at: [MARGIN.left + 3.3, -0.22], size: TYPE.title, bold: true }), 'slip:about');
    parts.add(words(s, 'sizes found', { at: [MARGIN.left, -1.56] }), 'slip:code');
  }
  if (answered && last!.again) {
    const again = words(s, `sent again: ${last!.again.status} OK`, { at: [MARGIN.left, OUTCOME_Y], bold: true });
    parts.add(emphasised(again, `sent again after ${FIX_NAME[last!.fix!]}: ${sayReply(last!.again)}`), 'outcome');
  }

  // Behind the counter, quiet: what the Company knows of the Session.
  // Drawn quiet, in SOFT, as the kit's ledger is laid out: only a row the last event changed is set in INK, bold, with a change bar.
  const rows = knownBy(w), right = MARGIN.right;
  parts.add(words(s, 'The Company knows', { at: [LEDGER_X, 3.85], color: TONE.soft, bold: true }), 'company:title');
  parts.add(new Rectangle({ width: right - LEDGER_X, height: 0.03, fill: TONE.rule, stroke: 'none' }).moveTo([(LEDGER_X + right) / 2, 3.42]), 'company:rule');
  rows.forEach((row, i) => {
    const y = 2.9 - i * 0.74, k = `company:${row.label}`;
    parts.add(words(s, row.label, { at: [LEDGER_X, y], color: TONE.soft }), `${k}:label`);
    const value = parts.add(words(s, row.value, { at: [right, y], align: 'end', mono: !row.quiet, bold: !!row.changed, color: row.changed ? TONE.ink : TONE.soft }), `${k}:value`);
    parts.add(new Rectangle({ width: right - LEDGER_X, height: STROKE.hair, fill: TONE.rule, stroke: 'none' }).moveTo([(LEDGER_X + right) / 2, y - 0.37]), `${k}:rule`);
    if (row.changed) {
      emphasised(value, `changed: ${row.label} is now ${row.value}`);
      parts.add(new Rectangle({ width: 0.09, height: 0.56, fill: TONE.ink, stroke: 'none', cornerRadius: 0.02 }).moveTo([LEDGER_X - 0.26, y]), `${k}:mark`);
    }
  });

  // The right-hand focus: what to predict, why the tempting remedy would fail, or the 401 counterfactual.
  const room = MARGIN.right - LEDGER_X, tempting = temptation(w);
  const focus = (over: string, head: string, under: string) => {
    parts.add(words(s, over, { at: [LEDGER_X, 1.22], color: TONE.soft }), 'panel:over');
    const big = words(s, head, { at: [LEDGER_X, 0.3], size: TYPE.title, bold: true });
    parts.add(big.width() <= room ? big : words(s, head, { at: [LEDGER_X, 0.3], size: TYPE.label, bold: true }), 'panel:head');
    parts.add(words(s, under, { at: [LEDGER_X, -0.62] }), 'panel:body');
  };
  if (shown.whatIf) {
    parts.add(words(s, 'An OAuth library', { at: [LEDGER_X, 1.22], color: TONE.soft }), 'panel:whatif');
    parts.add(words(s, '400', { at: [LEDGER_X, 0.4], size: TYPE.label, mono: true, bold: true }), 'panel:400');
    parts.add(key(s, { at: [LEDGER_X + 1.85, 0.4], size: 0.45, teeth: 2 }), 'panel:400:key');
    parts.add(words(s, 'keeps it', { at: [LEDGER_X + 2.7, 0.4] }), 'panel:400:says');
    parts.add(words(s, '401', { at: [LEDGER_X, -0.5], size: TYPE.label, mono: true, bold: true }), 'panel:401');
    parts.add(key(s, { at: [LEDGER_X + 1.85, -0.5], size: 0.45, teeth: 2, ghost: true }), 'panel:401:key');
    parts.add(emphasised(words(s, 'discards it', { at: [LEDGER_X + 2.7, -0.5], bold: true }), 'a 401 would make an OAuth library discard a good token'), 'panel:401:says');
  } else if (refused) focus('predict', 'Which remedy?', 'the slip says');
  else if (answered && tempting) focus('why not', `${FIX_NAME[tempting.fix]}?`, WHY_NOT[last!.trouble]);
  else if (last && !refused) focus('no refusal', 'The key fits', 'cut for this server');

  // The agent's remedies, along the bottom: idle ones in outline, the one applied in its colours, the tempting one struck through.
  const slots = railSlots(s);
  RAIL.forEach((fix, i) => {
    const x = slots[i]!, lit = answered && last!.fix === fix, struck = answered && tempting?.fix === fix;
    const object = parts.add(remedyObject(s, fix, x), `rail:${fix}`);
    if (!lit) object.setStyle({ fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine });
    const label = parts.add(words(s, FIX_NAME[fix], { at: [x, RAIL_LABEL_Y], align: 'middle', bold: lit, color: lit ? TONE.ink : TONE.soft }), `rail:${fix}:name`);
    if (lit) {
      emphasised(label, `the remedy applied: ${FIX_NAME[fix]}`);
      parts.add(new Rectangle({ width: label.width(), height: 0.07, fill: TONE.ink, stroke: 'none', cornerRadius: 0.02 }).moveTo([x, RAIL_LABEL_Y - 0.32]), `rail:${fix}:mark`);
    }
    if (struck) parts.add(poly([[x - 0.5, RAIL_Y - 0.42], [x - 0.42, RAIL_Y - 0.5], [x + 0.5, RAIL_Y + 0.42], [x + 0.42, RAIL_Y + 0.5]], TONE.ink), `rail:${fix}:strike`);
  });
  return parts.group();
}

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World, shown: Shown): string {
  const last = w.last, refused = pending(w), part = last ? ABOUT[PART[last.trouble]] : '';
  const map = last?.trouble === 'mcp' ? 'Two lanes run from the agent to the Company’s counter: the API, idle, and the MCP server’s, in use.' : 'One lane runs from the agent to the Company’s counter.';
  const holds = `The agent holds its seal and a key for ${refused && last!.trouble === 'read-only' ? 'orders:read only' : 'orders:read and orders:write'}${w.mcpKey ? ', and a second key, cut for the MCP server only' : ''}.`;
  const sent = !last ? 'Nothing has been sent.'
    : refused ? `The agent sent the ${WHAT[last.trouble]} after this: ${troubleWords(last.trouble)}. The ticket, with its seal, its key and a tag reading version ${last.trouble === 'old-copy' ? '0.3' : '0.4'}, stands before a barrier, and the Company handed back a slip: ${sayReply(last.reply)}, about ${part}${last.reply.retryAfter ? `, Retry-After ${last.reply.retryAfter} seconds` : ''}${last.reply.needs ? `, naming ${last.reply.needs}` : ''}${last.reply.resourceMetadata ? `, with resource_metadata ${last.reply.resourceMetadata}` : ''}; a leader from the slip rings ${part}. The agent has not answered yet.`
    : last.fix ? `After this: ${troubleWords(last.trouble)}, the ${WHAT[last.trouble]} was refused with ${sayReply(last.reply)}; the slip still points at ${part}. The agent answered with ${FIX_NAME[last.fix]} and sent it again: ${sayReply(last.again!)}; the ticket rests docked at its stop.`
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

/** The lane a world's last request took, its height, and whether the MCP lane is drawn, for the scene's flights. */
export function laneOfWorld(w: World): { on: Lane; y: number; route: Vec[]; mcpShown: boolean } {
  const on = w.last ? laneOfTrouble(w.last.trouble) : 'api', mcpShown = on === 'mcp';
  return { on, y: laneY(on, mcpShown), route: routeOf(on, mcpShown), mcpShown };
}
