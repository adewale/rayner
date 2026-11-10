import { Circle, Group, Rectangle, VMobject } from '../../../src/index.ts';
import type { Mobject, Style, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { MARGIN, PALETTE as KIT_PALETTE, STROKE, TONE, TYPE, certificate, clock as clockFace, key, seal, sheet, words } from '../lib/poppy-kit.ts';
import { AGENT_SIGNER, CHECKS, TIME, attempt, clock, genuine, hostOf, ruleOf } from './model.ts';
import type { CheckId, Request, SealWorld, Tamper } from './model.ts';

// One state as a picture. The idea: the seal on a request is the end of a chain of vouching, and
// the Company checks a request the way a conductor checks a ticket, punching it claim by claim.
//
// Left, the chain, hanging top to bottom: the agent's metadata document (agent.json, at the address
// iss names), the signet ring that is its published key, the delegation it signed (the kit's
// certificate) with the clock of its lifetime, and the seal die that is the delegated key, which
// pressed the wax seal on the ticket's corner. Between them hang real chain links, one per check
// of the chain: client (the keys hang at iss), delegation (the ring signed an unexpired pass),
// signature (the die the pass names pressed this seal). A link is STEEL until checked, INK once it
// holds, and drawn split open where the check fails.
//
// Middle, the ticket: the Session JWT's claims printed on paper, one per row. Each row check that
// passes punches a hole beside its row, in the order the draft gives; the first that fails tears a
// notch into the ticket's edge and strikes its value through. Rows after it stay unpunched.
// Above, what came back, in the kit's answer type. Right, what the Company reads as it checks: the
// time now, and, for the two optional checks, what it remembers.
//
// Colours keep the kit's meanings: WAX the agent's seal (and the agent's die and ring are INK, its
// pass is the kit's certificate under its seal), PEWTER another party's chain, BRASS the access
// token whose hash the ath row carries. Outcomes are holes, tears, broken links and words; no
// colour means pass or fail. Every label is at least TYPE.small.

export const PALETTE = KIT_PALETTE;

/** How much of the chain the scene has explained so far: none, the address and its keys, or all of it. */
export type Shown = { links: 0 | 1 | 3 };
export const ALL_SHOWN: Shown = { links: 3 };

// ------------------------------------------------------------------ geometry (shared with the scene)

/** The chain's axis, where its links hang. */
const AXIS = -7.15;
/** The ticket's edges. */
export const TK = { left: -2.85, right: 4.7, top: 2.0, bottom: -4.1 } as const;
/** The rows of the ticket, top to bottom, and the check that punches each (iss is checked by the chain). */
export type RowId = 'iss' | 'aud' | 'htu' | 'iat' | 'ath' | 'jti' | 'sub';
const ROWS: readonly RowId[] = ['iss', 'aud', 'htu', 'iat', 'ath', 'jti', 'sub'];
const ROW_CHECK: Partial<Record<CheckId, RowId | 'typ'>> = { typ: 'typ', aud: 'aud', request: 'htu', time: 'iat', token: 'ath', replay: 'jti', 'one-user': 'sub' };
const HEAD_Y = 1.52;
const rowY = (row: RowId) => 0.82 - ROWS.indexOf(row) * 0.68;
const HOLE_X = TK.left + 0.32, PERF_X = TK.left + 0.62, NAME_X = TK.left + 0.78, VALUE_X = TK.left + 2.1;
/** The chain's three links and the checks they stand for. */
export const LINKS = ['client', 'delegation', 'signature'] as const;
type LinkId = (typeof LINKS)[number];
const LINK_SPAN: Record<LinkId, [number, number]> = { client: [3.02, 2.48], delegation: [1.5, 1.08], signature: [-0.72, TK.bottom + 0.45] };
/** Where the chain's objects hang. */
const SHEET_AT: Vec = [AXIS, 3.55], RING_AT: Vec = [AXIS, 1.98], CERT_AT: Vec = [-5.52, 0.3], DIE_Y = TK.bottom + 0.15;
/** The wax seal on the ticket's lower-left corner, which the die pressed. */
export const SEAL_AT: Vec = [TK.left, DIE_Y];
/** Where a ticket comes from: under the die (the agent, or someone holding its key), up from below (a copy), down from above (another Company). */
export const SOURCE: Record<'agent' | 'copy' | 'company', Vec> = { agent: [-4.6, DIE_Y], copy: [0.9, -5.6], company: [5.6, 5.4] };
/** The resting centre of the ticket. */
export const TICKET_AT: Vec = [(TK.left + TK.right) / 2, (TK.top + TK.bottom) / 2];
const RIGHT_X = 4.95;

// ------------------------------------------------------------------ what a state shows

/** The request on the ticket: the agent's genuine one until something is sent, then the last attempt. */
const requestOf = (w: SealWorld): Request => (w.last ? attempt(w.last.tamper).request : genuine());
const nowOf = (w: SealWorld): number => (w.last ? attempt(w.last.tamper).now : TIME.signed + 1);
/** Who the chain on the left belongs to: the thief signs with its own chain; everyone else holds the agent's. */
const chainOwner = (w: SealWorld): 'agent' | 'thief' => (w.last?.tamper === 'thief' ? 'thief' : 'agent');
/** Where the last ticket came from. */
export const sourceOf = (tamper: Tamper): keyof typeof SOURCE =>
  tamper === 'aud' ? 'company' : tamper === 'replay' || tamper === 'url' || tamper === 'thief' ? 'copy' : 'agent';

const ASKED: Record<Tamper, string> = {
  send: 'agent: the exchange, sealed',
  replay: 'copy: the same request, 10 s later',
  late: 'copy: the same request, 2 min later',
  url: 'copy: sent to GET /ord_7Hk2 instead',
  aud: 'shoes.example: replays a header it got',
  thief: 'thief: its own seal, your copied token',
  published: 'agent: sealed with its published key',
  expired: 'your leaked key, used at 07:00',
  'other-user': 'your leaked key, for another User',
};
const PHRASE: Record<number, string> = { 200: 'OK', 400: 'Bad Request', 401: 'Unauthorized' };
const short = (path: string) => `/${path.split('/').at(-1)}`;
const pathOf = (url: string) => url.replace(/^https:\/\/[^/]+/, '');

/** The verdict's meaning line: what the Company saw, in a few words. */
function meaningOf(w: SealWorld): string {
  const v = w.last!.verdict, a = v.answer, r = requestOf(w);
  if (!v.failed) return a.status === 200 ? 'the exchange is made' : `needs ${a.needs}`;
  switch (v.failed) {
    case 'request': return `this is ${r.method} ${short(pathOf(r.url))}`;
    case 'aud': return `addressed to ${hostOf(r.session!.aud)}`;
    case 'token': return `token is ${hostOf(r.token!.client)}’s`;
    case 'delegation': return !r.session!.poppy_dlg ? 'no delegation at all' : `delegation expired ${clock(r.session!.poppy_dlg.exp).slice(0, 5)}`;
    case 'replay': return 'this jti was seen already';
    case 'one-user': return `key already used for ${(a.reason ?? '').split(' ').at(-1)!.slice(4)}`;
    default: return a.reason ?? 'refused';
  }
}

/** The ticket's printed rows: the claims of the seal on it. */
function rowsOf(r: Request): Record<RowId, string> {
  const s = r.session!;
  return {
    iss: hostOf(s.iss)!, aud: hostOf(s.aud)!, htu: `${s.htm} ${short(pathOf(s.htu))}`, iat: clock(s.iat),
    ath: s.ath ? s.ath.slice(4, -1) : 'none', jti: s.jti, sub: s.sub,
  };
}

/** Each check's state in this picture: passed, failed, or not reached. */
const statusOf = (w: SealWorld, id: CheckId): 'held' | 'broke' | 'open' => {
  const v = w.last?.verdict;
  if (!v) return 'open';
  return v.passed.includes(id) ? 'held' : v.failed === id ? 'broke' : 'open';
};

/** The picture in words: every field of the state, and of what is shown. */
export function sayWorld(w: SealWorld, shown: Shown): string {
  const r = requestOf(w), s = r.session!, last = w.last, rule = ruleOf(last), owner = chainOwner(w);
  const chain = shown.links === 0 ? 'The chain behind the seal is not drawn yet.'
    : shown.links === 1 ? `Left, the agent's metadata document at its client_id, and its published key, ${AGENT_SIGNER.published}, hanging from it.`
    : `Left, the chain of vouching: ${owner === 'thief' ? 'the thief’s' : 'the agent’s'} metadata document, its published key, ${last?.tamper === 'published' ? 'no delegation (the published key sealed the request itself)' : `a delegation lasting until ${clock(s.poppy_dlg!.exp)}`}, and the delegated key ${s.kid} that pressed the seal.`;
  const claims = `The ticket's seal says: iss ${s.iss}, aud ${s.aud}, ${s.htm} ${s.htu}, sid ${s.sid}, sub ${s.sub}, signed at ${clock(s.iat)}, jti ${s.jti}, ${s.ath ? `ath covering the access token ${r.token ? 'it carries' : 'it does not carry'}` : 'no ath'}; the request is ${r.method} ${r.url}${r.token ? ` with access token ${r.token.value}` : ' with no access token'}.`;
  const verdict = last
    ? `${ASKED[last.tamper]}, arriving at ${clock(nowOf(w))}. Checks that held: ${last.verdict.passed.join(', ')}. ${last.verdict.failed ? `It failed at ${last.verdict.failed}: ${last.verdict.answer.status} ${last.verdict.answer.error}, ${last.verdict.answer.reason}.` : `Answer ${last.verdict.answer.status}${last.verdict.answer.needs ? `, naming ${last.verdict.answer.needs}` : ''}.`}`
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
 * A length of chain hanging from y0 down to y1 on the axis: oval links seen face on, alternating
 * with links seen edge on. Held, INK; open (unchecked), STEEL; broken, the middle oval split in
 * two halves pulled apart, INK.
 */
function chain(x: number, y0: number, y1: number, status: 'held' | 'broke' | 'open'): Group {
  const pitch = 0.46, n = Math.max(2, Math.round((y0 - y1) / pitch)), step = (y0 - y1) / n, colour = status === 'open' ? TONE.steel : TONE.ink;
  const parts: Mobject[] = [], broken = status === 'broke' ? Math.floor(n / 2) : -1;
  for (let i = 0; i < n; i++) {
    const cy = y0 - step * (i + 0.5);
    if (i % 2 === 0) {
      const outer = stadium([x, cy], 0.42, step + 0.2), inner = stadium([x, cy], 0.2, step - 0.06);
      if (i === broken || (broken >= 0 && i === broken - 1 && broken % 2 === 1)) {
        // Split open: two halves, pulled apart sideways, with a gap where they parted.
        for (const side of [-1, 1]) {
          const half = (pts: P[]) => pts.filter((p) => side * (p[0] - x) >= -1e-9).map((p): P => [p[0] + side * 0.3, p[1] + side * 0.12]);
          const o = half(outer), inr = half(inner).reverse();
          parts.push(shape([[...o, ...inr]], { fill: colour }));
        }
      } else parts.push(shape([outer, inner], { fill: colour }));
    } else parts.push(shape([stadium([x, cy], 0.12, step + 0.18)], { fill: colour }));
  }
  return new Group(...parts);
}

/** The signet ring, the published key: a band seen face on, a flat bezel engraved with the emblem. */
function signet(at: P, colour: string, deep: string): Group {
  const [x, y] = at;
  const band = shape([arcPts([x, y - 0.06], 0.4, 0, 2 * Math.PI, 40), arcPts([x, y - 0.06], 0.28, 0, 2 * Math.PI, 36)], { fill: colour });
  const bezel = new Rectangle({ width: 0.5, height: 0.3, fill: colour, stroke: 'none', cornerRadius: 0.06 }).moveTo([x, y + 0.38]);
  const engraved = [0, 1, 2, 3].map((k) => new Circle({ radius: 0.045, fill: deep, stroke: 'none' }).moveTo(polar([x, y + 0.38], 0.06, Math.PI / 4 + (k * Math.PI) / 2)));
  return new Group(band, bezel, ...engraved);
}

/**
 * The seal die, the delegated key, lying on its side from its knob (at the chain's foot) to its face
 * (against the wax): a lathe-turned handle, a knob, a bulb, a waist, a flared foot, a collar and the
 * engraved face that pressed the seal.
 */
function die(knobX: number, faceX: number, y: number, colour: string, deep: string): Group {
  const L = faceX - knobX;
  const profile: [number, number][] = [
    [0, 0.06], [0.01, 0.2], [0.035, 0.26], [0.07, 0.27], [0.1, 0.23], [0.13, 0.12], [0.24, 0.1], [0.34, 0.15], [0.47, 0.19],
    [0.6, 0.16], [0.69, 0.11], [0.8, 0.17], [0.88, 0.27], [0.9, 0.3], [1, 0.3],
  ];
  const top = profile.map(([f, h]): P => [knobX + f * L, y + h]), bottom = profile.map(([f, h]): P => [knobX + f * L, y - h]).reverse();
  return new Group(
    shape([[...top, ...bottom]], { fill: TONE.raised, stroke: colour, strokeWidth: STROKE.fine }),
    new Rectangle({ width: 0.08, height: 0.6, fill: deep, stroke: 'none' }).moveTo([knobX + 0.9 * L + 0.04, y]),
    new Rectangle({ width: 0.05, height: 0.6, fill: deep, stroke: 'none' }).moveTo([faceX - 0.025, y]),
  );
}

/** The ticket, one request, large: paper with a perforated head carrying typ, and a row per claim. */
function ticketOf(s: Stage, r: Request, foreign: boolean): Group {
  const w = TK.right - TK.left, h = TK.top - TK.bottom, rows = rowsOf(r);
  const parts: Mobject[] = [
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: 0.08 }).moveTo(TICKET_AT),
    ...Array.from({ length: 28 }, (_, i) => new Circle({ radius: 0.03, fill: TONE.paperLine, stroke: 'none' }).moveTo([PERF_X + 0.2 + i * ((TK.right - PERF_X - 0.5) / 27), HEAD_Y - 0.38])),
    ...Array.from({ length: 22 }, (_, i) => new Circle({ radius: 0.03, fill: TONE.paperLine, stroke: 'none' }).moveTo([PERF_X, TK.top - 0.25 - i * ((h - 0.5) / 21)])),
    words(s, r.session!.typ, { at: [NAME_X, HEAD_Y], mono: true, bold: true, color: TONE.print }),
  ];
  for (const row of ROWS) {
    const y = rowY(row);
    parts.push(words(s, row, { at: [NAME_X, y], mono: true, color: TONE.print }));
    if (row === 'ath' && r.session!.ath) {
      parts.push(key(s, { at: [VALUE_X + 0.45, y + 0.04], size: 0.42, teeth: 2, onPaper: true }));
      parts.push(words(s, rows.ath, { at: [VALUE_X + 1.1, y], mono: true, bold: true, color: TONE.print }));
    } else parts.push(words(s, rows[row], { at: [VALUE_X, y], mono: true, bold: rows[row] !== 'none', color: TONE.print }));
  }
  parts.push(seal(s, { at: SEAL_AT, r: 0.42, foreign }));
  return new Group(...parts);
}

