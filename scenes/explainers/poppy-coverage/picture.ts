import { Circle, Group, Rectangle, VMobject, keyed } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, RADIUS, TICKET, TONE, TYPE,
  addAll, barrier, counter, instructionCard, lane, laneRoute, sheet, speech, station, stationExit, stationHolds, ticket, words,
} from '../lib/poppy-kit.ts';
import { asksOf, keyOf, TASKS } from './model.ts';
import type { Ask, CoverageEvent, TaskKey, Use, Verdict, World } from './model.ts';

// One state as a picture, on the series' kit. The Company's counter runs the full height of the
// stage at x COUNTER_X: the agent's side on the left, the Company's on the right.
//
// The agent's side. Top: its station, holding its seal and its key: the code that signs, which the
// model never reads (10.2). Three lanes run from it to stops on the counter. Bottom: an open tray,
// the agent's model, where the User's words and the Company's paper are read.
//
// The Company's side. Top: its notice board, with the tasks it chose not to offer (9.1), and its
// skill card (9.4). Under them: the feedback box (9.3) and one ledger row, what the shop sees.
// Bottom: what the agent did not follow, left on the shop's side of the counter, each strip with
// the section of the draft that says to set it aside.
//
// The visual rule: paper never becomes a key. A Company's note is torn into strips; a strip the
// User's task can use goes to the agent's station, and only the station sends a ticket, sealed and
// keyed. A strip set aside stays on the counter. Outcomes are said by position and words; no colour
// means good or bad (WAX is the agent's seal, BRASS its key, as everywhere in the series).

export const PALETTE = KIT_PALETTE;

// ---------------------------------------------------------------------------------------------
// Geometry, shared with the scene's transitions

/** The counter's face. */
export const COUNTER_X = -0.4;
/** The agent's station: what holds the seal and the key. */
const STATION: Vec = [-6.35, 2.78];
const STATION_R = 0.95;
const TRUNK_X = -5.25;
const FAN = 0.6;
const NAME_X = -4.15;
export const LANES = ['api', 'web', 'chat'] as const;
export type Lane = (typeof LANES)[number];
const LANE_NAME: Record<Lane, string> = { api: 'API', web: 'Website', chat: 'Chat' };
const LANE_Y: Record<Lane, number> = { api: 3.8, web: 3.0, chat: 2.2 };
const BUNDLE: Record<Lane, number> = { api: 0.22, web: 0, chat: -0.22 };
/** The corners of a lane, from the station to its stop on the counter. */
export const routeOf = (on: Lane): Vec[] => laneRoute({ from: stationExit(STATION, STATION_R, BUNDLE[on]), trunk: TRUNK_X, y: LANE_Y[on], to: COUNTER_X, fan: FAN });
const BARRIER_X = COUNTER_X - 0.5;
/** Where the station holds its seal (a ticket is stamped and sets off there) and its key. */
export const SEAL_AT: Vec = stationHolds(STATION, STATION_R).seal;
/** A ticket docked at the API stop. */
const TICKET_AT: Vec = [COUNTER_X - 0.17 - TICKET.width / 2, LANE_Y.api];

/** The tray: the agent's model. */
const TRAY = { left: MARGIN.left - 0.05, right: COUNTER_X - 0.42, top: 0.12, bottom: -4.3 };
const TRAY_IN = TRAY.left + 0.3;
/** Where the shop's note lies on its side of the counter, unread. */
export const NOTE_AT: Vec = [3.0, -2.0];
/** Where paper lands in the tray, for flights in and out. */
export const TRAY_AT: Vec = [(TRAY.left + TRAY.right) / 2, -2.2];

/** The notice board. */
const BOARD = { left: 0.45, right: MARGIN.right, top: 4.2, bottom: 2.36 };
export const BOARD_AT: Vec = [(BOARD.left + BOARD.right) / 2, (BOARD.top + BOARD.bottom) / 2];
/** The skill card. */
export const SKILL_AT: Vec = [6.1, 1.6];
const SKILL_W = 3.0, SKILL_H = 0.95 + 2 * 0.22;
/** The feedback box, and its slot. */
const BOX: Vec = [0.98, 1.55];
export const SLOT_AT: Vec = [BOX[0], BOX[1] + 0.3];
/** The Company's side, where strips set aside lie. */
const ASIDE_X = 0.5;
const STRIP_Y = (i: number) => -1.2 - i * 0.92;

