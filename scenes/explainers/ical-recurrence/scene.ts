import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/ical-recurrence.ts';
import { Scene } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { Card, CodeBlock } from '../../../explain/index.ts';
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
  erSource,
  expand,
  guestCopy,
  lines,
  long,
  occurrences,
  organiserCopy,
  parseRule,
  schema,
  short,
  validate,
  MASTER,
} from '../lib/ical-recurrence.ts';
import type { Change, Copy, VEvent } from '../lib/ical-recurrence.ts';

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
    title: 'What changes when a recurring meeting moves?',
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
  };
  static settings = [
    {
      id: 'change',
      label: 'Alice’s change',
      default: 'move',
      options: (Object.keys(CHANGES) as Change[]).map((value) => ({ value, label: CHANGES[value] })),
    },
    {
      id: 'copy',
      label: 'Whose copy',
      default: 'organiser',
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
    await readerFirst(this, s, readerFrames(change, copy));
    await this.step('series', {
      detail: true,
      title: 'A weekly stand-up is stored as one VEVENT',
      line: 'DTSTART is the first meeting; RRULE with COUNT=6 makes six.',
      // RFC 5545 §3.3.10, lines 2272–2274: COUNT; DTSTART counts as the first occurrence.
      caption: `Alice’s calendar app saves her stand-up as one VEVENT. DTSTART is the first meeting, ${long(DTSTART)} 2026 at 09:00 UTC. RRULE repeats it weekly, and COUNT=6 stops after six meetings, with DTSTART counting as the first. The list shows the meetings a calendar computes from those two lines.`,
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
      detail: true,
      title: 'Inviting Bob to one meeting stores a second VEVENT',
      line: `Same UID, and RECURRENCE-ID ${GUEST_MEETING} names the third meeting.`,
      // RFC 5545 §3.8.4.4, lines 6294–6306: UID names the set, RECURRENCE-ID one instance, by its original start.
      caption: `Alice invites Bob to the third meeting only. The app keeps the first VEVENT as it was and adds a second with the same UID, an override. Its RECURRENCE-ID, ${GUEST_MEETING}, is the start the rule gave that meeting. RFC 5545 keeps that value even when the meeting is moved.`,
    });
    await code.morph(lines(INVITED), { markAdded: true });
    await list.set(Object.fromEntries(rows(INVITED)));
    await list.mark(week(GUEST_MEETING), { as: 'the override' });
    this.state.invite = { stored: counts(INVITED), meetings: expand(INVITED).map((m) => m.start) };

    // ------------------------------------------------------------------ change
    const moved = expand(after).find((m) => m.slot === MOVED_FROM)!;
    await this.step('change', {
      detail: true,
      title:
        change === 'move'
          ? 'Moving the second meeting stores a third VEVENT'
          : change === 'skip'
            ? `Skipping Bob’s meeting adds an EXDATE; ${number(expand(after).length)} meetings remain`
            : 'Five meetings come from the rule, one from the override',
      line:
        change === 'move'
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

    // ------------------------------------------------------------------ schema
    await this.step('schema', {
      detail: true,
      title: 'One UID: at most one master, any number of overrides',
      line: 'At a line’s end, a bar is one, a circle zero, a crow’s foot many.',
      // RFC 4791 §4.1, lines 479–487.
      caption:
        'The same storage as a schema. Marks at a line’s ends say how many: a bar is one, a circle zero, a crow’s foot many. RFC 4791 puts every VEVENT with one UID in one calendar object: the master, which it defines as the one without RECURRENCE-ID, and the overrides, which may be stored without it.',
    });
    await s.clear();
    const er = await s.show({ source: erSource('rfc') }, { box: FULL });
    this.state.schema = { relations: schema('rfc') };

    // ------------------------------------------------------------------ copy
    const mine = copyOf(change, copy),
      n = counts(mine),
      bob = guestCopy(change);
    const parts = `${n.masters ? `one master with ${plural(n.rrules, 'RRULE')} and ${plural(n.exdates, 'EXDATE')}` : 'no master'}, and ${plural(n.overrides, 'override')}`;
    if (copy === 'organiser') {
      await this.step('copy', {
        detail: true,
        title: `Alice’s copy: ${plural(n.vevents, 'VEVENT')}, one UID`,
        line: `${n.masters ? 'One master' : 'No master'} and ${plural(n.overrides, 'override')}; her calendar shows ${number(expand(mine).length)} meetings.`,
        caption: `The server stores Alice’s object as her app saved it: ${parts}, ${n.vevents > 1 ? 'all ' : ''}with UID standup. The notes count each part in her copy, and parts her copy lacks are dimmed. Her calendar shows ${number(expand(mine).length)} meetings.`,
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
        detail: true,
        title:
          change === 'skip'
            ? 'Bob’s copy keeps the meeting, marked cancelled'
            : change === 'move'
              ? 'Alice’s move leaves Bob’s copy as it was'
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
            ? `Bob is now in no meeting, so the server, Baïkal running sabre/dav, sends him an iTIP CANCEL. Delivering it, sabre/vobject sets STATUS:CANCELLED on the VEVENT Bob holds and deletes nothing, so his calendar still lists ${long(GUEST_MEETING)}, marked cancelled.`
            : change === 'move'
              ? 'Saving the move sends Bob an iTIP REQUEST, but the server, Baïkal running sabre/dav, puts in it only the VEVENTs Bob attends: the third meeting’s override again. His copy still holds that one VEVENT, and the Tuesday meeting never appears in it.'
              : `The invitation reached Bob as an iTIP REQUEST holding only the VEVENTs he attends, and the server stored it as it came: the third meeting’s override, with RECURRENCE-ID and no master, which RFC 4791 allows. His calendar shows ${plural(expand(mine).length, 'meeting')}.`,
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

    // ------------------------------------------------------------------ server
    const refused = Object.fromEntries(
      (['two masters', 'two RRULEs', 'override only'] as const).map((k) => [
        k,
        validate(SERVER_CASES[k]).map((r) => r.message),
      ]),
    );
    await this.step('server', {
      detail: true,
      title: 'The server refuses a second master or a second RRULE',
      line: 'It answers 415; RFC 5545 only says RRULE SHOULD NOT repeat.',
      // sabre/dav Plugin.php:843–874; sabre/vobject VCalendar.php:448–455, Component.php:626–647.
      // RFC 5545 §3.8.5.3, lines 6808–6812: RRULE SHOULD NOT repeat; the set is then undefined.
      caption:
        'Baïkal, running sabre/dav, checks each object saved to it and answers 415 to two VEVENTs without RECURRENCE-ID or to two RRULEs in one VEVENT. RFC 5545 says only that RRULE SHOULD NOT repeat, so here sabre is stricter, and the RRULE line now allows one. Bob’s copy, with no master, is accepted.',
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
    let rules = er;
    if (copy === 'guest') {
      await s.clear();
      rules = await s.show({ source: erSource('rfc') }, { box: FULL });
    } else {
      await er.clearNotes();
      await er.dim(null);
    }
    await rules.morph({ source: erSource('sabre') }, { ops });
    await rules.note('entity:MASTER', 'a second one: 415', { side: 'above' });
    await rules.note('entity:RRULE', 'a second one: 415', { side: 'above' });
    this.state.server = { relations: schema('sabre'), refused };
  }
}
