import { Circle, Group, Polygon, Rectangle, keyed as keyedAs } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import {
  MARGIN, PALETTE as KIT_PALETTE, RADIUS, STROKE, TONE, TYPE,
  addAll, barrier, codeSlip, counter, key, person, phone, seal, station, ticket, words,
} from '../lib/poppy-kit.ts';
import type { Parts } from '../lib/poppy-kit.ts';
import { SID, USER_IDS } from '../poppy/model.ts';
import { CARDS, DEVICE, OTHER, ruleOf } from './model.ts';
import type { Flow, OfferedScope, Scope, World } from './model.ts';

// One state as a picture, on the series' kit. The idea is a hatch in the Company's counter. While a
// sign-in is open, the top left is your browser (Direct Sign-In) or your phone, upright (Device
// Sign-In); the page in it is drawn in the Company's tone and runs out through the window's edge into
// the counter, so the page is the Company's ground, reached through your window. Your password card
// goes into that page and no further. When no sign-in is open the page is gone, and the agent's
// keyring takes its place: the key large enough to count its teeth, the refresh-token tag on a cord.
// Behind the counter, the scopes example.com offers, each a row with a tooth the size of the key's,
// cut in brass when the agent holds the scope and hollow when it does not, so the key's teeth are
// the brass rows. Bottom right, what happened last, in words.
//
// Colours are the kit's, each with one meaning: WAX the agent's seal, BRASS a key and its teeth,
// PEWTER what is someone else's, INK what is in use, STEEL what is idle. Outcomes are said by place,
// a barrier and words. Every label is at least TYPE.small. Full URLs and the rule of the draft that
// decided the picture are in its words (sayWorld), not drawn.

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;
/** What a step shows that is not the model: step 1's picture of the password shortcut. */
export type Shown = { password: boolean };

// The picture's geometry, shared with the scene's transitions. Two layouts on the left half: while a
// sign-in is open, the Company's page fills the top (your browser, or your phone upright) and the
// agent stands small at the bottom; when none is open, the page is gone and the agent's keyring is
// the hero at the top, the key large enough to count its teeth, with you and your password below.
const WIN = { left: MARGIN.left, right: -1.3, top: MARGIN.top, bottom: -0.22, bar: 0.86 } as const;
/** The counter's face, and its lower end, where the agent deals with the token endpoint. */
export const FACE = -0.6;
const COUNTER_BOTTOM = -1.5;
/** Where the agent's requests to the token endpoint, revocation and polls, meet the counter. */
export const DESK: Vec = [FACE - 0.2, -1.05];
/** Rows shared by the page and the scope rack, so a line on the page and its scope sit side by side. */
type Rows = { title: number; field: number; 'orders:read': number; 'orders:write': number };
const ROWS: Record<Flow, Rows> = {
  direct: { title: 2.76, field: 1.96, 'orders:read': 1.08, 'orders:write': 0.26 },
  device: { title: 2.95, field: 2.32, 'orders:read': 1.48, 'orders:write': 0.68 },
};
const RACK: readonly OfferedScope[] = ['addresses', 'orders:read', 'orders:write'];
const rackY = (rows: Rows, scope: OfferedScope) => (scope === 'addresses' ? rows.field : rows[scope as Scope]);
const RACK_X = 1.0, TOOTH_X = 0.42;
const PAGE_X = WIN.left + 0.3;
const LINE: Record<Scope, string> = { 'orders:read': 'See your orders', 'orders:write': 'Exchange items' };
const SHORT: Record<Scope, string> = { 'orders:read': 'read', 'orders:write': 'write' };
/** The phone of Device Sign-In: the kit's phone, upright, at twice its size. */
const PHONE = { at: [-2.9, 1.95] as Vec, size: 2.0 };
const SCREEN = { left: PHONE.at[0] - 0.53 * PHONE.size, right: PHONE.at[0] + 0.53 * PHONE.size, top: PHONE.at[1] + 0.87 * PHONE.size, bottom: PHONE.at[1] - 0.83 * PHONE.size };
/** The strip under the browser window, and where a slip or card rests in it. */
const STRIP_Y = -1.06;
export const SLIP_AT: Vec = [-2.75, STRIP_Y];
/** Where you stand, and your password card, in each layout. */
type Place = { you: Vec; size: number; card: Vec };
const YOU: { direct: Place; device: Place; closed: Place } = {
  direct: { you: [-7.0, STRIP_Y], size: 1.1, card: [-5.3, STRIP_Y] },
  device: { you: [-6.5, 2.55], size: 1.3, card: [-6.2, 0.75] },
  closed: { you: [-6.9, -2.6], size: 1.2, card: [-5.0, -2.65] },
};
/** The agent's station and keyring in each layout: small at the bottom, or the hero at the top. */
type Ring = { station: Vec; ring: Vec; key: Vec; size: number; tag: Vec };
const AGENT_AT: { open: Ring; closed: Ring } = {
  open: { station: [-6.3, -2.86], ring: [-5.22, -2.2], key: [-3.86, -2.2], size: 1.15, tag: [-2.3, -3.48] },
  closed: { station: [-6.3, 2.3], ring: [-5.22, 2.6], key: [-3.02, 2.6], size: 2.0, tag: [-2.8, 0.15] },
};
const STATION_R = 0.72;
export const THIEF_AT: Vec = [-0.95, -2.1];
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
  if (shown.password) return { asked: 'agent: types your password', phrase: 'No limit on it', meaning: 'it can only be blocked' };
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
 * hole ringed in brass, "refresh token" and its value printed on it. Blank (a copy seen from afar)
 * with `value` null, stamped with another's seal when `foreign`. One unkeyed Group.
 */
