import { Circle, Group, Rectangle, VMobject } from '../../../src/index.ts';
import type { Mobject, Style, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { MARGIN, PALETTE as KIT_PALETTE, STROKE, TONE, TYPE, certificate, clock as clockFace, key, seal, sheet, words } from '../lib/poppy-kit.ts';
import { AGENT_SIGNER, CHECKS, TIME, attempt, clock, genuine, hostOf, ruleOf } from './model.ts';
import type { CheckId, Request, SealWorld, Tamper } from './model.ts';

// One state as a picture, in three zones.
//
// ACROSS THE TOP, the chain of vouching, read left to right, each object named above it: the
// agent's metadata document (agent.json, at the address iss names), the signet ring that is its
// published key, the delegation it signed (the kit's certificate) with the clock of its lifetime,
// and the seal stamp that is the delegated key, standing on the wax it pressed into the ticket's
// top edge. Real chain links join them, one length per check of the chain: client (the keys hang
// at iss), delegation (the ring signed an unexpired pass), signature (the stamp the pass names
// pressed this wax). A length is STEEL until checked, INK once it holds, split open where it fails.
//
// BOTTOM RIGHT, the ticket: the Session JWT's claims printed on paper, each row a plain word with
// the claim's name beside it, in three pairs: where it may go (for, where), when and with what
// (when, with), and the two the Company may check (once, who). Down its perforated left margin the
// Company punches a round hole beside each row whose check holds, in the draft's order; the first
// that fails tears the margin at its row and strikes its value. A validator stamp says when it
// arrived.
//
// BOTTOM LEFT, the Company: its answer (the status number, what it means in a few words, and the
// error code), and a small ledger of what it may remember for the two optional checks.
//
// Colours keep the kit's meanings: WAX the agent's seal, PEWTER another party's chain, BRASS the
// access token whose hash the "with" row carries, INK what is in use, STEEL what is idle. Outcomes
// are holes, tears, broken links and words. Every label is at least TYPE.small.

export const PALETTE = KIT_PALETTE;

/** How much of the chain the scene has explained so far: none, the address and its keys, or all of it. */
/**
 * `take` marks a picture shown apart from the machine (the detail step's other history): its
 * ticket and punches are keyed afresh, so the change to it cross-fades instead of morphing one
 * ticket's printing into another's.
 */
export type Shown = { links: 0 | 1 | 3; take?: 2 };
export const ALL_SHOWN: Shown = { links: 3 };

// ------------------------------------------------------------------ geometry (shared with the scene)

/** The top band: names above, objects below. */
const LABEL_Y = 3.85, OBJ_Y = 2.82;
/** The columns of the chain: the document, the ring, the delegation and its clock, the stamp. */
const COL = { sheet: -5.97, ring: -1.865, pass: 1.945, stamp: 5.78 } as const;
const CERT_X = 1.57, CLOCK_X = 2.82;
/** The ticket's edges. */
export const TK = { left: -1.79, right: 7.85, top: 1.6, bottom: -4.42 } as const;
/** The wax on the ticket's top edge, under the stamp. */
export const SEAL_AT: Vec = [COL.stamp, TK.top];
/** The ticket's rows, in three pairs, and the check that punches each. */
export type RowId = 'aud' | 'htu' | 'iat' | 'ath' | 'jti' | 'sub';
const ROWS: readonly { id: RowId; word: string; y: number }[] = [
  { id: 'aud', word: 'for', y: 0.36 }, { id: 'htu', word: 'where', y: -0.3 },
  { id: 'iat', word: 'when', y: -1.08 }, { id: 'ath', word: 'with', y: -1.74 },
  { id: 'jti', word: 'once', y: -2.52 }, { id: 'sub', word: 'who', y: -3.18 },
];
const rowY = (id: RowId) => ROWS.find((r) => r.id === id)!.y;
const ROW_CHECK: Partial<Record<CheckId, RowId | 'typ'>> = { typ: 'typ', aud: 'aud', request: 'htu', time: 'iat', token: 'ath', replay: 'jti', 'one-user': 'sub' };
const HEAD_Y = 1.12;
const HOLE_X = TK.left + 0.31, PERF_X = TK.left + 0.62, WORD_X = TK.left + 0.84, CLAIM_X = WORD_X + 1.92, VALUE_X = CLAIM_X + 1.2;
/** The chain's three lengths and the checks they stand for. */
export const LINKS = ['client', 'delegation', 'signature'] as const;
type LinkId = (typeof LINKS)[number];
const LINK_SPAN: Record<LinkId, [number, number]> = { client: [COL.sheet + 0.5, COL.ring - 0.5], delegation: [COL.ring + 0.48, CERT_X - 0.86], signature: [CLOCK_X + 0.38, COL.stamp - 0.42] };
/** The resting centre of the ticket. */
export const TICKET_AT: Vec = [(TK.left + TK.right) / 2, (TK.top + TK.bottom) / 2];
/** Where a ticket's centre comes from: in from under the stamp's side (the agent, or someone holding its key), up from below the stage (a copy), in from the right (another Company). */
export const SOURCE: Record<'agent' | 'copy' | 'company', Vec> = { agent: [TICKET_AT[0] + 1.4, TICKET_AT[1]], copy: [TICKET_AT[0], -9.2], company: [14.5, TICKET_AT[1]] };
/** The Company's zone. */
const CO = { left: MARGIN.left, right: TK.left - 0.5 } as const;

// ------------------------------------------------------------------ what a state shows

/** The request on the ticket: the agent's genuine one until something is sent, then the last attempt. */
const requestOf = (w: SealWorld): Request => (w.last ? attempt(w.last.tamper).request : genuine());
const nowOf = (w: SealWorld): number => (w.last ? attempt(w.last.tamper).now : TIME.signed + 1);
/** Whose chain hangs across the top: the thief signs with its own; everyone else holds the agent's. */
const chainOwner = (w: SealWorld): 'agent' | 'thief' => (w.last?.tamper === 'thief' ? 'thief' : 'agent');
/** Where the last ticket came from. */
export const sourceOf = (tamper: Tamper): keyof typeof SOURCE =>
  tamper === 'aud' ? 'company' : tamper === 'replay' || tamper === 'url' || tamper === 'thief' ? 'copy' : 'agent';

const ASKED: Record<Tamper, string> = {
  send: 'The agent sent the exchange, sealed',
  replay: 'A copy of the same request arrived 10 s later',
  late: 'A copy of the same request arrived 2 min later',
  url: 'A copy of the header and token was sent to GET /orders/ord_7Hk2',
  aud: 'shoes.example replayed a header the agent had signed for it',
  thief: 'A thief sealed your copied token with its own keys',
  published: 'The agent sealed the request with its published key',
  expired: 'Someone holding your leaked delegated key signed a request at 07:00',
  'other-user': 'Someone holding your leaked delegated key signed for another User',
};
const PHRASE: Record<number, string> = { 200: 'OK', 400: 'Bad Request', 401: 'Unauthorized' };
const short = (path: string) => `/${path.split('/').at(-1)}`;
const pathOf = (url: string) => url.replace(/^https:\/\/[^/]+/, '');

/** The answer's title: what happened, in a few plain words. */
function titleOf(w: SealWorld): string {
  const v = w.last!.verdict, r = requestOf(w);
  if (!v.failed) return v.answer.status === 200 ? 'Accepted' : 'Signed out';
  return {
    header: 'No seal', client: 'Unknown agent', delegation: r.session!.poppy_dlg ? 'Pass expired' : 'No delegation', signature: 'Wrong stamp',
    typ: 'Not a seal', aud: 'Other shop', request: 'Other URL', time: 'Too old', token: 'Not its token', replay: 'Seen before', 'one-user': 'Key reused',
  }[v.failed];
}

/** The ticket's printed values: the claims of the seal on it. */
function rowsOf(r: Request): Record<RowId, string> {
  const s = r.session!;
  return { aud: hostOf(s.aud)!, htu: `${s.htm} ${short(pathOf(s.htu))}`, iat: clock(s.iat), ath: s.ath ? s.ath.slice(4, -1) : 'none', jti: s.jti, sub: s.sub };
}

/** Each check's state in this picture: held, broke, or not reached. */
const statusOf = (w: SealWorld, id: CheckId): 'held' | 'broke' | 'open' => {
  const v = w.last?.verdict;
  if (!v) return 'open';
  return v.passed.includes(id) ? 'held' : v.failed === id ? 'broke' : 'open';
};

/** The picture in words: every field of the state, and of what is shown. */
export function sayWorld(w: SealWorld, shown: Shown): string {
  const r = requestOf(w), s = r.session!, last = w.last, rule = ruleOf(last), owner = chainOwner(w);
  const chain = shown.links === 0 ? 'The chain behind the seal is not drawn yet; the wax on the ticket asks what pressed it.'
    : shown.links === 1 ? `Across the top, the agent's metadata document at its client_id, and its published key, ${AGENT_SIGNER.published}, chained to it.`
    : last?.tamper === 'published'
      ? 'Across the top, the agent’s metadata document and an empty place where its published key hung: there is no delegation, and the published key itself stands on the wax it pressed.'
      : `Across the top, the chain of vouching: ${owner === 'thief' ? 'the thief’s' : 'the agent’s'} metadata document, its published key, a delegation lasting until ${clock(s.poppy_dlg!.exp)}, and the delegated key ${s.kid}, a stamp standing on the wax it pressed.`;
  const claims = `The ticket's seal says: iss ${s.iss}, aud ${s.aud}, ${s.htm} ${s.htu}, sid ${s.sid}, sub ${s.sub}, signed at ${clock(s.iat)}, jti ${s.jti}, ${s.ath ? `ath covering the access token ${r.token ? 'it carries' : 'it does not carry'}` : 'no ath'}; the request is ${r.method} ${r.url}${r.token ? ` with access token ${r.token.value}` : ' with no access token'}.`;
  const verdict = last
    ? `${ASKED[last.tamper]}, arriving at ${clock(nowOf(w))}. Checks that held: ${last.verdict.passed.join(', ')}. ${last.verdict.failed ? `It failed at ${last.verdict.failed}: ${last.verdict.answer.status} ${PHRASE[last.verdict.answer.status]}, ${last.verdict.answer.error}, ${last.verdict.answer.reason}.` : `Answer ${last.verdict.answer.status} ${PHRASE[last.verdict.answer.status]}${last.verdict.answer.needs ? `, naming ${last.verdict.answer.needs}` : ''}.`}`
    : 'Nothing has been checked yet.';
  const memory = w.policy === 'remembers'
    ? `The Company makes the two optional checks; it remembers ${w.memory.jtis.length ? `jtis ${w.memory.jtis.join(' and ')}` : 'no jti yet'} and ${Object.keys(w.memory.keyUser).length ? Object.entries(w.memory.keyUser).map(([k, u]) => `key ${k} signed for ${u}`).join(', ') : 'no key yet'}.`
    : 'The Company makes only the required checks and remembers nothing.';
  return `${chain} ${claims} ${verdict} ${memory} ${w.sent ? 'The agent has sent its exchange.' : 'The agent has not sent its exchange yet.'} The rule, from section ${rule.section} of the draft: ${rule.says}`;
}

// ------------------------------------------------------------------ drawing helpers

type P = Vec;
const polar = (c: P, r: number, a: number): P => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
const arcPts = (c: P, r: number, a0: number, a1: number, n = 16): P[] => Array.from({ length: n + 1 }, (_, i) => polar(c, r, a0 + ((a1 - a0) * i) / n));
/** A filled shape from closed outlines; nested outlines cut holes. */
function shape(outlines: readonly P[][], style: Style): VMobject {
  const v = new VMobject({ stroke: 'none', fillRule: 'evenodd', ...style });
  for (const pts of outlines) {
    v.startNewPath(pts[0]!);
    for (const p of pts.slice(1)) v.addLineTo(p);
    v.closePath();
  }
  return v;
}
/** A stadium (a rounded bar) centred at c, w wide, h high. */
function stadium(c: P, w: number, h: number): P[] {
  const r = Math.min(w, h) / 2;
  if (h >= w) return [...arcPts([c[0], c[1] + h / 2 - r], r, 0, Math.PI, 10), ...arcPts([c[0], c[1] - h / 2 + r], r, Math.PI, 2 * Math.PI, 10)];
  return [...arcPts([c[0] + w / 2 - r, c[1]], r, -Math.PI / 2, Math.PI / 2, 10), ...arcPts([c[0] - w / 2 + r, c[1]], r, Math.PI / 2, 1.5 * Math.PI, 10)];
}

/**
 * A length of chain from x0 to x1 at height y: oval links seen face on, alternating with links seen
 * edge on. Held, INK; open (unchecked), STEEL; broken, the middle oval split in two halves pulled
 * apart, INK.
 */
function chain(x0: number, x1: number, y: number, status: 'held' | 'broke' | 'open'): Group {
  const pitch = 0.38, n = Math.max(3, Math.round((x1 - x0) / pitch)), step = (x1 - x0) / n, colour = status === 'open' ? TONE.steel : TONE.ink;
  const parts: Mobject[] = [], broken = status === 'broke' ? 2 * Math.floor(n / 4) : -1;
  for (let i = 0; i < n; i++) {
    const cx = x0 + step * (i + 0.5);
    if (i % 2 === 0) {
      const outer = stadium([cx, y], step + 0.14, 0.3), inner = stadium([cx, y], step - 0.02, 0.16);
      if (i === broken) {
        // Split open: two halves, pulled apart, with a gap where they parted.
        for (const side of [-1, 1]) {
          const half = (pts: P[]) => pts.filter((p) => side * (p[0] - cx) >= -1e-9).map((p): P => [p[0] + side * 0.3, p[1] - side * 0.14]);
          parts.push(shape([[...half(outer), ...half(inner).reverse()]], { fill: colour }));
        }
      } else parts.push(shape([outer, inner], { fill: colour }));
    } else parts.push(shape([stadium([cx, y], step + 0.12, 0.07)], { fill: colour }));
  }
  return new Group(...parts);
}

/** The signet ring, the published key: a band seen face on and a flat bezel engraved with the emblem; `down`, stood on its bezel. */
function signet(at: P, colour: string, deep: string, down = false): Group {
  const [x, y] = at, f = down ? -1 : 1;
  const band = shape([arcPts([x, y - 0.06 * f], 0.4, 0, 2 * Math.PI, 40), arcPts([x, y - 0.06 * f], 0.28, 0, 2 * Math.PI, 36)], { fill: colour });
  const bezel = new Rectangle({ width: 0.52, height: 0.3, fill: colour, stroke: 'none', cornerRadius: 0.06 }).moveTo([x, y + 0.38 * f]);
  const engraved = [0, 1, 2, 3].map((k) => new Circle({ radius: 0.045, fill: deep, stroke: 'none' }).moveTo(polar([x, y + 0.38 * f], 0.06, Math.PI / 4 + (k * Math.PI) / 2)));
  return new Group(band, bezel, ...engraved);
}

/**
 * A seal stamp, the delegated key, standing on the wax it pressed: a round knob, a turned handle
 * that narrows to a waist, a collar, and a broad head whose face meets the wax at `foot`.
 */
function stamp(at: P, foot: number, colour: string, deep: string): Group {
  const [x] = at, top = foot + 1.42;
  const profile: [number, number][] = [[0, 0.4], [0.12, 0.4], [0.17, 0.24], [0.22, 0.13], [0.44, 0.2], [0.64, 0.12], [0.74, 0.11], [0.8, 0.17]];
  const right = profile.map(([d, hw]): P => [x + hw, foot + d * (top - foot - 0.2)]), left = right.map(([px, py]): P => [2 * x - px, py]).reverse();
  return new Group(
    shape([[...right, ...left]], { fill: colour }),
    new Rectangle({ width: 0.82, height: 0.06, fill: deep, stroke: 'none' }).moveTo([x, foot + 0.15]),
    new Rectangle({ width: 0.26, height: 0.05, fill: deep, stroke: 'none' }).moveTo([x, foot + 0.23 * (top - foot - 0.2)]),
    new Circle({ radius: 0.24, fill: colour, stroke: 'none' }).moveTo([x, top - 0.1]),
  );
}

/** The ticket: paper, a perforated left margin for the punches, the typ heading, and a row per claim. */
function ticketOf(s: Stage, r: Request, foreign: boolean): Group {
  const w = TK.right - TK.left, h = TK.top - TK.bottom, rows = rowsOf(r), print = TONE.print;
  const parts: Mobject[] = [
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: 0.08 }).moveTo(TICKET_AT),
    ...Array.from({ length: 24 }, (_, i) => new Circle({ radius: 0.032, fill: TONE.paperLine, stroke: 'none' }).moveTo([PERF_X, TK.top - 0.2 - i * ((h - 0.4) / 23)])),
    words(s, r.session!.typ, { at: [WORD_X, HEAD_Y], mono: true, bold: true, color: print }),
    new Rectangle({ width: TK.right - WORD_X - 0.3, height: 0.04, fill: print, stroke: 'none' }).moveTo([(WORD_X + TK.right - 0.3) / 2, HEAD_Y - 0.4]),
  ];
  for (const row of ROWS) {
    parts.push(words(s, row.word, { at: [WORD_X, row.y], color: print }));
    parts.push(words(s, row.id, { at: [CLAIM_X, row.y], mono: true, color: print }));
    if (row.id === 'ath' && r.session!.ath) {
      parts.push(key(s, { at: [VALUE_X + 0.45, row.y + 0.04], size: 0.42, teeth: 2, onPaper: true }));
      parts.push(words(s, rows.ath, { at: [VALUE_X + 1.1, row.y], mono: true, bold: true, color: print }));
    } else parts.push(words(s, rows[row.id], { at: [VALUE_X, row.y], mono: true, bold: rows[row.id] !== 'none', color: print }));
  }
  // Hairlines between the three pairs.
  for (const y of [-0.69, -2.13]) parts.push(new Rectangle({ width: TK.right - WORD_X - 0.3, height: 0.025, fill: TONE.paperLine, stroke: 'none' }).moveTo([(WORD_X + TK.right - 0.3) / 2, y]));
  parts.push(seal(s, { at: SEAL_AT, r: 0.4, foreign }));
  return new Group(...parts);
}

