import { Rectangle, Text } from '../../../src/index.ts';
import type { Group } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { AGENT, COMPANY, OPERATIONS, SID, THIEF, USER_IDS, ruleOf } from './model.ts';
import type { Exchange, Scope, World } from './model.ts';

// One state as a picture, in two halves that each stand alone. Left, the last thing sent: who sent
// it, a slot for each proof (who is asking, and what the account allows) and the Company's answer.
// Right, what that left behind: what the Company knows, and what the agent holds.
//
// Every label is at least 0.66 units high, about 15 px on a 358 px stage: a phone shows the whole
// picture, and while a reader presses events it shows nothing else, so no label here may depend on
// a close-up to be read. The scene draws no heading on the stage, which gives the picture the
// stage's full height; the page prints each step's title and line under the picture. That is why
// the picture says "read+write" where the words say orders:read orders:write, and why the
// request's method and path, and the rule of the draft that decided the answer, are in the
// picture's words (sayWorld) rather than drawn.

const PHRASE: Record<number, string> = { 200: 'OK', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };
const scopesOf = (scopes: readonly Scope[]) => scopes.join(' ');
/** Scopes in one short line of the slip: "orders: read, write". */
const onSlip = (scopes: readonly Scope[]) => `orders: ${scopes.map((scope) => scope.split(':')[1]).join(', ')}`;
/** Scopes in the few characters a ledger row has. */
const briefly = (scopes: readonly Scope[]) => (scopes.length > 1 ? 'read+write' : 'read only');

type Tone = 'good' | 'bad' | 'plain';
type Slot = { label: string; value: string; tone: Tone; sent: boolean };
/** The words of the left half: who sent what, the two slots, and what came back. */
export type Slip = { sender: string; asks: string; who: Slot; what: Slot; status: { code: string; outcome: string; tone: Tone } | null };

