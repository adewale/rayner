import { Circle, Group, Polygon, Rectangle, keyed as keyedAs } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, RADIUS, STROKE, TONE, TYPE,
  addAll, barrier, codeSlip, counter, key, person, seal, station, ticket, words,
} from '../lib/poppy-kit.ts';
import type { Parts } from '../lib/poppy-kit.ts';
import { SID, USER_IDS } from '../poppy/model.ts';
import { CARDS, DEVICE, OTHER, ruleOf } from './model.ts';
import type { Flow, OfferedScope, Scope, World } from './model.ts';

// One state as a picture, on the series' kit. The idea is a hatch in the Company's counter. Top
// left is your browser (Direct Sign-In) or your phone (Device Sign-In); the page in it is drawn in
// the Company's tone and runs out through the window's edge into the counter, so the page is the
// Company's ground, reached through your window. Your password goes into that page and no further.
// Behind the counter, the scopes example.com offers, each on the same row as its line on the page;
// a scope the agent holds carries a brass tooth, one tooth per scope, as its key does. Under the
// window, you with your password, and what the agent has handed you (Device: the code to type) or
// what has arrived for the agent (a swapped code). Bottom left the agent: its station, holding its
// seal and its key, and the tag beside it, the refresh token that brings new keys. Bottom right,
// what happened last, in words.
//
// Colours are the kit's, each with one meaning: WAX the agent's seal, BRASS a key and its teeth,
// PEWTER what is someone else's, INK what is in use, STEEL what is idle. Outcomes are said by place,
// a barrier and words. Every label is at least TYPE.small. Full URLs and the rule of the draft that
// decided the picture are in its words (sayWorld), not drawn.

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;
/** What a step shows that is not the model: step 1's picture of the password shortcut. */
export type Shown = { password: boolean };

// The picture's geometry, shared with the scene's transitions.
const WIN = { left: MARGIN.left, right: -1.3, top: MARGIN.top, bottom: -0.22, bar: 0.86 } as const;
/** The counter's face, and its lower end, where the agent deals with the token endpoint. */
export const FACE = -0.6;
const COUNTER_BOTTOM = -1.5;
/** Where the agent's requests to the token endpoint, revocation and polls, meet the counter. */
export const DESK: Vec = [FACE - 0.2, -1.05];
/** Rows shared by the page and the scope rack, so a line on the page and its scope sit side by side. */
const ROW = { title: 2.76, field: 1.96, 'orders:read': 1.08, 'orders:write': 0.26 } as const;
const RACK: readonly OfferedScope[] = ['addresses', 'orders:read', 'orders:write'];
const RACK_Y: Record<string, number> = { addresses: ROW.field, 'orders:read': ROW['orders:read'], 'orders:write': ROW['orders:write'] };
const RACK_X = 0.95, TOOTH_X = 0.42;
const PAGE_X = WIN.left + 0.3;
const LINE: Record<Scope, string> = { 'orders:read': 'See your orders', 'orders:write': 'Exchange items' };
/** The strip under the window: you, your password, and the slip or card between you and the agent. */
const STRIP_Y = -1.2;
export const YOU_AT: Vec = [-7.2, STRIP_Y];
export const PASSWORD_AT: Vec = [-6.0, STRIP_Y];
export const SLIP_AT: Vec = [-3.55, STRIP_Y];
/** The agent's station, bottom left. */
const STATION: Vec = [-6.3, -2.86];
const STATION_R = 0.72;
export const SEAL_AT: Vec = STATION;
/** The agent's keyring, beside its station: the ring, the key on it, and the tag on a cord below. */
const RING_AT: Vec = [-5.22, -2.2];
export const KEY_AT: Vec = [-3.86, -2.2];
const KEY_SIZE = 1.15;
export const TAG_AT: Vec = [-2.3, -3.48];
export const THIEF_AT: Vec = [-1.2, STRIP_Y];
/** Where the address bar is: an authorization request arrives there. */
export const ADDRESS_AT: Vec = [(WIN.left + WIN.right) / 2, WIN.top - WIN.bar / 2];
/** Where a code leaves the page for the agent's redirect. */
export const PAGE_OUT: Vec = [-2.4, 0.0];
/** Where the readout starts: behind the counter, under the scopes. */
const READ_X = 0.4, READ_Y = -1.62;