/** A punched hole: round, on the perforated margin, the ground showing through the paper. */
const hole = (y: number) => new Circle({ radius: 0.17, fill: TONE.ground, stroke: 'none' }).moveTo([HOLE_X, y]);
/** A tear: the margin ripped in from the ticket's edge at a row, ragged, and the row's value struck through. */
function tear(y: number, valueWidth: number): Group {
  const e = TK.left - 0.03, d = PERF_X + 0.05;
  const rag: P[] = [[e, y + 0.36], [e + 0.18, y + 0.3], [e + 0.3, y + 0.22], [d - 0.12, y + 0.16], [d, y + 0.07], [d - 0.1, y - 0.02], [d + 0.02, y - 0.1], [d - 0.16, y - 0.18], [e + 0.24, y - 0.26], [e + 0.1, y - 0.33], [e, y - 0.38]];
  return new Group(
    shape([rag], { fill: TONE.ground }),
    new Rectangle({ width: valueWidth + 0.24, height: 0.06, fill: TONE.print, stroke: 'none' }).moveTo([VALUE_X + valueWidth / 2, y + 0.02]),
  );
}
/** The validator's stamp: when the Company received the ticket, inked in an outlined box. */
function arrived(s: Stage, t: number): Group {
  const label = words(s, 'in', { at: [VALUE_X + 0.24, -3.95], color: TONE.print });
  const time = words(s, clock(t), { at: [VALUE_X + 0.24 + label.width() + 0.24, -3.95], mono: true, bold: true, color: TONE.print });
  const w = label.width() + time.width() + 0.72;
  return new Group(new Rectangle({ width: w, height: 0.62, fill: 'none', stroke: TONE.print, strokeWidth: STROKE.fine, cornerRadius: 0.08 }).moveTo([VALUE_X + w / 2, -3.95]), label, time);
}