// ---------------------------------------------------------------------------------------------
// Words

const USER_SAYS: Record<TaskKey, string> = { close: 'Close my account', gift: 'Use my gift card', exchange: 'Exchange the jacket' };
/** A strip's words: the few words each ask is drawn with. */
function stripOf(ask: Ask): { text: string; mono: boolean } | null {
  switch (ask.kind) {
    case 'way':
      if ('operation_id' in ask.via) {
        const op = ask.via.operation_id;
        if (op === 'payHere') return null; // in words only, not drawn
        return op === 'getOrder' ? { text: 'GET the order', mono: false } : op === 'createExchange' ? { text: 'POST the exchange', mono: false } : { text: op, mono: true };
      }
      return { text: 'checkout page', mono: false };
    case 'send': return { text: 'send address book', mono: false };
    case 'consent': return { text: '“the User agreed”', mono: false };
    case 'act': return { text: 'use shop.example', mono: false };
    case 'script': return { text: 'run setup.sh', mono: false };
    case 'grant': return { text: 'grants orders:write', mono: false };
    case 'reveal': return { text: 'your access token', mono: false };
  }
}
/** What the shop sees: only what reached it. */
export function seenBy(w: World): string {
  if (w.gift === 'reported' || w.gift === 'paid') return '1 report';
  if (w.close === 'searched' || w.gift === 'stuck') return 'a visitor left';
  return 'nothing yet';
}

const sayUse = (u: Use) => (u.use ? (u.carries === 'nothing' ? 'used, carrying nothing secret' : 'used, under the agent’s seal and key') : `set aside (section ${u.section}: ${u.because})`);
const sayVerdicts = (vs: readonly Verdict[]) => vs.map((v) => `“${v.says}”: ${sayUse(v.use)}`).join('; ');

/** The picture in words: every field of the state, so no two states read alike. */
export function sayWorld(w: World): string {
  const last = w.last;
  const company = `example.com is ${w.company === 'hostile' ? 'a hostile Company' : 'an honest Company'}.`;
  const holds = `The agent’s station holds its seal and a key for ${w.approves.join(' and ')}; the model reads in the tray and holds neither.`;
  const board = w.board ? 'The agent has read the shop’s list: not offered, “Close an account”; one skill, exchange-items; feedback taken.' : 'The agent has not read the shop’s list yet.';
  const progress = `Closing the account: ${{ no: 'not asked', searched: 'searched for, in vain', told: 'told at once that it is done on the website' }[w.close]}. Gift card: ${{ no: 'not asked', stuck: 'no way found', reported: 'reported', paid: 'applied' }[w.gift]}. Exchange skill: ${w.skill ? 'used' : 'not used'}. The shop sees ${seenBy(w)}.`;
  let what = 'Nothing has happened yet.';
  if (last?.kind === 'searched') what = `You asked “${TASKS[last.task].says}”. The agent looked on ${last.tried.join(', ')} and found no way; each lane ends at a barrier.`;
  if (last?.kind === 'board') what = `The agent fetched the tasks response with its seal and no key.${last.explains.length ? ' “Close an account” is on the list, so the search was never needed.' : ''}`;
  if (last?.kind === 'told') what = `You asked to close the account; the list says it is not offered, so the agent told you at once to use the website${last.alternative?.references?.length ? ` (${last.alternative.references.map((r) => r.url).join(', ')})` : ''}.`;
  if (last?.kind === 'reported') what = `The agent sent one report, “Pay with a gift card”, naming no order, name or ID; the shop answered ${last.answer.status}${last.answer.status === 200 ? ` with a note: ${last.answer.alternative.instructions}` : ''}`;
  if (last?.kind === 'used')
    what = `The agent read the ${last.source === 'skill' ? `skill card (digest ${last.verified ? 'matches' : 'does not match'})` : 'shop’s note'} as data: ${sayVerdicts(last.verdicts)}. A ticket with the agent’s seal and key went down the API lane; the shop answered ${last.answer.status}${last.answer.error ? ` ${last.answer.error}` : ''}.`;
  return `${company} ${holds} ${board} ${progress} ${what}`;
}

