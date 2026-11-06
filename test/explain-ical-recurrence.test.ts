// The ical-recurrence explainer's model, held to RFC 5545's own examples, to sabre/vobject 4.5.7
// (frozen here, and run again in Docker when SABRE_DOCKER=1), to a Baïkal server run, and to the
// ER diagram it draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fc, params } from './lib/pbt.ts';
import {
  DTSTART,
  GUEST,
  GUEST_MEETING,
  INVITED,
  MASTER,
  MOVED_FROM,
  MOVED_TO,
  MOVE_OVERRIDE,
  ORGANISER,
  RRULE,
  SERIES,
  SERVER_CASES,
  LEFT_MARK,
  RIGHT_MARK,
  copyOf,
  counts,
  deliver,
  erSource,
  expand,
  fromMs,
  guestCopy,
  messageFor,
  occurrences,
  organiserCopy,
  parseRule,
  recurrenceSet,
  schema,
  toMs,
  validate,
  weeks,
} from '../scenes/explainers/ical-recurrence/model.ts';
import type { Cardinality, Change, Copy, VEvent } from '../scenes/explainers/ical-recurrence/model.ts';
import { RFC_EXAMPLES, inputsDigest, runSabre } from './lib/ical-recurrence-sabre.ts';
import type { Frozen, Stored } from './lib/ical-recurrence-sabre.ts';

const FROZEN: Frozen = JSON.parse(readFileSync(new URL('./lib/ical-recurrence-sabre.json', import.meta.url), 'utf8'));
const CHANGES: Change[] = ['none', 'move', 'skip'];
const COPIES: Copy[] = ['organiser', 'guest'];
const starts = (cs: readonly VEvent[]) => expand(cs).map((m) => m.start);
/** A model VEVENT in the shape the sabre probe reads back. */
const stored = (c: VEvent): Stored => ({
  recurrenceId: c.recurrenceId,
  dtstart: c.dtstart,
  rrules: c.rrules,
  exdates: c.exdates,
  attendees: c.attendees,
  status: c.status,
});

// ---------------------------------------------------------------------------------------- RFC 5545

test('weekly rules give RFC 5545’s own example dates', () => {
  // RFC 5545 §3.8.5.3, lines 6927–6958. The examples use TZID=America/New_York; read as UTC, the
  // dates are the same, since each step is seven whole days and the model has no time zones.
  const md = (s: string) => `${+s.slice(4, 6)}/${+s.slice(6, 8)}`;
  const ten = RFC_EXAMPLES['weekly, 10 occurrences']!,
    until = RFC_EXAMPLES['weekly until 24 December 1997']!;
  assert.deepEqual(occurrences(ten.dtstart, parseRule(ten.rrule)).map(md), ['9/2', '9/9', '9/16', '9/23', '9/30', '10/7', '10/14', '10/21', '10/28', '11/4']);
  assert.deepEqual(
    occurrences(until.dtstart, parseRule(until.rrule)).map(md),
    ['9/2', '9/9', '9/16', '9/23', '9/30', '10/7', '10/14', '10/21', '10/28', '11/4', '11/11', '11/18', '11/25', '12/2', '12/9', '12/16', '12/23'],
  );
});

test('COUNT counts DTSTART, and an EXDATE does not give the count back', () => {
  // §3.3.10, lines 2272–2274; §3.8.5.1, lines 6630–6634.
  const six = occurrences(DTSTART, parseRule(RRULE));
  assert.equal(six.length, 6);
  assert.equal(six[0], DTSTART);
  assert.equal(six[5], '20261207T090000Z');
  assert.deepEqual(recurrenceSet({ ...MASTER, exdates: [GUEST_MEETING] }), six.filter((s) => s !== GUEST_MEETING));
  assert.equal(starts(organiserCopy('skip')).length, 5);
});

test('an override replaces the meeting whose start equals its RECURRENCE-ID, and the master is unchanged', () => {
  // §3.8.4.4, lines 6294–6306.
  const move = organiserCopy('move');
  assert.deepEqual(move[0], MASTER);
  assert.equal(MOVE_OVERRIDE.recurrenceId, MOVED_FROM);
  const m = expand(move);
  assert.equal(m.length, 6);
  assert.deepEqual(m[1], { slot: MOVED_FROM, start: MOVED_TO, override: true, cancelled: false });
  assert.ok(!m.some((x) => x.start === MOVED_FROM));
  // With no master, an override is a meeting at its own DTSTART (RFC 4791 §4.1, lines 479–487).
  assert.deepEqual(starts([MOVE_OVERRIDE]), [MOVED_TO]);
});