export function tag(s: Stage, { at, value, foreign = false }: { at: Vec; value: string | null; foreign?: boolean }): Group {
  const text = value ? words(s, value, { mono: true, bold: true, color: TONE.print }) : null;
  const name = value ? words(s, 'refresh token', { color: TONE.print }) : null;
  const w = text && name ? Math.max(text.width(), name.width()) + 0.85 : 1.0, h = value ? 1.44 : 0.8, [x, y] = at, l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2, cut = 0.3;
  const parts: Mobject[] = [
    outline([[l + cut, t], [r - RADIUS.ticket, t], [r, t - RADIUS.ticket], [r, b + RADIUS.ticket], [r - RADIUS.ticket, b], [l + cut, b], [l, y - 0.12], [l, y + 0.12]], TONE.paper),
    new Circle({ radius: 0.12, fill: TONE.ground, stroke: foreign ? TONE.pewterDeep : TONE.brassDeep, strokeWidth: STROKE.fine }).moveTo([l + 0.3, value ? t - 0.3 : y]),
  ];
  if (text && name) parts.push(name.moveTo([l + 0.55, y + 0.36], [-1, 0]), text.moveTo([l + 0.55, y - 0.36], [-1, 0]));
  if (foreign) parts.push(seal(s, { at: [r - 0.38, y], r: 0.26, foreign: true }));
  return new Group(...parts);
}

/** Your password, as a card: PAPER, 1.8 × 0.86, six PRINT dots in a field ruled under them. One unkeyed Group. */
export function passwordCard(_s: Stage, { at }: { at: Vec }): Group {
  const [x, y] = at;
  return new Group(
    new Rectangle({ width: 1.8, height: 0.86, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.ticket }).moveTo(at),
    ...dots([x - 0.55, y + 0.05], TONE.print, 0.22, 0.09),
    new Rectangle({ width: 1.3, height: 0.04, fill: TONE.paperLine, stroke: 'none' }).moveTo([x, y - 0.22]),
  );
}
const dots = (from: Vec, colour: string, pitch = 0.16, r = 0.07) => Array.from({ length: 6 }, (_, i) => new Circle({ radius: r, fill: colour, stroke: 'none' }).moveTo([from[0] + i * pitch, from[1]]));

