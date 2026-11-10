import { Circle, Group, Line, Rectangle } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { MARGIN, PALETTE as KIT_PALETTE, PLATE_HEIGHT, RADIUS, SPACE, STROKE, TONE, TYPE, addAll, aiMark, ledger, person, speech, words } from '../lib/poppy-kit.ts';
import { AGENT } from '../poppy/model.ts';
import { ACCOUNT, CONVERSATION_ID, LINES, OWNER, PERSON, USER_ID, activeOf, authorOf, continueAs, openDirectOf, roleOf, ruleOf } from './model.ts';
import type { Caller, Conv, Speaker, Turn, World } from './model.ts';

// One state of the conversation as a picture: a table seen from above, with four seats. The User's
// side sits at the left end (your agent above, you below), the Company's side at the right end (the
// Company Agent above, a person below). A seat is a disc of the raised tone; an empty one is a dashed
// ring, so a reader sees from the first frame that two seats are for people and stand empty.
//
// A message is a speech turn on the table, drawn with the kit's `speech`: its mark, the person mark
// or the AI mark, says who wrote it (author.type). At most one turn rests on the table at a time.
// The four state fields of the conversation in use stand at the bottom right as a ledger. While no
// Direct Conversation has opened, the bottom left names the two marks; when one opens, a second,
// smaller table stands there, joined to the first by a thread, with you at it, the Company's seat
// opposite, and your agent watching from beside it. The first table is then drawn in the idle tone
// under the word "paused". The Company's invitation (user_requested) is a folded card that rests in
// front of your agent, not you.
//
// Colours are the kit's: INK for who is present and speaking, STEEL for an empty or paused seat,
// PAPER for a person's words and RAISED for an AI's. Wax, brass and pewter are not used: no seal,
// key or other agent's seal appears in this chapter's picture. Every word is TYPE.small or larger.

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;
/** What the scene shows that is not the model: the ownership step's place card and requests. */
export type Shown = { owner?: boolean };

// ---------------------------------------------------------------------------------------------
// Geometry, shared with the scene's transitions

/** The conversation's table: its centre and size. */
const MAIN = { x: 0, y: 1.95, w: 12.0, h: 1.6 } as const;
/** The Direct Conversation's table. */
const DIRECT = { x: -2.97, y: -2.6, w: 6.05, h: 1.6 } as const;
/** Seats at the conversation's table. */
const SEAT_X = 6.85, UPPER = 2.85, LOWER = 1.05;
export const SEATS = {
  agent: [-SEAT_X, UPPER] as Vec,
  you: [-SEAT_X, LOWER] as Vec,
  company: [SEAT_X, UPPER] as Vec,
  person: [SEAT_X, LOWER] as Vec,
  /** You, at the Direct Conversation's table. */
  directYou: [-SEAT_X, DIRECT.y] as Vec,
  /** The Company's seat at the Direct Conversation's table. */
  directCompany: [0.9, DIRECT.y] as Vec,
  /** Your agent, watching the Direct Conversation from beside it. */
  observer: [-SEAT_X, -1.3] as Vec,
};
/** Where a person who joins comes from: the Company's back office, off the right edge of the stage. */
export const BACK_OFFICE_X = 8.6;
const SEAT_R = 0.6;
/** The ledger of state fields, bottom right. */
const LEDGER_X = 1.9, LEDGER_TOP = -0.55, ROW_GAP = 0.66;
/** The thread between the two tables runs down here, clear of every label. */
const THREAD_X = -2.15;

/**
 * Where a speech turn rests at a table, given its width: next to its writer's end, with the kit's
 * mark (0.42 beyond the bubble, about 0.35 wide) clear of the seats at that end.
 */