// ---------------------------------------------------------------------------------------- the story

test('each scenario stores what the scene says', () => {
  const want: Record<Change, Record<Copy, ReturnType<typeof counts>>> = {
    none: {
      organiser: { vevents: 2, masters: 1, overrides: 1, rrules: 1, exdates: 0, uids: ['standup'] },
      guest: { vevents: 1, masters: 0, overrides: 1, rrules: 0, exdates: 0, uids: ['standup'] },
    },
    move: {
      organiser: { vevents: 3, masters: 1, overrides: 2, rrules: 1, exdates: 0, uids: ['standup'] },
      guest: { vevents: 1, masters: 0, overrides: 1, rrules: 0, exdates: 0, uids: ['standup'] },
    },
    skip: {
      organiser: { vevents: 1, masters: 1, overrides: 0, rrules: 1, exdates: 1, uids: ['standup'] },
      guest: { vevents: 1, masters: 0, overrides: 1, rrules: 0, exdates: 0, uids: ['standup'] },
    },
  };
  for (const change of CHANGES) for (const copy of COPIES) assert.deepEqual(counts(copyOf(change, copy)), want[change][copy], `${change}/${copy}`);
  assert.deepEqual(guestCopy('none').messages.map((m) => m.method), ['REQUEST']);
  assert.deepEqual(guestCopy('move').messages.map((m) => m.method), ['REQUEST', 'REQUEST']);
  assert.deepEqual(guestCopy('skip').messages.map((m) => m.method), ['REQUEST', 'CANCEL']);
  assert.deepEqual(expand(guestCopy('skip').copy), [{ slot: GUEST_MEETING, start: GUEST_MEETING, override: true, cancelled: true }]);
});

// ---------------------------------------------------------------------------------------- sabre/vobject

test('the frozen sabre/vobject answers are for the model’s current objects', () => {
  assert.equal(FROZEN.sabre, '4.5.7');
  assert.equal(FROZEN.inputsDigest, inputsDigest(), 'the model’s objects changed: refresh test/lib/ical-recurrence-sabre.json (see that file’s .ts)');
});

test('the model refuses what sabre/vobject refuses, with sabre’s words', () => {
  const calendars = FROZEN.answers.calendars;
  const objects: Record<string, readonly VEvent[]> = { series: SERIES, invited: INVITED, 'moved override only': [MOVE_OVERRIDE], ...SERVER_CASES };
  for (const change of CHANGES) for (const copy of COPIES) objects[`${change}/${copy}`] = copyOf(change, copy);
  for (const [name, cs] of Object.entries(objects)) {
    const sabre = calendars[name]!.validate;
    // sabre's level 3 messages are the ones sabre/dav answers with 415 (CalDAV/Plugin.php:863–874).
    assert.deepEqual(
      validate(cs).map((r) => r.message),
      sabre.filter(([level]) => level === 3).map(([, message]) => message),
      name,
    );
  }
});

test('the model’s meetings start when sabre/vobject’s expand() says, where sabre has a master', () => {
  const calendars = FROZEN.answers.calendars;
  for (const change of CHANGES) assert.deepEqual(starts(organiserCopy(change)), calendars[`${change}/organiser`]!.starts, change);
  assert.deepEqual(starts(SERIES), calendars.series!.starts);
  assert.deepEqual(starts(INVITED), calendars.invited!.starts);
  for (const [name, ex] of Object.entries(RFC_EXAMPLES)) assert.deepEqual(occurrences(ex.dtstart, parseRule(ex.rrule)), calendars[name]!.starts, name);
  // With no master, compare start times only: sabre labels the instance by its DTSTART, not by
  // its RECURRENCE-ID (EventIterator.php:121–142 makes the first override the master).
  assert.deepEqual(starts([MOVE_OVERRIDE]), calendars['moved override only']!.starts);
});