/**
 * A key's tooth, as the rack marks a scope: the same size as a tooth of the agent's key at its
 * largest. BRASS when the agent holds the scope; dashed STEEL, hollow, as an uncut key is, when not.
 */
function tooth(at: Vec, cut: boolean): Mobject {
  // One tooth of a key at the hero key's scale (size 2): 0.3 wide, 0.5 deep, its tip cut on one corner.
  const [x, y] = at, pts: Vec[] = [[x - 0.15, y + 0.25], [x + 0.15, y + 0.25], [x + 0.15, y - 0.17], [x + 0.07, y - 0.25], [x - 0.15, y - 0.25]];
  return cut ? outline(pts, TONE.brass) : new Polygon(pts, { fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, dashArray: '0.1 0.06' });
}

/** A tick box: an INK outline; ticked, an INK check mark drawn as a filled stroke. */
function box(at: Vec, ticked: boolean): Mobject {
  const [x, y] = at, frame = new Rectangle({ width: 0.42, height: 0.42, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: 0.06 }).moveTo(at);
  if (!ticked) return frame;
  return new Group(frame, outline([[x - 0.15, y + 0.01], [x - 0.08, y + 0.08], [x - 0.03, y - 0.03], [x + 0.13, y + 0.15], [x + 0.19, y + 0.08], [x - 0.03, y - 0.16]], TONE.ink));
}

/** The display card the agent shows for Device Sign-In: the code, and the Company's name, its right edge at `at`; or a card someone else's, face down, centred at `at`. */
function deviceCard(s: Stage, at: Vec, foreign: boolean): Group {
  const code = words(s, DEVICE.user_code, { mono: true, bold: true }), name = words(s, 'Example Company');
  const w = foreign ? 3.4 : Math.max(code.width(), name.width()) + 0.7, h = 1.3, y = at[1], x = foreign ? at[0] : at[0] - w / 2;
  if (foreign)
    return new Group(
      new Rectangle({ width: w, height: h, fill: TONE.pewterDeep, stroke: TONE.pewter, strokeWidth: STROKE.fine, cornerRadius: RADIUS.ticket }).moveTo([x, y]),
      ...[-0.9, -0.3, 0.3, 0.9].map((dx) => new Rectangle({ width: 0.42, height: 0.08, fill: TONE.pewter, stroke: 'none', cornerRadius: 0.04 }).moveTo([x + dx, y])),
    );
  return new Group(
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.ticket }).moveTo([x, y]),
    words(s, DEVICE.user_code, { at: [x, y + 0.33], mono: true, bold: true, color: TONE.print, align: 'middle' }),
    words(s, 'Example Company', { at: [x, y - 0.37], color: TONE.print, align: 'middle' }),
  );
}

/** A barrier lying across, between something stopped and whoever it would have reached. */
const crossBarrier = (s: Stage, at: Vec, length: number) => barrier(s, { at, height: length }).rotate(Math.PI / 2);

/** A request on its way, for the transitions: the kit's ticket, stamped with the agent's seal. */
export const requestToken = (s: Stage): Mobject => ticket(s, {});
/** A one-time code on its way to the agent, with the PKCE verifier riding on it to the token endpoint. */
export const codeToken = (s: Stage): Mobject => codeSlip(s, { code: 'c_5Rm2' });

// ---------------------------------------------------------------------------------------------
// The picture