// ---------------------------------------------------------------------------------------------
// Objects this chapter adds to the kit

/** A torn strip of paper: one thing a note asks for, its two ends ragged. One unkeyed Group. */
export function strip(s: Stage, text: string, { at, mono = false }: { at: Vec; mono?: boolean }): Group {
  const label = words(s, text, { mono, color: TONE.print });
  const w = label.width() + 0.56, h = 0.7, [x0, y] = at, l = x0, r = x0 + w, t = y + h / 2, b = y - h / 2;
  const tear = (xe: number, dir: number): Vec[] => Array.from({ length: 7 }, (_, i): Vec => [xe + dir * (i % 2 ? 0.07 : 0), t - (i * h) / 6]);
  const outline: Vec[] = [[l, t], [r, t], ...tear(r, -1).slice(1), [r, b], [l, b], ...tear(l, 1).reverse().slice(1, -1)];
  const paper = new VMobject({ fill: TONE.paper, stroke: 'none' });
  paper.startNewPath(outline[0]!);
  for (const p of outline.slice(1)) paper.addLineTo(p);
  paper.closePath();
  return new Group(paper, label.moveTo([l + 0.28, y], [-1, 0]));
}

/** A strip's width, for placing what follows it. */
const stripWidth = (s: Stage, text: string, mono: boolean) => words(s, text, { mono }).width() + 0.56;

/** The notice board: a board with a sheet pinned to it, its heading printed, its lines readable once the agent has read it. */
function board(s: Stage, read: boolean, marked: boolean): Mobject[] {
  const { left, right, top, bottom } = BOARD, w = right - left, h = top - bottom, cx = left + w / 2, cy = bottom + h / 2;
  const back = new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: 'none', cornerRadius: RADIUS.panel }).moveTo([cx, cy]);
  const pw = w - 0.36, ph = h - 0.28, pl = cx - pw / 2, pt = cy + ph / 2;
  const paper = new Rectangle({ width: pw, height: ph, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo([cx, cy]);
  const pins = [pl + 0.16, pl + pw - 0.16].map((x) => new Circle({ radius: 0.07, fill: TONE.steel, stroke: 'none' }).moveTo([x, pt - 0.14]));
  const head = words(s, 'Not offered here', { at: [pl + 0.32, pt - 0.44], bold: true, color: TONE.print });
  const out: Mobject[] = [keyed(new Group(back, paper, ...pins, head), 'board')];
  const lineY = pt - 1.18;
  if (read) {
    const line = keyed(words(s, 'Close an account', { at: [pl + 0.32, lineY], color: TONE.print, bold: marked }), 'board:line');
    if (marked) emphasised(line, 'the list names the task the agent searched for');
    out.push(line);
    if (marked) out.push(keyed(new Rectangle({ width: 0.09, height: 0.6, fill: TONE.print, stroke: 'none', cornerRadius: 0.02 }).moveTo([pl + 0.15, lineY]), 'board:mark'));
  } else out.push(keyed(new Rectangle({ width: 3.0, height: 0.09, fill: TONE.paperLine, stroke: 'none', cornerRadius: 0.04 }).moveTo([pl + 0.32 + 1.5, lineY]), 'board:unread'));
  return out;
}

/** The feedback box: a box with a slot in its lid. */
function feedbackBox(holds: boolean): Group {
  return new Group(
    ...(holds ? [new Rectangle({ width: 0.5, height: 0.34, fill: TONE.paper, stroke: 'none' }).moveTo([BOX[0], BOX[1] + 0.32])] : []),
    new Rectangle({ width: 1.3, height: 0.86, fill: TONE.steel, stroke: 'none', cornerRadius: RADIUS.ticket }).moveTo(BOX),
    new Rectangle({ width: 1.44, height: 0.16, fill: TONE.soft, stroke: 'none', cornerRadius: 0.04 }).moveTo([BOX[0], BOX[1] + 0.43]),
    new Rectangle({ width: 0.7, height: 0.1, fill: TONE.ground, stroke: 'none', cornerRadius: 0.05 }).moveTo([BOX[0], BOX[1] + 0.2]),
  );
}

/** The shop's desk behind its counter, where the paper it hands over lies, and what the agent leaves there. */
function desk(): Group {
  const l = COUNTER_X + 0.62, r = 8.2, w = r - l, h = TRAY.top - TRAY.bottom;
  return new Group(new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: 'none', cornerRadius: RADIUS.panel }).moveTo([l + w / 2, TRAY.bottom + h / 2]));
}

