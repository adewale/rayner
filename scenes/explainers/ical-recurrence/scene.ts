import { Scene, Group, Rectangle, Text, view } from '../../../src/index.ts';
import type { Box, MatchKey, Mobject } from '../../../src/index.ts';
import { stage, settingsOf, Card, CodeBlock } from '../../../explain/index.ts';
import type { Diagram, Stage } from '../../../explain/index.ts';
import {
  DTSTART,
  GUEST,
  GUEST_MEETING,
  INVITED,
  MOVED_FROM,
  MOVED_TO,
  SERIES,
  SERVER_CASES,
  copyOf,
  counts,
  deliver,
  erSource,
  expand,
  guestCopy,
  lines,
  long,
  messageFor,
  occurrences,
  organiserCopy,
  parseRule,
  schema,
  short,
  validate,
  weeks,
  MASTER,
} from './model.ts';
import type { Change, Copy, VEvent, Week } from './model.ts';
import { stagedStep } from '../../../explain/index.ts';
import { numberWord } from '../lib/format.ts';

// Sources: RFC 5545 and RFC 4791 (sections and lines are quoted in ../lib/ical-recurrence.ts), and
// sabre/vobject 4.5.7 with sabre/dav 4.7.0, the library and server inside Baïkal.
const VOBJECT = 'https://github.com/sabre-io/vobject/blob/ff22611a53782e90c97be0d0bc4a5f98a5c0a12c/lib/';
const DAV = 'https://github.com/sabre-io/dav/blob/074373bcd689a30bcf5aaa6bbb20a3395964ce7a/lib/CalDAV/';
const STYLE = 'github-light';

// Code on the left, the meeting list on the right; the ER diagram takes the whole stage.
const CODE: Box = [-7.55, -4.1, -0.05, 3.1];
const LIST: Box = [0.25, -4.1, 7.55, 3.1];
const FULL: Box = [-7.8, -4.3, 7.8, 3.3];
const CODE_SIZE = 0.28;
const LIST_SIZE = 0.3;
const LIST_WIDTH = 7.3;

const CHANGES: Record<Change, string> = {
  none: 'No other change',
  move: 'Move the second meeting',
  skip: 'Skip Bob’s meeting',
};
const COPIES: Record<Copy, string> = { organiser: 'Alice’s, the organiser', guest: 'Bob’s, a guest at one meeting' };

const RULE_STARTS = occurrences(DTSTART, parseRule(MASTER.rrules[0]!));
const week = (slot: string) => `Week ${RULE_STARTS.indexOf(slot) + 1}`;
const plural = (n: number, word: string) => `${numberWord(n)} ${word}${n === 1 ? '' : 's'}`;
const upperFirst = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** The script's one-sentence answer (meta.answer), which the copy step states in every scenario. */
const ANSWER =
  'a guest’s calendar keeps only the meetings it was sent, and on this server a cancellation marks the guest’s copy CANCELLED instead of deleting it';

// Check 1: Alice skips the fifth meeting instead of Bob's. COUNT still counts it, so the series does not
// run a week longer, and Bob is still in his override, so his copy keeps it uncancelled.
const FIFTH = RULE_STARTS[4]!;
const SKIP_FIFTH: VEvent[] = [{ ...MASTER, exdates: [FIFTH] }, ...INVITED.slice(1)];
const FIFTH_LEFT = expand(SKIP_FIFTH);
const FIFTH_MESSAGE = messageFor(INVITED, SKIP_FIFTH, GUEST);
const FIFTH_BOB = FIFTH_MESSAGE ? deliver(FIFTH_MESSAGE, guestCopy('none').copy) ?? [] : [];
if (FIFTH_LEFT.length !== 5 || FIFTH_LEFT.at(-1)!.start !== RULE_STARTS.at(-1) || expand(FIFTH_BOB).map((m) => `${m.start}${m.cancelled}`).join() !== `${GUEST_MEETING}false`)
  throw new Error('Skipping the fifth meeting must leave five meetings ending on the sixth start, and Bob’s meeting uncancelled');
// Check 3: what Bob's copy lacks to rebuild the series.
const BOB = counts(guestCopy('skip').copy);
if (BOB.masters || BOB.rrules) throw new Error('Bob’s copy must hold no master and no RRULE');

/**
 * Alice's meeting list, one row per week of the rule: the start her calendar shows, with what makes
 * it differ from the rule.
 */