test('sabre/vobject’s expand() drops a master-less override whose RECURRENCE-ID equals its DTSTART', () => {
  // EventIterator.php:121–142 records each override's RECURRENCE-ID as an exception, then, with no
  // master, takes the first override as the master: its only start is that exception, so it yields
  // nothing and expand() skips it. Baïkal 0.10.1's calendar-query with <C:expand> returned Bob's
  // objects with no VEVENT in them. The model follows RFC 4791 §4.1 instead: one meeting.
  const calendars = FROZEN.answers.calendars;
  for (const name of ['none/guest', 'move/guest', 'skip/guest', 'override only']) assert.deepEqual(calendars[name]!.starts, [], name);
  for (const change of CHANGES) assert.deepEqual(starts(guestCopy(change).copy), [GUEST_MEETING], change);
});

test('the guest’s messages and copy are the ones sabre/vobject’s Broker produces', () => {
  for (const change of CHANGES) {
    const sabre = FROZEN.answers.schedules[change]!,
      model = guestCopy(change);
    assert.deepEqual(sabre.messages.map((m) => m.method), model.messages.map((m) => m.method), change);
    // A REQUEST carries the VEVENTs the guest attends; Broker.php:513–539 builds a CANCEL from the
    // first VEVENT's DTSTART and the attendee alone, which the model does not use.
    sabre.messages.forEach((m, i) => {
      if (m.method === 'REQUEST') assert.deepEqual(m.components, model.messages[i]!.components.map(stored), `${change} message ${i}`);
    });
    assert.deepEqual(sabre.copy, model.copy.map(stored), change);
  }
});

const SABRE_LIVE = process.env.SABRE_DOCKER === '1';
test('sabre/vobject, run now in Docker, gives the frozen answers', { skip: SABRE_LIVE ? false : 'set SABRE_DOCKER=1 to run sabre/vobject 4.5.7 in Docker (composer:2.8)' }, (tc) => {
  const r = runSabre();
  if ('skip' in r) return tc.skip(r.skip);
  assert.deepEqual(r.answers, FROZEN.answers);
});

// ---------------------------------------------------------------------------------------- Baïkal

/**
 * Baïkal 0.10.1 (Docker image ckulka/baikal:nginx; sabre/dav 4.7.0, sabre/vobject 4.5.6, whose
 * Broker, Component, VCalendar and VEvent files are identical to 4.5.7's), run on 2026-10-25 with two
 * local users, alice@example.com and bob@example.com. Alice PUT the series, then the invitation,
 * then the change; the table is what each calendar held afterwards, read back with GET, and what
 * the server answered to the objects in the server step.
 */
const BAIKAL = {
  stored: {
    none: {
      organiser: [
        [null, '20261102T090000Z', ['FREQ=WEEKLY;COUNT=6'], [], null],
        ['20261116T090000Z', '20261116T090000Z', [], [], null],
      ],
      guest: [['20261116T090000Z', '20261116T090000Z', [], [], null]],
    },
    move: {
      organiser: [
        [null, '20261102T090000Z', ['FREQ=WEEKLY;COUNT=6'], [], null],
        ['20261109T090000Z', '20261110T140000Z', [], [], null],
        ['20261116T090000Z', '20261116T090000Z', [], [], null],
      ],
      guest: [['20261116T090000Z', '20261116T090000Z', [], [], null]],
    },
    skip: {
      organiser: [[null, '20261102T090000Z', ['FREQ=WEEKLY;COUNT=6'], ['20261116T090000Z'], null]],
      guest: [['20261116T090000Z', '20261116T090000Z', [], [], 'CANCELLED']],
    },
  },
  put: {
    'two masters': [415, 'Validation error in iCalendar: More than one master object was found for the object with UID two-masters'],
    'two RRULEs': [415, 'Validation error in iCalendar: RRULE MUST NOT appear more than once in a VEVENT component'],
    'two identical RRULEs': [415, 'Validation error in iCalendar: RRULE MUST NOT appear more than once in a VEVENT component'],
    'override only': [201, ''],
    'two UIDs': [415, 'Validation error in iCalendar: A calendar object on a CalDAV server may only have components with the same UID.'],
  },
} as const;

test('each copy holds what Baïkal stored', () => {
  // Baïkal kept Alice's VEVENTs in the order she sent them; the move's override was sent in the
  // order the run's script chose, so compare as sets.
  const key = (row: readonly unknown[]) => JSON.stringify(row);
  for (const change of CHANGES)
    for (const copy of COPIES) {
      const model = copyOf(change, copy).map((c) => key([c.recurrenceId, c.dtstart, c.rrules, c.exdates, c.status]));
      assert.deepEqual(new Set(model), new Set(BAIKAL.stored[change][copy].map(key)), `${change}/${copy}`);
    }
});

