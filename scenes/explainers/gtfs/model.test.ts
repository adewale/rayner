import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRegisteredMermaid } from 'agentic-mermaid';
import { mutate, serializeMermaid } from 'agentic-mermaid/agent';
import type { AnyMutationOp } from 'agentic-mermaid/agent';
import { fc, params } from '../lib/pbt.ts';
import { SAMPLE_FEED } from './feed.ts';
import { parseCsv, readFeed, serviceOn, servicesOn, tripsOn, visitsAt, stopDay, weekday, addDays, seconds, clock, weekGrid, WEEKDAYS, dayChart, ganttSource, ganttEdits } from './model.ts';
import type { Feed, GtfsDate } from './model.ts';

const FEED = readFeed(SAMPLE_FEED);

// gtfs-kit 13.0.1 (pandas 3.1.0, Python 3.15.0), run once on 2026-10-25 over the vendored files:
//   gk.get_active_services(feed, d), len(gk.get_trips(feed, date=d)) and
//   gk.build_stop_timetable(feed, stop, [d])[['trip_id', 'departure_time', 'stop_sequence']].
// (gk.expand_frequencies gives STBA 32 vehicles, 6:00 to 21:30: it takes end_time as excluded,
// which the reference does not say; the explainer gives headways, not a vehicle count.)
const GTFS_KIT_SERVICES: Record<GtfsDate, string[]> = {
  '20070603': ['FULLW', 'WE'],
  '20070604': [],
  '20070605': ['FULLW'],
  '20070606': ['FULLW'],
  '20070607': ['FULLW'],
  '20070608': ['FULLW'],
  '20070609': ['FULLW', 'WE'],
};

const GTFS_KIT_TRIPS: Record<GtfsDate, number> = { '20070603': 11, '20070604': 0, '20070605': 7, '20070606': 7, '20070607': 7, '20070608': 7, '20070609': 11 };

const GTFS_KIT_TIMETABLE: Record<string, [string, string, number][]> = {
  'BEATTY_AIRPORT 20070604': [],
  'BEATTY_AIRPORT 20070605': [
    ['STBA', '6:20:00', 2],
    ['AB1', '8:00:00', 1],
    ['AB2', '12:15:00', 2],
  ],
  'BEATTY_AIRPORT 20070609': [
    ['STBA', '6:20:00', 2],
    ['AB1', '8:00:00', 1],
    ['AAMV1', '8:00:00', 1],
    ['AAMV2', '11:00:00', 2],
    ['AB2', '12:15:00', 2],
    ['AAMV3', '13:00:00', 1],
    ['AAMV4', '16:00:00', 2],
  ],
  'STAGECOACH 20070604': [],
  'STAGECOACH 20070605': [
    ['STBA', '6:00:00', 1],
    ['CITY1', '6:00:00', 1],
    ['CITY2', '6:58:00', 5],
  ],
  'STAGECOACH 20070609': [
    ['STBA', '6:00:00', 1],
    ['CITY1', '6:00:00', 1],
    ['CITY2', '6:58:00', 5],
  ],
};

// A service as calendar.txt and calendar_dates.txt can state it, for properties over any date.
const ymd = fc.date({ min: new Date(Date.UTC(2005, 0, 1)), max: new Date(Date.UTC(2012, 11, 31)), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10).replace(/-/g, ''));

const service = fc.record({
  inCalendar: fc.boolean(),
  days: fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }),
  start: ymd,
  end: ymd,
  exception: fc.constantFrom<0 | 1 | 2>(0, 1, 2),
});

function feedOf(s: { inCalendar: boolean; days: boolean[]; start: string; end: string; exception: 0 | 1 | 2 }, date: string): Feed {
  const files: Record<string, string> = {};
  if (s.inCalendar)
    files['calendar.txt'] = `service_id,${WEEKDAYS.join(',')},start_date,end_date\nS,${s.days.map((b) => (b ? 1 : 0)).join(',')},${s.start},${s.end}\n`;
  if (s.exception) files['calendar_dates.txt'] = `service_id,date,exception_type\nS,${date},${s.exception}\n`;
  return readFeed(files);
}

