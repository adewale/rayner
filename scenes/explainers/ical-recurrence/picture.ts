import { Group, Rectangle, Text, keyed } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { DTSTART, GUEST, MOVED_FROM, MASTER, counts, expand, occurrences, parseRule, short } from './model.ts';
import type { Change, VEvent, Week } from './model.ts';
import { counted } from '../lib/format.ts';

// How the explainer's lists and the copies picture look, drawn from the model's VEVENTs alone.

export const RULE_STARTS = occurrences(DTSTART, parseRule(MASTER.rrules[0]!));
export const week = (slot: string) => `Week ${RULE_STARTS.indexOf(slot) + 1}`;

/**
 * Alice's meeting list, one row per week of the rule: the start her calendar shows, with what makes
 * it differ from the rule.
 */
export function rows(components: readonly VEvent[]): [string, string][] {
  const meetings = new Map(expand(components).map((m) => [m.slot, m]));
  return RULE_STARTS.map((slot) => {
    const m = meetings.get(slot);
    if (!m) return [week(slot), 'skipped, EXDATE'];
    const c = components.find((v) => v.recurrenceId === slot);
    const notes = [
      m.start !== slot && 'moved',
      c?.attendees.includes(GUEST) && 'with Bob',
      m.cancelled && 'cancelled',
    ].filter(Boolean);
    return [week(slot), [short(m.start), ...notes].join(', ')];
  });
}
/** Bob's meeting list: his calendar knows nothing of weeks, only the meetings his copy holds, each [start, cancelled]. */
export const guestRows = (meetings: readonly (readonly [string, boolean])[]): [string, string][] =>
  meetings.map(([start, cancelled]) => ['Stand-up', [short(start), ...(cancelled ? ['cancelled'] : [])].join(', ')]);

// ------------------------------------------------------------------ the copies picture
// Alice's and Bob's stored objects side by side, each over the six weeks of Alice's rule (weeks() in
// the model): Alice's master generates them and excludes one; Bob's copy has nothing to generate them.
/** One stored copy as the copies step records it: what it counts, its weeks of Alice's rule, and its VEVENTs. */
export interface CopyState { stored: ReturnType<typeof counts>; weeks: Week[]; components: VEvent[] }
export interface CopiesState { change: Change; alice: CopyState; bob: CopyState & { sent: string[] } }
export const day = (t: string) => short(t).split(', ')[0]!.split(' ').slice(1).join(' ');
/**
 * Alice's and Bob's stored objects and their weeks, drawn from the step's state alone: each column lists a copy's
 * VEVENTs, and each strip its weeks of Alice's rule (weeks() in the model), dated from the copy's own meetings.
 */