const scopesOf = (scopes: readonly Scope[]) => scopes.join(' ');
const briefly = (scopes: readonly Scope[]) => (scopes.length > 1 ? 'both scopes' : 'orders:read only');

/** The words at the bottom right: who did what, the outcome in a phrase, and what it means. */
export type Report = { asked: string; phrase: string; meaning: string; mono?: boolean };
export function reportOf(w: World, shown: Shown): Report | null {
  if (shown.password) return { asked: 'agent: types your password', phrase: 'Looks like you', meaning: 'it can only be blocked' };
  const last = w.last;
  if (!last) return null;
  switch (last.kind) {
    case 'ask':
      return w.flow === 'direct'
        ? { asked: 'agent: opens the page', phrase: 'Asked', meaning: 'on example.com’s own page' }
        : { asked: 'agent: shows you a code', phrase: 'Asked', meaning: 'its link checked first' };
    case 'approve':
      return { asked: 'you: sign in and approve', phrase: 'Approved', meaning: briefly(last.approved) };
    case 'pending':
      return { asked: 'agent: polls the Company', phrase: 'Not yet', meaning: 'authorization_pending', mono: true };
    case 'tokens':
      return last.replaced
        ? { asked: 'you: approve again', phrase: 'Old tag replaced', meaning: `${CARDS[w.holds!.card === 0 ? 1 : 0]} revoked`, mono: true }
        : { asked: w.flow === 'direct' ? 'agent: redeems the code' : 'agent: polls again', phrase: `Key cut: ${last.granted.length === 1 ? '1 tooth' : '2 teeth'}`, meaning: last.saysScope ? `scope: ${scopesOf(last.granted)}` : 'every scope asked', mono: last.saysScope };
    case 'trick':
      return w.flow === 'direct'
        ? { asked: 'a code from shoes.example', phrase: 'Rejected', meaning: 'iss: not example.com' }
        : { asked: 'a link on another host', phrase: 'Not shown', meaning: 'auth.shoes.example', mono: true };
    case 'thief':
      return { asked: 'thief: refresh with a copy', phrase: 'Refused', meaning: last.error, mono: true };
    case 'sign-out':
      return { asked: 'agent: sign out', phrase: 'Revoked', meaning: 'the Session carries on' };
    case 'disconnect':
      return { asked: 'you: disconnect it', phrase: 'Disconnected', meaning: 'you keep your account' };
  }
}