test('the feed the page carries is the vendored sample feed, byte for byte', async () => {
  const names = Object.keys(SAMPLE_FEED).sort();
  assert.deepEqual(names, ['calendar.txt', 'calendar_dates.txt', 'frequencies.txt', 'routes.txt', 'stop_times.txt', 'stops.txt', 'trips.txt']);
  for (const name of names)
    assert.equal(SAMPLE_FEED[name], await readFile(new URL(`./sample-feed-1/${name}`, import.meta.url), 'utf8'), name);
});

test('the sample feed says what the explainer says it says', () => {
  // google/transit 3c9e7b9, gtfs/spec/en/examples/sample-feed-1.
  assert.deepEqual(
    FEED.calendar.map((r) => [r.service_id, WEEKDAYS.map((d) => r[d]).join(''), r.start_date, r.end_date]),
    [
      ['FULLW', '1111111', '20070101', '20101231'],
      ['WE', '0000011', '20070101', '20101231'],
    ],
  );
  assert.deepEqual(FEED.calendarDates, [{ service_id: 'FULLW', date: '20070604', exception_type: '2' }]);
  assert.equal(FEED.trips.length, 11);
  assert.deepEqual(FEED.trips.filter((t) => t.service_id === 'WE').map((t) => t.route_id), ['AAMV', 'AAMV', 'AAMV', 'AAMV']);
  assert.deepEqual(
    FEED.frequencies.filter((r) => r.trip_id === 'STBA'),
    [{ trip_id: 'STBA', start_time: '6:00:00', end_time: '22:00:00', headway_secs: '1800' }],
  );
  // No frequencies row gives exact_times, so every one is frequency-based (reference.md:667).
  assert.ok(FEED.frequencies.every((r) => r.exact_times == null));
});

test('dates: 4 June 2007 is a Monday, and calendar.txt names its columns by weekday', () => {
  assert.equal(weekday('20070101'), 'monday');
  assert.equal(weekday('20070604'), 'monday');
  assert.equal(weekday('20070605'), 'tuesday');
  assert.equal(weekday('20070609'), 'saturday');
  assert.equal(addDays('20070604', -1), '20070603');
  assert.equal(addDays('20071231', 1), '20080101');
  assert.equal(seconds('25:01:02'), 90062);
  assert.equal(clock(seconds('7:59:59')), '7:59:59');
  assert.equal(clock(seconds('08:00:00')), '8:00');
});

test('which services and how many trips run each day of the week of 4 June, as gtfs-kit says', () => {
  for (const [date, services] of Object.entries(GTFS_KIT_SERVICES)) {
    assert.deepEqual(servicesOn(FEED, date).filter((s) => s.runs).map((s) => s.serviceId), services, date);
    assert.equal(tripsOn(FEED, date).length, GTFS_KIT_TRIPS[date], date);
  }
  // Monday 4 June: FULLW's Monday is removed by its exception; WE never runs on Mondays.
  assert.deepEqual(serviceOn(FEED, 'FULLW', '20070604'), {
    serviceId: 'FULLW',
    inCalendar: true,
    weekday: true,
    inRange: true,
    exception: 2,
    byCalendar: true,
    runs: false,
  });
  assert.equal(tripsOn(FEED, '20070604', { byCalendar: true }).length, 7);
});

