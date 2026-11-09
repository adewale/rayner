import { Rectangle, Text } from '../../../src/index.ts';
import type { Group } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { AGENT, COMPANY, OPERATIONS, SID, THIEF, USER_IDS, ruleOf } from './model.ts';
import type { Exchange, Scope, World } from './model.ts';

// One state as a picture, in three columns. Left, what the agent holds. Right, what the Company
// knows. Between them, the last thing sent: a slip with one slot for each proof (who is asking, and
// what the account allows) and the Company's answer under it.

const PHRASE: Record<number, string> = { 200: 'OK', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };
const scopesOf = (scopes: readonly Scope[]) => scopes.join(' ');

type Tone = 'good' | 'bad' | 'plain';
/** The words of the slip: who sent what, the two slots, and what came back. */
export type Slip = {
  sender: string;
  line: string;
  who: { name: string; means: string; value: string; tone: Tone };
  what: { name: string; means: string; value: string; tone: Tone };
  status?: { code: string; outcome: string; tone: Tone };
};

/** What the last exchange put on the slip, in the reader's words. */
export function slipOf(w: World): Slip {
  const last: Exchange | null = w.last;
  const header = { name: 'Poppy-Session', means: 'who is asking' }, auth = { name: 'Authorization', means: 'what your account allows' };
  if (!last)
    return {
      sender: 'Nothing sent yet',
      line: 'example.com/.well-known/poppy.json',
      who: { ...header, value: 'not sent', tone: 'plain' },
      what: { ...auth, value: 'not sent', tone: 'plain' },
    };
  if (last.kind === 'sign-in')
    return {
      sender: 'You sign in',
      line: 'auth.example.com/oauth/authorize',
      who: { name: 'Your browser', means: 'who is asking', value: 'you, on the Company’s page', tone: 'plain' },
      what: { name: 'Consent', means: 'what you approve', value: scopesOf(last.granted), tone: 'good' },
      status: { code: 'Approved', outcome: 'tokens go to agent.example only', tone: 'good' },
    };
  if (last.kind === 'revoke')
    return {
      sender: 'Your agent signs out',
      line: 'POST auth.example.com/oauth/revoke',
      who: { name: 'Client assertion', means: 'who is asking', value: AGENT.name, tone: 'plain' },
      what: { name: 'Refresh token', means: 'what it gives up', value: scopesOf(w.approves), tone: 'plain' },
      status: { code: '200 OK', outcome: 'account access has ended', tone: 'plain' },
    };
  const op = OPERATIONS[last.op], { status, error, needs } = last.answer, thief = last.by === 'thief';
  const outcome =
    status === 200 ? { cart: 'the medium is in the cart', order: 'here is order 1042', exchange: 'the exchange is made' }[last.op]
    : status === 401 ? `sign in for ${needs}`
    : status === 403 ? `the token lacks ${needs}`
    : thief ? `that token is ${AGENT.name}’s`
    : (last.answer.reason ?? 'refused');
  return {
    sender: thief ? 'A thief sends' : 'Your agent sends',
    line: `${op.method} ${op.path}`,
    who: { ...header, value: `signed by ${thief ? THIEF.name : AGENT.name}`, tone: thief ? 'bad' : 'plain' },
    what: { ...auth, value: last.token ? (thief ? 'the agent’s copied token' : scopesOf(w.approves)) : 'no access token', tone: last.token && !thief ? 'good' : 'plain' },
    status: { code: `${status} ${error ?? PHRASE[status]}`, outcome, tone: status === 200 ? 'good' : 'bad' },
  };
}

/** What the Company knows, row by row: only what verified requests have told it. */
export function knownBy(w: World): [string, string][] {
  return [
    ['Agent', w.started ? AGENT.name : 'not met yet'],
    ['User ID', w.started ? USER_IDS[COMPANY.domain] : 'not met yet'],
    ['Session', w.started ? `${SID}: ${w.cart ? '1 in cart' : 'cart empty'}` : 'none'],
    ['Account', w.linked === 'yes' ? `linked: ${w.approves.length > 1 ? 'read + write' : 'read only'}` : w.linked === 'no' ? 'not linked' : 'signed out'],
  ];
}

/** What the agent holds for this User: a User ID for each Company, the Session ID it chose for this errand, and a refresh token once the User signs in. */
export function heldBy(w: World): [string, string][] {
  return [
    ...Object.entries(USER_IDS).map(([domain, id]): [string, string] => [`User ID at ${domain}`, id]),
    ['Session ID, this errand', SID],
    ['Refresh token', w.grant ? scopesOf(w.approves) : 'none'],
  ];
}

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World): string {
  const last = w.last, scopes = scopesOf(w.approves);
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
  return `${sent} ${known} The agent holds ${w.grant ? `a refresh token for ${scopes}` : 'no refresh token'}.`;
}

const LEFT = -5.5, RIGHT = 5.5, COLUMN = 4.5, SLIP = 5.8, TOP = 2.62;