/** What the last exchange put on the slip, in the reader's words. */
export function slipOf(w: World): Slip {
  const last: Exchange | null = w.last;
  const header = 'Session header: who', token = 'Access token: what';
  if (!last)
    return {
      sender: 'Your agent has',
      asks: 'sent nothing yet',
      who: { label: header, value: 'not sent', tone: 'plain', sent: false },
      what: { label: token, value: 'not sent', tone: 'plain', sent: false },
      status: null,
    };
  if (last.kind === 'sign-in')
    return {
      sender: 'At the Company, you',
      asks: 'sign in',
      who: { label: 'Who is asking', value: 'you, not the agent', tone: 'plain', sent: true },
      what: { label: 'What you approve', value: onSlip(last.granted), tone: 'good', sent: true },
      status: { code: 'Approved', outcome: 'agent gets tokens', tone: 'good' },
    };
  if (last.kind === 'revoke')
    return {
      sender: 'Your agent asks to',
      asks: 'sign out',
      who: { label: 'Who is asking', value: AGENT.name, tone: 'plain', sent: true },
      what: { label: 'What it gives up', value: 'its refresh token', tone: 'plain', sent: true },
      status: { code: '200 OK', outcome: 'access has ended', tone: 'plain' },
    };
  const { status, needs } = last.answer, thief = last.by === 'thief';
  const outcome =
    status === 200 ? { cart: 'added to the cart', order: 'here is order 1042', exchange: 'exchange is made' }[last.op]
    : status === 401 ? `needs ${needs}`
    : status === 403 ? `lacks ${needs}`
    : (last.answer.error ?? 'refused');
  return {
    sender: thief ? 'A thief asks to' : 'Your agent asks to',
    asks: { cart: 'add to cart', order: 'see the order', exchange: 'exchange the jacket' }[last.op],
    who: { label: header, value: thief ? THIEF.name : AGENT.name, tone: thief ? 'bad' : 'plain', sent: true },
    what: { label: token, value: last.token ? (thief ? 'the agent’s, copied' : onSlip(w.approves)) : 'none sent', tone: last.token && !thief ? 'good' : 'plain', sent: last.token },
    status: { code: `${status} ${PHRASE[status]}`, outcome, tone: status === 200 ? 'good' : 'bad' },
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

/** What the agent holds that sign-in changes: a refresh token, once the User approves. */
export function heldBy(w: World): [string, string][] {
  return [['Refresh token', w.grant ? 'held' : 'none']];
}

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World): string {
  const last = w.last, scopes = scopesOf(w.approves), rule = ruleOf(last);
  const sent = !last ? 'Nothing has been sent yet.'
    : last.kind === 'sign-in' ? `You signed in on the Company’s own page and approved ${scopesOf(last.granted)}.`
    : last.kind === 'revoke' ? 'The agent revoked its refresh token.'
    : `${last.by === 'thief' ? 'A thief' : 'The agent'} sent ${OPERATIONS[last.op].method} ${OPERATIONS[last.op].path} with a Session header signed by ${last.by === 'thief' ? THIEF.name : AGENT.name} and ${
        last.token ? (last.by === 'thief' ? 'the agent’s copied access token' : `an access token for ${scopes}`) : 'no access token'
      }; the Company answered ${last.answer.status}${last.answer.error ? ` ${last.answer.error}` : ''}${last.answer.needs ? `, naming ${last.answer.needs}` : ''}.`;
  const known = w.started
    ? `The Company knows ${AGENT.name}, User ID ${USER_IDS[COMPANY.domain]} and Session ${SID}, whose cart ${w.cart ? 'holds the medium' : 'is empty'}; the account is ${
        w.linked === 'yes' ? `linked for ${scopes}` : w.linked === 'no' ? 'not linked' : 'signed out'
      }.`
    : 'The Company knows nothing yet.';
  return `${sent} ${known} The agent holds ${w.grant ? `a refresh token for ${scopes}` : 'no refresh token'}. The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

/** Each half is HALF wide, its inner edge GAP / 2 from the middle; text sits PAD inside a box. */
const HALF = 7.3, GAP = 0.9, PAD = 0.28, TOP = 4.2, BOTTOM = -4.2;
const LABEL = 0.66, VALUE = 0.72, TITLE = 0.7;

/** The state as its picture: the last exchange on the left, what it left behind on the right. */
export function drawWorld(w: World, s: Stage): Group {
  const { ink, soft, good, bad, emphasis, raised, rule: hairline, paper } = s.look, shaping = s.scene.textShaping;
  const parts = keyedParts();
  const tone = (t: Tone) => (t === 'good' ? good : t === 'bad' ? bad : ink);
  const text = (key: string, value: string, at: [number, number], o: { size: number; color?: string; bold?: boolean; end?: boolean }) =>
    parts.add(
      new Text(value, { fontSize: o.size, color: o.color ?? ink, shaping, anchor: o.end ? 'end' : 'start', ...(o.bold ? { weight: 'bold' as const } : {}) }).moveTo(at, [o.end ? 1 : -1, 0]),
      key,
    );
  const box = (key: string, left: number, top: number, bottom: number, o: { stroke?: string; fill?: string; fillOpacity?: number; strokeWidth?: number } = {}) =>
    parts.add(
      new Rectangle({ width: HALF, height: top - bottom, stroke: o.stroke ?? hairline, strokeWidth: o.strokeWidth ?? 0.04, fill: o.fill ?? raised, fillOpacity: o.fillOpacity ?? 1, cornerRadius: 0.18 }).moveTo([left + HALF / 2, (top + bottom) / 2]),
      key,
    );

  // Left: the last exchange.
  const slip = slipOf(w), x = -GAP / 2 - HALF;
  text('slip:sender', slip.sender, [x, TOP - 0.4], { size: LABEL, color: soft });
  text('slip:asks', slip.asks, [x, TOP - 1.25], { size: 0.74, bold: true });
  ([['who', slip.who, 2.4], ['what', slip.what, 0.35]] as const).forEach(([key, slot, top]) => {
    const frame = box(`slip:${key}:box`, x, top, top - 1.9, { stroke: slot.sent ? tone(slot.tone) : hairline, fill: slot.sent ? raised : paper, strokeWidth: slot.sent ? 0.07 : 0.04 });
    if (!slot.sent) frame.style.dashArray = '0.22 0.16';
    text(`slip:${key}:label`, slot.label, [x + PAD, top - 0.52], { size: LABEL, color: soft });
    text(`slip:${key}:value`, slot.value, [x + PAD, top - 1.36], { size: VALUE, color: slot.sent ? tone(slot.tone) : soft });
  });
  if (slip.status) {
    const colour = tone(slip.status.tone), plain = slip.status.tone === 'plain';
    emphasised(box('slip:answer:box', x, -1.7, BOTTOM, { stroke: colour, fill: plain ? raised : colour, fillOpacity: plain ? 1 : 0.1, strokeWidth: 0.08 }), `the answer: ${slip.status.code}, ${slip.status.outcome}`);
    text('slip:answer:code', slip.status.code, [x + PAD, -2.42], { size: 0.78, bold: true, color: colour });
    text('slip:answer:outcome', slip.status.outcome, [x + PAD, -3.48], { size: 0.68 });
  } else {
    box('slip:answer:box', x, -1.7, BOTTOM, { fill: paper }).style.dashArray = '0.22 0.16';
    text('slip:answer:code', 'No answer yet', [x + PAD, -2.95], { size: VALUE, color: soft });
  }

  // Right: what the exchange left behind. A value it changed is drawn in the emphasis colour and marked.
  const last = w.last, request = last?.kind === 'request' && last.by === 'agent' && last.answer.error !== 'invalid_session' ? last : null;
  const r = GAP / 2, pitch = 1.14;
  const ledger = (key: string, title: string, rows: [string, string][], top: number, changed: (label: string) => boolean) => {
    text(`${key}:title`, title, [r, top - 0.4], { size: TITLE, bold: true });
    box(`${key}:panel`, r, top - 0.92, top - 0.92 - rows.length * pitch - 0.08);
    rows.forEach(([label, value], i) => {
      const y = top - 0.92 - 0.61 - i * pitch, quiet = ['none', 'none yet', 'not met yet', 'not linked'].includes(value);
      text(`${key}:${label}:label`, label, [r + PAD, y], { size: LABEL, color: soft });
      const shown = text(`${key}:${label}:value`, value, [r + HALF - PAD, y], { size: LABEL, color: quiet ? soft : changed(label) ? emphasis : ink, end: true });
      if (changed(label)) emphasised(shown, `changed: ${label} is now ${value}`);
    });
  };
  ledger('company', 'The Company knows', knownBy(w), TOP, (label) => !!request && (label === 'Account' ? request.token : label === 'Session' && request.op === 'cart'));
  ledger('agent', 'Your agent holds', heldBy(w), BOTTOM + 0.92 + pitch + 0.08, () => last?.kind === 'sign-in');
  return parts.group();
}