test('the stop_times rows at each stop are gtfs-kit’s; departures are those that are not a trip’s last stop', () => {
  for (const [key, rows] of Object.entries(GTFS_KIT_TIMETABLE)) {
    const [stop, date] = key.split(' ') as [string, string];
    // gtfs-kit orders ties by trip_id within its own sort; compare as sets of rows, then by time.
    const mine = visitsAt(FEED, stop, date).map((v) => [v.tripId, clock(v.departure) + ':00', v.stopSequence]);
    const sort = (xs: unknown[][]) => [...xs].map((x) => JSON.stringify(x)).sort();
    assert.deepEqual(sort(mine), sort(rows), key);
    const day = stopDay(FEED, stop, date);
    const leaving = [...day.departures.map((d) => d.tripId), ...day.headways.map((h) => h.tripId)].sort();
    const last = (tripId: string) => Math.max(...FEED.stopTimes.filter((r) => r.trip_id === tripId).map((r) => +r.stop_sequence!));
    assert.deepEqual(leaving, rows.filter(([t, , seq]) => seq !== last(t)).map(([t]) => t).sort(), key);
    assert.deepEqual([...day.ending].sort(), rows.filter(([t, , seq]) => seq === last(t)).map(([t]) => t).sort(), key);
  }
  // The counts the explainer states: 0, 1 and 3 departures from the airport; Stagecoach served by two frequency trips.
  assert.deepEqual(
    ['20070604', '20070605', '20070609'].map((d) => stopDay(FEED, 'BEATTY_AIRPORT', d).departures.length),
    [0, 1, 3],
  );
  const stagecoach = stopDay(FEED, 'STAGECOACH', '20070609');
  assert.deepEqual(stagecoach.departures, []);
  assert.deepEqual(stagecoach.headways.map((h) => [h.tripId, h.offset, h.bands.map((b) => b.headwaySecs / 60)]), [
    ['CITY1', 0, [30, 10, 30, 10, 30]],
    ['STBA', 0, [30]],
  ]);
});

test('a service runs on a date exactly when an exception adds it, or no exception removes it and its weekly pattern covers the date', () => {
  fc.assert(
    fc.property(service, ymd, (s, date) => {
      const day = serviceOn(feedOf(s, date), 'S', date);
      const utcDay = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`).getUTCDay();
      const mondayIndex = (utcDay + 6) % 7;
      const pattern = s.inCalendar && s.days[mondayIndex]! && s.start <= date && date <= s.end;
      assert.equal(day.byCalendar, pattern);
      assert.equal(day.runs, s.exception === 1 || (s.exception !== 2 && pattern));
    }),
    params(),
  );
});

test('a route has departures only on dates its trips’ service runs', () => {
  // The scene's dates and the exception date, then any date: every trip leaving any stop has a running service.
  const dates = fc.oneof(fc.constantFrom('20070603', '20070604', '20070605', '20070609'), ymd);
  fc.assert(
    fc.property(dates, fc.constantFrom(...FEED.stops.map((s) => s.stop_id!)), (date, stop) => {
      const day = stopDay(FEED, stop, date);
      for (const tripId of [...day.departures.map((d) => d.tripId), ...day.headways.map((h) => h.tripId)]) {
        const trip = FEED.trips.find((t) => t.trip_id === tripId)!;
        assert.ok(serviceOn(FEED, trip.service_id!, date).runs, `${tripId} leaves ${stop} on ${date}`);
      }
    }),
    params(),
  );
  // So AB1, route 10's trip under FULLW, leaves the airport on 5 June and not on 4 June, when FULLW is removed.
  assert.deepEqual(['20070604', '20070605'].map((d) => stopDay(FEED, 'BEATTY_AIRPORT', d).departures.some((x) => x.tripId === 'AB1')), [false, true]);
});

test('one calendar_dates.txt row adds or removes a service for one date, leaving routes and trips as they were', () => {
  const plus = (row: string) => readFeed({ ...SAMPLE_FEED, 'calendar_dates.txt': SAMPLE_FEED['calendar_dates.txt'] + '\n' + row });
  const ids = (feed: Feed, date: string) => tripsOn(feed, date).map((t) => t.trip_id);
  // WE,20070604,1 adds route 50's four weekend trips to Monday 4 June.
  assert.deepEqual(ids(plus('WE,20070604,1'), '20070604'), ['AAMV1', 'AAMV2', 'AAMV3', 'AAMV4']);
  // WE,20070609,2 removes them from Saturday 9 June only: seven trips run, and the next Saturday keeps all eleven.
  assert.equal(ids(plus('WE,20070609,2'), '20070609').length, 7);
  assert.equal(ids(plus('WE,20070609,2'), '20070616').length, 11);
  // FULLW,20070605,2 empties Tuesday 5 June as the sample's own row empties Monday 4 June.
  assert.deepEqual(ids(plus('FULLW,20070605,2'), '20070605'), []);
  assert.equal(plus('FULLW,20070605,2').routes.length, FEED.routes.length);
});

test('gtfs week view: the week grid is each service’s run, removed or off cell per date, and its column totals are the day’s trips', () => {
  // Sunday 3 to Saturday 9 June: FULLW's Monday is removed, WE runs only at the weekend, so Monday's column is empty.
  const week = weekGrid(FEED, '20070604');
  assert.deepEqual(week.dates, Object.keys(GTFS_KIT_TRIPS));
  assert.deepEqual(week.services.map((s) => [s.serviceId, s.trips, s.cells]), [
    ['FULLW', 7, ['runs', 'removed', 'runs', 'runs', 'runs', 'runs', 'runs']],
    ['WE', 4, ['runs', 'off', 'off', 'off', 'off', 'off', 'runs']],
  ]);
  assert.deepEqual(week.trips, Object.values(GTFS_KIT_TRIPS));
  // Any date: the grid's week runs Sunday to Saturday around it, and each cell and total is the model's for that day.
  fc.assert(
    fc.property(ymd, (date) => {
      const w = weekGrid(FEED, date);
      assert.equal(w.dates.length, 7);
      assert.ok(w.dates.includes(date));
      assert.equal(weekday(w.dates[0]!), 'sunday');
      w.dates.forEach((d, i) => {
        assert.equal(w.trips[i], tripsOn(FEED, d).length);
        for (const s of w.services) {
          const on = serviceOn(FEED, s.serviceId, d);
          assert.equal(s.cells[i], on.runs ? 'runs' : on.byCalendar ? 'removed' : 'off', `${s.serviceId} ${d}`);
        }
      });
    }),
    params(),
  );
});

test('the weekly pattern repeats every seven days; only calendar_dates.txt breaks it', () => {
  fc.assert(
    fc.property(ymd, (date) => {
      const next = addDays(date, 7);
      assert.equal(weekday(next), weekday(date));
      if (date >= '20070101' && next <= '20101231' && date !== '20070604' && next !== '20070604')
        assert.deepEqual(tripsOn(FEED, next), tripsOn(FEED, date));
    }),
    params(),
  );
});

test('CSV: quoted fields keep their commas, quotes and line breaks', () => {
  const field = fc.string({ unit: fc.constantFrom('a', 'b', ',', '"', '\n', ' ', 'é') });
  fc.assert(
    fc.property(fc.array(field, { minLength: 1, maxLength: 4 }), (values) => {
      const header = values.map((_, i) => `c${i}`).join(',');
      const row = values.map((v) => `"${v.replace(/"/g, '""')}"`).join(',');
      const [parsed] = parseCsv(`${header}\r\n${row}\r\n`);
      // Fields are trimmed, as GTFS readers do with surrounding spaces.
      assert.deepEqual(Object.values(parsed!), values.map((v) => v.trim()));
    }),
    params(300),
  );
});