function rows(components: readonly VEvent[]): [string, string][] {
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
const guestRows = (meetings: readonly (readonly [string, boolean])[]): [string, string][] =>
  meetings.map(([start, cancelled]) => ['Stand-up', [short(start), ...(cancelled ? ['cancelled'] : [])].join(', ')]);
/**
 * A card's parts paired by what they say and where, so a sync keeps an unchanged row still and crossfades a changed
 * value, as Card.set does; the panel and its bar pair by place.
 */
const sameWords: MatchKey = (part, root) => {
  for (let m: Mobject | null = part; m && m !== root; m = m.parent)
    if (m instanceof Text) return `${m.text}|${m.anchorPoint().map((v) => v.toFixed(3)).join(',')}|${m.children.indexOf(part)}`;
  return `${part.constructor.name}|${root.family().indexOf(part)}`;
};

export default class IcalRecurrenceExplainer extends Scene {
  static meta = {
    id: 'ical-recurrence',
    title: 'Why can a cancelled meeting remain in a guest’s calendar?',
    sources: [
      'https://www.rfc-editor.org/rfc/rfc5545#section-3.6.1',
      'https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10',
      'https://www.rfc-editor.org/rfc/rfc5545#section-3.8.4.4',
      'https://www.rfc-editor.org/rfc/rfc5545#section-3.8.5.1',
      'https://www.rfc-editor.org/rfc/rfc5545#section-3.8.5.3',
      'https://www.rfc-editor.org/rfc/rfc4791#section-4.1',
      VOBJECT + 'Component/VEvent.php#L106-L138',
      VOBJECT + 'Component.php#L626-L647',
      VOBJECT + 'Component/VCalendar.php#L448-L485',
      VOBJECT + 'ITip/Broker.php#L269-L317',
      VOBJECT + 'ITip/Broker.php#L459-L620',
      DAV + 'Plugin.php#L843-L874',
      DAV + 'Schedule/Plugin.php#L407-L530',
    ],
    // The script's answer and check questions (script.md); the copy step states the answer.
    answer: ANSWER,
    // Sentences that reach past the scenarios on screen, and the test that holds each.
    claims: [
      { says: 'invites Bob to the third meeting only', shown: true as const },
      { says: 'keeps only the meetings it was sent', test: 'test/explain-ical-recurrence.test.ts: the guest’s messages and copy are the ones sabre/vobject’s Broker produces' },
      { says: 'only the VEVENTs', test: 'test/explain-ical-recurrence.test.ts: property: a guest gets exactly the overrides they attend' },
      { says: 'only the override Bob attends', test: 'test/explain-ical-recurrence.test.ts: the guest’s messages and copy are the ones sabre/vobject’s Broker produces' },
      { says: 'never appears in it', test: 'test/explain-ical-recurrence.test.ts: each copy holds what Baïkal stored' },
      { says: 'Bob has no rule, only that meeting', test: 'test/explain-ical-recurrence.test.ts: the copies view' },
      { says: 'puts every VEVENT with one UID in one calendar object', test: 'test/explain-ical-recurrence.test.ts: every marker in the ER source says what the model allows' },
    ],
    checks: [
      {
        question: `Alice skips the fifth meeting, ${long(FIFTH)}, instead of Bob’s, by adding EXDATE:${FIFTH}. How many meetings does her calendar show, and when is the last? What does Bob’s calendar show?`,
        answer: `Alice’s shows ${numberWord(FIFTH_LEFT.length)}, the last still on ${long(FIFTH_LEFT.at(-1)!.start)}: COUNT=6 counts the excluded start, so the series does not run a week longer. Bob is still in the third meeting’s override, so any update the server sends him carries that override again, and his calendar keeps ${long(GUEST_MEETING)}, not cancelled.`,
      },
      {
        question: 'Alice moves the second meeting, which Bob does not attend. Before trying that setting: does Bob’s copy change, and why?',
        answer: 'No. The iTIP REQUEST the server sends him holds only the VEVENTs he attends, the third meeting’s override, so his copy keeps that one VEVENT and never learns of the move.',
      },
      {
        question: 'Bob’s calendar app wants to show him the rest of the stand-up series. Which lines would it need that his stored copy lacks?',
        answer: `The master’s DTSTART and RRULE. His copy holds ${plural(BOB.overrides, 'override')} and ${plural(BOB.masters, 'master')}, so it has no rule to generate the other weeks from; only the organiser’s object has one.`,
      },
    ],
  };
  static settings = [
    {
      id: 'change',
      label: 'Alice’s change',
      default: 'skip',
      options: (Object.keys(CHANGES) as Change[]).map((value) => ({ value, label: CHANGES[value] })),
    },
    {
      id: 'copy',
      label: 'Whose copy',
      default: 'guest',
      options: (Object.keys(COPIES) as Copy[]).map((value) => ({ value, label: COPIES[value] })),
    },
  ];

  override async construct() {
    const values = settingsOf(this);
    const change = values.change as Change,
      copy = values.copy as Copy;
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const after = organiserCopy(change);

    // ------------------------------------------------------------------ series
    await this.step('series', {
      title: 'A weekly stand-up is stored as one VEVENT',
      line: 'DTSTART is the first meeting; RRULE with COUNT=6 makes six.',
      // RFC 5545 §3.3.10, lines 2272–2274: COUNT; DTSTART counts as the first occurrence.
      caption: `Alice cancels one meeting of her weekly stand-up. Bob, invited to that meeting alone, can still find it in his calendar, marked cancelled. To see why, start with how Alice’s app stores the series: as one VEVENT, the iCalendar record for an event. DTSTART is the first meeting, ${long(DTSTART)} 2026 at 09:00 UTC. RRULE repeats it weekly, and COUNT=6 stops after six meetings, with DTSTART counting as the first. The list shows the meetings a calendar computes from those two lines.`,
    });
    await s.clear();
    const code: CodeBlock = await s.code(lines(SERIES), {
      at: CODE,
      align: 'top',
      fontSize: CODE_SIZE,
      title: 'Alice’s stored object, some lines left out',
    });
    // `components`: the VEVENTs Alice's object holds after each step, which her meeting list is computed from.
    this.state.series = { vevents: SERIES.length, meetings: expand(SERIES).map((m) => m.start), components: SERIES };
    /** The object as it stands: the change's, else the invitation's, else the series'. */
    const stored = (st: Record<string, unknown>) => ((st.change ?? st.invite ?? st.series) as { components: VEvent[] }).components;
    // `shown.listMark`: the meeting the list lights and what the description calls it, or none.
    const list = view(
      this,
      (st, shown) => {
        const mark = shown.listMark as { row: string; as: string } | null | undefined;
        return new Card(this, s.palette, rows(stored(st)), {
          at: LIST,
          align: 'top',
          width: LIST_WIDTH,
          fontSize: LIST_SIZE,
          title: 'Meetings Alice’s calendar shows',
          ...(mark ? { lit: mark.row, litAs: mark.as } : {}),
        });
      },
      { place: false },
    );
    await s.enter(list, { runTime: 0.35, shift: [0, -0.08] });

    // ------------------------------------------------------------------ invite
    await this.step('invite', {
      title: 'Inviting Bob to one meeting stores a second VEVENT',
      line: `Same UID, and RECURRENCE-ID ${GUEST_MEETING} names the third meeting.`,
      // RFC 5545 §3.8.4.4, lines 6294–6306: UID names the set, RECURRENCE-ID one instance, by its original start.
      caption: `Alice invites Bob to the third meeting only. The app keeps the first VEVENT as it was and adds a second with the same UID, an override. Its RECURRENCE-ID, ${GUEST_MEETING}, is the start the rule gave that meeting, kept even if the meeting moves. Bob is sent this override and nothing else. His copy has one occurrence, not the master rule that generates Alice’s whole series.`,
    });
    await code.morph(lines(INVITED), { markAdded: true });
    this.state.invite = { stored: counts(INVITED), meetings: expand(INVITED).map((m) => m.start), components: INVITED };
    this.shown.listMark = { row: week(GUEST_MEETING), as: 'the override' };
    await this.play(list.sync({ runTime: 0.45, match: sameWords }));

    // ------------------------------------------------------------------ change
    const moved = expand(after).find((m) => m.slot === MOVED_FROM)!;
    await this.step('change', {
      title:
        change === 'move'
          ? 'Moving the second meeting stores a third VEVENT'
          : change === 'skip'
            ? `Skipping Bob’s meeting adds an EXDATE; ${numberWord(expand(after).length)} meetings remain`
            : 'Five meetings come from the rule, one from the override',
      line:
        copy === 'guest'
          ? 'Predict: what does Bob’s calendar show now?'
          : change === 'move'
            ? 'RECURRENCE-ID keeps the rule’s start; DTSTART holds the new one.'
            : change === 'skip'
              ? 'COUNT=6 still counts the excluded start; the override is deleted.'
              : 'The override replaces the start that equals its RECURRENCE-ID.',
      caption:
        change === 'move'
          ? `Alice moves the second meeting to ${long(MOVED_TO)} at 14:00. The first VEVENT does not change, and its rule still gives ${long(MOVED_FROM)}. A third VEVENT, an override with RECURRENCE-ID ${MOVED_FROM}, that original start, carries the new DTSTART, and calendars show it in the Monday’s place.`
          : change === 'skip'
            ? // RFC 5545 §3.8.5.1, lines 6630–6634: the set is the rule's starts with the EXDATEs taken out.
              `Alice cancels the third meeting. Her app adds EXDATE:${GUEST_MEETING} to the first VEVENT and deletes the override that invited Bob. COUNT=6 still counts the excluded start, because RFC 5545 generates the rule’s starts first and then removes EXDATEs, so ${numberWord(expand(after).length)} meetings remain.`
            : 'Alice changes nothing else, so the object keeps two VEVENTs. A calendar takes all six starts from the rule, then puts the override in place of the start that equals its RECURRENCE-ID. Five meetings come from the first VEVENT and one from the second.',
    });
    this.state.change = {
      change,
      stored: counts(after),
      meetings: expand(after).map((m) => m.start),
      ...(change === 'move' ? { moved: { from: moved.slot, to: moved.start } } : {}),
      components: after,
    };
    if (change === 'none') {
      await code.clearMarks();
      await code.focus([0, 4], { as: 'the master' });
      this.shown.listMark = null;
      await this.play(list.sync({ runTime: 0.3, match: sameWords }));
    } else {
      await code.morph(lines(after), { markAdded: true });
      this.shown.listMark = { row: week(change === 'move' ? MOVED_FROM : GUEST_MEETING), as: change === 'move' ? 'moved' : 'skipped' };
      await this.play(list.sync({ runTime: 0.45, match: sameWords }));
    }

    // ------------------------------------------------------------------ copies
    // Alice's and Bob's stored objects side by side, each over the six weeks of Alice's rule (weeks() in
    // the model): Alice's master generates them and excludes one; Bob's copy has nothing to generate them.
    /** One stored copy as the copies step records it: what it counts, its weeks of Alice's rule, and its VEVENTs. */
    interface CopyState { stored: ReturnType<typeof counts>; weeks: Week[]; components: VEvent[] }
    interface CopiesState { change: Change; alice: CopyState; bob: CopyState & { sent: string[] } }
    const day = (t: string) => short(t).split(', ')[0]!.split(' ').slice(1).join(' ');
    /**
     * Alice's and Bob's stored objects and their weeks, drawn from the step's state alone: each column lists a copy's
     * VEVENTs, and each strip its weeks of Alice's rule (weeks() in the model), dated from the copy's own meetings.
     */
    const copiesPicture = (st: { copies: CopiesState }, s: Stage) => {
      const { change: edit, alice, bob } = st.copies;
      const pal = s.palette,
        TOP = 0.3,
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
          text(who === 'alice' ? 'Alice’s stored object' : 'Bob’s stored object', TOP, pal.ink, [x0, 2.85], 'start', 'bold'),
          text(
            who === 'alice'
              ? edit === 'skip'
                ? 'Her app adds EXDATE to the master'
                : edit === 'move'
                  ? `Her app adds an override for ${day(MOVED_FROM)}`
                  : 'As saved after inviting Bob'
              : `iTIP sent to him: ${bob.sent.join(', then ')}`,
            0.3,
            s.soft,
            [x0, 2.3],
            'start',
          ),
        ];
        const rows: [string, string, boolean][] = cs.map((c) => [c.recurrenceId === null ? 'Master' : 'Override', detail(c, who === 'alice'), false]);
        if (who === 'bob') rows.unshift(['Master', 'none, so no RRULE', true]);
        rows.forEach(([kind, what, missing], i) => {
          const y = 1.6 - i * 0.66;
          parts.push(
            box(7.2, 0.58, missing ? s.soft : pal.ink, 0.03, missing).moveTo([x0 + 3.6, y]),
            text(kind, TOP, missing ? s.soft : pal.ink, [x0 + 0.15, y], 'start', 'bold'),
            text(what, TOP, missing ? s.soft : pal.ink, [x0 + 1.5, y], 'start'),
          );
        });
        const g = new Group(...parts);
        g.key = who === 'alice' ? 'copies-alice' : 'copies-bob';
        return g;
      };
      const STYLE: Record<Week, { stroke: string; width: number; dashed: boolean; label: boolean; word?: string; ink: string }> = {
        meeting: { stroke: pal.ink, width: 0.03, dashed: false, label: true, ink: pal.ink },
        moved: { stroke: s.emphasis, width: 0.05, dashed: false, label: true, word: 'moved', ink: s.emphasis },
        cancelled: { stroke: s.bad, width: 0.06, dashed: false, label: true, word: 'cancelled', ink: s.bad },
        excluded: { stroke: s.soft, width: 0.03, dashed: true, label: true, word: 'EXDATE', ink: s.soft },
        absent: { stroke: s.soft, width: 0.03, dashed: true, label: false, ink: s.soft },
      };
      const strip = (c: CopyState, name: string, top: number) => {
        const shown = expand(c.components);
        const n = c.weeks.filter((w) => w !== 'excluded' && w !== 'absent').length;
        const parts: (Text | Rectangle)[] = [text(`${name}: ${plural(n, 'meeting')}`, WEEK, pal.ink, [-3.6, top], 'start', 'bold')];
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
      weeksBlock.key = 'copies-weeks';
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
    // Alice's and Bob's stored objects side by side, each over the six weeks of Alice's rule: Alice's master
    // generates them and excludes one; Bob's copy has nothing to generate them. A staged step: the stage is
    // cleared and the picture drawn from the step's state.
    const copiesStep = () => {
      const bob = guestCopy(change),
        alice = after;
      const na = counts(alice),
        nb = counts(bob.copy);
      const wa = weeks(alice),
        wb = weeks(bob.copy);
      const sent = bob.messages.map((m) => m.method);
      if (nb.masters || nb.rrules || na.masters !== 1 || na.rrules !== 1)
        throw new Error('Alice’s copy must hold one master with its RRULE, Bob’s none');
      if (wa.some((w, i) => w.slot !== RULE_STARTS[i]) || wb.some((w, i) => w.slot !== RULE_STARTS[i]))
        throw new Error('Each copy’s weeks must be the six weeks of Alice’s rule, in order');
      const meetingsA = wa.filter((w) => w.week !== 'excluded' && w.week !== 'absent').length;
      // `change` and `components`: the edit the subtitle names and the VEVENTs each column lists and each strip dates.
      const state: { copies: CopiesState } = {
        copies: {
          alice: { stored: na, weeks: wa.map((w) => w.week), components: alice },
          bob: { stored: nb, weeks: wb.map((w) => w.week), sent, components: bob.copy },
          change,
        },
      };
      return stagedStep({
        id: 'copies',
        title:
          change === 'skip'
            ? 'Alice’s rule loses a week to EXDATE; Bob has no rule, only that meeting'
            : change === 'move'
              ? 'Alice’s object gains an override for the move; Bob’s keeps its one meeting'
              : 'Alice’s object holds the rule; Bob’s holds one meeting and no rule',
        line: 'Each row is one calendar, over the six weeks of Alice’s rule.',
        caption:
          change === 'skip'
            ? `The same cancellation reaches two different objects. Alice’s holds the master, whose RRULE gives six weeks, so her app takes the third out with EXDATE:${GUEST_MEETING}, leaving ${numberWord(meetingsA)} meetings. Bob’s holds the override for ${day(GUEST_MEETING)} and no master. His other five weeks are empty because nothing in his copy generates them, and the iTIP ${sent.at(-1)} marks the one VEVENT he has STATUS:CANCELLED.`
            : change === 'move'
              ? `Alice’s object now holds the master and ${plural(na.overrides, 'override')}: the one that invited Bob, and a new one that moves the second meeting to ${short(MOVED_TO)}. Bob’s holds the one override he attends and no master. The iTIP ${sent.at(-1)} the server sends him carries that override again, so his calendar shows the third week and nothing of the move.`
              : `Alice’s object holds the master, whose RRULE gives all six weeks, and the override that puts Bob in the third. Bob’s holds that override and no master, so his calendar shows the third week and no other.`,
        state,
        draw: copiesPicture,
        opening: ['copies-weeks'],
      });
    };
    if (copy === 'organiser') await s.steps([copiesStep()]);

    // ------------------------------------------------------------------ schema
    // A detail step: before Alice's copy, which counts its parts on the schema, or after Bob's.
    const schemaStep = async () => {
      await this.step('schema', {
        kind: 'detail',
        title: 'One UID: at most one master, any number of overrides',
        line: 'At a line’s end, a bar is one, a circle zero, a crow’s foot many.',
        // RFC 4791 §4.1, lines 479–487.
        caption:
          'The storage rules explain why Bob can keep one occurrence without Alice’s master rule. Marks at a line’s ends say how many: a bar is one, a circle zero, a crow’s foot many. RFC 4791 puts every VEVENT with one UID in one calendar object: the master, which it defines as the one without RECURRENCE-ID, and the overrides, which may be stored without it, as Bob’s is.',
      });
      await s.clear();
      const drawn = await s.show({ source: erSource('rfc') }, { box: FULL });
      this.state.schema = { relations: schema('rfc') };
      return drawn;
    };

    // ------------------------------------------------------------------ copy
    // The prediction's answer, and the end of the story: the copy the reader chose to inspect.
    const mine = copyOf(change, copy),
      n = counts(mine),
      bob = guestCopy(change);
    const parts = `${n.masters ? `one master with ${plural(n.rrules, 'RRULE')} and ${plural(n.exdates, 'EXDATE')}` : 'no master'}, and ${plural(n.overrides, 'override')}`;
    // `components`: the VEVENTs the copy holds, which Bob's stored object lists.
    const copyState = { copy, stored: counts(mine), meetings: expand(mine).map((m) => [m.start, m.cancelled] as const), components: mine };
    let er: Diagram | undefined;
    if (copy === 'organiser') {
      er = await schemaStep();
      await this.step('copy', {
        title: `Alice’s copy: ${plural(n.vevents, 'VEVENT')}, one UID`,
        line: `${n.masters ? 'One master' : 'No master'} and ${plural(n.overrides, 'override')}; her calendar shows ${numberWord(expand(mine).length)} meetings.`,
        caption: `The server stores Alice’s object as her app saved it: ${parts}, ${n.vevents > 1 ? 'all ' : ''}with UID standup. The notes on the schema count each part, and parts her copy lacks are dimmed. Bob’s copy is different: ${ANSWER}.`,
      });
      const present = [
        'entity:CALENDAR_OBJECT',
        ...(n.masters ? ['entity:MASTER'] : []),
        ...(n.overrides ? ['entity:OVERRIDE'] : []),
        ...(n.rrules ? ['entity:RRULE'] : []),
        ...(n.exdates ? ['entity:EXDATE'] : []),
      ];
      this.state.copy = copyState;
      await er.dim(present);
      const count = (k: number, word: string) =>
        k ? plural(k, word).replace(/^one /, '1 ').replace(/^two /, '2 ') : `no ${word}`;
      await er.note('entity:MASTER', count(n.masters, 'master'), { side: 'above' });
      await er.note('entity:OVERRIDE', count(n.overrides, 'override'), { side: 'above' });
      await er.note('entity:RRULE', count(n.rrules, 'RRULE'), { side: 'above' });
      await er.note('entity:EXDATE', count(n.exdates, 'EXDATE'), { side: 'above' });
    } else {
      const [first, second] = bob.messages;
      /** Bob's stored object and the meetings his calendar shows, drawn from the step's state alone. */
      const bobsCopy = (st: { copy: typeof copyState }, s: Stage) =>
        new Group(
          new CodeBlock(this, s.palette, lines(st.copy.components), {
            at: CODE,
            align: 'top',
            fontSize: CODE_SIZE,
            title: 'Bob’s stored object, some lines left out',
          }),
          new Card(this, s.palette, guestRows(st.copy.meetings), {
            at: LIST,
            align: 'top',
            width: LIST_WIDTH,
            fontSize: LIST_SIZE,
            title: 'Meetings Bob’s calendar shows',
          }),
        );
      // A staged step: the stage is cleared and Bob's copy drawn from its VEVENTs and meetings.
      const copyStep = stagedStep({
        id: 'copy',
        title:
          change === 'skip'
            ? 'Answer: Bob’s copy keeps the meeting, marked cancelled'
            : change === 'move'
              ? 'Answer: Alice’s move leaves Bob’s copy as it was'
              : 'Bob’s copy is one override and no master',
        line:
          change === 'skip'
            ? 'Delivering the CANCEL sets STATUS:CANCELLED and deletes nothing.'
            : change === 'move'
              ? 'The iTIP REQUEST holds only the override Bob attends.'
              : 'It came as an iTIP REQUEST, and the server stored it as it came.',
        // Broker.php:459–620 (what each attendee is sent), :269–317 (how it is stored).
        caption:
          change === 'skip'
            ? `${upperFirst(ANSWER)}. Bob is now in no meeting, so the server, Baïkal running sabre/dav, sends him an iTIP CANCEL, the scheduling message that calls a meeting off. Delivering it sets STATUS:CANCELLED on the one VEVENT he holds. Alice’s calendar no longer has a third meeting, because she excluded its start from her rule; Bob had no rule to exclude it from, so his copy still contains ${long(GUEST_MEETING)}, marked cancelled.`
            : change === 'move'
              ? `${upperFirst(ANSWER)}. Saving the move sends Bob an iTIP REQUEST, a scheduling message carrying a meeting’s details, but the server, Baïkal running sabre/dav, puts in it only the VEVENTs Bob attends: the third meeting’s override again. His copy still holds that one VEVENT, and the moved Tuesday meeting never appears in it.`
              : `${upperFirst(ANSWER)}. The invitation reached Bob as an iTIP REQUEST, a scheduling message carrying a meeting’s details, holding only the VEVENTs he attends. The server stored it as it came: the third meeting’s override, with RECURRENCE-ID and no master, which RFC 4791 allows. His stored copy contains ${plural(expand(mine).length, 'meeting')} and no rule to generate the others.`,
        state: { copy: copyState, messages: [first, second].filter(Boolean).map((m) => m!.method) },
        draw: bobsCopy,
      });
      await s.steps([copyStep]);
    }
    // Bob's copy comes first, then the two copies side by side, then the schema as a detail; Alice's copy was drawn on it.
    if (copy === 'guest') await s.steps([copiesStep()]);
    er ??= await schemaStep();

    // ------------------------------------------------------------------ server
    const refused = Object.fromEntries(
      (['two masters', 'two RRULEs', 'override only'] as const).map((k) => [
        k,
        validate(SERVER_CASES[k]).map((r) => r.message),
      ]),
    );
    await this.step('server', {
      kind: 'detail',
      title: 'The server refuses a second master or a second RRULE',
      line: 'It answers 415, though RFC 5545 says just that RRULE SHOULD NOT repeat.',
      // sabre/dav Plugin.php:843–874; sabre/vobject VCalendar.php:448–455, Component.php:626–647.
      // RFC 5545 §3.8.5.3, lines 6808–6812: RRULE SHOULD NOT repeat; the set is then undefined.
      caption:
        'Baïkal, running sabre/dav, checks each object saved to it and answers 415 to two VEVENTs without RECURRENCE-ID or to two RRULEs in one VEVENT. RFC 5545 recommends against a repeated RRULE, saying it SHOULD NOT occur, but does not forbid it; sabre is stricter, so the RRULE line now allows at most one. Bob’s copy, with no master, is accepted.',
    });
    // The edit, replayed on the schema: the RRULE relationship is removed and added back as zero or one.
    const ops = [
      // erSource puts the RRULE relationship last.
      { kind: 'remove_relation', index: schema('rfc').length - 1 },
      {
        kind: 'add_relation',
        from: 'MASTER',
        to: 'RRULE',
        leftCard: 'one-only',
        rightCard: 'zero-or-one',
        label: 'repeats by',
      },
    ] as const;
    if (copy === 'organiser') {
      await er.clearNotes();
      await er.dim(null);
    }
    await er.morph({ source: erSource('sabre') }, { ops });
    await er.note('entity:MASTER', 'a second one: 415', { side: 'above' });
    await er.note('entity:RRULE', 'a second one: 415', { side: 'above' });
    this.state.server = { relations: schema('sabre'), refused };
  }
}
