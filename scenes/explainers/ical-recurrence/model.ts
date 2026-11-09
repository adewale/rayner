// How a CalDAV calendar stores a weekly meeting and its exceptions, and what a server does with them.
// Pure TypeScript, no Node APIs: the scene and the tests both read from here.
// Its limits: one six-occurrence weekly series in UTC. No time zones or daylight-saving transitions,
// no general recurrence expansion (only the rule parts the series uses), and no scheduling client's
// display policy: keeping STATUS:CANCELLED is the delivery behaviour of the server shown (sabre/dav
// in Baïkal), not a claim that every calendar app leaves a cancelled event visible. expand() is the
// model's own reading of the stored copy, not sabre/vobject's expand(), which drops a master-less
// override whose RECURRENCE-ID equals its DTSTART (tested separately; the stored VEVENT is not
// deleted). validate() follows sabre, which refuses a second RRULE that RFC 5545 only says SHOULD NOT occur.
//
// Sources (line numbers are those of the rfc-editor.org .txt files and of the tagged PHP files):
// - RFC 5545 §3.6.1 (lines 2907–2957): in a VEVENT, recurid is "OPTIONAL, but MUST NOT occur more than
//   once" (2930–2936), rrule "OPTIONAL, but SHOULD NOT occur more than once" (2938–2941), exdate
//   "OPTIONAL, and MAY occur more than once" (2949–2953).
// - RFC 5545 §3.3.10 (2272–2274): COUNT bounds the recurrence; "The DTSTART property value always counts
//   as the first occurrence."
// - RFC 5545 §3.8.4.4 (6262–6310): UID refers to the whole recurrence set, RECURRENCE-ID to one instance;
//   its value is the instance's original start, "if the intent is to change a Friday meeting to Thursday,
//   the DATE-TIME is still set to the original Friday meeting."
// - RFC 5545 §3.8.5.1 (6620–6637): the set is the RRULE and RDATE starts, "and then excluding any start
//   DATE-TIME values specified by EXDATE properties."
// - RFC 5545 §3.8.5.3 (6808–6812): RRULE "SHOULD NOT be specified more than once. The recurrence set
//   generated with multiple RRULE properties is undefined."
// - RFC 4791 §4.1 (457–487): components with the same UID in a calendar collection "MUST be contained in
//   the same calendar object resource", and a resource may hold only overridden instances "without also
//   including the master recurring component".
// - sabre/vobject 4.5.7 (tag commit ff22611a): lib/Component/VEvent.php:106–138 ('UID' => 1,
//   'RECURRENCE-ID' => '?', 'RRULE' => '?', 'EXDATE' => '*'); lib/Component.php:626–647 (a '?' property
//   that appears twice is a level 3 error, "<NAME> MUST NOT appear more than once in a VEVENT
//   component"); lib/Component/VCalendar.php:448–455 ("More than one master object was found for the
//   object with UID ", level 3) and :479–485 (one UID per object under PROFILE_CALDAV).
// - sabre/dav 4.7.0 (tag commit 074373bc) lib/CalDAV/Plugin.php:843–874: a PUT is validated with PROFILE_CALDAV and any level 3
//   message is answered 415 "Validation error in iCalendar: <message>".
// - sabre/vobject 4.5.7 lib/ITip/Broker.php:459–620 (parseEventForOrganizer: an attendee who is in no
//   instance any more gets CANCEL, otherwise REQUEST with only their instances), :269–291
//   (processMessageRequest replaces the attendee's components with the message's), :304–317
//   (processMessageCancel sets STATUS:CANCELLED on every VEVENT the attendee holds). sabre/dav 4.7.0
//   lib/CalDAV/Schedule/Plugin.php:407–530 delivers to a local attendee through processMessage.

/** A UTC DATE-TIME as iCalendar writes it: 20261102T090000Z. The model has no time zones. */
export type Stamp = string;