test('the server refuses what Baïkal refused, and accepts the guest’s master-less copy', () => {
  for (const [name, [status, message]] of Object.entries(BAIKAL.put)) {
    const refusals = validate(SERVER_CASES[name as keyof typeof SERVER_CASES]);
    assert.equal(refusals.length ? 415 : 201, status, name);
    // Baïkal's run used its own UIDs; the model's object is UID standup.
    if (refusals.length) assert.equal(`Validation error in iCalendar: ${refusals[0]!.message}`, message.replace('two-masters', 'standup'), name);
  }
  for (const change of CHANGES) assert.deepEqual(validate(guestCopy(change).copy), [], change);
});

// ---------------------------------------------------------------------------------------- the ER diagram

/** What the model's own rules allow, as a cardinality: the least and most of `many` a `one` can have. */
function allowed(min: 0 | 1, max: 1 | 'many'): Cardinality {
  return min === 0 ? (max === 1 ? 'zero-or-one' : 'zero-or-many') : max === 1 ? 'one-only' : 'one-or-many';
}

test('every marker in the ER source says what the model allows', () => {
  // Each count is read from the model's validator or its stored copies, not from schema().
  const ok = (cs: readonly VEvent[]) => validate(cs).length === 0;
  const twoMasters = ok(SERVER_CASES['two masters']),
    noMaster = ok(guestCopy('none').copy),
    twoOverrides = counts(organiserCopy('move')).overrides === 2 && ok(organiserCopy('move')),
    twoRrules = ok(SERVER_CASES['two RRULEs']),
    twoExdates = ok([{ ...MASTER, exdates: [MOVED_FROM, GUEST_MEETING] }]);
  const sabre: Record<string, Cardinality> = {
    'CALENDAR_OBJECT-MASTER': allowed(noMaster ? 0 : 1, twoMasters ? 'many' : 1),
    'CALENDAR_OBJECT-OVERRIDE': allowed(0, twoOverrides ? 'many' : 1),
    'MASTER-OVERRIDE': allowed(0, twoOverrides ? 'many' : 1),
    'MASTER-EXDATE': allowed(0, twoExdates ? 'many' : 1),
    'MASTER-RRULE': allowed(0, twoRrules ? 'many' : 1),
  };
  // RFC 5545 §3.6.1: rrule SHOULD NOT occur more than once, so its grammar still admits several.
  const rfc: Record<string, Cardinality> = { ...sabre, 'MASTER-RRULE': 'zero-or-many' };
  // The other end: every component is in exactly one object; an override has at most one master
  // and may have none (the guest's copy); an RRULE or EXDATE belongs to the one master it is in.
  const back: Record<string, Cardinality> = {
    'CALENDAR_OBJECT-MASTER': 'one-only',
    'CALENDAR_OBJECT-OVERRIDE': 'one-only',
    'MASTER-OVERRIDE': allowed(noMaster ? 0 : 1, 1),
    'MASTER-EXDATE': 'one-only',
    'MASTER-RRULE': 'one-only',
  };
  const leftOf = Object.fromEntries(Object.entries(LEFT_MARK).map(([k, v]) => [v, k as Cardinality]));
  const rightOf = Object.fromEntries(Object.entries(RIGHT_MARK).map(([k, v]) => [v, k as Cardinality]));
  for (const [scenario, want] of [
    ['rfc', rfc],
    ['sabre', sabre],
  ] as const) {
    const rels = [...erSource(scenario).matchAll(/^ {2}(\w+) (\S\S)--(\S\S) (\w+) : /gm)];
    assert.equal(rels.length, 5, scenario);
    for (const [, from, l, r, to] of rels) {
      const name = `${from}-${to}`;
      // The left marker sits at `from` and counts `from`s per `to`; the right one counts `to`s per `from`.
      assert.equal(rightOf[r!], want[name], `${scenario} ${name}: how many ${to} per ${from}`);
      assert.equal(leftOf[l!], back[name], `${scenario} ${name}: how many ${from} per ${to}`);
    }
    assert.deepEqual(
      schema(scenario).map((r) => [`${r.from}-${r.to}`, r.left, r.right]),
      schema(scenario).map((r) => [`${r.from}-${r.to}`, back[`${r.from}-${r.to}`], want[`${r.from}-${r.to}`]]),
    );
  }
});

