import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { Card, CodeBlock, Diagram } from '../../../explain/index.ts';
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
} from '../lib/ical-recurrence.ts';
import type { Change, Copy, VEvent, Week } from '../lib/ical-recurrence.ts';

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
const number = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n);
const plural = (n: number, word: string) => `${number(n)} ${word}${n === 1 ? '' : 's'}`;
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
/** Bob's meeting list: his calendar knows nothing of weeks, only the meetings his copy holds. */
const guestRows = (components: readonly VEvent[]): [string, string][] =>
  expand(components).map((m) => ['Stand-up', [short(m.start), ...(m.cancelled ? ['cancelled'] : [])].join(', ')]);

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
        answer: `Alice’s shows ${number(FIFTH_LEFT.length)}, the last still on ${long(FIFTH_LEFT.at(-1)!.start)}: COUNT=6 counts the excluded start, so the series does not run a week longer. Bob is still in the third meeting’s override, so any update the server sends him carries that override again, and his calendar keeps ${long(GUEST_MEETING)}, not cancelled.`,
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
    const list: Card = await s.card(rows(SERIES), {
      at: LIST,
      align: 'top',
      width: LIST_WIDTH,
      fontSize: LIST_SIZE,
      title: 'Meetings Alice’s calendar shows',
    });
    this.state.series = { vevents: SERIES.length, meetings: expand(SERIES).map((m) => m.start) };

    // ------------------------------------------------------------------ invite
    await this.step('invite', {
      title: 'Inviting Bob to one meeting stores a second VEVENT',
      line: `Same UID, and RECURRENCE-ID ${GUEST_MEETING} names the third meeting.`,
      // RFC 5545 §3.8.4.4, lines 6294–6306: UID names the set, RECURRENCE-ID one instance, by its original start.
      caption: `Alice invites Bob to the third meeting only. The app keeps the first VEVENT as it was and adds a second with the same UID, an override. Its RECURRENCE-ID, ${GUEST_MEETING}, is the start the rule gave that meeting, kept even if the meeting moves. Bob is sent this override and nothing else. His copy has one occurrence, not the master rule that generates Alice’s whole series.`,
    });
    await code.morph(lines(INVITED), { markAdded: true });
    await list.set(Object.fromEntries(rows(INVITED)));
    await list.mark(week(GUEST_MEETING), { as: 'the override' });
    this.state.invite = { stored: counts(INVITED), meetings: expand(INVITED).map((m) => m.start) };

    // ------------------------------------------------------------------ change
    const moved = expand(after).find((m) => m.slot === MOVED_FROM)!;
    await this.step('change', {
      title:
        change === 'move'
          ? 'Moving the second meeting stores a third VEVENT'
          : change === 'skip'
            ? `Skipping Bob’s meeting adds an EXDATE; ${number(expand(after).length)} meetings remain`
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
              `Alice cancels the third meeting. Her app adds EXDATE:${GUEST_MEETING} to the first VEVENT and deletes the override that invited Bob. COUNT=6 still counts the excluded start, because RFC 5545 generates the rule’s starts first and then removes EXDATEs, so ${number(expand(after).length)} meetings remain.`
            : 'Alice changes nothing else, so the object keeps two VEVENTs. A calendar takes all six starts from the rule, then puts the override in place of the start that equals its RECURRENCE-ID. Five meetings come from the first VEVENT and one from the second.',
    });
    if (change === 'none') {
      await code.clearMarks();
      await code.focus([0, 4], { as: 'the master' });
      await list.mark(null);
    } else {
      await code.morph(lines(after), { markAdded: true });
      await list.set(Object.fromEntries(rows(after)));
      await list.mark(week(change === 'move' ? MOVED_FROM : GUEST_MEETING), {
        as: change === 'move' ? 'moved' : 'skipped',
      });
    }
    this.state.change = {
      change,
      stored: counts(after),
      meetings: expand(after).map((m) => m.start),
      ...(change === 'move' ? { moved: { from: moved.slot, to: moved.start } } : {}),
    };

    // ------------------------------------------------------------------ copies
    // Alice's and Bob's stored objects side by side, each over the six weeks of Alice's rule (weeks() in
    // the model): Alice's master generates them and excludes one; Bob's copy has nothing to generate them.
    const copiesStep = async () => {
      const bob = guestCopy(change),
        alice = after;
      const na = counts(alice),
        nb = counts(bob.copy);
      const wa = weeks(alice),
        wb = weeks(bob.copy);
      const sent = bob.messages.map((m) => m.method);
      if (nb.masters || nb.rrules || na.masters !== 1 || na.rrules !== 1)
        throw new Error('Alice’s copy must hold one master with its RRULE, Bob’s none');
      const day = (t: string) => short(t).split(', ')[0]!.split(' ').slice(1).join(' ');
      const meetingsA = wa.filter((w) => w.week !== 'excluded' && w.week !== 'absent').length;
      await this.step('copies', {
        title:
          change === 'skip'
            ? 'Alice’s rule loses a week to EXDATE; Bob has no rule, only that meeting'
            : change === 'move'
              ? 'Alice’s object gains an override for the move; Bob’s keeps its one meeting'
              : 'Alice’s object holds the rule; Bob’s holds one meeting and no rule',
        line: 'Each row is one calendar, over the six weeks of Alice’s rule.',
        caption:
          change === 'skip'
            ? `The same cancellation reaches two different objects. Alice’s holds the master, whose RRULE gives six weeks, so her app takes the third out with EXDATE:${GUEST_MEETING}, leaving ${number(meetingsA)} meetings. Bob’s holds the override for ${day(GUEST_MEETING)} and no master. His other five weeks are empty because nothing in his copy generates them, and the iTIP ${sent.at(-1)} marks the one VEVENT he has STATUS:CANCELLED.`
            : change === 'move'
              ? `Alice’s object now holds the master and ${plural(na.overrides, 'override')}: the one that invited Bob, and a new one that moves the second meeting to ${short(MOVED_TO)}. Bob’s holds the one override he attends and no master. The iTIP ${sent.at(-1)} the server sends him carries that override again, so his calendar shows the third week and nothing of the move.`
              : `Alice’s object holds the master, whose RRULE gives all six weeks, and the override that puts Bob in the third. Bob’s holds that override and no master, so his calendar shows the third week and no other.`,
      });
      await s.clear();
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
      const column = (who: 'alice' | 'bob', x0: number) => {
        const cs = who === 'alice' ? alice : bob.copy;
        const parts: (Text | Rectangle)[] = [
          text(who === 'alice' ? 'Alice’s stored object' : 'Bob’s stored object', TOP, pal.ink, [x0, 2.85], 'start', 'bold'),
          text(
            who === 'alice'
              ? change === 'skip'
                ? 'Her app adds EXDATE to the master'
                : change === 'move'
                  ? `Her app adds an override for ${day(MOVED_FROM)}`
                  : 'As saved after inviting Bob'
              : `iTIP sent to him: ${sent.join(', then ')}`,
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
      const strip = (ws: typeof wa, cs: readonly VEvent[], name: string, top: number) => {
        const shown = expand(cs);
        const n = ws.filter((w) => w.week !== 'excluded' && w.week !== 'absent').length;
        const parts: (Text | Rectangle)[] = [text(`${name}: ${plural(n, 'meeting')}`, WEEK, pal.ink, [-3.6, top], 'start', 'bold')];
        const cell = 1.14,
          gap = 0.06;
        ws.forEach((w, i) => {
          const x = -3.6 + cell / 2 + i * (cell + gap),
            y = top - 0.75,
            st = STYLE[w.week];
          parts.push(box(cell, 0.92, st.stroke, st.width, st.dashed).moveTo([x, y]));
          const [date, month] = day(shown.find((m) => m.slot === w.slot)?.start ?? w.slot).split(' ');
          if (st.label) parts.push(text(date!, WEEK, st.ink, [x, y + 0.19]), text(month!, WEEK, st.ink, [x, y - 0.19]));
          if (st.word) parts.push(text(st.word, WEEK, st.ink, [x, y - 0.72]));
        });
        return parts;
      };
      const weeksBlock = new Group(...strip(wa, alice, 'Alice’s calendar', -0.55), ...strip(wb, bob.copy, 'Bob’s calendar', -2.5));
      weeksBlock.key = 'copies-weeks';
      const say = (ws: typeof wa) => ws.map((w) => `${day(w.slot)} ${w.week}`).join(', ');
      await s.enter(column('alice', -7.55), column('bob', 0.35), weeksBlock, {
        describe: `Alice’s stored object: ${alice.map((c) => detail(c, true)).join('; ')}. Bob’s stored object: no master, ${bob.copy.map((c) => detail(c, false)).join('; ')}. The six weeks of Alice’s rule, Alice’s calendar: ${say(wa)}. Bob’s calendar: ${say(wb)}.`,
      });
      s.opening(weeksBlock);
      this.state.copies = {
        alice: { stored: na, weeks: wa.map((w) => w.week) },
        bob: { stored: nb, weeks: wb.map((w) => w.week), sent },
      };
    };
    if (copy === 'organiser') await copiesStep();

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
    let er: Diagram | undefined;
    if (copy === 'organiser') {
      er = await schemaStep();
      await this.step('copy', {
        title: `Alice’s copy: ${plural(n.vevents, 'VEVENT')}, one UID`,
        line: `${n.masters ? 'One master' : 'No master'} and ${plural(n.overrides, 'override')}; her calendar shows ${number(expand(mine).length)} meetings.`,
        caption: `The server stores Alice’s object as her app saved it: ${parts}, ${n.vevents > 1 ? 'all ' : ''}with UID standup. The notes on the schema count each part, and parts her copy lacks are dimmed. Bob’s copy is different: ${ANSWER}.`,
      });
      const present = [
        'entity:CALENDAR_OBJECT',
        ...(n.masters ? ['entity:MASTER'] : []),
        ...(n.overrides ? ['entity:OVERRIDE'] : []),
        ...(n.rrules ? ['entity:RRULE'] : []),
        ...(n.exdates ? ['entity:EXDATE'] : []),
      ];
      await er.dim(present);
      const count = (k: number, word: string) =>
        k ? plural(k, word).replace(/^one /, '1 ').replace(/^two /, '2 ') : `no ${word}`;
      await er.note('entity:MASTER', count(n.masters, 'master'), { side: 'above' });
      await er.note('entity:OVERRIDE', count(n.overrides, 'override'), { side: 'above' });
      await er.note('entity:RRULE', count(n.rrules, 'RRULE'), { side: 'above' });
      await er.note('entity:EXDATE', count(n.exdates, 'EXDATE'), { side: 'above' });
    } else {
      const [first, second] = bob.messages;
      await this.step('copy', {
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
      });
      await s.clear();
      await s.code(lines(mine), {
        at: CODE,
        align: 'top',
        fontSize: CODE_SIZE,
        title: 'Bob’s stored object, some lines left out',
      });
      await s.card(guestRows(mine), {
        at: LIST,
        align: 'top',
        width: LIST_WIDTH,
        fontSize: LIST_SIZE,
        title: 'Meetings Bob’s calendar shows',
      });
      this.state.messages = [first, second].filter(Boolean).map((m) => m!.method);
    }
    this.state.copy = { copy, stored: counts(mine), meetings: expand(mine).map((m) => [m.start, m.cancelled]) };
    // Bob's copy comes first, then the two copies side by side, then the schema as a detail; Alice's copy was drawn on it.
    if (copy === 'guest') await copiesStep();
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