// ------------------------------------------------------------------ the picture

/** The state as its picture: the chain across the top, the punched ticket bottom right, the Company's answer and ledger bottom left. */
export function drawWorld(w: SealWorld, shown: Shown, s: Stage): Group {
  const parts = keyedParts(), r = requestOf(w), last = w.last, owner = chainOwner(w), published = last?.tamper === 'published';
  const [ink, deep] = owner === 'thief' ? [TONE.pewter, TONE.pewterDeep] : [TONE.ink, TONE.steel];
  const text = (k: string, value: string, o: Parameters<typeof words>[2]) => parts.add(words(s, value, o), k);
  const name = (k: string, value: string, x: number, soft = false) => text(k, value, { at: [x, LABEL_Y], align: 'middle', color: soft ? TONE.soft : TONE.ink, mono: value.endsWith('.json') });

  // Across the top: the chain, as far as the scene has explained it.
  if (shown.links >= 1) {
    parts.add(sheet(s, { at: [COL.sheet, OBJ_Y], width: 0.8, height: 1.0, lines: 3 }), 'chain:sheet');
    name('chain:sheet:name', 'agent.json', COL.sheet);
    if (published) parts.add(new Circle({ radius: 0.4, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, dashArray: '0.12 0.08' }).moveTo([COL.ring, OBJ_Y - 0.06]), 'chain:ring:slot');
    else parts.add(signet([COL.ring, OBJ_Y], ink, deep), 'chain:ring');
    if (!published) name('chain:ring:name', 'published key', COL.ring);
    parts.add(chain(...LINK_SPAN.client, OBJ_Y, statusOf(w, 'client')), `link:client:${statusOf(w, 'client')}`);
  }
  if (shown.links >= 3) {
    const pass = r.session!.poppy_dlg;
    parts.add(chain(...LINK_SPAN.delegation, OBJ_Y, statusOf(w, 'delegation')), `link:delegation:${statusOf(w, 'delegation')}`);
    parts.add(chain(...LINK_SPAN.signature, OBJ_Y, statusOf(w, 'signature')), `link:signature:${statusOf(w, 'signature')}`);
    if (pass) {
      parts.add(certificate(s, { at: [CERT_X, OBJ_Y], width: 1.6, height: 1.1, foreign: owner === 'thief' }), 'chain:cert');
      name('chain:cert:name', 'delegation', COL.pass);
      const left = Math.max(0, Math.min(1, (pass.exp - nowOf(w)) / (pass.exp - pass.iat)));
      parts.add(clockFace(s, { at: [CLOCK_X, OBJ_Y + 0.12], r: 0.3, remaining: left }), `chain:clock:${left > 0 ? 'running' : 'run-out'}`);
      text('chain:until', `${left > 0 ? 'until' : 'ended'} ${clock(pass.exp).slice(0, 5)}`, { at: [COL.pass, 2.02], align: 'middle', color: left > 0 ? TONE.ink : TONE.soft });
      parts.add(stamp([COL.stamp, 0], SEAL_AT[1] + 0.34, ink, deep), 'chain:stamp');
      name('chain:stamp:name', 'delegated key', COL.stamp);
    } else {
      // No delegation: the pass's place is empty, and the published key itself stands on the wax it pressed.
      parts.add(new Rectangle({ width: 1.6, height: 1.1, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, dashArray: '0.16 0.1', cornerRadius: 0.05 }).moveTo([CERT_X, OBJ_Y]), 'chain:cert:slot');
      name('chain:cert:name', 'delegation', COL.pass, true);
      text('chain:until', 'none', { at: [COL.pass, 2.02], align: 'middle', color: TONE.soft });
      parts.add(signet([COL.stamp, SEAL_AT[1] + 0.78], ink, deep, true), 'chain:ring:on-wax');
      name('chain:stamp:name', 'published key', COL.stamp);
    }
  } else if (shown.links === 0) text('chain:none', 'pressed by?', { at: [COL.stamp, OBJ_Y - 0.1], size: TYPE.label, color: TONE.soft, align: 'middle' });

  // Bottom right: the ticket, its punches and its tear, and the validator's stamp once it has arrived.
  const fk = (k: string) => (shown.take ? `${k}@${shown.take}` : k);
  parts.add(ticketOf(s, r, owner === 'thief'), fk('ticket'));
  if (last) {
    parts.add(arrived(s, nowOf(w)), fk('ticket:arrived'));
    for (const check of CHECKS) {
      const on = ROW_CHECK[check.id];
      if (!on) continue;
      const y = on === 'typ' ? HEAD_Y : rowY(on), state = statusOf(w, check.id);
      if (state === 'held') parts.add(hole(y), fk(`hole:${on}`));
      if (state === 'broke') {
        const value = on === 'typ' ? r.session!.typ : rowsOf(r)[on];
        const width = words(s, value, { mono: true }).width() + (on === 'ath' && r.session!.ath ? 1.1 : 0);
        emphasised(parts.add(tear(y, width), fk(`tear:${on}`)), `torn at ${on}`);
      }
    }
  }

  // Bottom left: the Company's answer, appearing only once the ticket has been checked.
  if (last) {
    const a = last.verdict.answer;
    text('verdict:code', String(a.status), { at: [CO.left - 0.06, 1.25], size: TYPE.display, mono: true, bold: true });
    emphasised(text('verdict:title', titleOf(w), { at: [CO.left, -0.28], size: TYPE.title, bold: true }), `the answer: ${a.status} ${PHRASE[a.status]}, ${titleOf(w)}`);
    if (a.status === 401) {
      const needs = text('verdict:detail', 'needs', { at: [CO.left, -1.2] });
      text('verdict:detail:scope', a.needs!, { at: [CO.left + needs.width() + 0.2, -1.2], mono: true });
    } else text('verdict:detail', a.error ?? 'exchange made', { at: [CO.left, -1.2], mono: !!a.error });
  } else text('verdict:code', 'not checked yet', { at: [CO.left, 0.6], size: TYPE.label, color: TONE.soft });

  // Bottom left, under the answer: what the Company may remember, as a small ruled ledger.
  const width = CO.right - CO.left, mid = (CO.left + CO.right) / 2;
  text('memory:title', 'Optional memory', { at: [CO.left, -2.1], bold: true });
  parts.add(new Group(
    new Rectangle({ width, height: 0.045, fill: TONE.ink, stroke: 'none' }).moveTo([mid, -2.54]),
    new Rectangle({ width, height: 0.025, fill: TONE.ink, stroke: 'none' }).moveTo([mid, -2.63]),
  ), 'memory:rule');
  const remembers = w.policy === 'remembers', jtis = w.memory.jtis, user = Object.values(w.memory.keyUser)[0];
  const row = (k: string, label: string, value: string, quiet: boolean, y: number) => {
    text(`memory:${k}:label`, label, { at: [CO.left, y], color: TONE.soft });
    text(fk(`memory:${k}:value`), value, { at: [CO.right, y], align: 'end', mono: !quiet, color: quiet ? TONE.soft : TONE.ink });
    parts.add(new Rectangle({ width, height: STROKE.hair, fill: TONE.rule, stroke: 'none' }).moveTo([mid, y - 0.34]), `memory:${k}:rule`);
  };
  row('jti', 'once', !remembers ? 'skipped' : jtis.length === 0 ? 'nothing yet' : jtis.length === 1 ? jtis[0]! : `${jtis.length} jtis`, !remembers || jtis.length === 0, -3.1);
  row('key', 'who', !remembers ? 'skipped' : user ?? 'nobody yet', !remembers || !user, -3.8);
  return parts.group();
}

/** The keys of the parts a check adds, in the order the Company makes the checks: what the scene punches one by one. */
export function punchOrder(): string[] {
  return CHECKS.flatMap((c) => {
    if ((LINKS as readonly string[]).includes(c.id)) return [`link:${c.id}:held`, `link:${c.id}:broke`];
    const on = ROW_CHECK[c.id];
    return on ? [`hole:${on}`, `tear:${on}`] : [];
  });
}