function turnAt(at: 'main' | 'direct', userSide: boolean, width: number): Vec {
  const t = at === 'main' ? MAIN : DIRECT, y = t.y + 0.15, gap = SPACE.xs + 0.42 + 0.35;
  const leftSeat = at === 'main' ? SEATS.you[0] : SEATS.directYou[0], rightSeat = at === 'main' ? SEATS.person[0] : SEATS.directCompany[0];
  return userSide ? [leftSeat + SEAT_R + gap + width / 2, y] : [rightSeat - SEAT_R - gap - width / 2, y];
}

// ---------------------------------------------------------------------------------------------
// Objects this chapter needs that the kit has no drawing for

/** A table seen from above: a slab of the raised tone with a hairline inset, as a table top's edge. */
function table(c: Vec, w: number, h: number, outline = false): Group {
  if (outline)
    return new Group(new Rectangle({ width: w, height: h, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: RADIUS.panel, dashArray: '0.16 0.1' }).moveTo(c));
  return new Group(
    new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: 'none', cornerRadius: RADIUS.panel }).moveTo(c),
    new Rectangle({ width: w - 0.24, height: h - 0.24, fill: 'none', stroke: TONE.rule, strokeWidth: STROKE.hair, cornerRadius: RADIUS.panel - 0.06 }).moveTo(c),
  );
}

/** A seat: a disc in the raised tone with a fine ring, INK when someone sits there or is expected, a dashed STEEL ring when empty. */
function seat(c: Vec, state: 'taken' | 'empty' | 'awaited'): Circle {
  if (state === 'taken') return new Circle({ radius: SEAT_R, fill: TONE.raised, stroke: TONE.rule, strokeWidth: STROKE.fine }).moveTo(c);
  return new Circle({ radius: SEAT_R, fill: TONE.ground, stroke: state === 'awaited' ? TONE.ink : TONE.steel, strokeWidth: state === 'awaited' ? STROKE.line : STROKE.fine, dashArray: '0.14 0.09' }).moveTo(c);
}

/** The mark of who sits in a seat: the kit's person mark or AI mark, sized to the seat. */
const markOf = (s: Stage, who: 'person' | 'ai', at: Vec, color: string = TONE.ink): Group =>
  who === 'person' ? person(s, { at: [at[0], at[1] + 0.06], size: 0.82, color }) : aiMark(s, { at, size: 1.3, color });

/**
 * The Company's invitation, a user_requested event: a folded card of PAPER, its fold a PAPER_LINE
 * triangle at the top, the event's type printed on it in mono. One Group.
 */
export function invitation(s: Stage, at: Vec): Group {
  const text = words(s, 'user_requested', { at: [at[0], at[1] - 0.04], mono: true, color: TONE.print, align: 'middle' });
  const w = text.width() + 0.5, h = 0.8, [x, y] = at;
  return new Group(
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo(at),
    new Rectangle({ width: w - 0.1, height: STROKE.hair, fill: TONE.paperLine, stroke: 'none' }).moveTo([x, y + h / 2 - 0.12]),
    text,
  );
}