/** The state as its picture: the agent's column, the slip, and the Company's column. */
export function drawWorld(w: World, s: Stage): Group {
  const { ink, soft, good, bad, emphasis, raised, rule: hairline, paper } = s.look, shaping = s.scene.textShaping;
  const parts = keyedParts();
  const tone = (t: Tone) => (t === 'good' ? good : t === 'bad' ? bad : ink);
  const text = (key: string, value: string, at: [number, number], o: { size: number; color?: string; bold?: boolean; mono?: boolean; end?: boolean; middle?: boolean }) =>
    parts.add(
      new Text(value, { fontSize: o.size, color: o.color ?? ink, shaping, anchor: o.end ? 'end' : o.middle ? 'middle' : 'start', ...(o.bold ? { weight: 'bold' as const } : {}), ...(o.mono ? { font: 'mono' as const } : {}) })
        .moveTo(at, [o.end ? 1 : o.middle ? 0 : -1, 0]),
      key,
    );
  const box = (key: string, centre: [number, number], width: number, height: number, o: { stroke?: string; fill?: string; fillOpacity?: number; strokeWidth?: number } = {}) =>
    parts.add(new Rectangle({ width, height, stroke: o.stroke ?? hairline, strokeWidth: o.strokeWidth ?? 0.03, fill: o.fill ?? raised, fillOpacity: o.fillOpacity ?? 1, cornerRadius: 0.12 }).moveTo(centre), key);

  /** A column: its name, its domain, and its rows on a panel, each a small label over its value. */
  const column = (key: string, x: number, name: string, domain: string, rows: [string, string][], changed: (label: string) => boolean) => {
    const left = x - COLUMN / 2 + 0.25, pitch = 1.08, height = rows.length * pitch + 0.3;
    text(`${key}:name`, name, [x - COLUMN / 2, TOP], { size: 0.4, bold: true });
    text(`${key}:domain`, domain, [x + COLUMN / 2, TOP - 0.02], { size: 0.27, color: soft, mono: true, end: true });
    box(`${key}:panel`, [x, TOP - 0.45 - height / 2], COLUMN, height);
    rows.forEach(([label, value], i) => {
      const y = TOP - 0.95 - i * pitch, quiet = value === 'none' || value === 'not met yet' || value === 'not linked';
      text(`${key}:${label}:label`, label, [left, y], { size: 0.25, color: soft });
      const shown = text(`${key}:${label}:value`, value, [left, y - 0.45], { size: 0.29, color: quiet ? soft : changed(label) ? emphasis : ink });
      // A value the last exchange changed is a mark: the phone's tour stops on it, and the description names it.
      if (changed(label)) emphasised(shown, `changed: ${name}, ${label} is now ${value}`);
    });
  };

  const last = w.last, request = last?.kind === 'request' ? last : null;
  // What the last exchange changed is drawn in the emphasis colour, where it changed.
  column('agent', LEFT, 'Your agent', AGENT.name, heldBy(w), (label) => label === 'Refresh token' && last?.kind === 'sign-in');
  column('company', RIGHT, 'The Company', COMPANY.domain, knownBy(w), (label) =>
    !!request && request.by === 'agent' && request.answer.error !== 'invalid_session' && (label === 'Account' ? request.token : label === 'Session' && request.op === 'cart'));

  const slip = slipOf(w), x0 = -SLIP / 2 + 0.3, x1 = SLIP / 2 - 0.3;
  text('slip:sender', slip.sender, [-SLIP / 2, TOP], { size: 0.4, bold: true });
  text('slip:line', slip.line, [-SLIP / 2, TOP - 0.55], { size: 0.25, color: soft, mono: true });
  ([['who', slip.who, 1.02], ['what', slip.what, -0.42]] as const).forEach(([key, slot, y]) => {
    const sent = slot.value !== 'not sent' && slot.value !== 'no access token';
    const frame = box(`slip:${key}:box`, [0, y], SLIP, 1.24, { stroke: sent ? tone(slot.tone) : hairline, fill: sent ? raised : paper, strokeWidth: sent ? 0.045 : 0.03 });
    if (!sent) frame.style.dashArray = '0.14 0.1';
    text(`slip:${key}:name`, slot.name, [x0, y + 0.3], { size: 0.25, mono: true, color: sent ? ink : soft });
    text(`slip:${key}:means`, slot.means, [x1, y + 0.3], { size: 0.25, color: soft, end: true });
    text(`slip:${key}:value`, slot.value, [x0, y - 0.22], { size: 0.31, color: sent ? tone(slot.tone) : soft });
  });
  if (slip.status) {
    const colour = tone(slip.status.tone);
    const answer = box('slip:answer:box', [0, -2.02], SLIP, 1.44, { stroke: colour, fill: slip.status.tone === 'plain' ? raised : colour, fillOpacity: slip.status.tone === 'plain' ? 1 : 0.1, strokeWidth: 0.05 });
    emphasised(answer, `the answer: ${slip.status.code}, ${slip.status.outcome}`);
    text('slip:answer:code', slip.status.code, [x0, -1.72], { size: 0.42, bold: true, color: colour });
    text('slip:answer:outcome', slip.status.outcome, [x0, -2.36], { size: 0.3 });
  }
  // The rule that decided this picture, with its section of the draft.
  const rule = ruleOf(last), bandLeft = LEFT - COLUMN / 2, bandWidth = RIGHT - LEFT + COLUMN;
  box('rule:band', [0, -3.62], bandWidth, 0.86, { stroke: hairline, fill: paper });
  text('rule:section', `Poppy 0.4 §${rule.section}`, [bandLeft + 0.3, -3.62], { size: 0.27, mono: true, color: emphasis });
  text('rule:says', rule.says, [bandLeft + 3.0, -3.62], { size: 0.3 });
  return parts.group();
}