/** The scope rack's status word for a scope: what the sign-in waiting says of it, else whether the agent holds it. */
function statusOf(w: World, scope: OfferedScope): string {
  if (scope !== 'orders:read' && scope !== 'orders:write') return '';
  if (w.sign) return w.sign.approved ? (w.sign.approved.includes(scope) ? 'approved' : 'not now') : 'asked';
  return w.holds?.scopes.includes(scope) ? 'granted' : '';
}

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World, shown: Shown): string {
  if (shown.password)
    return 'The shortcut. Your agent holds your password and types it into example.com’s own sign-in page. The Company sees you, not an agent: it cannot limit what the agent does, and can only stop it by blocking it entirely. The rule, from section 10.5 of the draft: an agent that signs in with your credentials looks like you.';
  const device = w.flow === 'device', rule = ruleOf(w), last = w.last;
  const frame = device ? 'your phone, open at auth.example.com/device' : 'your browser, open at auth.example.com';
  const page = !w.sign
    ? `No sign-in page is open in ${device ? 'your phone' : 'your browser'}.`
    : w.sign.approved
      ? `The Company’s page in ${frame} holds your password, and you approved ${scopesOf(w.sign.approved)}${w.sign.approved.length === 1 ? ' and left orders:write unticked' : ''}.`
      : `The Company’s page in ${frame} asks you to sign in and approve orders:read and orders:write; your password is still with you.`;
  const card = device && w.sign && !w.sign.approved ? ` The agent has shown you the link and the code ${DEVICE.user_code}, with Example Company and example.com beside them.` : '';
  const held = w.holds
    ? `The agent holds a key with ${w.holds.scopes.length === 1 ? 'one tooth, for orders:read' : 'two teeth, for orders:read and orders:write'}, and the refresh token ${CARDS[w.holds.card]}.`
    : `The agent holds no key and no refresh token${w.ended ? ': it is signed out, and its Session goes on' : ''}.`;
  const said = !last ? 'Nothing has happened yet.'
    : last.kind === 'ask' ? (device ? `The agent asked for a code for orders:read and orders:write, checked that the link’s host is the Company’s, and showed it to you.` : 'The agent opened the Company’s authorization page in your browser, asking for orders:read and orders:write, with a PKCE challenge.')
    : last.kind === 'approve' ? `You signed in on the Company’s page and approved ${scopesOf(last.approved)}.`
    : last.kind === 'pending' ? 'The agent polled the token endpoint with its client assertion and got authorization_pending.'
    : last.kind === 'tokens' ? (last.replaced
        ? 'A new sign-in brought a new key and a new refresh token, which replaces the old one; the agent revoked the old one, which is not signing out.'
        : `${device ? 'The agent’s next poll' : 'Your browser brought a one-time code to the agent’s registered redirect; the agent checked iss and redeemed the code with its client assertion and PKCE verifier, and the token endpoint'} returned a key cut for ${scopesOf(last.granted)}${last.saysScope ? ', its scope saying so' : ''}.`)
    : last.kind === 'trick' ? `${device ? `The agent was offered a link on ${OTHER.issuer.slice(8)}` : `A response from ${OTHER.domain}’s sign-in reached the agent’s redirect`} and rejected it: ${last.reason}.`
    : last.kind === 'thief' ? `A thief sent a copy of the refresh token with its own client assertion and got ${last.error}: ${last.reason}.`
    : last.kind === 'sign-out' ? 'The agent revoked every refresh token it held for your account.'
    : 'You disconnected the agent in your account settings at example.com, which revoked its refresh tokens.';
  return `${page}${card} ${held} ${said} The Session ${SID} and User ID ${USER_IDS['example.com']} are untouched by sign-in. The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

// ---------------------------------------------------------------------------------------------
// Objects this chapter needs that the kit lacks, drawn in its vocabulary.

/** A filled outline. */
const outline = (points: Vec[], fill: string) => new Polygon(points, { fill, stroke: 'none' });

/**
 * A key tag, the refresh token: a PAPER luggage tag with a cut corner at the hole end, a punched
 * hole ringed in brass, and its value printed in mono. Width fits the value; 0.8 high.
 * With `value` null, the same tag blank (a copy seen from afar). One unkeyed Group.
 */
export function tag(s: Stage, { at, value, foreign = false }: { at: Vec; value: string | null; foreign?: boolean }): Group {
  const text = value ? words(s, value, { mono: true, bold: true, color: TONE.print }) : null;
  const name = value ? words(s, 'refresh token', { color: TONE.print }) : null;
  const w = text && name ? Math.max(text.width(), name.width()) + 1.0 : 1.0, h = value ? 1.44 : 0.8, [x, y] = at, l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2, cut = 0.3;
  const parts: Mobject[] = [
    outline([[l + cut, t], [r - RADIUS.ticket, t], [r, t - RADIUS.ticket], [r, b + RADIUS.ticket], [r - RADIUS.ticket, b], [l + cut, b], [l, y - 0.12], [l, y + 0.12]], TONE.paper),
    new Circle({ radius: 0.12, fill: TONE.ground, stroke: foreign ? TONE.pewterDeep : TONE.brassDeep, strokeWidth: STROKE.fine }).moveTo([l + 0.3, value ? t - 0.3 : y]),
  ];
  if (text && name) parts.push(name.moveTo([l + 0.62, y + 0.36], [-1, 0]), text.moveTo([l + 0.62, y - 0.36], [-1, 0]));
  if (foreign) parts.push(seal(s, { at: [r - 0.38, y], r: 0.26, foreign: true }));
  return new Group(...parts);
}

/** A password card: a small PAPER card with six PRINT dots, the secret you type. One unkeyed Group. */
export function passwordCard(_s: Stage, { at }: { at: Vec }): Group {
  return new Group(
    new Rectangle({ width: 1.3, height: 0.6, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo(at),
    ...dots([at[0] - 0.4, at[1]], TONE.print),
  );
}
const dots = (from: Vec, colour: string) => Array.from({ length: 6 }, (_, i) => new Circle({ radius: 0.07, fill: colour, stroke: 'none' }).moveTo([from[0] + i * 0.16, from[1]]));

/** A key's tooth, as the rack marks a scope the agent holds: BRASS, 0.22 wide, with a cut tip. */
function tooth(at: Vec): Mobject {
  const [x, y] = at;
  return outline([[x - 0.14, y + 0.3], [x + 0.14, y + 0.3], [x + 0.14, y - 0.18], [x + 0.05, y - 0.3], [x - 0.14, y - 0.3]], TONE.brass);
}

/** A tick box: RAISED with an INK outline; ticked, an INK check mark drawn as a filled stroke. */
function box(at: Vec, ticked: boolean): Mobject[] {
  const [x, y] = at, frame = new Rectangle({ width: 0.42, height: 0.42, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: 0.06 }).moveTo(at);
  if (!ticked) return [frame];
  const mark = outline([[x - 0.15, y + 0.01], [x - 0.08, y + 0.08], [x - 0.03, y - 0.03], [x + 0.13, y + 0.15], [x + 0.19, y + 0.08], [x - 0.03, y - 0.16]], TONE.ink);
  return [new Group(frame, mark)];
}

/** The display card the agent shows for Device Sign-In: the code in mono bold, the Company's domain under it. */
function deviceCard(s: Stage, at: Vec, foreign: boolean): Group {
  const w = 3.4, h = 1.42, [x, y] = at;
  if (foreign)
    return new Group(
      new Rectangle({ width: w, height: h, fill: TONE.pewterDeep, stroke: TONE.pewter, strokeWidth: STROKE.fine, cornerRadius: RADIUS.ticket }).moveTo(at),
      ...[-0.9, -0.3, 0.3, 0.9].map((dx) => new Rectangle({ width: 0.42, height: 0.08, fill: TONE.pewter, stroke: 'none', cornerRadius: 0.04 }).moveTo([x + dx, y])),
    );
  return new Group(
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.ticket }).moveTo(at),
    words(s, DEVICE.user_code, { at: [x, y + 0.32], mono: true, bold: true, color: TONE.print, align: 'middle' }),
    words(s, 'Example Company', { at: [x, y - 0.36], color: TONE.print, align: 'middle' }),
  );
}

/** A request on its way, for the transitions: the kit's ticket, stamped with the agent's seal. */
export const requestToken = (s: Stage): Mobject => ticket(s, {});
/** A one-time code on its way to the agent, with the stub of the PKCE ticket riding on it. */
export const codeToken = (s: Stage): Mobject => codeSlip(s, { code: 'c_5Rm2' });

// ---------------------------------------------------------------------------------------------
// The picture

/** The window or phone the Company's page shows in, and the page itself, joined to the counter. */
function hatch(s: Stage, parts: Parts, flow: Flow, host: string, open = true) {
  const w = WIN.right - WIN.left, h = WIN.top - WIN.bottom, cx = (WIN.left + WIN.right) / 2, cy = (WIN.top + WIN.bottom) / 2;
  const device = flow === 'device';
  const address = words(s, host, { mono: true, at: [cx, WIN.top - WIN.bar / 2], align: 'middle', color: open ? TONE.ink : TONE.soft });
  const frame: Mobject[] = [
    new Rectangle({ width: w, height: h, fill: TONE.ground, stroke: open ? TONE.ink : TONE.steel, strokeWidth: device ? STROKE.line : STROKE.fine, cornerRadius: device ? RADIUS.device : RADIUS.panel }).moveTo([cx, cy]),
    new Rectangle({ width: address.width() + 0.5, height: 0.6, fill: TONE.raised, stroke: 'none', cornerRadius: 0.3 }).moveTo([cx, WIN.top - WIN.bar / 2]),
  ];
  if (device) frame.push(new Rectangle({ width: 0.07, height: 0.5, fill: TONE.steel, stroke: 'none', cornerRadius: 0.035 }).moveTo([WIN.left + 0.13, cy - 0.3]));
  parts.add(new Group(...frame), 'window:frame');
  parts.add(address, 'window:host');
  // The page, in the Company's tone, running out through the window's right edge into the counter.
  if (!open) return;
  const pageTop = WIN.top - WIN.bar - 0.08, pageBottom = WIN.bottom + 0.14, pageLeft = WIN.left + (device ? 0.3 : 0.14);
  parts.add(new Group(
    new Rectangle({ width: WIN.right - pageLeft, height: pageTop - pageBottom, fill: TONE.raised, stroke: 'none', cornerRadius: 0.08 }).moveTo([(pageLeft + WIN.right) / 2, (pageTop + pageBottom) / 2]),
    new Rectangle({ width: FACE - WIN.right + 0.24, height: 2.3, fill: TONE.raised, stroke: 'none' }).moveTo([(WIN.right + FACE) / 2 - 0.06, pageBottom + 1.15]),
  ), 'window:page');
}

/** The state as its picture. */
export function drawWorld(w: World, shown: Shown, s: Stage): Group {
  const parts = keyedParts();
  if (shown.password) return drawShortcut(s, parts);
  const report = reportOf(w, shown), last = w.last, device = w.flow === 'device';

  // Top left: your browser or phone, with the Company's page in it when a sign-in is open.
  hatch(s, parts, w.flow, 'auth.example.com', !!w.sign);
  addAll(parts, counter(s, { x: FACE, top: MARGIN.top, bottom: COUNTER_BOTTOM }));
  if (w.sign) {
    parts.add(words(s, 'Example Company', { at: [PAGE_X, ROW.title], bold: true }), 'page:title');
    parts.add(new Rectangle({ width: 3.9, height: 0.6, fill: TONE.ground, stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: 0.1 }).moveTo([PAGE_X + 1.95, ROW.field]), 'page:field');
    if (w.sign.approved) {
      const typed = parts.add(new Group(...dots([PAGE_X + 0.3, ROW.field], TONE.ink)), 'page:password');
      if (last?.kind === 'approve') emphasised(typed, 'changed: your password is on the Company’s page');
    } else parts.add(words(s, 'password', { at: [PAGE_X + 0.24, ROW.field], color: TONE.soft }), 'page:hint');
    for (const scope of ['orders:read', 'orders:write'] as const) {
      const ticked = !!w.sign.approved?.includes(scope);
      parts.add(box([PAGE_X + 0.21, ROW[scope]], ticked)[0]!, `page:${scope}:box`);
      parts.add(words(s, LINE[scope], { at: [PAGE_X + 0.66, ROW[scope]] }), `page:${scope}:line`);
    }
  } else parts.add(words(s, 'no sign-in open', { at: [(WIN.left + WIN.right) / 2, 1.2], size: TYPE.label, color: TONE.soft, align: 'middle' }), 'page:closed');

  // Behind the counter: the scopes the Company offers, each on its page line's row. A tooth for each the agent holds.
  parts.add(words(s, 'The Company', { at: [RACK_X, WIN.top - WIN.bar / 2], size: TYPE.label, bold: true }), 'company');
  parts.add(words(s, 'Scopes offered', { at: [RACK_X, ROW.title], color: TONE.soft }), 'rack:title');
  for (const scope of RACK) {
    const y = RACK_Y[scope]!, status = statusOf(w, scope), asked = !!w.sign && scope !== 'addresses';
    parts.add(words(s, scope, { at: [RACK_X, y], mono: true, color: asked || status === 'granted' ? TONE.ink : TONE.soft, bold: asked }), `rack:${scope}:name`);
    if (status) {
      const word = parts.add(words(s, status, { at: [MARGIN.right, y], align: 'end', color: status === 'not now' ? TONE.soft : TONE.ink }), `rack:${scope}:status`);
      if (last?.kind === 'approve' || last?.kind === 'tokens') emphasised(word, `changed: ${scope} is ${status}`);
    }
    if (w.holds?.scopes.includes(scope as Scope)) parts.add(tooth([TOOTH_X, y]), `rack:${scope}:tooth`);
  }
  parts.add(words(s, 'can’t be undone', { at: [RACK_X, ROW['orders:write'] - 0.7], color: TONE.soft }), 'rack:hint');

  // The strip under the window: you; your password unless it is on the page; the card or slip in between.
  parts.add(person(s, { at: YOU_AT, size: 0.86 }), 'you');
  if (!w.sign?.approved) parts.add(passwordCard(s, { at: PASSWORD_AT }), 'you:password');
  if (device && w.sign && !w.sign.approved) parts.add(deviceCard(s, SLIP_AT, false), 'card');
  if (last?.kind === 'trick') {
    parts.add(barrier(s, { at: [SLIP_AT[0] - 2.1, SLIP_AT[1]], height: 1.0 }), 'barrier');
    parts.add(device ? deviceCard(s, [SLIP_AT[0] + 0.15, SLIP_AT[1]], true) : swappedSlip(s, [SLIP_AT[0] - 0.2, SLIP_AT[1]]), 'trick');
  }

  // Bottom left: the agent, its seal, and its keyring: the key (access token) and the tag (refresh token).
  addAll(parts, station(s, { at: STATION, r: STATION_R }));
  const ring = keyring(s, w.holds ? w.holds.scopes.length : 0, w.holds ? CARDS[w.holds.card] : null);
  const held = ring.find((m) => m.key === 'agent:key');
  if (held && last?.kind === 'tokens') emphasised(held, `changed: the agent holds a key for ${scopesOf(w.holds!.scopes)}`);
  addAll(parts, ring);
  if (last?.kind === 'thief') parts.add(tag(s, { at: THIEF_AT, value: null, foreign: true }), 'thief');

  // Bottom right: what happened last.
  readout(s, parts, report);
  return parts.group();
}

/**
 * The agent's keyring beside its station: a brass ring on a short bar from the station; on it the
 * key (with one tooth per scope it holds, or the empty slot for one) and, on a cord, the tag.
 * Keyed parts: `agent:ring`, `agent:key:slot`, `agent:key`, `tag:cord`, `tag`.
 */
function keyring(s: Stage, teeth: number, card: string | null): Mobject[] {
  const EDGE = STATION[0] + Math.sqrt(Math.max(0, STATION_R ** 2 - (RING_AT[1] - STATION[1]) ** 2)) - 0.04;
  const keyed = <T extends Mobject>(m: T, k: string): T => keyedAs(m, k);
  const out: Mobject[] = [
    keyed(new Group(
      new Rectangle({ width: RING_AT[0] - 0.2 - EDGE + 0.04, height: 0.08, fill: TONE.brassDeep, stroke: 'none' }).moveTo([(RING_AT[0] - 0.2 + EDGE) / 2, RING_AT[1]]),
      new Circle({ radius: 0.2, fill: 'none', stroke: TONE.brass, strokeWidth: STROKE.line }).moveTo(RING_AT),
    ), 'agent:ring'),
    keyed(key(s, { at: KEY_AT, size: KEY_SIZE, teeth: Math.max(1, teeth), ghost: true }), 'agent:key:slot'),
  ];
  if (teeth > 0) out.push(keyed(key(s, { at: KEY_AT, size: KEY_SIZE, teeth }), 'agent:key'));
  if (card) {
    const t = tag(s, { at: TAG_AT, value: card }), hole: Vec = [t.center()[0]! - t.width() / 2 + 0.3, TAG_AT[1] + 0.72 - 0.3];
    const from: Vec = [RING_AT[0], RING_AT[1] - 0.2];
    const dx = hole[0] - from[0], dy = hole[1] - from[1], len = Math.hypot(dx, dy), nx = (-dy / len) * 0.035, ny = (dx / len) * 0.035;
    out.push(keyed(outline([[from[0] + nx, from[1] + ny], [hole[0] + nx, hole[1] + ny], [hole[0] - nx, hole[1] - ny], [from[0] - nx, from[1] - ny]], TONE.brassDeep), 'tag:cord'));
    out.push(keyed(t, 'tag'));
  }
  return out;
}

/** A code slip from another Company's sign-in: the kit's slip, with a PEWTER issuer stamp: someone else's. */
function swappedSlip(s: Stage, at: Vec): Group {
  const slip = codeSlip(s, { at, code: 'c_9Zt4' });
  return new Group(slip, seal(s, { at: [at[0] + 1.55, at[1] + 0.25], r: 0.3, foreign: true }));
}

/** The readout: who did what in SOFT, the phrase in TYPE.title bold, and what it means. */
function readout(s: Stage, parts: Parts, report: Report | null) {
  if (!report) {
    parts.add(words(s, 'nothing asked yet', { at: [READ_X, READ_Y - 1.2], size: TYPE.label, color: TONE.soft }), 'answer:phrase');
    return;
  }
  parts.add(words(s, report.asked, { at: [READ_X, READ_Y], color: TONE.soft }), 'answer:asked');
  emphasised(parts.add(words(s, report.phrase, { at: [READ_X, READ_Y - 1.05], size: TYPE.title, bold: true }), 'answer:phrase'), `the outcome: ${report.phrase}, ${report.meaning}`);
  parts.add(words(s, report.meaning, { at: [READ_X, READ_Y - 1.85], mono: !!report.mono }), 'answer:meaning');
}

/** Step 1's picture: the shortcut, the agent typing your password into the website. */
function drawShortcut(s: Stage, parts: Parts): Group {
  hatch(s, parts, 'direct', 'example.com');
  addAll(parts, counter(s, { x: FACE, top: MARGIN.top, bottom: COUNTER_BOTTOM }));
  parts.add(words(s, 'Sign in', { at: [PAGE_X, ROW.title], bold: true }), 'page:title');
  parts.add(new Rectangle({ width: 3.9, height: 0.6, fill: TONE.ground, stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: 0.1 }).moveTo([PAGE_X + 1.95, ROW.field]), 'page:field');
  parts.add(new Group(...dots([PAGE_X + 0.3, ROW.field], TONE.ink)), 'page:password');
  parts.add(words(s, 'typed by your agent', { at: [PAGE_X, ROW['orders:read']], color: TONE.soft }), 'page:by');
  // Behind the counter: who the Company sees.
  parts.add(words(s, 'The Company sees', { at: [RACK_X, ROW.title], bold: true }), 'sees:title');
  parts.add(person(s, { at: [RACK_X + 0.55, 1.45], size: 1.2 }), 'sees:you');
  parts.add(words(s, 'you', { at: [RACK_X + 1.45, 1.45], size: TYPE.title, bold: true }), 'sees:who');
  parts.add(words(s, 'not your agent', { at: [RACK_X, 0.2], color: TONE.soft }), 'sees:not');
  // You, with nothing in hand; the agent, holding your password.
  parts.add(person(s, { at: YOU_AT, size: 0.86 }), 'you');
  addAll(parts, station(s, { at: STATION, r: STATION_R }));
  // On the agent's keyring, where a key would hang, your password.
  addAll(parts, keyring(s, 0, null).filter((m) => m.key !== 'agent:key:slot'));
  parts.add(passwordCard(s, { at: [RING_AT[0] + 0.85, RING_AT[1]] }), 'agent:password');
  parts.add(words(s, 'your password', { at: [RING_AT[0] + 1.7, RING_AT[1]], color: TONE.soft }), 'agent:password:label');
  readout(s, parts, reportOf({ flow: 'direct', sign: null, holds: null, ended: false, last: null }, { password: true }));
  return parts.group();
}

