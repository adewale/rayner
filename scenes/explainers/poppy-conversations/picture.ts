import { Circle, Group, Line, Polygon, Rectangle } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { MARGIN, PALETTE as KIT_PALETTE, RADIUS, STROKE, TONE, TYPE, aiMark, person, words } from '../lib/poppy-kit.ts';
import type { Parts } from '../lib/poppy-kit.ts';
import { AGENT } from '../poppy/model.ts';
import { ACCOUNT, CONVERSATION_ID, LINES, OWNER, PERSON, USER_ID, activeOf, authorOf, continueAs, openDirectOf, roleOf, ruleOf } from './model.ts';
import type { Caller, Conv, Speaker, Turn, World } from './model.ts';

// One state of the conversation as a picture. The hero is the conversation's table, seen from
// above: a wide slab on the left and centre of the stage, with two seats on your side (your agent
// above, you below) and two on the Company's (its agent above, a person below), each seat a disc
// tucked under the table's edge holding the kit's AI mark or person mark, its name beside it and,
// under the name, the word the protocol uses for who sits there: AI or person. An empty seat is a
// dashed ring; a seat the Company is finding a person for is a solid ring waiting.
//
// A message is a turn of speech lying on the table in front of its writer, its tail pointing at
// the writer's seat, the writer's mark at its start: a person's turn is paper, an AI's is the
// ground's dark with an ink edge. One turn at a time. While the Company has work in progress
// (working), a typing badge sits by the seat of whoever handles its side.
//
// When a Direct Conversation opens, the first table steps back to the top of the stage, idle and
// marked "paused", and a second, smaller table stands below it, joined by a thread: you sit at its
// end, the Company's seat at the other, and your agent watches from beside it, set back. The state
// fields of the conversation in use stand on the right as a narrow ledger. The Company's invitation
// (user_requested) is a small envelope that stops in front of your agent's seat.
//
// Colours are the kit's: INK for who is present, STEEL for idle or empty, PAPER for a person's
// words, the ground and RAISED for an AI's turn and the tables. No wax, brass or pewter: this
// chapter's picture holds no seal, key or other agent's seal. Every word is TYPE.small or larger.

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;
/** What the scene shows that is not the model: the ownership step's place card and requests. */
export type Shown = { owner?: boolean };

// ---------------------------------------------------------------------------------------------
// Geometry, shared with the scene's transitions

type Box = { x: number; y: number; w: number; h: number };
const top = (b: Box) => b.y + b.h / 2, bottom = (b: Box) => b.y - b.h / 2, left = (b: Box) => b.x - b.w / 2, right = (b: Box) => b.x + b.w / 2;

/** The conversation's table: the hero, and the smaller, stepped-back table while a Direct Conversation is open. */
const MAIN_FULL: Box = { x: -2.4, y: 0.0, w: 8.4, h: 3.3 };
const MAIN_BACK: Box = { x: -2.4, y: 2.25, w: 8.4, h: 1.3 };
/** The Direct Conversation's table, lower on the stage. */
const DIRECT: Box = { x: -2.4, y: -2.25, w: 7.0, h: 2.0 };
const SEAT_R = 0.6;
/** How far a seat's centre stands out from the table's edge: the disc tucks under the edge a little. */
const OUT = 0.55;
/** Seat columns at the conversation's table: your side, the Company's side. */
const YOUR_X = -5.2, THEIR_X = 0.4;