/** The tray: the agent's model, an open tray that paper lands in. */
function tray(): Group {
  const w = TRAY.right - TRAY.left, h = TRAY.top - TRAY.bottom;
  return new Group(
    new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: 'none', cornerRadius: RADIUS.panel }).moveTo([TRAY.left + w / 2, TRAY.bottom + h / 2]),
  );
}

/** The paper a report is written on, and a note travelling, for the transitions. */
export const slipToken = (s: Stage): Mobject => sheet(s, { width: 0.8, height: 1.0, lines: 2 });
export const noteToken = (s: Stage): Mobject => sheet(s, { width: 0.9, height: 1.15, lines: 3 });
export const probeToken = (s: Stage): Mobject => sheet(s, { width: 0.5, height: 0.62, lines: 2 });

export const requestToken = (s: Stage): Mobject => ticket(s, {});


// ---------------------------------------------------------------------------------------------
// The picture

/** The middle of line `i` of the shop's note as it lies on the desk: where that line's strip is torn from. */
export const noteLineAt = (i: number): Vec => [ASIDE_X + 2.6, -0.3 - 0.2 - 0.34 - i * 0.68];
/** Where a strip of the skill card starts: the card, each a little lower than the last. */
export const cardLineAt = (i: number): Vec => [SKILL_AT[0], SKILL_AT[1] - 0.2 * i];

/** The strips of the last `used` exchange, keyed as drawn, each with its line on the paper it was torn from. */
export function stripKeys(w: World): { key: string; line: number }[] {
  const last = w.last;
  if (last?.kind !== 'used') return [];
  const drawn = asksOf(last.source, w.company).map((a, i) => ({ s: stripOf(a), v: last.verdicts[i]! })).filter((x) => x.s).map((x, line) => ({ ...x, line }));
  const kept = drawn.filter((x) => x.v.use.use).map((x, i) => ({ key: `strip:used:${i}`, line: x.line }));
  const left = drawn.filter((x) => !x.v.use.use).map((x, i) => ({ key: `strip:aside:${i}`, line: x.line }));
  return [...kept, ...left];
}