/** A place card on the table: the conversation's owner, printed in mono on PAPER. One Group. */
function placeCard(s: Stage, at: Vec, line: string): Group {
  const text = words(s, line, { at, mono: true, color: TONE.print, align: 'middle' });
  return new Group(new Rectangle({ width: text.width() + 0.56, height: PLATE_HEIGHT, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo(at), text);
}

// ---------------------------------------------------------------------------------------------
// Words: names, and the picture in words

const NAME: Record<Speaker, string> = { agent: 'your agent', you: 'you', 'company agent': 'the Company Agent', person: PERSON.name };
/** Who is speaking in a turn, as a reader would say it: the person at the Direct Conversation is the specialist. */
const speakerName = (t: Turn) => (t.speaker === 'person' && t.at === 'direct' ? 'the specialist' : NAME[t.speaker]);
const fields = (c: Conv) => `working ${c.working}, handoff ${c.handoff}, responder ${c.responder}, closed ${c.closed}`;

/** The rows of the ledger for a conversation, or for none yet. */
function ledgerRows(c: Conv | null) {
  if (!c) return ['working', 'handoff', 'responder', 'closed'].map((label) => ({ label, value: 'none yet', quiet: true }));
  return [
    { label: 'working', value: String(c.working) },
    { label: 'handoff', value: c.handoff },
    { label: 'responder', value: c.responder },
    { label: 'closed', value: String(c.closed) },
  ];
}

/** The requests of the ownership step, after the conversation has used account A (8.2, 8.11). */
export function ownerRows(): { label: string; value: string }[] {
  const used = { ...OWNER, account: ACCOUNT };
  const as = (o: Partial<Caller>): Caller => ({ client: OWNER.client, userId: USER_ID, account: null, session: 'Yx2b7Q', ...o });
  const code = (o: Partial<Caller>) => { const r = continueAs(used, as(o)); return r.status === 'continues' ? '202' : String(r.status); };
  return [
    { label: `account ${ACCOUNT}`, value: code({ account: ACCOUNT }) },
    { label: 'signed out', value: code({}) },
    { label: 'other User ID', value: code({ userId: 'usr_m4Tz9P' }) },
    { label: 'account B', value: code({ account: 'B' }) },
  ];
}

/** The picture in words, for a reader who cannot see it; it names every field, so no two states read alike. */
export function sayWorld(w: World, shown: Shown = {}): string {
  const direct = openDirectOf(w), rule = ruleOf(w);
  const seats = !w.main
    ? 'At the conversation’s table, your agent and the Company Agent sit at opposite ends; your seat and a person’s seat are empty. No conversation has started.'
    : `At the conversation’s table (${CONVERSATION_ID}), your agent sits at the left end${direct ? ' and your seat beside it is empty' : ', and you beside it'}; at the right end sit the Company Agent and ${w.main.responder === 'human' ? `${PERSON.name}, a person` : w.main.handoff === 'pending' ? 'an empty seat the Company is finding a person for' : 'an empty seat for a person'}. Its fields: ${fields(w.main)}.${w.main.closed ? ' It is closed.' : direct ? ' It is paused.' : ''}`;
  const directWords = direct
    ? ` A Direct Conversation is open at a smaller table: you sit at it, your agent watches from beside it, and across from you sits ${direct.responder === 'human' ? 'a specialist, a person' : 'the Company Agent'}. Its fields: ${fields(direct)}.`
    : w.direct === 'closed' ? ' A Direct Conversation was opened and has closed; its table stands empty.' : ' No Direct Conversation has opened.';
  const invite = w.invited ? ' The Company’s invitation, a user_requested card, lies in front of your agent, waiting for your answer.' : '';
  const turn = w.said
    ? ` On the ${w.said.at === 'main' ? 'conversation’s' : 'Direct Conversation’s'} table, ${speakerName(w.said)} says “${LINES[w.said.line]}”, marked ${authorOf(w.said.speaker) === 'human' ? 'person' : 'AI'} (author.type ${authorOf(w.said.speaker)}, role ${roleOf(w.said.speaker)}).`
    : ' Nothing is said on the table in use.';
  const owner = shown.owner
    ? ` A place card names the conversation’s owner: ${AGENT.name}, User ID ${USER_ID}, account ${ACCOUNT}. A message from that owner signed in to account ${ACCOUNT} continues; ${ownerRows().slice(1).map((r) => `${r.label}: ${r.value}`).join('; ')}.`
    : '';
  return `${seats}${directWords}${invite}${turn}${owner} The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

// ---------------------------------------------------------------------------------------------
// The picture

/** The state as its picture: the conversation's table across the top, the Direct Conversation or the key to the marks below left, the state fields below right. */
export function drawWorld(w: World, s: Stage, shown: Shown = {}): Group {
  const parts = keyedParts();
  const direct = openDirectOf(w), active = activeOf(w);
  const paused = !!direct || !!w.main?.closed;
  const idle = (on: boolean) => (on ? TONE.steel : TONE.ink);
  const label = (key: string, value: string, at: Vec, align: 'start' | 'end' | 'middle', soft = false) =>
    parts.add(words(s, value, { at, align, color: soft ? TONE.soft : TONE.ink }), key);

  // The conversation's table, and its ID once the first message has started it.
  parts.add(table([MAIN.x, MAIN.y], MAIN.w, MAIN.h), 'main:table');
  if (w.main) parts.add(words(s, CONVERSATION_ID, { at: [-4.4, 0.62], mono: true, color: TONE.soft, align: 'middle' }), 'main:id');

  // Your agent's seat: always taken. Its mark goes to the idle tone while the conversation is paused.
  parts.add(seat(SEATS.agent, 'taken'), 'seat:agent');
  parts.add(markOf(s, 'ai', SEATS.agent, idle(paused)), 'agent:mark');
  label('agent:label', 'your agent', [MARGIN.left, UPPER + 0.95], 'start', paused);

  // Your seat at the conversation's table, and you: here, or at the Direct Conversation's table.
  const youThere = !!direct;
  parts.add(seat(SEATS.you, youThere ? 'empty' : 'taken'), 'seat:you');
  if (youThere) parts.add(seat(SEATS.directYou, 'taken'), 'seat:direct:you');
  parts.add(markOf(s, 'person', youThere ? SEATS.directYou : SEATS.you), 'you:mark');
  label('you:label', 'you', youThere ? [MARGIN.left, DIRECT.y - 0.95] : [MARGIN.left, LOWER - 0.92], 'start');

  // The Company's end: its agent always; a person once one has joined, an empty seat until then.
  parts.add(seat(SEATS.company, 'taken'), 'seat:company');
  parts.add(markOf(s, 'ai', SEATS.company, idle(paused)), 'company:mark');
  label('company:label', 'Company Agent', [MARGIN.right, UPPER + 0.95], 'end', paused);
  const joined = w.main?.responder === 'human', looking = w.main?.handoff === 'pending';
  parts.add(seat(SEATS.person, joined ? 'taken' : looking ? 'awaited' : 'empty'), 'seat:person');
  if (joined) parts.add(markOf(s, 'person', SEATS.person, idle(paused)), 'person:mark');
  label('person:label', joined ? PERSON.name : looking ? 'finding a person' : 'a person', [MARGIN.right, LOWER - 0.92], 'end', !joined || paused);

  // While paused or closed, the table says so, and why its messages are refused.
  if (paused && !shown.owner) {
    const word = w.main?.closed ? 'closed' : 'paused', code = w.main?.closed ? '409 conversation_closed' : '409 direct_conversation_open';
    const head = words(s, word, { at: [MAIN.x, MAIN.y + 0.34], size: TYPE.label, bold: true, align: 'middle' });
    const sub = words(s, code, { at: [MAIN.x, MAIN.y - 0.4], mono: true, color: TONE.soft, align: 'middle' });
    parts.add(emphasised(head, `the conversation is ${word}`), 'main:state');
    parts.add(sub, 'main:code');
  }

  // The ownership step: a place card naming who the conversation belongs to.
  if (shown.owner) parts.add(placeCard(s, [MAIN.x, MAIN.y], `${USER_ID} · account ${ACCOUNT}`), 'owner:card');

  // The Company's invitation lies in front of your agent.
  if (w.invited) parts.add(emphasised(invitation(s, [-3.35, MAIN.y - 0.38]), 'the Company asks for you, through your agent'), 'invite');

  // Below left: the Direct Conversation's table when one has opened; until then, the key to the marks.
  if (direct || w.direct === 'closed') {
    parts.add(table([DIRECT.x, DIRECT.y], DIRECT.w, DIRECT.h, !direct), 'direct:table');
    if (direct) parts.add(new Line([THREAD_X, MAIN.y - MAIN.h / 2], [THREAD_X, DIRECT.y + DIRECT.h / 2], { stroke: TONE.ink, strokeWidth: STROKE.fine }), 'direct:thread');
  }
  if (direct) {
    // Your agent watches from beside the table, not at it.
    parts.add(markOf(s, 'ai', SEATS.observer), 'observer:mark');
    label('observer:label', 'your agent watches', [MARGIN.left, SEATS.observer[1] + 0.85], 'start');
    const human = direct.responder === 'human';
    parts.add(seat(SEATS.directCompany, 'taken'), 'seat:direct:company');
    parts.add(markOf(s, human ? 'person' : 'ai', SEATS.directCompany), human ? 'specialist:mark' : 'direct:agent:mark');
    const who = human ? 'specialist' : 'Company Agent';
    label('direct:company:label', who, [SEATS.directCompany[0] + SEAT_R, DIRECT.y - 1.25], 'end', !human);
  } else if (w.direct === 'closed') {
    parts.add(words(s, 'Direct Conversation', { at: [DIRECT.x, DIRECT.y + 0.32], color: TONE.soft, align: 'middle' }), 'direct:closed');
    parts.add(words(s, 'closed', { at: [DIRECT.x, DIRECT.y - 0.32], color: TONE.soft, bold: true, align: 'middle' }), 'direct:closed:word');
  } else {
    const kx = MARGIN.left + 0.45, tx = MARGIN.left + 1.2;
    parts.add(person(s, { at: [kx, -1.55], size: 0.82 }), 'legend:person');
    parts.add(words(s, 'a person wrote it', { at: [tx, -1.3], bold: true }), 'legend:person:name');
    parts.add(words(s, 'author.type human', { at: [tx, -1.98], mono: true, color: TONE.soft }), 'legend:person:says');
    parts.add(aiMark(s, { at: [kx, -3.0], size: 1.3 }), 'legend:ai');
    parts.add(words(s, 'an AI wrote it', { at: [tx, -2.75], bold: true }), 'legend:ai:name');
    parts.add(words(s, 'author.type agent', { at: [tx, -3.43], mono: true, color: TONE.soft }), 'legend:ai:says');
  }

  // The turn of speech on the table in use, marked person or AI.
  if (w.said && w.said.at === active) {
    const userSide = roleOf(w.said.speaker) === 'user', text = LINES[w.said.line];
    const width = words(s, text).width() + 0.56;
    const turn = speech(s, text, { at: turnAt(w.said.at, userSide, width), who: authorOf(w.said.speaker) === 'human' ? 'person' : 'ai', side: userSide ? 'left' : 'right' });
    parts.add(emphasised(turn, `${speakerName(w.said)} says: ${text}`), 'turn');
  }

  // Below right: the state fields of the conversation in use, or, at the ownership step, who may continue it.
  if (shown.owner)
    addAll(parts, ledger(s, ownerRows().map((r) => ({ ...r, quiet: false })), { at: [LEDGER_X, LEDGER_TOP], width: MARGIN.right - LEDGER_X, title: 'Who may continue', key: 'owner', rowGap: ROW_GAP }));
  else {
    const c = active === 'direct' ? direct : w.main;
    const title = active === 'direct' ? 'Direct Conversation' : w.main ? 'The conversation' : 'No conversation yet';
    addAll(parts, ledger(s, ledgerRows(c), { at: [LEDGER_X, LEDGER_TOP], width: MARGIN.right - LEDGER_X, title, key: 'state', rowGap: ROW_GAP }));
  }
  return parts.group();
}

/** Where a turn sets off from: the mark of the speaker who wrote it. */
export function speakerAt(w: World): Vec | null {
  const t = w.said;
  if (!t) return null;
  if (t.speaker === 'agent') return SEATS.agent;
  if (t.speaker === 'you') return t.at === 'direct' ? SEATS.directYou : SEATS.you;
  if (t.at === 'direct') return SEATS.directCompany;
  return t.speaker === 'person' ? SEATS.person : SEATS.company;
}
