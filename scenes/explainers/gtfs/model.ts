// Which trips of a GTFS feed run on a date, and what leaves a stop that day, read from the feed's
// own tables. Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// What it leaves out: realtime delays and cancellations, transfers and journey planning. It is held to
// Google's sample feed (calendars, trips, stop times and frequencies) and to gtfs-kit's counts for it
// (model.test.ts). It reads only the seven tables readFeed names.
//
// Every rule is from the GTFS Schedule reference at google/transit commit 3c9e7b9
// (gtfs/spec/en/reference.md, lines as numbered at that commit):
//   120  routes.txt: "A route is a group of trips that are displayed to riders as a single service."
//   121  trips.txt: "A trip is a sequence of two or more stops that occur during a specific time period."
//   260  trips.route_id: "Foreign ID referencing `routes.route_id`".
//   261  trips.service_id: "Foreign ID referencing `calendar.service_id` or `calendar_dates.service_id`".
//   306  stop_times.trip_id: "Foreign ID referencing `trips.trip_id`"; 309 stop_id references stops.stop_id.
//   338  calendar.monday: "1 - Service is available for all Mondays in the date range" (339-344: the
//        other days "function in the same way"); 345-346 start_date and end_date, the end date "included".
//   361  calendar_dates: "If a `service_id` value appears in both calendar.txt and calendar_dates.txt,
//        the information in calendar_dates.txt modifies the service information specified in calendar.txt."
//   363  exception_type: "1 - Service has been added for the specified date. 2 - Service has been
//        removed for the specified date."
//   657  frequencies, exact_times=0: "operators attempt to strictly maintain predetermined headways".
//   664-666  start_time, end_time ("Time at which service changes to a different headway (or ceases)
//        at the first stop in the trip"), headway_secs.
//   667  exact_times: "0 or empty - Frequency-based trips."

import { listed, upperFirst } from '../lib/format.ts';

/** One row of a CSV table, by column name. */
export type Row = Readonly<Record<string, string>>;

/** RFC 4180 CSV: a header row, then records; quoted fields may hold commas, quotes and newlines. */
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = '',
    record: string[] = [],
    quoted = false,
    // A line with nothing on it is no record; a line holding "" is one empty field.
    blank = true;
  const end = () => {
    record.push(field);
    if (!blank) records.push(record);
    (field = ''), (record = []), (blank = true);
  };
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') (quoted = true), (blank = false);
    else if (c === ',') record.push(field), (field = ''), (blank = false);
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      end();
    } else (field += c), (blank = false);
  }
  if (!blank) end();
  const [header, ...rows] = records;
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? '').trim()])));
}

export interface Feed {
  routes: Row[];
  trips: Row[];
  stopTimes: Row[];
  stops: Row[];
  calendar: Row[];
  calendarDates: Row[];
  frequencies: Row[];
}
/** The tables a feed's files hold; a missing optional file is an empty table. */
export function readFeed(files: Readonly<Record<string, string>>): Feed {
  const table = (name: string) => (files[name] == null ? [] : parseCsv(files[name]!));
  return {
    routes: table('routes.txt'),
    trips: table('trips.txt'),
    stopTimes: table('stop_times.txt'),
    stops: table('stops.txt'),
    calendar: table('calendar.txt'),
    calendarDates: table('calendar_dates.txt'),
    frequencies: table('frequencies.txt'),
  };
}

// ------------------------------------------------------------------ dates