export const copiesPicture = (st: { copies: CopiesState }, s: Stage) => {
  const { change: edit, alice, bob } = st.copies;
  const TOP = 0.3,
    WEEK = 0.33;
  const text = (t: string, size: number, color: string, at: [number, number], anchor?: 'start', weight?: 'bold') => {
    const m = new Text(t, { fontSize: size, color, ...(anchor ? { anchor } : {}), ...(weight ? { weight } : {}) });
    return anchor ? m.moveTo(at, [-1, 0]) : m.moveTo(at);
  };
  const box = (w: number, h: number, stroke: string, width: number, dashed: boolean) => {
    const r = new Rectangle({ width: w, height: h, stroke, strokeWidth: width, fill: 'none', cornerRadius: 0.08 });
    if (dashed) r.style.dashArray = '0.12 0.08';
    return r;
  };
  const column = (who: 'alice' | 'bob', x0: number) => {
    const cs = who === 'alice' ? alice.components : bob.components;
    const parts: (Text | Rectangle)[] = [
      text(who === 'alice' ? 'Alice’s stored object' : 'Bob’s stored object', TOP, s.look.ink, [x0, 2.85], 'start', 'bold'),
      text(
        who === 'alice'
          ? edit === 'skip'
            ? 'Her app adds EXDATE to the master'
            : edit === 'move'
              ? `Her app adds an override for ${day(MOVED_FROM)}`
              : 'As saved after inviting Bob'
          : `iTIP sent to him: ${bob.sent.join(', then ')}`,
        0.3,
        s.look.soft,
        [x0, 2.3],
        'start',
      ),
    ];
    const rows: [string, string, boolean][] = cs.map((c) => [c.recurrenceId === null ? 'Master' : 'Override', detail(c, who === 'alice'), false]);
    if (who === 'bob') rows.unshift(['Master', 'none, so no RRULE', true]);
    rows.forEach(([kind, what, missing], i) => {
      const y = 1.6 - i * 0.66;
      parts.push(
        box(7.2, 0.58, missing ? s.look.soft : s.look.ink, 0.03, missing).moveTo([x0 + 3.6, y]),
        text(kind, TOP, missing ? s.look.soft : s.look.ink, [x0 + 0.15, y], 'start', 'bold'),
        text(what, TOP, missing ? s.look.soft : s.look.ink, [x0 + 1.5, y], 'start'),
      );
    });
    const g = new Group(...parts);
    keyed(g, who === 'alice' ? 'copies-alice' : 'copies-bob');
    return g;
  };
  const STYLE: Record<Week, { stroke: string; width: number; dashed: boolean; label: boolean; word?: string; ink: string }> = {
    meeting: { stroke: s.look.ink, width: 0.03, dashed: false, label: true, ink: s.look.ink },
    moved: { stroke: s.look.emphasis, width: 0.05, dashed: false, label: true, word: 'moved', ink: s.look.emphasis },
    cancelled: { stroke: s.look.bad, width: 0.06, dashed: false, label: true, word: 'cancelled', ink: s.look.bad },
    excluded: { stroke: s.look.soft, width: 0.03, dashed: true, label: true, word: 'EXDATE', ink: s.look.soft },
    absent: { stroke: s.look.soft, width: 0.03, dashed: true, label: false, ink: s.look.soft },
  };
  const strip = (c: CopyState, name: string, top: number) => {
    const shown = expand(c.components);
    const n = c.weeks.filter((w) => w !== 'excluded' && w !== 'absent').length;
    const parts: (Text | Rectangle)[] = [text(`${name}: ${counted(n, 'meeting', { words: true })}`, WEEK, s.look.ink, [-3.6, top], 'start', 'bold')];
    const cell = 1.14,
      gap = 0.06;
    c.weeks.forEach((w, i) => {
      const slot = RULE_STARTS[i]!,
        x = -3.6 + cell / 2 + i * (cell + gap),
        y = top - 0.75,
        look = STYLE[w];
      parts.push(box(cell, 0.92, look.stroke, look.width, look.dashed).moveTo([x, y]));
      const [date, month] = day(shown.find((m) => m.slot === slot)?.start ?? slot).split(' ');
      if (look.label) parts.push(text(date!, WEEK, look.ink, [x, y + 0.19]), text(month!, WEEK, look.ink, [x, y - 0.19]));
      if (look.word) parts.push(text(look.word, WEEK, look.ink, [x, y - 0.72]));
    });
    return parts;
  };
  const weeksBlock = new Group(...strip(alice, 'Alice’s calendar', -0.55), ...strip(bob, 'Bob’s calendar', -2.5));
  keyed(weeksBlock, 'copies-weeks');
  return new Group(column('alice', -7.55), column('bob', 0.35), weeksBlock);
};
/** One VEVENT as a row: what kind it is, and the lines that matter here. */
const detail = (c: VEvent, mine: boolean) => {
  if (c.recurrenceId === null) return `RRULE ${c.rrules.map((r) => r.replace('FREQ=WEEKLY;', '')).join(', ')}${c.exdates.length ? `, EXDATE ${c.exdates.map(day).join(', ')}` : ''}`;
  const notes = [
    c.dtstart !== c.recurrenceId && `now ${day(c.dtstart)}`,
    mine && c.attendees.includes(GUEST) && 'with Bob',
    c.status === 'CANCELLED' && 'CANCELLED',
  ].filter(Boolean);
  return [`RECURRENCE-ID ${day(c.recurrenceId)}`, ...notes].join(', ');
};