/** Where each seat is, in the picture of this state. */
export function seatsOf(w: World) {
  const back = !!openDirectOf(w), t = back ? MAIN_BACK : MAIN_FULL;
  const up = top(t) + OUT, down = bottom(t) - OUT;
  return {
    agent: (back ? [left(DIRECT) - 0.95, top(DIRECT) + 0.95] : [YOUR_X, up]) as Vec,
    agentSeat: [YOUR_X, up] as Vec,
    you: (back ? [left(DIRECT) - 0.7, DIRECT.y] : [YOUR_X, down]) as Vec,
    youSeat: [YOUR_X, down] as Vec,
    company: [THEIR_X, up] as Vec,
    person: [THEIR_X, down] as Vec,
    directYou: [left(DIRECT) - 0.7, DIRECT.y] as Vec,
    directCompany: [right(DIRECT) + 0.7, DIRECT.y] as Vec,
  };
}
/** Where a person who joins comes from: the Company's back office, off the right edge of the stage. */
export const BACK_OFFICE_X = 8.6;
/** The narrow ledger of state fields, on the right. */
const LEDGER = { x: 2.6, width: MARGIN.right - 2.6 } as const;
/** The thread between the two tables runs down here, clear of every label. */
const THREAD_X = -1.5;

// ---------------------------------------------------------------------------------------------
// Objects this chapter needs that the kit has no drawing for

/** A table seen from above: a slab of the raised tone with a hairline inset; an idle one has only its dashed outline. */
function table(b: Box, ghost = false): Group {
  const c: Vec = [b.x, b.y];
  if (ghost) return new Group(new Rectangle({ width: b.w, height: b.h, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: RADIUS.device, dashArray: '0.16 0.1' }).moveTo(c));
  return new Group(
    new Rectangle({ width: b.w, height: b.h, fill: TONE.raised, stroke: 'none', cornerRadius: RADIUS.device }).moveTo(c),
    new Rectangle({ width: b.w - 0.3, height: b.h - 0.3, fill: 'none', stroke: TONE.rule, strokeWidth: STROKE.fine, cornerRadius: RADIUS.device - 0.1 }).moveTo(c),
  );
}

/** A seat: a disc tucked under the table's edge. Taken: the ground's colour with an ink rim. Empty: a dashed STEEL ring. Awaited: a solid INK ring. */
function seat(c: Vec, state: 'taken' | 'idle' | 'empty' | 'awaited', r = SEAT_R): Circle {
  if (state === 'taken' || state === 'idle') return new Circle({ radius: r, fill: TONE.ground, stroke: state === 'taken' ? TONE.ink : TONE.steel, strokeWidth: STROKE.line }).moveTo(c);
  return new Circle({ radius: r, fill: TONE.ground, stroke: state === 'awaited' ? TONE.ink : TONE.steel, strokeWidth: state === 'awaited' ? STROKE.bold : STROKE.fine, ...(state === 'empty' ? { dashArray: '0.15 0.1' } : {}) }).moveTo(c);
}

/** The mark of who sits in a seat, large: the kit's person mark or AI mark. */
const markOf = (s: Stage, who: 'person' | 'ai', at: Vec, color: string = TONE.ink, scale = 1): Group =>
  who === 'person' ? person(s, { at: [at[0], at[1] + 0.05 * scale], size: 0.86 * scale, color }) : aiMark(s, { at, size: 1.36 * scale, color });

/**
 * A typing badge, the Company's side at work (working): a small pill of the raised tone with an ink
 * edge and three ink dots, as a chat shows someone writing. One Group.
 */
function typing(at: Vec): Group {
  return new Group(
    new Rectangle({ width: 0.92, height: 0.46, fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: 0.23 }).moveTo(at),
    ...[-0.24, 0, 0.24].map((dx) => new Circle({ radius: 0.065, fill: TONE.ink, stroke: 'none' }).moveTo([at[0] + dx, at[1]])),
  );
}

/** An envelope, the Company's invitation: PAPER with its flap drawn in PAPER_LINE. 1.1 × 0.74. One Group. */
function envelope(at: Vec): Group {
  const [x, y] = at, w = 1.1, h = 0.74;
  return new Group(
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo(at),
    new Polygon([[x - w / 2 + 0.06, y + h / 2 - 0.05], [x, y - 0.06], [x + w / 2 - 0.06, y + h / 2 - 0.05], [x + w / 2 - 0.06, y + h / 2 - 0.13], [x, y - 0.15], [x - w / 2 + 0.06, y + h / 2 - 0.13]], { fill: TONE.paperLine, stroke: 'none' }),
  );
}