/** A GTFS date, YYYYMMDD (reference.md line 82). */
export type GtfsDate = string;
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const utc = (date: GtfsDate) => {
  if (!/^\d{8}$/.test(date)) throw new Error(`Not a GTFS date: ${date}`);
  return Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8));
};
/** The day of the week of a date, as calendar.txt names its columns. */
export function weekday(date: GtfsDate): Weekday {
  // getUTCDay: 0 is Sunday.
  return WEEKDAYS[(new Date(utc(date)).getUTCDay() + 6) % 7]!;
}
export function addDays(date: GtfsDate, n: number): GtfsDate {
  return new Date(utc(date) + n * 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
}
/** "Monday 4 June 2007". */
export function longDate(date: GtfsDate): string {
  const d = new Date(utc(date));
  return `${upperFirst(weekday(date))} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "4 June". */
export function shortDate(date: GtfsDate): string {
  const d = new Date(utc(date));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// ------------------------------------------------------------------ services

/** How one service_id stands on one date, rule by rule. */
export interface ServiceDay {
  serviceId: string;
  /** The service has a row in calendar.txt. */
  inCalendar: boolean;
  /** calendar.txt's column for the date's weekday is 1 (null without a calendar row). */
  weekday: boolean | null;
  /** The date lies in start_date..end_date, both included (null without a calendar row). */
  inRange: boolean | null;
  /** calendar_dates.txt's exception_type for this service and date, if any. */
  exception: 1 | 2 | null;
  /** What the weekly pattern alone says. */
  byCalendar: boolean;
  runs: boolean;
}
export function serviceOn(feed: Feed, serviceId: string, date: GtfsDate): ServiceDay {
  const row = feed.calendar.find((r) => r.service_id === serviceId);
  const day = weekday(date);
  const flag = row ? row[day] === '1' : null;
  const inRange = row ? row.start_date! <= date && date <= row.end_date! : null;
  const byCalendar = !!flag && !!inRange;
  const ex = feed.calendarDates.find((r) => r.service_id === serviceId && r.date === date);
  const exception = ex ? (Number(ex.exception_type) as 1 | 2) : null;
  if (exception != null && exception !== 1 && exception !== 2) throw new Error(`exception_type ${ex!.exception_type}`);
  // An exception decides the date outright (line 363); otherwise the weekly pattern does.
  const runs = exception === 1 ? true : exception === 2 ? false : byCalendar;
  return { serviceId, inCalendar: !!row, weekday: flag, inRange, exception, byCalendar, runs };
}
/** Every service_id the feed defines, in the order calendar.txt then calendar_dates.txt first names it. */
export function serviceIds(feed: Feed): string[] {
  return [...new Set([...feed.calendar, ...feed.calendarDates].map((r) => r.service_id!))];
}
export function servicesOn(feed: Feed, date: GtfsDate): ServiceDay[] {
  return serviceIds(feed).map((id) => serviceOn(feed, id, date));
}
/** A week-grid cell: the service runs; the weekly pattern runs it but calendar_dates.txt removes it; or neither. */
export type Cell = 'runs' | 'removed' | 'off';
export interface WeekGrid {
  /** Sunday to Saturday, around the date asked for. */
  dates: GtfsDate[];
  services: { serviceId: string; trips: number; cells: Cell[] }[];
  /** Trips that run on each date. */
  trips: number[];
}
/** The week around a date as a grid: one row per service, one column per date, and each column's trips. */
export function weekGrid(feed: Feed, date: GtfsDate): WeekGrid {
  const sunday = addDays(date, -((WEEKDAYS.indexOf(weekday(date)) + 1) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  const services = serviceIds(feed).map((serviceId) => ({
    serviceId,
    trips: feed.trips.filter((t) => t.service_id === serviceId).length,
    cells: dates.map((d): Cell => {
      const s = serviceOn(feed, serviceId, d);
      return s.runs ? 'runs' : s.byCalendar ? 'removed' : 'off';
    }),
  }));
  return { dates, services, trips: dates.map((d) => tripsOn(feed, d).length) };
}
/**
 * The trips that run on a date: those whose service_id runs then, in trips.txt order. With
 * `byCalendar`, those calendar.txt's weekly pattern alone would run, before calendar_dates.txt.
 */
export function tripsOn(feed: Feed, date: GtfsDate, { byCalendar = false } = {}): Row[] {
  const running = new Set(servicesOn(feed, date).filter((s) => (byCalendar ? s.byCalendar : s.runs)).map((s) => s.serviceId));
  return feed.trips.filter((t) => running.has(t.service_id!));
}

// ------------------------------------------------------------------ times

/** Seconds from "noon minus 12h" of the service day (line 92), H:MM:SS; GTFS times may pass 24:00:00. */
export function seconds(time: string): number {
  const m = /^(\d+):(\d\d):(\d\d)$/.exec(time.trim());
  if (!m) throw new Error(`Not a GTFS time: ${time}`);
  return +m[1]! * 3600 + +m[2]! * 60 + +m[3]!;
}
/** "8:00", or "7:59:59" when the seconds are not zero. */
export function clock(s: number): string {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}${sec ? ':' + String(sec).padStart(2, '0') : ''}`;
}

/** One headway period of a frequency-based trip. */
export interface Band {
  start: number;
  end: number;
  headwaySecs: number;
  /** 0: frequency-based, no fixed times (line 667); 1: a compressed fixed schedule. */
  exactTimes: 0 | 1;
}
/** A trip's stop times in stop_sequence order. */
export function stopTimesOf(feed: Feed, tripId: string): Row[] {
  return feed.stopTimes.filter((r) => r.trip_id === tripId).sort((a, b) => +a.stop_sequence! - +b.stop_sequence!);
}
export function bandsOf(feed: Feed, tripId: string): Band[] {
  return feed.frequencies
    .filter((r) => r.trip_id === tripId)
    .map((r) => ({
      start: seconds(r.start_time!),
      end: seconds(r.end_time!),
      headwaySecs: Number(r.headway_secs),
      exactTimes: (r.exact_times === '1' ? 1 : 0) as 0 | 1,
    }))
    .sort((a, b) => a.start - b.start);
}

/** A trip as the day's chart draws it. */
export interface TripSpan {
  tripId: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  /** Headway periods, for a trip in frequencies.txt; empty for a trip that runs once at its stop times. */
  bands: Band[];
  /** A once-only trip: first departure to last arrival. A frequency trip: the hours vehicles leave its first stop. */
  start: number;
  end: number;
}
export function spanOf(feed: Feed, trip: Row): TripSpan {
  const times = stopTimesOf(feed, trip.trip_id!);
  const bands = bandsOf(feed, trip.trip_id!);
  const first = times[0],
    last = times.at(-1);
  if (!first || !last) throw new Error(`Trip ${trip.trip_id} has no stop times`);
  return {
    tripId: trip.trip_id!,
    routeId: trip.route_id!,
    serviceId: trip.service_id!,
    headsign: trip.trip_headsign ?? '',
    bands,
    start: bands.length ? bands[0]!.start : seconds(first.departure_time!),
    end: bands.length ? bands.at(-1)!.end : seconds(last.arrival_time!),
  };
}

// ------------------------------------------------------------------ a stop's day

/** One stop_times row at a stop, for a trip that runs that day. */
export interface Visit {
  tripId: string;
  routeId: string;
  stopSequence: number;
  departure: number;
  /** The trip's last stop: it arrives and goes no further. */
  last: boolean;
}
/** Every stop_times row at the stop for the day's trips, by departure time, then trip_id. */
export function visitsAt(feed: Feed, stopId: string, date: GtfsDate, options: { byCalendar?: boolean } = {}): Visit[] {
  return tripsOn(feed, date, options)
    .flatMap((trip) => {
      const times = stopTimesOf(feed, trip.trip_id!);
      return times
        .filter((r) => r.stop_id === stopId)
        .map((r) => ({
          tripId: trip.trip_id!,
          routeId: trip.route_id!,
          stopSequence: +r.stop_sequence!,
          departure: seconds(r.departure_time!),
          last: r === times.at(-1),
        }));
    })
    .sort((a, b) => a.departure - b.departure || (a.tripId < b.tripId ? -1 : 1));
}
/** A once-only departure: a trip that leaves the stop at a fixed time. */
export interface Departure {
  tripId: string;
  routeId: string;
  time: number;
  headsign: string;
}
/** A frequency trip that leaves the stop on a headway: its periods, shifted to this stop. */
export interface Headways {
  tripId: string;
  routeId: string;
  headsign: string;
  /** Seconds from the trip's first stop to this one: each vehicle leaves here that long after it starts. */
  offset: number;
  bands: Band[];
}
export interface StopDay {
  stopId: string;
  stopName: string;
  departures: Departure[];
  headways: Headways[];
  /** Trips that end at this stop, by trip_id. */
  ending: string[];
}
export function stopDay(feed: Feed, stopId: string, date: GtfsDate, options: { byCalendar?: boolean } = {}): StopDay {
  const stop = feed.stops.find((s) => s.stop_id === stopId);
  if (!stop) throw new Error(`No stop ${stopId}`);
  const trip = (id: string) => feed.trips.find((t) => t.trip_id === id)!;
  const visits = visitsAt(feed, stopId, date, options);
  const leaving = visits.filter((v) => !v.last);
  const departures: Departure[] = [],
    headways: Headways[] = [];
  for (const v of leaving) {
    const bands = bandsOf(feed, v.tripId);
    const headsign = trip(v.tripId).trip_headsign ?? '';
    if (!bands.length) departures.push({ tripId: v.tripId, routeId: v.routeId, time: v.departure, headsign });
    else {
      const offset = v.departure - seconds(stopTimesOf(feed, v.tripId)[0]!.departure_time!);
      headways.push({ tripId: v.tripId, routeId: v.routeId, headsign, offset, bands: bands.map((b) => ({ ...b, start: b.start + offset, end: b.end + offset })) });
    }
  }
  return {
    stopId,
    stopName: stop.stop_name!,
    departures,
    headways,
    ending: visits.filter((v) => v.last).map((v) => v.tripId),
  };
}

// ------------------------------------------------------------------ the day as a Gantt chart

/** "every 30 min", "every 10 or 30 min". */
export function headwayWords(bands: readonly Band[]): string {
  const mins = [...new Set(bands.map((b) => b.headwaySecs / 60))].sort((a, b) => a - b);
  return `every ${listed(mins, { or: true })} min`;
}
/** A Gantt task's words: the trip_id and its route, its headways if it repeats, and "(no service)" on a day it does not run. */
export function taskLabel(feed: Feed, span: TripSpan, runs: boolean): string {
  const route = feed.routes.find((r) => r.route_id === span.routeId)!;
  return `${span.tripId}, route ${route.route_short_name}${span.bands.length ? ' ' + headwayWords(span.bands) : ''}${runs ? '' : ' (no service)'}`;
}
/** HHmm: Agentic Mermaid's edits refuse task dates with a colon. */
const hhmm = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
/** The Gantt task id of a trip. */
export const taskId = (tripId: string) => tripId.toLowerCase();

/** Every trip in the feed, grouped by service_id and ordered by route, each marked as running or not on the date. */
export function dayChart(feed: Feed, date: GtfsDate) {
  const running = new Set(tripsOn(feed, date).map((t) => t.trip_id));
  const routeRank = (t: Row) => feed.routes.findIndex((r) => r.route_id === t.route_id);
  return serviceIds(feed)
    .map((serviceId) => ({
      serviceId,
      trips: feed.trips
        .filter((t) => t.service_id === serviceId)
        .map((t, i) => ({ t, i }))
        .sort((a, b) => routeRank(a.t) - routeRank(b.t) || a.i - b.i)
        .map(({ t }) => ({ span: spanOf(feed, t), runs: running.has(t.trip_id) })),
    }))
    .filter((s) => s.trips.length);
}
/** Thinner bars than Mermaid's default: with a section per service_id, the labels reach 14 px on the stage. */
const GANTT_CONFIG = ['---', 'config:', '  gantt:', '    barHeight: 6', '---'];
/** The day's chart as Mermaid: one section per service_id, one task per trip; trips that do not run are "done" (grey).
 * A frequency trip's bar spans the hours its vehicles leave the first stop; it does not draw one vehicle travelling
 * continuously. */
export function ganttSource(feed: Feed, date: GtfsDate): string {
  return [
    ...GANTT_CONFIG,
    'gantt',
    '  dateFormat HHmm',
    '  axisFormat %H:%M',
    ...dayChart(feed, date).flatMap(({ serviceId, trips }) => [
      `  section service_id ${serviceId}`,
      ...trips.map(
        ({ span, runs }) => `    ${taskLabel(feed, span, runs)} :${runs ? '' : 'done, '}${taskId(span.tripId)}, ${hhmm(span.start)}, ${hhmm(span.end)}`,
      ),
    ]),
  ].join('\n');
}
/** The edits that turn one day's chart into another's: a rename and a status for each trip that starts or stops running. */
export function ganttEdits(feed: Feed, from: GtfsDate, to: GtfsDate): Record<string, unknown>[] {
  const before = dayChart(feed, from),
    after = dayChart(feed, to);
  return after.flatMap(({ trips }, sectionIndex) =>
    trips.flatMap(({ span, runs }, taskIndex) =>
      before[sectionIndex]!.trips[taskIndex]!.runs === runs
        ? []
        : [
            { kind: 'rename_task', sectionIndex, taskIndex, label: taskLabel(feed, span, runs) },
            { kind: 'set_task_status', sectionIndex, taskIndex, status: runs ? null : 'done' },
          ],
    ),
  );
}