test('the captured ER diagrams draw each marker at the end it counts', () => {
  // Capture names the marker at the first entity card:<rel>:1 and at the second card:<rel>:2, with
  // Mermaid's category; explain/diagrams.ts reads them the same way for the picture's description.
  const CATEGORY: Record<Cardinality, string> = { 'one-only': 'one', 'zero-or-one': 'zero-one', 'zero-or-many': 'zero-many', 'one-or-many': 'many' };
  const dir = new URL('../scenes/explainers/ical-recurrence/scene.snapshots/', import.meta.url);
  type Part = { id: string; shapes: { subpaths: number[][] }[]; channels?: { category?: string } };
  const centre = (p: Part) => {
    const xs: number[] = [],
      ys: number[] = [];
    for (const s of p.shapes) for (const sp of s.subpaths) for (let i = 0; i < sp.length; i += 2) xs.push(sp[i]!), ys.push(sp[i + 1]!);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  };
  const gap = (pt: { x: number; y: number }, box: number[]) => Math.hypot(Math.max(box[0]! - pt.x, 0, pt.x - box[2]!), Math.max(box[1]! - pt.y, 0, pt.y - box[3]!));
  let seen = 0;
  for (const scenario of ['rfc', 'sabre'] as const) {
    const file = readdirSync(dir).find((f) => f !== 'index.json' && JSON.parse(readFileSync(new URL(f, dir), 'utf8')).spec.source === erSource(scenario));
    assert.ok(file, `no snapshot for the ${scenario} schema`);
    const parts: Part[] = JSON.parse(readFileSync(new URL(file, dir), 'utf8')).parts;
    const get = (id: string) => parts.find((p) => p.id === id)!;
    for (const r of schema(scenario)) {
      const rel = `${r.from}-${r.to}#0`;
      const [one, two] = [get(`card:${rel}:1`), get(`card:${rel}:2`)];
      assert.equal(one.channels?.category, CATEGORY[r.left], `${scenario} ${rel} at ${r.from}`);
      assert.equal(two.channels?.category, CATEGORY[r.right], `${scenario} ${rel} at ${r.to}`);
      const from = centre(get(`entity:${r.from}`)).box,
        to = centre(get(`entity:${r.to}`)).box;
      assert.ok(gap(centre(one), from) < gap(centre(one), to), `${scenario} ${rel}: marker 1 is drawn at ${r.from}`);
      assert.ok(gap(centre(two), to) < gap(centre(two), from), `${scenario} ${rel}: marker 2 is drawn at ${r.to}`);
      seen++;
    }
  }
  assert.equal(seen, 10);
});

// ---------------------------------------------------------------------------------------- properties

/** A weekly series with some starts excluded and some overridden by a move of up to three days. */
const series = fc
  .record({ count: fc.integer({ min: 1, max: 30 }), interval: fc.integer({ min: 1, max: 4 }), seed: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 30, maxLength: 30 }), shift: fc.array(fc.integer({ min: -72, max: 72 }), { minLength: 30, maxLength: 30 }) })
  .map(({ count, interval, seed, shift }) => {
    const rrule = `FREQ=WEEKLY;INTERVAL=${interval};COUNT=${count}`;
    // Independent UTC arithmetic anchors generated slots; occurrences is the subject.
    const all = Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 10, 2, 9) + i * interval * 7 * 86400e3)
      .toISOString().replace(/[-:]/g, '').replace('.000', ''));
    // 0 keeps a start, 1 excludes it, 2 moves it by shift hours.
    const exdates = all.filter((_, i) => seed[i] === 1);
    const overrides = all
      .map((s, i) => [s, i] as const)
      .filter(([, i]) => seed[i] === 2)
      .map(([s, i]): VEvent => ({ ...MOVE_OVERRIDE, recurrenceId: s, dtstart: fromMs(toMs(s) + shift[i]! * 3600e3) }));
    const master: VEvent = { ...MASTER, rrules: [rrule], exdates };
    return { all, master, overrides, exdates };
  });