/** A punched hole beside a row, diamond-shaped as a conductor's punch cuts it: the ground seen through the paper. */
const hole = (y: number) => shape([[[HOLE_X, y + 0.2], [HOLE_X + 0.2, y], [HOLE_X, y - 0.2], [HOLE_X - 0.2, y]]], { fill: TONE.ground });
/** A tear: a notch torn into the ticket's punch margin at a row, and the row's value struck through. */
function tear(y: number, valueWidth: number): Group {
  const e = TK.left - 0.02;
  return new Group(
    shape([[[e, y + 0.3], [e + 0.4, y + 0.12], [e + 0.24, y], [e + 0.44, y - 0.1], [e, y - 0.3]]], { fill: TONE.ground }),
    new Rectangle({ width: valueWidth + 0.2, height: 0.06, fill: TONE.print, stroke: 'none' }).moveTo([VALUE_X + valueWidth / 2, y + 0.02]),
  );
}

// ------------------------------------------------------------------ the picture

/** The state as its picture: the chain on the left, the punched ticket, what came back above it, what the Company reads on the right. */
export function drawWorld(w: SealWorld, shown: Shown, s: Stage): Group {
  const parts = keyedParts(), r = requestOf(w), last = w.last, owner = chainOwner(w);
  const [ink, deep] = owner === 'thief' ? [TONE.pewter, TONE.pewterDeep] : [TONE.ink, TONE.steel];
  const text = (k: string, value: string, o: Parameters<typeof words>[2]) => parts.add(words(s, value, o), k);

  // The chain, as far as the scene has explained it.
  if (shown.links >= 1) {
    parts.add(sheet(s, { at: SHEET_AT, width: 0.8, height: 1.0, lines: 3 }), 'chain:sheet');
    text('chain:sheet:name', 'agent.json', { at: [AXIS + 0.65, SHEET_AT[1]], mono: true });
    parts.add(signet(RING_AT, ink, deep), 'chain:ring');
    text('chain:ring:name', 'published key', { at: [AXIS + 0.65, RING_AT[1]] });
    parts.add(chain(AXIS, ...LINK_SPAN.client, statusOf(w, 'client')), `link:client:${statusOf(w, 'client')}`);
  } else text('chain:none', 'pressed by?', { at: [MARGIN.left, DIE_Y + 0.75], size: TYPE.label, color: TONE.soft });
  if (shown.links >= 3) {
    const sealed = r.session!.poppy_dlg;
    parts.add(chain(AXIS, ...LINK_SPAN.delegation, statusOf(w, 'delegation')), `link:delegation:${statusOf(w, 'delegation')}`);
    if (sealed) {
      parts.add(certificate(s, { at: CERT_AT, title: 'delegation', foreign: owner === 'thief' }), 'chain:cert');
      const left = Math.max(0, Math.min(1, (sealed.exp - nowOf(w)) / (sealed.exp - sealed.iat)));
      parts.add(clockFace(s, { at: [-6.5, -1.3], r: 0.32, remaining: left }), `chain:clock:${left > 0 ? 'running' : 'run-out'}`);
      text('chain:until', `${left > 0 ? 'until' : 'expired'} ${clock(sealed.exp).slice(0, 5)}`, { at: [-6.05, -1.3], bold: left === 0 });
      parts.add(chain(AXIS, ...LINK_SPAN.signature, statusOf(w, 'signature')), `link:signature:${statusOf(w, 'signature')}`);
      text('chain:die:name', 'delegated key', { at: [AXIS + 0.4, -2.62] });
      parts.add(die(AXIS, SEAL_AT[0] - 0.4, DIE_Y, ink, deep), 'chain:die');
    } else {
      // No delegation: the place where the pass would hang is empty, and the ring pressed the seal.
      parts.add(new Rectangle({ width: 4.0, height: 1.5, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, dashArray: '0.16 0.1', cornerRadius: 0.05 }).moveTo(CERT_AT), 'chain:cert:none');
      text('chain:cert:none:name', 'no delegation', { at: [CERT_AT[0], CERT_AT[1]], align: 'middle', color: TONE.soft });
    }
  }

  // The ticket, its holes and its tear.
  parts.add(ticketOf(s, r, owner === 'thief'), 'ticket');
  if (last) {
    for (const check of CHECKS) {
      const on = ROW_CHECK[check.id];
      if (!on) continue;
      const y = on === 'typ' ? HEAD_Y : rowY(on), state = statusOf(w, check.id);
      if (state === 'held') parts.add(hole(y), `hole:${on}`);
      if (state === 'broke') {
        const value = on === 'typ' ? r.session!.typ : rowsOf(r)[on];
        const width = words(s, value, { mono: true }).width() + (on === 'ath' && r.session!.ath ? 1.1 : 0);
        emphasised(parts.add(tear(y, width), `tear:${on}`), `refused at ${on}`);
      }
    }
  }

  // Above the ticket: what was sent, and what came back, appearing only once it has been checked.
  const top = MARGIN.top - 0.12;
  if (last) {
    const v = last.verdict;
    text('verdict:asked', ASKED[last.tamper], { at: [TK.left, top], color: TONE.soft });
    text('verdict:code', String(v.answer.status), { at: [TK.left - 0.06, 2.85], size: TYPE.display, mono: true, bold: true });
    emphasised(text('verdict:phrase', PHRASE[v.answer.status]!, { at: [TK.left + 3.05, 3.3], size: TYPE.title, bold: true }), `the answer: ${v.answer.status} ${PHRASE[v.answer.status]}, ${meaningOf(w)}`);
    text('verdict:meaning', meaningOf(w), { at: [TK.left + 3.05, 2.4] });
  } else {
    text('verdict:asked', ASKED.send, { at: [TK.left, top], color: TONE.soft });
    text('verdict:code', 'not checked yet', { at: [TK.left, 2.9], size: TYPE.label, color: TONE.soft });
  }

  // Right: what the Company reads as it checks. The time now; and what it remembers, for the two
  // optional checks, beside the rows they read.
  text('now:name', 'now', { at: [RIGHT_X, 1.52], color: TONE.soft });
  text('now:time', clock(nowOf(w)), { at: [RIGHT_X, 0.86], mono: true, bold: true });
  if (last) text('memory:title', 'optional', { at: [RIGHT_X, rowY('iat')], bold: true });
  if (last) text('memory:what', w.policy === 'remembers' ? 'remembers' : 'skipped', { at: [RIGHT_X, rowY('ath')], color: TONE.soft });
  if (last && w.policy === 'remembers') {
    const jtis = w.memory.jtis, keyUser = Object.values(w.memory.keyUser)[0];
    text('memory:jti', jtis.length ? (jtis.length === 1 ? jtis[0]! : `${jtis.length} seen`) : 'none yet', { at: [RIGHT_X, rowY('jti')], mono: jtis.length > 0, color: jtis.length ? TONE.ink : TONE.soft });
    text('memory:key', keyUser ? keyUser.slice(4) : 'none yet', { at: [RIGHT_X, rowY('sub')], mono: !!keyUser, color: keyUser ? TONE.ink : TONE.soft });
  }
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