/** Apply the day chart's edits with Agentic Mermaid's own mutate; true when the result serializes as `to`'s chart does. */
function replays(from: GtfsDate, to: GtfsDate): boolean {
  const parsed = parseRegisteredMermaid(ganttSource(FEED, from)),
    target = parseRegisteredMermaid(ganttSource(FEED, to));
  assert.ok(parsed.ok && target.ok);
  let model = parsed.value;
  for (const op of ganttEdits(FEED, from, to)) {
    const r = mutate(model, op as unknown as AnyMutationOp);
    assert.ok(r.ok, JSON.stringify(op));
    model = r.value;
  }
  return serializeMermaid(model) === serializeMermaid(target.value);
}

test('the day chart’s edits, replayed by Agentic Mermaid, turn any day’s chart into any other’s', () => {
  // The scene's three scenarios, then a sample of other pairs of dates.
  for (const date of ['20070604', '20070605', '20070609'])
    assert.ok(replays(addDays(date, -1), date), date);
  fc.assert(
    fc.property(ymd, ymd, (a, b) => {
      assert.ok(replays(a, b), `${a} to ${b}`);
      // Two edits per trip whose running changes, none for the others.
      const changed = FEED.trips.filter((t) => tripsOn(FEED, a).includes(t) !== tripsOn(FEED, b).includes(t)).length;
      assert.equal(ganttEdits(FEED, a, b).length, 2 * changed);
      assert.equal(dayChart(FEED, b).flatMap((s) => s.trips).filter((t) => t.runs).length, tripsOn(FEED, b).length);
    }),
    params(40),
  );
});