export interface VEvent {
  uid: string;
  /** Null for the master; for an override, the original start of the meeting it replaces. */
  recurrenceId: Stamp | null;
  dtstart: Stamp;
  /** RRULE values; RFC 5545 allows several (SHOULD NOT), sabre/vobject refuses a second. */
  rrules: string[];
  exdates: Stamp[];
  /** Calendar user addresses, mailto: URIs. */
  attendees: string[];
  status: 'CANCELLED' | null;
}

/** One meeting a calendar app shows after expanding the stored components. */
export interface Meeting {
  /** The start the rule gave it (its RECURRENCE-ID); for an override with no master, its own RECURRENCE-ID. */
  slot: Stamp;
  start: Stamp;
  /** True when an override VEVENT, not the master, supplies it. */
  override: boolean;
  cancelled: boolean;
}

// ---------------------------------------------------------------------------------------- dates

const STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
export function toMs(s: Stamp): number {
  const m = STAMP.exec(s);
  if (!m) throw new Error(`not a UTC DATE-TIME: ${s}`);
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
}
export function fromMs(ms: number): Stamp {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Mon 2 Nov, 09:00". */
export function short(s: Stamp): string {
  const d = new Date(toMs(s));
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${s.slice(9, 11)}:${s.slice(11, 13)}`;
}
/** "Monday 9 November". */
export function long(s: Stamp): string {
  const d = new Date(toMs(s));
  return `${LONG_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]}`;
}
/** "09:00". */
export const clock = (s: Stamp) => `${s.slice(9, 11)}:${s.slice(11, 13)}`;

// ---------------------------------------------------------------------------------------- rules

export interface Rule {
  freq: 'DAILY' | 'WEEKLY';
  interval: number;
  count: number | null;
  until: Stamp | null;
}
/** The RRULE parts this model reads: FREQ (DAILY or WEEKLY), INTERVAL, COUNT, UNTIL. Others are refused. */
export function parseRule(text: string): Rule {
  const parts = new Map(text.split(';').map((p) => p.split('=') as [string, string]));
  for (const key of parts.keys()) if (!['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'WKST'].includes(key)) throw new Error(`RRULE part not modelled: ${key}`);
  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY') throw new Error(`FREQ not modelled: ${freq}`);
  // §3.3.10: COUNT and UNTIL MUST NOT occur in the same recur.
  if (parts.has('COUNT') && parts.has('UNTIL')) throw new Error('COUNT and UNTIL in one RRULE');
  return {
    freq,
    interval: Number(parts.get('INTERVAL') ?? 1),
    count: parts.has('COUNT') ? Number(parts.get('COUNT')) : null,
    until: parts.get('UNTIL') ?? null,
  };
}

/**
 * The starts a rule generates from DTSTART, before EXDATE: DTSTART first (§3.3.10, "always counts as
 * the first occurrence"), then every FREQ × INTERVAL. COUNT stops after that many; UNTIL is inclusive.
 * A rule with neither repeats forever, so `limit` bounds the list.
 */
export function occurrences(dtstart: Stamp, rule: Rule, limit = 1000): Stamp[] {
  const step = (rule.freq === 'WEEKLY' ? 7 : 1) * rule.interval * 86400e3;
  const out: Stamp[] = [];
  const end = rule.until ? toMs(rule.until) : Infinity;
  for (let t = toMs(dtstart); out.length < (rule.count ?? limit) && t <= end; t += step) out.push(fromMs(t));
  return out;
}

/** The master's recurrence set: its rule's starts with the EXDATEs taken out (§3.8.5.1). */
export function recurrenceSet(master: VEvent): Stamp[] {
  if (master.rrules.length > 1) throw new Error('more than one RRULE: RFC 5545 calls the set undefined');
  const all = master.rrules.length ? occurrences(master.dtstart, parseRule(master.rrules[0]!)) : [master.dtstart];
  const skip = new Set(master.exdates);
  return all.filter((s) => !skip.has(s));
}

/**
 * The meetings the stored components describe, in start order. The master contributes each start of
 * its set; an override replaces the instance whose start equals its RECURRENCE-ID (§3.8.4.4). With no
 * master (RFC 4791 §4.1), each override is one meeting at its own DTSTART.
 */
export function expand(components: readonly VEvent[]): Meeting[] {
  const masters = components.filter((c) => c.recurrenceId === null);
  if (masters.length > 1) throw new Error('more than one master');
  const overrides = new Map(components.filter((c) => c.recurrenceId !== null).map((c) => [c.recurrenceId!, c]));
  const out: Meeting[] = [];
  if (masters.length) {
    const master = masters[0]!;
    const set = recurrenceSet(master);
    for (const slot of set) {
      const o = overrides.get(slot);
      out.push(o ? { slot, start: o.dtstart, override: true, cancelled: o.status === 'CANCELLED' } : { slot, start: slot, override: false, cancelled: master.status === 'CANCELLED' });
    }
    // An override for a start the set does not have is outside what this model claims.
    for (const rid of overrides.keys()) if (!set.includes(rid)) throw new Error(`override ${rid} is not in the recurrence set`);
  } else for (const o of overrides.values()) out.push({ slot: o.recurrenceId!, start: o.dtstart, override: true, cancelled: o.status === 'CANCELLED' });
  return out.sort((a, b) => toMs(a.start) - toMs(b.start));
}

// ---------------------------------------------------------------------------------------- validation

/** A level 3 message from sabre/vobject's validate(PROFILE_CALDAV), which sabre/dav answers with 415. */
export interface Refusal {
  level: 3;
  message: string;
}
/**
 * The subset of sabre/vobject 4.5.7's checks this explainer shows, with sabre's own messages: a second
 * RRULE or RECURRENCE-ID in one VEVENT (Component.php:626–647, VEvent.php:123–124), a second master for
 * a UID (VCalendar.php:448–455), more than one UID in an object (VCalendar.php:479–485).
 */
export function validate(components: readonly VEvent[]): Refusal[] {
  const out: Refusal[] = [];
  for (const c of components)
    if (c.rrules.length > 1) out.push({ level: 3, message: 'RRULE MUST NOT appear more than once in a VEVENT component' });
  const masters = new Map<string, number>();
  for (const c of components)
    if (c.recurrenceId === null) {
      const n = (masters.get(c.uid) ?? 0) + 1;
      masters.set(c.uid, n);
      if (n > 1) out.push({ level: 3, message: `More than one master object was found for the object with UID ${c.uid}` });
    }
  if (new Set(components.map((c) => c.uid)).size > 1)
    out.push({ level: 3, message: 'A calendar object on a CalDAV server may only have components with the same UID.' });
  return out;
}

// ---------------------------------------------------------------------------------------- the story

export const UID = 'standup';
export const ORGANISER = 'mailto:alice@example.com';
export const GUEST = 'mailto:bob@example.com';
/** Monday 2 November 2026, 09:00 UTC. */
export const DTSTART = '20261102T090000Z';
export const RRULE = 'FREQ=WEEKLY;COUNT=6';
/** The second meeting moves from Monday 9 November 09:00 to Tuesday 10 November 14:00. */
export const MOVED_FROM = '20261109T090000Z';
export const MOVED_TO = '20261110T140000Z';
/** The guest is invited to the third meeting only; "skip" cancels that meeting. */
export const GUEST_MEETING = '20261116T090000Z';

export type Change = 'none' | 'move' | 'skip';
export type Copy = 'organiser' | 'guest';

const vevent = (v: Partial<VEvent> & Pick<VEvent, 'dtstart'>): VEvent => ({
  uid: UID,
  recurrenceId: null,
  rrules: [],
  exdates: [],
  attendees: [ORGANISER],
  status: null,
  ...v,
});
/** The series as first saved: one VEVENT. */
export const MASTER: VEvent = vevent({ dtstart: DTSTART, rrules: [RRULE] });
/** The third meeting with the guest added: an override that keeps the original time. */
export const GUEST_OVERRIDE: VEvent = vevent({ recurrenceId: GUEST_MEETING, dtstart: GUEST_MEETING, attendees: [ORGANISER, GUEST] });
export const MOVE_OVERRIDE: VEvent = vevent({ recurrenceId: MOVED_FROM, dtstart: MOVED_TO });

/** The organiser's stored object before the guest is invited. */
export const SERIES: readonly VEvent[] = [MASTER];
/** The organiser's stored object once the guest is invited to the third meeting. */
export const INVITED: readonly VEvent[] = [MASTER, GUEST_OVERRIDE];

/**
 * The organiser's stored object after the change. Moving adds an override and leaves the master as it
 * was. Skipping the guest's meeting adds an EXDATE to the master and drops that meeting's override,
 * which is what this scenario's organiser app does; RFC 5545 would also allow keeping the override with
 * STATUS:CANCELLED.
 */
export function organiserCopy(change: Change): VEvent[] {
  // Stored in the order the app adds them: the new override goes last.
  if (change === 'move') return [MASTER, GUEST_OVERRIDE, MOVE_OVERRIDE];
  if (change === 'skip') return [{ ...MASTER, exdates: [GUEST_MEETING] }];
  return [...INVITED];
}

/** An iTIP message from the organiser's server to one attendee (RFC 5546), as sabre's Broker builds it. */
export interface Message {
  method: 'REQUEST' | 'CANCEL';
  recipient: string;
  /** For REQUEST, the VEVENTs the attendee is in; CANCEL carries no instance list the model uses. */
  components: VEvent[];
}
/**
 * What sabre/vobject's Broker sends one attendee when the organiser saves `next` over `previous`
 * (Broker.php:459–620): nothing if they are in neither version, CANCEL if they are in no instance of
 * `next`, otherwise REQUEST with the instances they are in. The master is never among them here.
 */
export function messageFor(previous: readonly VEvent[] | null, next: readonly VEvent[], attendee: string): Message | null {
  const mine = (cs: readonly VEvent[] | null) => (cs ?? []).filter((c) => c.attendees.includes(attendee));
  const before = mine(previous),
    after = mine(next);
  if (!before.length && !after.length) return null;
  if (after.some((c) => c.recurrenceId === null)) throw new Error('an attendee of the master is not modelled');
  return after.length ? { method: 'REQUEST', recipient: attendee, components: after.map((c) => ({ ...c })) } : { method: 'CANCEL', recipient: attendee, components: [] };
}
/** The attendee's stored copy after a message (Broker.php:269–317). */
export function deliver(message: Message, existing: readonly VEvent[] | null): VEvent[] | null {
  if (message.method === 'REQUEST') return message.components.map((c) => ({ ...c }));
  return existing ? existing.map((c) => ({ ...c, status: 'CANCELLED' as const })) : null;
}

/** The guest's stored copy: the invitation's message delivered, then the change's, if any. */
export function guestCopy(change: Change): { copy: VEvent[]; messages: Message[] } {
  // The organiser saves twice: the invitation, then the change ("none" saves nothing more).
  const saves: [readonly VEvent[], readonly VEvent[]][] = [[SERIES, INVITED]];
  if (change !== 'none') saves.push([INVITED, organiserCopy(change)]);
  const messages: Message[] = [];
  let copy: VEvent[] | null = null;
  for (const [previous, next] of saves) {
    const m = messageFor(previous, next, GUEST);
    if (!m) continue;
    messages.push(m);
    copy = deliver(m, copy);
  }
  return { copy: copy ?? [], messages };
}

/**
 * What a stored copy shows in each week of the organiser's rule (MASTER's DTSTART and RRULE): a meeting,
 * moved or cancelled; a start its own master's EXDATE excludes; or nothing, because no VEVENT in the copy
 * gives that week. A copy without a master has nothing to generate weeks from, or to exclude them from.
 */
export type Week = 'meeting' | 'moved' | 'cancelled' | 'excluded' | 'absent';
export function weeks(components: readonly VEvent[]): { slot: Stamp; week: Week }[] {
  const meetings = new Map(expand(components).map((m) => [m.slot, m]));
  const master = components.find((c) => c.recurrenceId === null);
  return occurrences(MASTER.dtstart, parseRule(MASTER.rrules[0]!)).map((slot) => {
    const m = meetings.get(slot);
    if (m) return { slot, week: m.cancelled ? 'cancelled' : m.start !== slot ? 'moved' : 'meeting' };
    return { slot, week: master?.exdates.includes(slot) ? 'excluded' : 'absent' };
  });
}

export function copyOf(change: Change, copy: Copy): VEvent[] {
  return copy === 'organiser' ? organiserCopy(change) : guestCopy(change).copy;
}

/** What one stored copy holds, counted the way the ER diagram's entities are. */
export function counts(components: readonly VEvent[]) {
  const masters = components.filter((c) => c.recurrenceId === null);
  return {
    vevents: components.length,
    masters: masters.length,
    overrides: components.length - masters.length,
    rrules: masters.reduce((n, c) => n + c.rrules.length, 0),
    exdates: masters.reduce((n, c) => n + c.exdates.length, 0),
    uids: [...new Set(components.map((c) => c.uid))],
  };
}

// ---------------------------------------------------------------------------------------- text

/** iCalendar lines for the stored components: the properties the scene talks about, in RFC 5545 order. */
export function lines(components: readonly VEvent[]): string[] {
  return components.flatMap((c) => [
    'BEGIN:VEVENT',
    `UID:${c.uid}`,
    ...(c.recurrenceId ? [`RECURRENCE-ID:${c.recurrenceId}`] : []),
    `DTSTART:${c.dtstart}`,
    ...c.rrules.map((r) => `RRULE:${r}`),
    ...c.exdates.map((e) => `EXDATE:${e}`),
    ...c.attendees.filter((a) => a !== ORGANISER).map((a) => `ATTENDEE:${a}`),
    ...(c.status ? [`STATUS:${c.status}`] : []),
    'END:VEVENT',
  ]);
}

/** A whole iCalendar object for a server: the lines above plus DTSTAMP, DURATION, ORGANIZER and attendees with CN. */
export function ics(components: readonly VEvent[]): string {
  const cn = (a: string) => (a === ORGANISER ? 'Alice' : a === GUEST ? 'Bob' : a.replace(/^mailto:/, ''));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//lantern//ical-recurrence//EN',
    ...components.flatMap((c) => [
      'BEGIN:VEVENT',
      `UID:${c.uid}`,
      'DTSTAMP:20261020T120000Z',
      'SUMMARY:Stand-up',
      ...(c.recurrenceId ? [`RECURRENCE-ID:${c.recurrenceId}`] : []),
      `DTSTART:${c.dtstart}`,
      'DURATION:PT15M',
      ...c.rrules.map((r) => `RRULE:${r}`),
      ...c.exdates.map((e) => `EXDATE:${e}`),
      `ORGANIZER;CN=Alice:${ORGANISER}`,
      ...c.attendees.map((a) => `ATTENDEE;CN=${cn(a)};PARTSTAT=${a === ORGANISER ? 'ACCEPTED' : 'NEEDS-ACTION'}:${a}`),
      ...(c.status ? [`STATUS:${c.status}`] : []),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// ---------------------------------------------------------------------------------------- schema

/**
 * The schema the ER diagram draws: for each relationship, how many of each end the other end has.
 * `left` is the count of `from` per `to`, `right` the count of `to` per `from` (Mermaid's markers
 * sit at the entity they count). `rrule` is RFC 5545's (SHOULD NOT repeat, so the grammar allows
 * several) until the server step, where sabre/vobject's '?' makes it zero or one.
 */
export type Cardinality = 'one-only' | 'zero-or-one' | 'zero-or-many' | 'one-or-many';
export interface Relation {
  from: string;
  to: string;
  left: Cardinality;
  right: Cardinality;
  label: string;
}
export function schema(rrule: 'rfc' | 'sabre'): Relation[] {
  return [
    // RFC 4791 §4.1: one master at most, or none ("without also including the master").
    { from: 'CALENDAR_OBJECT', to: 'MASTER', left: 'one-only', right: 'zero-or-one', label: 'holds' },
    // RFC 4791 §4.1: every same-UID component is in the one resource.
    { from: 'CALENDAR_OBJECT', to: 'OVERRIDE', left: 'one-only', right: 'zero-or-many', label: 'holds' },
    // RFC 5545 §3.8.4.4: an override names one start of the master's set; RFC 4791 lets the master be absent.
    { from: 'MASTER', to: 'OVERRIDE', left: 'zero-or-one', right: 'zero-or-many', label: 'is overridden by' },
    // RFC 5545 §3.6.1: rrule SHOULD NOT occur more than once; sabre/vobject: '?'.
    { from: 'MASTER', to: 'RRULE', left: 'one-only', right: rrule === 'rfc' ? 'zero-or-many' : 'zero-or-one', label: 'repeats by' },
    // RFC 5545 §3.6.1: exdate MAY occur more than once.
    { from: 'MASTER', to: 'EXDATE', left: 'one-only', right: 'zero-or-many', label: 'skips' },
  ];
}

/** Objects the server step talks about: two it refuses, the guest's master-less copy it accepts, and two UIDs. */
export const SERVER_CASES: Readonly<Record<'two masters' | 'two RRULEs' | 'two identical RRULEs' | 'override only' | 'two UIDs', readonly VEvent[]>> = {
  'two masters': [MASTER, MASTER],
  'two RRULEs': [{ ...MASTER, rrules: [RRULE, 'FREQ=DAILY;COUNT=2'] }],
  // sabre/dav validates with REPAIR unless the client asks for strict handling, and REPAIR merges a
  // repeated '?' property only when array_unique() finds the copies equal (Component.php:630–640);
  // Baïkal still answered 415 to two identical RRULE lines.
  'two identical RRULEs': [{ ...MASTER, rrules: [RRULE, RRULE] }],
  'override only': [GUEST_OVERRIDE],
  'two UIDs': [MASTER, { ...MASTER, uid: 'retro' }],
};

/** Each entity's attributes, as Mermaid ER lines ("type name"). */
export const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  CALENDAR_OBJECT: ['text UID'],
  MASTER: ['datetime DTSTART'],
  OVERRIDE: ['datetime RECURRENCE-ID', 'datetime DTSTART'],
  RRULE: ['text FREQ', 'int COUNT'],
  EXDATE: ['datetime excluded'],
};
/** Mermaid's marker for a cardinality at the left (`from`) end and at the right (`to`) end. */
export const LEFT_MARK: Readonly<Record<Cardinality, string>> = { 'one-only': '||', 'zero-or-one': '|o', 'zero-or-many': '}o', 'one-or-many': '}|' };
export const RIGHT_MARK: Readonly<Record<Cardinality, string>> = { 'one-only': '||', 'zero-or-one': 'o|', 'zero-or-many': 'o{', 'one-or-many': '|{' };
/**
 * The schema as a Mermaid ER diagram: the entities, then the relationships with RRULE's last, so that
 * the server step's edit (remove it, add it back as zero or one) leaves the source in the same order.
 */
export function erSource(rrule: 'rfc' | 'sabre'): string {
  const rels = schema(rrule);
  const ordered = [...rels.filter((r) => r.to !== 'RRULE'), ...rels.filter((r) => r.to === 'RRULE')];
  return [
    '---',
    'config:',
    '  er:',
    '    rankSpacing: 40',
    '    nodeSpacing: 30',
    '---',
    'erDiagram',
    ...Object.entries(ATTRIBUTES).flatMap(([name, attrs]) => [`  ${name} {`, ...attrs.map((a) => `    ${a}`), '  }']),
    ...ordered.map((r) => `  ${r.from} ${LEFT_MARK[r.left]}--${RIGHT_MARK[r.right]} ${r.to} : ${/ /.test(r.label) ? `"${r.label}"` : r.label}`),
  ].join('\n');
}