test('property: meetings are the rule’s starts less the EXDATEs; overrides move them and never add or remove one', () => {
  fc.assert(
    fc.property(series, ({ all, master, overrides, exdates }) => {
      const m = expand([master, ...overrides]);
      assert.equal(m.length, all.length - exdates.length);
      assert.deepEqual(new Set(m.map((x) => x.slot)), new Set(all.filter((s) => !exdates.includes(s))));
      for (const x of m) {
        const o = overrides.find((v) => v.recurrenceId === x.slot);
        assert.equal(x.start, o ? o.dtstart : x.slot);
        assert.equal(x.override, !!o);
      }
      // The master alone gives the same slots: overrides change starts only.
      assert.deepEqual(new Set(expand([master]).map((x) => x.slot)), new Set(m.map((x) => x.slot)));
      assert.deepEqual(validate([master, ...overrides]), []);
    }),
    params(300),
  );
});

test('property: UNTIL at the k-th start gives the same starts as COUNT=k', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 4 }), (k, interval) => {
      const expected = Array.from({ length: k }, (_, i) => new Date(Date.UTC(2026, 10, 2, 9) + i * interval * 7 * 86400e3)
        .toISOString().replace(/[-:]/g, '').replace('.000', ''));
      assert.deepEqual(occurrences(DTSTART, parseRule(`FREQ=WEEKLY;INTERVAL=${interval};COUNT=${k}`)), expected);
      assert.deepEqual(occurrences(DTSTART, parseRule(`FREQ=WEEKLY;INTERVAL=${interval};UNTIL=${expected.at(-1)}`)), expected);
    }),
    params(200),
  );
});

test('property: a guest gets exactly the overrides they attend, never the master, and a CANCEL keeps them', () => {
  fc.assert(
    fc.property(series, fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }), fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }), ({ master, overrides }, before, after) => {
      const withGuest = (pick: boolean[]) => [master, ...overrides.map((o, i) => (pick[i] ? { ...o, attendees: [ORGANISER, GUEST] } : o))];
      const previous = withGuest(before),
        next = withGuest(after);
      const first = messageFor(null, previous, GUEST);
      const copy = first ? deliver(first, null) : null;
      const m = messageFor(previous, next, GUEST);
      const attends = next.filter((c) => c.attendees.includes(GUEST));
      const attended = previous.filter((c) => c.attendees.includes(GUEST));
      if (!attends.length && !attended.length) return assert.equal(m, null);
      const result = deliver(m!, copy);
      if (attends.length) {
        assert.equal(m!.method, 'REQUEST');
        assert.deepEqual(result, attends);
      } else {
        assert.equal(m!.method, 'CANCEL');
        assert.deepEqual(result, attended.map((c) => ({ ...c, status: 'CANCELLED' })));
      }
      for (const c of result ?? []) assert.notEqual(c.recurrenceId, null);
      assert.deepEqual(validate(result ?? []), []);
    }),
    params(300),
  );
});

test('the copies view: Alice’s rule excludes the cancelled week; Bob’s copy has no rule, so every other week is absent', () => {
  const w = (cs: readonly VEvent[]) => weeks(cs).map((x) => x.week);
  const RULE = occurrences(DTSTART, parseRule(RRULE));
  assert.deepEqual(weeks(organiserCopy('skip')).map((x) => x.slot), RULE);
  assert.deepEqual(w(organiserCopy('skip')), ['meeting', 'meeting', 'excluded', 'meeting', 'meeting', 'meeting']);
  assert.deepEqual(w(guestCopy('skip').copy), ['absent', 'absent', 'cancelled', 'absent', 'absent', 'absent']);
  assert.deepEqual(w(organiserCopy('move')), ['meeting', 'moved', 'meeting', 'meeting', 'meeting', 'meeting']);
  assert.deepEqual(w(organiserCopy('none')), ['meeting', 'meeting', 'meeting', 'meeting', 'meeting', 'meeting']);
  for (const change of CHANGES) {
    // Bob holds no master, so nothing in his copy generates or excludes a week: only his own meeting is there.
    for (const x of weeks(guestCopy(change).copy))
      assert.equal(x.week === 'absent', x.slot !== GUEST_MEETING, `${change} ${x.slot}`);
    assert.ok(weeks(organiserCopy(change)).every((x) => x.week !== 'absent'), change);
  }
  // Whatever the master excludes, a week is excluded exactly when its start is an EXDATE and no override fills it.
  fc.assert(
    fc.property(fc.subarray(RULE), (exdates) => {
      const ws = weeks([{ ...MASTER, exdates }]);
      for (const x of ws) assert.equal(x.week === 'excluded', exdates.includes(x.slot));
      assert.equal(ws.filter((x) => x.week === 'meeting').length, recurrenceSet({ ...MASTER, exdates }).length);
    }),
    params(),
  );
});