/** Your browser window, with the Company's page in it, joined to the counter. */
function browser(s: Parts, st: Stage, host: string, rows: Rows) {
  const w = WIN.right - WIN.left, h = WIN.top - WIN.bottom, cx = (WIN.left + WIN.right) / 2, cy = (WIN.top + WIN.bottom) / 2;
  const address = words(st, host, { mono: true, at: [cx, WIN.top - WIN.bar / 2], align: 'middle' });
  s.add(new Group(
    new Rectangle({ width: w, height: h, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.panel }).moveTo([cx, cy]),
    new Rectangle({ width: address.width() + 0.44, height: 0.6, fill: TONE.raised, stroke: 'none', cornerRadius: 0.3 }).moveTo([cx, WIN.top - WIN.bar / 2]),
  ), 'window:frame');
  s.add(address, 'window:host');
  const pageTop = WIN.top - WIN.bar - 0.08, pageBottom = WIN.bottom + 0.14, pageLeft = WIN.left + 0.14;
  s.add(new Group(
    new Rectangle({ width: WIN.right - pageLeft, height: pageTop - pageBottom, fill: TONE.raised, stroke: 'none', cornerRadius: 0.08 }).moveTo([(pageLeft + WIN.right) / 2, (pageTop + pageBottom) / 2]),
    bridge(WIN.right, rows),
  ), 'window:page');
}
/** The page's way out through the window's edge, into the counter. */
const bridge = (from: number, rows: Rows) => {
  const top = rows.field + 0.45, bottom = rows['orders:write'] - 0.45;
  return new Rectangle({ width: FACE - from + 0.24, height: top - bottom, fill: TONE.raised, stroke: 'none' }).moveTo([(from + FACE) / 2 + 0.06, (top + bottom) / 2]);
};

/** Your phone, upright, with the Company's page on its screen, joined to the counter. */
function handset(s: Parts, st: Stage, rows: Rows) {
  s.add(phone(st, { at: PHONE.at, size: PHONE.size }), 'window:frame');
  const inset = 0.08;
  s.add(new Group(
    new Rectangle({ width: SCREEN.right - SCREEN.left - 2 * inset, height: SCREEN.top - SCREEN.bottom - 2 * inset, fill: TONE.raised, stroke: 'none', cornerRadius: 0.08 }).moveTo([PHONE.at[0], (SCREEN.top + SCREEN.bottom) / 2]),
    bridge(SCREEN.right - inset, rows),
  ), 'window:page');
}

/** The agent's station and its keyring, in a layout. Keyed: the station's parts, `agent:ring`, `agent:key:slot`, `agent:key`, `tag:cord`, `tag`. */
function agentWith(s: Stage, at: Ring, teeth: number, card: string | null, slot = true): Mobject[] {
  const out = [...station(s, { at: at.station, r: STATION_R })];
  const keyed = <T extends Mobject>(m: T, k: string): T => keyedAs(m, k);
  const edge = at.station[0] + Math.sqrt(Math.max(0, STATION_R ** 2 - (at.ring[1] - at.station[1]) ** 2)) - 0.04;
  out.push(keyed(new Group(
    new Rectangle({ width: at.ring[0] - 0.2 - edge + 0.04, height: 0.08, fill: TONE.brassDeep, stroke: 'none' }).moveTo([(at.ring[0] - 0.2 + edge) / 2, at.ring[1]]),
    new Circle({ radius: 0.2, fill: 'none', stroke: TONE.brass, strokeWidth: STROKE.line }).moveTo(at.ring),
  ), 'agent:ring'));
  if (slot) out.push(keyed(key(s, { at: at.key, size: at.size, teeth: Math.max(1, teeth), ghost: true }), 'agent:key:slot'));
  if (teeth > 0) out.push(keyed(key(s, { at: at.key, size: at.size, teeth }), 'agent:key'));
  if (card) {
    const t = tag(s, { at: at.tag, value: card }), hole: Vec = [at.tag[0] - t.width() / 2 + 0.3, at.tag[1] + 0.72 - 0.3];
    const from: Vec = [at.ring[0], at.ring[1] - 0.2];
    const dx = hole[0] - from[0], dy = hole[1] - from[1], len = Math.hypot(dx, dy), nx = (-dy / len) * 0.035, ny = (dx / len) * 0.035;
    out.push(keyed(outline([[from[0] + nx, from[1] + ny], [hole[0] + nx, hole[1] + ny], [hole[0] - nx, hole[1] - ny], [from[0] - nx, from[1] - ny]], TONE.brassDeep), 'tag:cord'));
    out.push(keyed(t, 'tag'));
  }
  return out;
}