/** A place card on the table: the conversation's owner, printed in mono on PAPER. One Group. */
function placeCard(s: Stage, at: Vec, line: string): Group {
  const text = words(s, line, { at, mono: true, color: TONE.print, align: 'middle' });
  return new Group(new Rectangle({ width: text.width() + 0.5, height: 0.84, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo(at), text);
}

/** How big a turn of speech is, for its words. */
const TURN_H = 1.0;
const turnWidth = (s: Stage, text: string) => words(s, text, { size: TYPE.label }).width() + 1.45;

/**
 * A turn of speech lying on the table: a bubble (PAPER with PRINT words for a person; the ground with
 * INK words and an ink edge for an AI), the writer's mark at its start, and a tail from the edge
 * that faces the writer's seat, stopping short of it. `at` is the bubble's centre. One Group.
 */
function turn(s: Stage, text: string, who: 'person' | 'ai', at: Vec, towards: Vec): Group {
  const w = turnWidth(s, text), h = TURN_H, [x, y] = at, l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2, k = RADIUS.panel;
  const dx = towards[0] - x, dy = towards[1] - y;
  const edge: 'top' | 'bottom' | 'left' | 'right' = Math.abs(dy) - h / 2 > Math.abs(dx) - w / 2 ? (dy > 0 ? 'top' : 'bottom') : dx > 0 ? 'right' : 'left';
  const along = edge === 'top' || edge === 'bottom' ? Math.max(l + 0.5, Math.min(r - 0.5, towards[0])) : Math.max(b + 0.32, Math.min(t - 0.32, towards[1]));
  const base: Vec = edge === 'top' ? [along, t] : edge === 'bottom' ? [along, b] : edge === 'left' ? [l, along] : [r, along];
  const d = Math.hypot(towards[0] - base[0], towards[1] - base[1]), reach = Math.max(0.2, d - SEAT_R - 0.14);
  const tip: Vec = [base[0] + ((towards[0] - base[0]) / d) * reach, base[1] + ((towards[1] - base[1]) / d) * reach];
  const half = 0.2, corner = (cx: number, cy: number, a0: number, a1: number): Vec[] => Array.from({ length: 6 }, (_, i) => [cx + k * Math.cos(a0 + ((a1 - a0) * i) / 5), cy + k * Math.sin(a0 + ((a1 - a0) * i) / 5)]);
  const pts: Vec[] = [
    ...corner(l + k, t - k, Math.PI, Math.PI / 2),
    ...(edge === 'top' ? [[along - half, t], tip, [along + half, t]] as Vec[] : []),
    ...corner(r - k, t - k, Math.PI / 2, 0),
    ...(edge === 'right' ? [[r, along + half], tip, [r, along - half]] as Vec[] : []),
    ...corner(r - k, b + k, 0, -Math.PI / 2),
    ...(edge === 'bottom' ? [[along + half, b], tip, [along - half, b]] as Vec[] : []),
    ...corner(l + k, b + k, -Math.PI / 2, -Math.PI),
    ...(edge === 'left' ? [[l, along - half], tip, [l, along + half]] as Vec[] : []),
  ];
  const isPerson = who === 'person', ink = isPerson ? TONE.print : TONE.ink;
  const bubble = new Polygon(pts, isPerson ? { fill: TONE.paper, stroke: 'none' } : { fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, lineJoin: 'round' });
  const markAt: Vec = [l + 0.5, y];
  const mark = isPerson ? person(s, { at: [markAt[0], markAt[1] + 0.02], size: 0.5, color: ink }) : aiMark(s, { at: markAt, size: 0.86, color: ink });
  return new Group(bubble, mark, words(s, text, { at: [l + 0.95, y], size: TYPE.label, color: ink }));
}

/** A narrow ledger: a title of one or two bold lines over a double rule, then rows of a SOFT name and a mono value over hairlines. Keyed `<key>:…`. */
function narrowLedger(s: Stage, parts: Parts, title: readonly string[], rows: readonly { label: string; value: string; quiet?: boolean }[], key: string, at: Vec) {
  const [x, y0] = at, width = LEDGER.width;
  title.forEach((line, i) => parts.add(words(s, line, { at: [x, y0 - i * 0.62], bold: true }), `${key}:title:${i}`));
  const ruleY = y0 - (title.length - 1) * 0.62 - 0.46;
  parts.add(new Group(
    new Rectangle({ width, height: 0.045, fill: TONE.ink, stroke: 'none' }).moveTo([x + width / 2, ruleY]),
    new Rectangle({ width, height: 0.025, fill: TONE.ink, stroke: 'none' }).moveTo([x + width / 2, ruleY - 0.1]),
  ), `${key}:rule`);
  rows.forEach((row, i) => {
    const y = ruleY - 0.56 - i * 0.66, slug = `${key}:${row.label.toLowerCase().replace(/\s+/g, '-')}`;
    parts.add(words(s, row.label, { at: [x, y], color: TONE.soft }), `${slug}:label`);
    parts.add(words(s, row.value, { at: [x + width, y], align: 'end', color: row.quiet ? TONE.soft : TONE.ink, mono: !row.quiet }), `${slug}:value`);
    parts.add(new Rectangle({ width, height: STROKE.hair, fill: TONE.rule, stroke: 'none' }).moveTo([x + width / 2, y - 0.33]), `${slug}:rule`);
  });
}

// ---------------------------------------------------------------------------------------------
// Words: names, and the picture in words

const NAME: Record<Speaker, string> = { agent: 'your agent', you: 'you', 'company agent': 'the Company Agent', person: PERSON.name };
/** Who is speaking in a turn, as a reader would say it: the person at the Direct Conversation is the specialist. */
const speakerName = (t: Turn) => (t.speaker === 'person' && t.at === 'direct' ? 'the specialist' : NAME[t.speaker]);
const fields = (c: Conv) => `working ${c.working}, handoff ${c.handoff}, responder ${c.responder}, closed ${c.closed}`;

/** The rows of the ledger for a conversation, or for none yet. */
function ledgerRows(c: Conv | null) {
  if (!c) return ['working', 'handoff', 'responder', 'closed'].map((label) => ({ label, value: 'none', quiet: true }));
  return [
    { label: 'working', value: String(c.working) },
    { label: 'handoff', value: c.handoff },
    { label: 'responder', value: c.responder },
    { label: 'closed', value: String(c.closed) },
  ];
}

/** The requests of the ownership step, after the conversation has used account A (8.2, 8.11): 202 accepted, or the error. */
export function ownerRows(): { label: string; value: string }[] {
  const used = { ...OWNER, account: ACCOUNT };
  const as = (o: Partial<Caller>): Caller => ({ client: OWNER.client, userId: USER_ID, account: null, session: 'Yx2b7Q', ...o });
  const code = (o: Partial<Caller>) => { const r = continueAs(used, as(o)); return r.status === 'continues' ? '202' : String(r.status); };
  return [
    { label: `account ${ACCOUNT}`, value: code({ account: ACCOUNT }) },
    { label: 'signed out', value: code({}) },
    { label: 'another user', value: code({ userId: 'usr_m4Tz9P' }) },
    { label: 'account B', value: code({ account: 'B' }) },
  ];
}

/** The picture in words, for a reader who cannot see it; it names every field, so no two states read alike. */
export function sayWorld(w: World, shown: Shown = {}): string {
  const direct = openDirectOf(w), rule = ruleOf(w);
  const seats = !w.main
    ? 'At the conversation’s table, your agent and you sit on your side, the Company Agent on the Company’s side, and the seat for a person there is empty. No conversation has started.'
    : `At the conversation’s table (${CONVERSATION_ID}), ${direct ? 'your seat is empty and your agent has stepped away to watch' : 'your agent and you sit on your side'}; on the Company’s side sit the Company Agent and ${w.main.responder === 'human' ? `${PERSON.name}, a person` : w.main.handoff === 'pending' ? 'a seat waiting for the person the Company is finding' : 'an empty seat for a person'}. Its fields: ${fields(w.main)}.${w.main.closed ? ' It is closed.' : direct ? ' It is paused.' : ''}`;
  const directWords = direct
    ? ` A Direct Conversation is open at a smaller table below: you sit at it, your agent watches from beside it, and across from you sits ${direct.responder === 'human' ? 'a specialist, a person' : 'the Company Agent'}. Its fields: ${fields(direct)}.`
    : w.direct === 'closed' ? ' A Direct Conversation was opened and has closed.' : ' No Direct Conversation has opened.';
  const invite = w.invited ? ' The Company’s invitation, a user_requested envelope, lies in front of your agent, waiting for your answer.' : '';
  const turnWords = w.said && w.said.at === activeOf(w)
    ? ` On the ${w.said.at === 'main' ? 'conversation’s' : 'Direct Conversation’s'} table, ${speakerName(w.said)} says “${LINES[w.said.line]}”, marked ${authorOf(w.said.speaker) === 'human' ? 'person' : 'AI'} (author.type ${authorOf(w.said.speaker)}, role ${roleOf(w.said.speaker)}).`
    : ' Nothing is said on the table in use.';
  const owner = shown.owner
    ? ` A place card names the conversation’s owner: ${AGENT.name}, User ID ${USER_ID}, account ${ACCOUNT}. A message from that owner signed in to account ${ACCOUNT} is accepted; ${ownerRows().slice(1).map((r) => `${r.label}: ${r.value}`).join('; ')}.`
    : '';
  return `${seats}${directWords}${invite}${turnWords}${owner} The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

// ---------------------------------------------------------------------------------------------
// The picture

/** Where a turn rests at a table: in front of its writer's seat, inside the table, and its writer's seat. */
function turnPlace(s: Stage, w: World, t: Turn): { at: Vec; seat: Vec } {
  const seats = seatsOf(w), text = LINES[t.line], width = turnWidth(s, text);
  if (t.at === 'direct') {
    const userSide = roleOf(t.speaker) === 'user', inset = 0.45;
    return userSide
      ? { at: [left(DIRECT) + inset + width / 2, DIRECT.y], seat: seats.directYou }
      : { at: [right(DIRECT) - inset - width / 2, DIRECT.y], seat: seats.directCompany };
  }
  const seat = t.speaker === 'agent' ? seats.agentSeat : t.speaker === 'you' ? seats.youSeat : t.speaker === 'person' ? seats.person : seats.company;
  const upper = seat[1] > MAIN_FULL.y, lo = left(MAIN_FULL) + 0.3 + width / 2, hi = right(MAIN_FULL) - 0.3 - width / 2;
  const x = Math.max(lo, Math.min(hi, seat[0] + (seat[0] < MAIN_FULL.x ? 1.2 : -1.2)));
  return { at: [x, upper ? MAIN_FULL.y + 0.3 : MAIN_FULL.y - 0.75], seat };
}

/** Where a turn sets off from: the seat of the writer, in the picture of this state. */
export function speakerAt(w: World): Vec | null {
  const t = w.said;
  if (!t) return null;
  const seats = seatsOf(w);
  if (t.at === 'direct') return roleOf(t.speaker) === 'user' ? seats.directYou : seats.directCompany;
  return t.speaker === 'agent' ? seats.agentSeat : t.speaker === 'you' ? seats.youSeat : t.speaker === 'person' ? seats.person : seats.company;
}

/** The state as its picture. */
export function drawWorld(w: World, s: Stage, shown: Shown = {}): Group {
  const parts = keyedParts();
  const direct = openDirectOf(w), active = activeOf(w), seats = seatsOf(w);
  const back = !!direct, paused = back || !!w.main?.closed;
  const main = back ? MAIN_BACK : MAIN_FULL;
  const ink = paused ? TONE.steel : TONE.ink;
  /** A seat's name and, under it, what sits there; above the seat for a seat on the table's far edge. */
  const named = (key: string, at: Vec, name: string, kind: string, above: boolean, quiet = false) => {
    const nameY = above ? at[1] + SEAT_R + 1.06 : at[1] - SEAT_R - 0.4, kindY = above ? at[1] + SEAT_R + 0.4 : at[1] - SEAT_R - 1.06;
    parts.add(words(s, name, { at: [at[0], nameY], align: 'middle', color: quiet ? TONE.soft : TONE.ink, bold: !quiet }), `${key}:name`);
    parts.add(words(s, kind, { at: [at[0], kindY], align: 'middle', color: TONE.soft }), `${key}:kind`);
  };

  // The conversation's table. Its seats are drawn first, so the table's edge covers their inner half.
  const joined = w.main?.responder === 'human', looking = w.main?.handoff === 'pending';
  parts.add(seat(seats.agentSeat, back ? 'empty' : paused ? 'idle' : 'taken'), 'seat:agent');
  parts.add(seat(seats.youSeat, back ? 'empty' : paused ? 'idle' : 'taken'), 'seat:you');
  parts.add(seat(seats.company, paused ? 'idle' : 'taken'), 'seat:company');
  parts.add(seat(seats.person, joined ? (paused ? 'idle' : 'taken') : looking ? 'awaited' : 'empty'), 'seat:person');
  parts.add(table(main), 'main:table');

  // Who sits where. Your agent and you move to the Direct Conversation while it is open.
  parts.add(markOf(s, 'ai', seats.company, ink), 'company:mark');
  if (joined) parts.add(markOf(s, 'person', seats.person, ink), 'person:mark');
  if (!back) {
    parts.add(markOf(s, 'ai', seats.agent, ink), 'agent:mark');
    parts.add(markOf(s, 'person', seats.you, ink), 'you:mark');
    named('agent', seats.agentSeat, 'your agent', 'AI', true, paused);
    named('you', seats.youSeat, 'you', 'person', false, paused);
    named('company', seats.company, 'Company Agent', 'AI', true, paused);
    named('person', seats.person, joined ? PERSON.name : 'a person', joined ? 'person' : looking ? 'being found' : 'no one yet', false, !joined || paused);
  }
  if (w.main && !back) parts.add(words(s, CONVERSATION_ID, { at: [-2.5, bottom(main) - 0.45], mono: true, color: TONE.soft, align: 'middle' }), 'main:id');

  // While paused or closed, the table says so.
  if (paused && !shown.owner) parts.add(emphasised(words(s, w.main?.closed ? 'closed' : 'paused', { at: [main.x, main.y], size: TYPE.label, bold: true, color: TONE.soft, align: 'middle' }), `the conversation is ${w.main?.closed ? 'closed' : 'paused'}`), 'main:state');
  // The ownership step: a place card naming who the conversation belongs to.
  if (shown.owner) parts.add(placeCard(s, [main.x, main.y], `${USER_ID} · account ${ACCOUNT}`), 'owner:card');

  // The Company's invitation stops in front of your agent's seat.
  if (w.invited) {
    const at: Vec = [YOUR_X - 0.3, top(MAIN_FULL) - 0.55];
    parts.add(emphasised(envelope(at), 'the Company asks for you, through your agent'), 'invite');
    parts.add(words(s, 'user_requested', { at: [at[0] + 0.75, at[1]], mono: true }), 'invite:type');
  }

  // The Direct Conversation: a smaller table below, joined to the first by a thread.
  if (direct) {
    parts.add(new Line([THREAD_X, bottom(MAIN_BACK)], [THREAD_X, top(DIRECT)], { stroke: TONE.ink, strokeWidth: STROKE.fine }), 'direct:thread');
    const human = direct.responder === 'human';
    parts.add(seat(seats.directYou, 'taken'), 'seat:direct:you');
    parts.add(seat(seats.directCompany, 'taken'), 'seat:direct:co');
    parts.add(table(DIRECT), 'direct:table');
    parts.add(markOf(s, 'person', seats.you), 'you:mark');
    named('you', seats.directYou, 'you', 'person', false);
    parts.add(markOf(s, human ? 'person' : 'ai', seats.directCompany), human ? 'specialist:mark' : 'direct:agent:mark');
    named('direct:co', seats.directCompany, human ? 'specialist' : 'Company Agent', human ? 'person' : 'AI', false);
    // Your agent, set back beside the table: it may watch, and it says nothing here.
    parts.add(seat(seats.agent, 'taken', 0.5), 'seat:watch');
    parts.add(markOf(s, 'ai', seats.agent, TONE.ink, 0.82), 'agent:mark');
    parts.add(words(s, 'your agent', { at: [seats.agent[0] + 0.75, seats.agent[1] + 0.31], bold: true }), 'agent:name');
    parts.add(words(s, 'AI, watching', { at: [seats.agent[0] + 0.75, seats.agent[1] - 0.37], color: TONE.soft }), 'agent:kind');
  } else if (w.direct === 'closed') {
    // Closed: the small table is gone, and the ledger's column notes that it was there.
    parts.add(words(s, 'Direct', { at: [LEDGER.x, -3.2], color: TONE.soft }), 'direct:closed');
    parts.add(words(s, 'closed', { at: [MARGIN.right, -3.2], mono: true, align: 'end' }), 'direct:closed:value');
    parts.add(new Rectangle({ width: LEDGER.width, height: STROKE.hair, fill: TONE.rule, stroke: 'none' }).moveTo([LEDGER.x + LEDGER.width / 2, -3.53]), 'direct:closed:rule');
  }

  // Working: a typing badge by the seat of whoever handles the Company's side of the table in use.
  const c = active === 'direct' ? direct : w.main;
  if (c?.working) {
    const at = active === 'direct' ? seats.directCompany : c.responder === 'human' ? seats.person : seats.company;
    const badge: Vec = active === 'direct' ? [at[0], at[1] + SEAT_R + 0.42] : [at[0] + 1.0, at[1] + (at[1] > MAIN_FULL.y ? 0.5 : -0.5)];
    parts.add(emphasised(typing(badge), 'the Company is working'), 'working');
  }

  // The turn of speech on the table in use, in front of its writer.
  if (w.said && w.said.at === active) {
    const text = LINES[w.said.line], place = turnPlace(s, w, w.said);
    parts.add(emphasised(turn(s, text, authorOf(w.said.speaker) === 'human' ? 'person' : 'ai', place.at, place.seat), `${speakerName(w.said)} says: ${text}`), 'turn');
  }

  // On the right: the state fields of the conversation in use, or, at the ownership step, who may continue it.
  const at: Vec = [LEDGER.x, back ? 3.6 : 3.0];
  if (shown.owner) narrowLedger(s, parts, ['Continue it?'], ownerRows(), 'owner', at);
  else narrowLedger(s, parts, active === 'direct' ? ['Direct', 'Conversation'] : w.main ? ['Conversation'] : ['No conversation'], ledgerRows(c ?? null), 'state', at);

  // Under it: who wrote the turn on the table, in the two fields a message carries for it (8.4, 8.8).
  const shownTurn = w.said && w.said.at === active ? w.said : null;
  narrowLedger(s, parts, ['On the table'], shownTurn
    ? [{ label: 'author.type', value: authorOf(shownTurn.speaker) }, { label: 'role', value: roleOf(shownTurn.speaker) }]
    : [{ label: 'author.type', value: 'none', quiet: true }, { label: 'role', value: 'none', quiet: true }], 'written', [LEDGER.x, back ? -0.75 : -0.85]);
  return parts.group();
}

export type { Mobject };