export function drawWorld(w: World, s: Stage): Group {
  const parts = keyedParts(), last = w.last;
  const used = last?.kind === 'used' ? last : null;

  // The agent's station: its seal and its key, which no paper reaches.
  addAll(parts, station(s, { at: STATION, r: STATION_R, keyTeeth: keyOf(w).scopes.length }));

  // The counter, full height, and the lanes to it.
  addAll(parts, counter(s, { x: COUNTER_X, top: MARGIN.top + 0.1, bottom: MARGIN.bottom - 0.1 }));
  const searched = last?.kind === 'searched';
  for (const name of LANES) {
    const [from, , , end] = routeOf(name), active = !!used && name === 'api';
    addAll(parts, lane(s, { id: name, name: LANE_NAME[name], y: LANE_Y[name], from: from!, trunk: TRUNK_X, to: end![0], nameX: NAME_X, active, reached: active && used!.answer.status === 200, fan: FAN }));
    if (searched) parts.add(barrier(s, { at: [BARRIER_X, LANE_Y[name]], height: 0.72 }), `barrier:${name}`);
  }
  if (used) parts.add(ticket(s, { at: used.answer.status === 200 ? TICKET_AT : [BARRIER_X - 0.28 - TICKET.width / 2, LANE_Y.api], keyTeeth: keyOf(w).scopes.length }), 'ticket');
  if (used && used.answer.status !== 200) parts.add(barrier(s, { at: [BARRIER_X, LANE_Y.api], height: 0.72 }), 'barrier:api');

  // The Company's side: the board, the skill card, the feedback box and what the shop sees.
  addAll(parts, board(s, w.board, last?.kind === 'board' && last.explains.length > 0));
  parts.add(instructionCard(s, { at: SKILL_AT, title: 'skill', lines: 2, width: SKILL_W }), 'skill:card');
  if (used?.source === 'skill') {
    // The digest checked: printed over the card's lines, since it is a fact about the card.
    const y = SKILL_AT[1] + SKILL_H / 2 - 1.08;
    const said = words(s, used.verified ? 'digest ok' : 'digest fails', { at: [SKILL_AT[0] - SKILL_W / 2 + 0.28, y], color: TONE.print, bold: true });
    parts.add(new Group(new Rectangle({ width: SKILL_W - 0.3, height: 0.5, fill: TONE.paper, stroke: 'none' }).moveTo([SKILL_AT[0], y]), said), 'skill:digest');
    emphasised(said, `the skill’s digest ${used.verified ? 'matches its bytes' : 'does not match'}`);
  }
  parts.add(feedbackBox(w.gift === 'reported' || w.gift === 'paid'), w.gift === 'reported' || w.gift === 'paid' ? 'feedback:box:holds' : 'feedback:box');
  parts.add(words(s, 'feedback', { at: [BOX[0] + 0.9, BOX[1]], color: TONE.soft }), 'feedback:name');
  const seen = seenBy(w), seenChanged = last?.kind === 'searched' || last?.kind === 'reported';
  parts.add(words(s, 'shop sees', { at: [ASIDE_X, 0.6], color: TONE.soft }), 'sees:label');
  const seenValue = parts.add(words(s, seen, { at: [MARGIN.right, 0.6], align: 'end', bold: seenChanged && seen !== 'nothing yet', color: seen === 'nothing yet' ? TONE.soft : TONE.ink }), 'sees:value');
  if (seenChanged) emphasised(seenValue, `changed: the shop sees ${seen}`);
  parts.add(desk(), 'desk');
  if (last?.kind === 'searched' && w.gift !== 'reported' && w.gift !== 'paid')
    parts.add(words(s, 'and never learns why', { at: [MARGIN.right, -0.45], color: TONE.soft, align: 'end' }), 'desk:why');

  // The agent's model: the tray, and what is on it.
  parts.add(tray(), 'tray');
  parts.add(words(s, 'its model', { at: [TRAY.left + 0.05, TRAY.top + 0.45], color: TONE.soft }), 'trayname');
  const userSays = (task: TaskKey, y = -1.15) => parts.add(speech(s, USER_SAYS[task], { at: [TRAY_IN + 0.84 + stripWidth(s, USER_SAYS[task], false) / 2, y], who: 'person' }), `tray:user:${task}`);
  /** The answer that came back, at the foot of the model's tray: the number, its phrase and what it meant. */
  const answerBlock = (code: string, phrase: string, meaning: string) => {
    parts.add(words(s, code, { at: [TRAY_IN - 0.06, -3.42], size: TYPE.display, mono: true, bold: true }), 'answer:code');
    emphasised(parts.add(words(s, phrase, { at: [TRAY_IN + 3.15, -3.05], size: TYPE.title, bold: true }), 'answer:phrase'), `the answer: ${code} ${phrase}, ${meaning}`);
    parts.add(words(s, meaning, { at: [TRAY_IN + 3.15, -3.82] }), 'answer:meaning');
  };
  if (!last) parts.add(words(s, 'nothing to read yet', { at: [TRAY_AT[0], TRAY_AT[1]], size: TYPE.label, color: TONE.soft, align: 'middle' }), 'tray:empty');
  if (last?.kind === 'searched') {
    userSays(last.task);
    const gone = parts.add(words(s, 'no way found', { at: [TRAY_IN + 0.84, -2.55], size: TYPE.title, bold: true }), 'tray:outcome');
    emphasised(gone, 'the agent found no way on any lane');
    parts.add(words(s, 'on any lane', { at: [TRAY_IN + 0.84, -3.3], color: TONE.soft }), 'tray:outcome:why');
  }
  if (last?.kind === 'board') {
    if (last.explains.includes('close')) {
      userSays('close');
      const found = parts.add(words(s, 'on the list', { at: [TRAY_IN + 0.84, -2.55], size: TYPE.title, bold: true }), 'tray:outcome');
      emphasised(found, 'the task the agent searched for is on the shop’s list');
      parts.add(words(s, 'no search needed', { at: [TRAY_IN + 0.84, -3.3], color: TONE.soft }), 'tray:outcome:why');
    } else parts.add(words(s, 'the shop’s list is read', { at: [TRAY_AT[0], TRAY_AT[1]], size: TYPE.label, color: TONE.soft, align: 'middle' }), 'tray:read');
  }
  if (last?.kind === 'told') {
    userSays('close');
    const reply = speech(s, 'Use their website', { at: [TRAY.right - 0.84 - stripWidth(s, 'Use their website', false) / 2, -2.45], who: 'ai', side: 'right' });
    parts.add(reply, 'tray:agent:told');
    emphasised(reply, 'the agent tells you at once, from the list');
  }
  if (last?.kind === 'reported') {
    // In the model: the report it sent, and the answer. On the counter: the shop's note, unread.
    parts.add(words(s, 'sent: one report', { at: [TRAY_IN, -0.4], color: TONE.soft }), 'tray:caption');
    parts.add(strip(s, 'Pay with a gift card', { at: [TRAY_IN, -1.2] }), 'tray:report');
    parts.add(words(s, 'no order, name or ID', { at: [TRAY_IN, -2.0], color: TONE.soft }), 'tray:report:note');
    answerBlock(String(last.answer.status), last.answer.status === 200 ? 'OK' : 'Accepted', last.answer.status === 200 ? 'a way' : 'noted');
    const lines = asksOf('alternative', w.company).map(stripOf).filter((x): x is { text: string; mono: boolean } => !!x);
    const pad = 0.2, lead = 0.68, texts = lines.map((l) => words(s, l.text, { mono: l.mono, color: TONE.print }));
    const nw = Math.max(...texts.map((t) => t.width())) + 2 * pad + 0.3, nh = lines.length * lead + 2 * pad, top = -0.3;
    const paper = sheet(s, { at: [ASIDE_X + nw / 2, top - nh / 2], width: nw, height: nh, lines: 0 });
    texts.forEach((t, i) => t.moveTo([ASIDE_X + pad, top - pad - lead / 2 - i * lead], [-1, 0]));
    parts.add(new Group(paper, ...texts), `note:${w.company}`);
  }
  if (used) {
    parts.add(words(s, used.source === 'skill' ? 'from the skill, followed' : 'from the note, followed', { at: [TRAY_IN, -0.4], color: TONE.soft }), 'tray:caption');
    parts.add(words(s, 'not followed', { at: [ASIDE_X, -0.5], color: TONE.soft }), 'aside:name');
    const drawn = asksOf(used.source, w.company).map((a, i) => ({ s: stripOf(a), v: used.verdicts[i]! })).filter((x): x is { s: { text: string; mono: boolean }; v: Verdict } => !!x.s);
    drawn.filter((x) => x.v.use.use).forEach((x, i) => parts.add(strip(s, x.s.text, { at: [TRAY_IN, STRIP_Y(i)], mono: x.s.mono }), `strip:used:${i}`));
    drawn.filter((x) => !x.v.use.use).forEach((x, i) => {
      parts.add(strip(s, x.s.text, { at: [ASIDE_X, STRIP_Y(i)], mono: x.s.mono }), `strip:aside:${i}`);
      const u = x.v.use;
      if (!u.use) parts.add(words(s, u.section, { at: [MARGIN.right, STRIP_Y(i)], align: 'end', mono: true, bold: true }), `strip:aside:${i}:tag`);
    });
    if (!drawn.some((x) => !x.v.use.use)) parts.add(words(s, 'nothing', { at: [ASIDE_X, STRIP_Y(0)], size: TYPE.label, color: TONE.soft }), 'aside:none');
    const ok = used.answer.status === 200;
    answerBlock(String(used.answer.status), ok ? 'OK' : 'Forbidden', ok ? (used.source === 'skill' ? 'exchanged' : 'applied') : `lacks ${used.answer.needs}`);
  }
  return parts.group();
}

/** The events whose motion the scene authors, by kind. */
export type Kind = 'probe' | 'read' | 'told' | 'report' | 'sort';
export const kindOf = (event: CoverageEvent, after: World): Kind =>
  event === 'read tasks' ? 'read' : event === 'report' ? 'report' : event === 'use alternative' || event === 'use skill' ? 'sort' : after.last?.kind === 'told' ? 'told' : 'probe';