/** The state as its picture. */
export function drawWorld(w: World, shown: Shown, s: Stage): Group {
  const parts = keyedParts();
  if (shown.password) return drawShortcut(s, parts);
  const report = reportOf(w, shown), last = w.last, device = w.flow === 'device', rows = ROWS[w.flow], open = !!w.sign;

  addAll(parts, counter(s, { x: FACE, top: MARGIN.top, bottom: COUNTER_BOTTOM }));
  // Top left, while a sign-in is open: the Company's page, in your browser or on your phone.
  if (w.sign) {
    const typed = !!w.sign.approved;
    let pw: Mobject | undefined;
    if (device) {
      handset(parts, s, rows);
      parts.add(new Rectangle({ width: 1.7, height: 0.6, fill: TONE.ground, stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: 0.1 }).moveTo([PHONE.at[0], rows.field]), 'page:field');
      if (typed) pw = parts.add(new Group(...dots([PHONE.at[0] - 0.4, rows.field], TONE.ink)), 'page:password');
      for (const scope of ['orders:read', 'orders:write'] as const) {
        parts.add(box([SCREEN.left + 0.38, rows[scope]], !!w.sign.approved?.includes(scope)), `page:${scope}:box`);
        parts.add(words(s, SHORT[scope], { at: [SCREEN.left + 0.75, rows[scope]] }), `page:${scope}:line`);
      }
    } else {
      browser(parts, s, 'auth.example.com', rows);
      parts.add(words(s, 'Example Company', { at: [PAGE_X, rows.title], bold: true }), 'page:title');
      parts.add(new Rectangle({ width: 3.9, height: 0.6, fill: TONE.ground, stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: 0.1 }).moveTo([PAGE_X + 1.95, rows.field]), 'page:field');
      if (typed) pw = parts.add(new Group(...dots([PAGE_X + 0.3, rows.field], TONE.ink)), 'page:password');
      else parts.add(words(s, 'password', { at: [PAGE_X + 0.24, rows.field], color: TONE.soft }), 'page:hint');
      for (const scope of ['orders:read', 'orders:write'] as const) {
        parts.add(box([PAGE_X + 0.21, rows[scope]], !!w.sign.approved?.includes(scope)), `page:${scope}:box`);
        parts.add(words(s, LINE[scope], { at: [PAGE_X + 0.66, rows[scope]] }), `page:${scope}:line`);
      }
    }
    if (pw && last?.kind === 'approve') emphasised(pw, 'changed: your password is on the Company’s page');
  }

  // Behind the counter: the scopes the Company offers, each a row with its tooth, cut in brass when the agent holds it.
  parts.add(words(s, 'The Company', { at: [RACK_X, WIN.top - WIN.bar / 2], size: TYPE.label, bold: true }), 'company');
  parts.add(words(s, 'Scopes offered', { at: [RACK_X, rows.title], bold: true }), 'rack:title');
  for (const scope of RACK) {
    const y = rackY(rows, scope), status = statusOf(w, scope), asked = !!w.sign && scope !== 'addresses', cut = !!w.holds?.scopes.includes(scope as Scope);
    parts.add(tooth([TOOTH_X, y], cut), `rack:${scope}:tooth`);
    parts.add(words(s, scope, { at: [RACK_X, y], mono: true, color: asked || cut ? TONE.ink : TONE.soft, bold: asked }), `rack:${scope}:name`);
    if (status) {
      const word = parts.add(words(s, status, { at: [MARGIN.right, y], align: 'end', color: status === 'not now' ? TONE.soft : TONE.ink }), `rack:${scope}:status`);
      if (last?.kind === 'approve' || last?.kind === 'tokens') emphasised(word, `changed: ${scope} is ${status}`);
    }
  }
  parts.add(words(s, 'can’t be undone', { at: [RACK_X, rows['orders:write'] - 0.7], color: TONE.soft }), 'rack:hint');

  // You, and your password unless it is on the page.
  const place = open ? YOU[w.flow] : YOU.closed;
  parts.add(person(s, { at: place.you, size: place.size }), 'you');
  if (!w.sign?.approved) parts.add(passwordCard(s, { at: place.card }), 'you:password');
  // What lies between: the code the agent shows you, a swapped code stopped short of the agent, a lookalike link kept from you.
  if (device && w.sign && !w.sign.approved) parts.add(deviceCard(s, [FACE - 0.15, STRIP_Y - 0.05], false), 'card');
  if (last?.kind === 'trick') {
    if (device) {
      parts.add(deviceCard(s, [-2.6, -1.42], true), 'trick');
      parts.add(crossBarrier(s, [-2.6, -2.34], 2.6), 'barrier');
    } else {
      parts.add(swappedSlip(s, [SLIP_AT[0], STRIP_Y + 0.12]), 'trick');
      parts.add(crossBarrier(s, [SLIP_AT[0], STRIP_Y - 0.56], 2.6), 'barrier');
    }
  }

  // The agent, with its keyring: small while a page is open, the hero when none is.
  const ring = agentWith(s, open ? AGENT_AT.open : AGENT_AT.closed, w.holds ? w.holds.scopes.length : 0, w.holds ? CARDS[w.holds.card] : null);
  const held = ring.find((m) => m.key === 'agent:key');
  if (held && last?.kind === 'tokens') emphasised(held, `changed: the agent holds a key with ${w.holds!.scopes.length === 1 ? 'one tooth' : 'two teeth'}`);
  addAll(parts, ring);
  if (last?.kind === 'thief') parts.add(tag(s, { at: THIEF_AT, value: null, foreign: true }), 'thief');

  readout(s, parts, report);
  return parts.group();
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

/** Step 1's picture: the shortcut. Your password hangs on the agent's keyring, where a key would, and the agent types it in. */
function drawShortcut(s: Stage, parts: Parts): Group {
  const rows = ROWS.direct;
  addAll(parts, counter(s, { x: FACE, top: MARGIN.top, bottom: COUNTER_BOTTOM }));
  browser(parts, s, 'example.com', rows);
  parts.add(words(s, 'Sign in', { at: [PAGE_X, rows.title], bold: true }), 'page:title');
  parts.add(new Rectangle({ width: 3.9, height: 0.6, fill: TONE.ground, stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: 0.1 }).moveTo([PAGE_X + 1.95, rows.field]), 'page:field');
  parts.add(new Group(...dots([PAGE_X + 0.3, rows.field], TONE.ink)), 'page:password');
  parts.add(words(s, 'typed by your agent', { at: [PAGE_X, rows['orders:read']], color: TONE.soft }), 'page:by');
  parts.add(words(s, 'The Company sees', { at: [RACK_X, rows.title], bold: true }), 'sees:title');
  parts.add(person(s, { at: [RACK_X + 0.55, 1.45], size: 1.2 }), 'sees:you');
  parts.add(words(s, 'you', { at: [RACK_X + 1.45, 1.45], size: TYPE.title, bold: true }), 'sees:who');
  parts.add(words(s, 'not your agent', { at: [RACK_X, 0.2], color: TONE.soft }), 'sees:not');
  parts.add(person(s, { at: YOU.direct.you, size: YOU.direct.size }), 'you');
  const at = AGENT_AT.open;
  addAll(parts, agentWith(s, at, 0, null, false));
  const card: Vec = [at.ring[0] + 0.2 + 0.9 + 0.02, at.ring[1]];
  parts.add(passwordCard(s, { at: card }), 'agent:password');
  parts.add(words(s, 'your password', { at: [card[0] - 0.9, card[1] - 0.8], color: TONE.soft }), 'agent:password:label');
  readout(s, parts, reportOf({ flow: 'direct', sign: null, holds: null, ended: false, last: null }, { password: true }));
  return parts.group();
}
