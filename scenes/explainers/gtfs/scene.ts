import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/gtfs.ts';
import { Scene, Text } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { SAMPLE_FEED } from './feed.ts';
import {
  readFeed,
  servicesOn,
  tripsOn,
  stopDay,
  stopTimesOf,
  bandsOf,
  ganttSource,
  ganttEdits,
  addDays,
  longDate,
  shortDate,
  weekday,
  clock,
  seconds,
  headwayWords,
} from '../lib/gtfs.ts';
import type { GtfsDate, Row, ServiceDay } from '../lib/gtfs.ts';

// Sources, all at google/transit commit 3c9e7b9: the GTFS Schedule reference (lines quoted in
// ../lib/gtfs.ts and below) and its sample feed, whose files are copied in ./sample-feed-1.
const TRANSIT = 'https://github.com/google/transit/blob/3c9e7b904b5035349622f03e11851e25c16d1d99/gtfs/spec/en/';
const STYLE = 'github-light';
const FEED = readFeed(SAMPLE_FEED);

// The tables as an ER diagram, with only the columns the steps use and no key markers (at the
// camera's zoom a key marker's 9 px letters stay under 14 px). Tighter spacing than Mermaid's default
// lets each camera view reach 14 px. Cardinalities, from reference.md: trips.route_id is a required
// foreign ID (260); stop_times.trip_id is required (306) and a trip is "a sequence of two or more
// stops" (121); stop_times.stop_id is conditionally required (309: on-demand rows name a location
// instead); frequencies.trip_id is required (663); trips.service_id references calendar.service_id or
// calendar_dates.service_id (261), and calendar.txt has one row per service_id (333), calendar_dates.txt
// one per service_id and date (352).
const ER = `---
config:
  er:
    rankSpacing: 40
    nodeSpacing: 30
---
erDiagram
  ROUTE ||--o{ TRIP : "route_id"
  TRIP ||--|{ STOP_TIME : "trip_id"
  STOP |o--o{ STOP_TIME : "stop_id"
  TRIP ||--o{ FREQUENCY : "trip_id"
  CALENDAR |o--o{ TRIP : "service_id"
  CALENDAR_DATE }o--o{ TRIP : "service_id"
  ROUTE {
    id route_id
    text route_short_name
  }
  TRIP {
    id trip_id
    id route_id
    id service_id
  }
  STOP_TIME {
    id trip_id
    int stop_sequence
    id stop_id
    time departure_time
  }
  STOP {
    id stop_id
    text stop_name
  }
  FREQUENCY {
    id trip_id
    time start_time
    time end_time
    int headway_secs
  }
  CALENDAR {
    id service_id
    enum monday
    enum tuesday
    enum wednesday
    enum thursday
    enum friday
    enum saturday
    enum sunday
    date start_date
    date end_date
  }
  CALENDAR_DATE {
    id service_id
    date date
    enum exception_type
  }`;

// The diagram takes the left of the stage, words the right; the day's chart takes the whole stage.
const LEFT: Box = [-7.55, -4.25, 1.75, 3.25];
const RIGHT: Box = [2.05, -4.25, 7.55, 3.05];
const FULL: Box = [-7.8, -4.25, 7.8, 3.25];
const ZOOM = 1.2;
const SIZE = 0.26;

const STOPS = { airport: 'BEATTY_AIRPORT', stagecoach: 'STAGECOACH' } as const;
type StopKey = keyof typeof STOPS;
/** A stop's name without the feed's " (Demo)". */
const stopName = (id: string) => FEED.stops.find((s) => s.stop_id === id)!.stop_name!.replace(/ \(Demo\)$/, '');
const route = (id: string) => FEED.routes.find((r) => r.route_id === id)!;
const tripsOf = (serviceId: string) => FEED.trips.filter((t) => t.service_id === serviceId);
const list = (xs: readonly string[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const number = (n: number) =>
  ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][n] ?? String(n);
const upper = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** What one service's calendar rows say for a date, in a few words. */
function verdict(s: ServiceDay, date: GtfsDate): string {
  const day = weekday(date);
  if (!s.inCalendar)
    return s.exception === 1 ? `added on ${shortDate(date)}: runs` : 'no row for this date: no service';
  const pattern = `${day} ${s.weekday ? 1 : 0}${s.inRange ? '' : ', out of range'}`;
  if (s.exception === 2) return `${pattern}, but exception_type 2: no service`;
  if (s.exception === 1) return `${pattern}, but exception_type 1: runs`;
  return `${pattern}: ${s.runs ? 'runs' : 'no service'}`;
}

export default class GtfsExplainer extends Scene {
  static meta = {
    id: 'gtfs',
    title: 'Why does a GTFS route have no departures today?',
    sources: [
      TRANSIT + 'reference.md#L120-L121',
      TRANSIT + 'reference.md#L252-L267',
      TRANSIT + 'reference.md#L298-L311',
      TRANSIT + 'reference.md#L329-L363',
      TRANSIT + 'reference.md#L649-L667',
      TRANSIT + 'examples/sample-feed-1',
      'https://github.com/google/transit/blob/3c9e7b904b5035349622f03e11851e25c16d1d99/LICENSE',
    ],
  };
  static settings = [
    {
      id: 'date',
      label: 'Date',
      default: '2007-06-04',
      options: [
        { value: '2007-06-04', label: 'Mon 4 June 2007' },
        { value: '2007-06-05', label: 'Tue 5 June 2007' },
        { value: '2007-06-09', label: 'Sat 9 June 2007' },
      ],
    },
    {
      id: 'stop',
      label: 'Stop',
      default: 'airport',
      options: [
        { value: 'airport', label: 'Nye County Airport' },
        { value: 'stagecoach', label: 'Stagecoach Hotel & Casino' },
      ],
    },
  ];

  override async construct() {
    const values = settingsOf(this);
    const date: GtfsDate = values.date!.replace(/-/g, ''),
      before = addDays(date, -1),
      stopKey = values.stop as StopKey,
      stopId = STOPS[stopKey];
    const s = stage(this, { style: STYLE, headingSize: 0.6 });

    // ------------------------------------------------------------------ files
    const tables: [string, number, string][] = [
      ['routes.txt', FEED.routes.length, 'routes'],
      ['trips.txt', FEED.trips.length, 'trips'],
      ['stop_times.txt', FEED.stopTimes.length, 'stops made by trips'],
      ['stops.txt', FEED.stops.length, 'stops'],
      ['frequencies.txt', FEED.frequencies.length, 'headway periods'],
      ['calendar.txt', FEED.calendar.length, 'weekly services'],
      ['calendar_dates.txt', FEED.calendarDates.length, 'dated exception'],
    ];
    await readerFirst(this, s, readerFrames(date, stopId));
    await this.step('files', {
      detail: true,
      title: 'A route row does not promise a departure',
      line: 'Seven CSV files decide which trips can actually leave a stop.',
      caption:
        'The Demo Transit Authority’s sample feed contains routes even on dates when none of their trips run. To find departures at the selected stop, we must join trips to stops and check each trip’s service against the selected date. The GTFS Schedule reference publishes 11 CSV files; these seven contain the rows needed for that question, counted below each header.',
    });
    await s.clear();
    await s.card(
      tables.map(([file, n, what]) => [file, `${n} ${what}`] as [string, string]),
      { at: [-7.55, -4.0, 7.55, 3.0], width: 9.5, fontSize: 0.3 },
    );
    this.state.tables = Object.fromEntries(tables.map(([file, n]) => [file, n]));

    /** Lines of text in the right column, wrapped to its width, from its top down; heads in bold. */
    const column = async (rows: readonly (string | { head: string })[]) => {
      const out: Text[] = [];
      let y = RIGHT[3] - SIZE * 0.6;
      for (const row of rows) {
        const head = typeof row !== 'string';
        let line = '';
        const flush = () => {
          out.push(
            new Text(line, {
              fontSize: SIZE,
              color: head ? s.emphasis : s.palette.ink,
              weight: head ? 'bold' : 'normal',
              anchor: 'start',
            }).moveTo([RIGHT[0], y], [-1, 0]),
          );
          y -= SIZE * 1.5;
          line = '';
        };
        for (const w of (head ? row.head : row).split(' ')) {
          const next = line ? line + ' ' + w : w;
          if (line && new Text(next, { fontSize: SIZE }).width() > RIGHT[2] - RIGHT[0]) flush();
          line = line ? line + ' ' + w : w;
        }
        flush();
        if (head) y -= SIZE * 0.1;
        else y -= SIZE * 0.25;
      }
      await s.enter(...out);
    };

    // ------------------------------------------------------------------ schema
    await this.step('schema', {
      detail: true,
      title: 'Seven tables joined by shared IDs',
      line: 'Each line joins two files by the ID column named on it.',
      caption:
        'Each box is one file, with the columns this explainer uses. Each line joins two files by the column named on it. The marks at a line’s ends say how many rows of the table at that end can match one row at the other end; the list on the right reads them.',
    });
    await s.clear();
    const er = await s.show({ source: ER }, { box: LEFT });
    await column([
      { head: 'Marks at a line’s end' },
      'Two bars: exactly one',
      'Circle and bar: zero or one',
      'Bar and crow’s foot: one or more',
      'Circle and crow’s foot: zero or more',
    ]);
    this.state.schema = { entities: 7, relationships: 6 };

    // ------------------------------------------------------------------ route-trip
    const tripsByRoute = FEED.routes.map(
      (r) => [r.route_id!, FEED.trips.filter((t) => t.route_id === r.route_id).map((t) => t.trip_id!)] as const,
    );
    await this.step('route-trip', {
      detail: true,
      title: 'A route has no times; its trips do',
      line: 'Each row of trips.txt names one route in route_id.',
      // reference.md:120 and :260.
      caption:
        'routes.txt gives a route its names, vehicle type, colours and web page, and nothing about when it runs. Each row of trips.txt names one route in route_id, so a route has zero or more trips. The reference defines a route as “a group of trips that are displayed to riders as a single service”.',
    });
    await s.clearOverlays();
    await er.focus(['entity:ROUTE', 'entity:TRIP'], { zoom: ZOOM });
    await er.mark(['rel:ROUTE-TRIP#0']);
    await column([
      { head: 'Trips by route_id' },
      ...tripsByRoute.map(
        ([id, trips]) =>
          `Route ${route(id).route_short_name}: ${trips.length > 3 ? `${trips[0]} to ${trips.at(-1)}` : list(trips)}`,
      ),
    ]);
    this.state.tripsByRoute = Object.fromEntries(tripsByRoute);

    // ------------------------------------------------------------------ trip-stops
    const ab1 = stopTimesOf(FEED, 'AB1'),
      city1 = stopTimesOf(FEED, 'CITY1');
    const ab1First = ab1[0]!,
      ab1Last = ab1.at(-1)!;
    const city1Bands = bandsOf(FEED, 'CITY1'),
      stbaBands = bandsOf(FEED, 'STBA');
    await this.step('trip-stops', {
      detail: true,
      title: 'A trip’s times are rows of stop_times.txt',
      line: 'One row per stop a trip makes, in stop_sequence order.',
      // reference.md:121, :306, :309; frequencies :657, :664-667.
      caption: `stop_times.txt joins trips to stops: one row for each stop a trip makes, in stop_sequence order, with its times. AB1 leaves ${stopName(ab1First.stop_id!)} at ${clock(seconds(ab1First.departure_time!))} and reaches ${stopName(ab1Last.stop_id!)} at ${clock(seconds(ab1Last.arrival_time!))}. A trip listed in frequencies.txt repeats through the day on a headway.`,
    });
    await s.clearOverlays();
    await er.unmark();
    await er.focus(['entity:TRIP', 'entity:STOP_TIME', 'entity:STOP', 'entity:FREQUENCY'], { zoom: ZOOM });
    await er.mark(['rel:TRIP-STOP_TIME#0', 'rel:STOP-STOP_TIME#0']);
    await column([
      { head: 'AB1 in stop_times.txt' },
      `1: ${stopName(ab1First.stop_id!)}, leaves ${clock(seconds(ab1First.departure_time!))}`,
      `2: ${stopName(ab1Last.stop_id!)}, arrives ${clock(seconds(ab1Last.arrival_time!))}`,
      { head: 'In frequencies.txt' },
      `STBA: ${headwayWords(stbaBands)}, ${clock(stbaBands[0]!.start)} to ${clock(stbaBands.at(-1)!.end)}`,
      `CITY1: ${headwayWords(city1Bands)}, in ${city1Bands.length} periods`,
    ]);
    this.state.stopTimes = {
      AB1: ab1.map((r) => [r.stop_id, r.arrival_time, r.departure_time]),
      CITY1: city1.length,
      frequencyRows: { STBA: stbaBands.length, CITY1: city1Bands.length },
    };

    // ------------------------------------------------------------------ service
    const services = [...new Set(FEED.trips.map((t) => t.service_id!))].map((id) => ({
      id,
      trips: tripsOf(id).length,
      calendar: FEED.calendar.some((r) => r.service_id === id),
      dates: FEED.calendarDates.filter((r) => r.service_id === id).length,
    }));
    const where = (x: (typeof services)[number]) =>
      x.calendar && x.dates
        ? 'calendar.txt and calendar_dates.txt'
        : x.calendar
          ? 'calendar.txt only'
          : 'calendar_dates.txt only';
    await this.step('service', {
      detail: true,
      title: 'A trip’s service_id may point into either of two tables',
      line: 'calendar.txt sets weekdays; calendar_dates.txt changes single dates.',
      // reference.md:261, :356-357, :361, :363.
      caption: `A trip’s service_id must match a row of calendar.txt, of calendar_dates.txt, or both. calendar.txt sets weekdays between a start and an end date; calendar_dates.txt adds or removes single dates. Here ${services
        .map((x) => `${x.id} (${x.trips} trips) is in ${where(x).replace(' only', ' alone')}`)
        .join(', and ')}.`,
    });
    await s.clearOverlays();
    await er.unmark();
    await er.focus(['entity:CALENDAR', 'entity:CALENDAR_DATE', 'entity:TRIP'], { zoom: ZOOM });
    await er.mark(['rel:CALENDAR-TRIP#0', 'rel:CALENDAR_DATE-TRIP#0'], { as: 'either table' });
    await column(services.flatMap((x) => [{ head: `${x.id}, ${x.trips} trips` }, `In ${where(x)}`]));
    this.state.services = services;

    // ------------------------------------------------------------------ evaluate
    const today = servicesOn(FEED, date);
    const running = today.filter((x) => x.runs).map((x) => x.serviceId);
    const tripsToday = tripsOn(FEED, date);
    const day = weekday(date);
    const removed = today.filter((x) => x.exception === 2);
    await this.step('evaluate', {
      detail: true,
      title: running.length
        ? `On ${longDate(date)}, ${list(running)} ${running.length > 1 ? 'run' : 'runs'}`
        : `On ${longDate(date)}, no service runs`,
      line: removed.length
        ? `An exception_type 2 row removes ${list(removed.map((x) => x.serviceId))}, overriding the ${day} column.`
        : `The ${day} column decides; no exception row matches this date.`,
      // reference.md:338-346 (weekday columns, range with end_date included) and :361-363 (exceptions).
      caption: `${longDate(date)} lies between start_date and end_date for ${today.every((x) => x.inRange) ? (today.length === 2 ? 'both services' : 'every service') : 'some services'}. ${today
        .map((x) =>
          x.exception === 2
            ? `${x.serviceId} has ${day} = 1, but calendar_dates.txt removes it on ${date} with exception_type 2, which overrides the weekly pattern`
            : `${x.serviceId} has ${day} = ${x.weekday ? 1 : 0}${x.runs ? ' and runs' : ''}`,
        )
        .join(
          '; ',
        )}. So ${tripsToday.length === 0 ? `none of the ${FEED.trips.length} trips runs` : tripsToday.length === FEED.trips.length ? `all ${FEED.trips.length} trips run` : `${number(tripsToday.length)} of the ${FEED.trips.length} trips run`}.`,
    });
    await s.clear();
    const calendar = SAMPLE_FEED['calendar.txt']!.split('\n'),
      exceptions = SAMPLE_FEED['calendar_dates.txt']!.split('\n');
    const code = await s.code(['# calendar.txt', ...calendar, '# calendar_dates.txt', ...exceptions], {
      at: [-7.55, -0.6, 7.55, 3.1],
      fontSize: 0.2,
    });
    // Mark the rows that decide: the exception if one applies, else the weekly rows.
    const exceptionLine = 1 + calendar.length + 1 + exceptions.findIndex((l) => l.split(',')[1] === date);
    await code.focus(removed.length ? exceptionLine : [2, calendar.length], {
      as: removed.length ? 'applies on this date' : 'decides this date',
    });
    await s.card(
      [
        ...today.map((x) => [x.serviceId, verdict(x, date)] as [string, string]),
        ['Trips that run', `${tripsToday.length} of ${FEED.trips.length}`],
      ],
      { at: [-7.55, -4.25, 7.55, -0.85], width: 10.5, fontSize: 0.28 },
    );
    this.state.today = today;

    // ------------------------------------------------------------------ day-before
    const was = tripsOn(FEED, before);
    const wasServices = servicesOn(FEED, before)
      .filter((x) => x.runs)
      .map((x) => x.serviceId);
    const of = (n: number) =>
      n === FEED.trips.length
        ? `all ${n} trips`
        : n
          ? `${n} of the ${FEED.trips.length} trips`
          : `none of the ${FEED.trips.length} trips`;
    await this.step('day-before', {
      detail: true,
      title: `The day before, ${longDate(before)}, runs ${of(was.length)}`,
      line:
        was.length < FEED.trips.length
          ? 'One bar per trip, grouped by service_id; grey bars do not run.'
          : 'One bar per trip, grouped by service_id; every bar runs.',
      caption: `One bar per trip, grouped by service_id and labelled with its route. A trip that runs once spans its first departure to its last arrival; a trip in frequencies.txt spans the hours its vehicles leave the first stop. Grey bars, marked “no service”, do not run that day. On ${shortDate(before)} ${
        wasServices.length ? `${list(wasServices)} ${wasServices.length > 1 ? 'run' : 'runs'}` : 'no service runs'
      }.`,
    });
    await s.clear();
    const chart = await s.show({ source: ganttSource(FEED, before) }, { box: FULL });
    this.state.dayBefore = { date: before, running: was.map((t) => t.trip_id) };

    // ------------------------------------------------------------------ day
    const edits = ganttEdits(FEED, before, date);
    const started = tripsToday.filter((t) => !was.includes(t)),
      stopped = was.filter((t) => !tripsToday.includes(t));
    const routesOf = (trips: readonly Row[]) =>
      FEED.routes.filter((r) => trips.some((t) => t.route_id === r.route_id)).map((r) => r.route_short_name!);
    const services2 = (trips: readonly Row[]) => [...new Set(trips.map((t) => t.service_id!))];
    await this.step('day', {
      detail: true,
      title: `${longDate(date)} runs ${of(tripsToday.length)}`,
      line:
        started.length || stopped.length
          ? `${upper(
              [
                ...(started.length ? [`${number(started.length)} ${list(services2(started))} trips start`] : []),
                ...(stopped.length ? [`${number(stopped.length)} ${list(services2(stopped))} trips stop`] : []),
              ].join(' and '),
            )}; each gets a new label and colour.`
          : 'No trip starts or stops, so the chart is unchanged.',
      caption: `The same chart, edited for ${shortDate(date)}: each trip that starts or stops running gets a new label and colour, ${edits.length} edits in all. ${
        started.length
          ? `${upper(number(started.length))} trips with service_id ${list(services2(started))} start, on route${routesOf(started).length > 1 ? 's' : ''} ${list(routesOf(started))}.`
          : ''
      }${
        stopped.length
          ? `${upper(number(stopped.length))} trips with service_id ${list(services2(stopped))} stop. All ${FEED.routes.length} routes are still in routes.txt; none has a trip running.`
          : ''
      }`,
    });
    await chart.morph({ source: ganttSource(FEED, date) }, { ops: edits });
    this.state.day = { date, running: tripsToday.map((t) => t.trip_id), edits: edits.length };

    // ------------------------------------------------------------------ departures
    const at = stopDay(FEED, stopId, date);
    const name = stopName(stopId);
    const leaving = [...at.departures.map((d) => d.tripId), ...at.headways.map((h) => h.tripId)];
    const routeOf = (tripId: string) =>
      route(FEED.trips.find((t) => t.trip_id === tripId)!.route_id!).route_short_name!;
    const ending = at.ending.length
      ? ` ${list(at.ending)} end${at.ending.length > 1 ? '' : 's'} here and ${at.ending.length > 1 ? 'do' : 'does'} not count.`
      : '';
    const servedBy = FEED.routes
      .filter((r) =>
        FEED.trips.some(
          (t) => t.route_id === r.route_id && stopTimesOf(FEED, t.trip_id!).some((x) => x.stop_id === stopId),
        ),
      )
      .map((r) => r.route_short_name!);
    // On a date an exception empties, show what calendar.txt alone would have sent from the stop.
    const usual = stopDay(FEED, stopId, date, { byCalendar: true });
    const shown = leaving.length ? at : usual;
    const removedBy = today.filter((x) => x.exception === 2).map((x) => x.serviceId);
    await this.step('departures', {
      detail: true,
      title: !leaving.length
        ? `Nothing leaves ${name} on ${shortDate(date)}`
        : at.headways.length && !at.departures.length
          ? `${upper(number(at.headways.length))} frequency trips leave ${name} on ${shortDate(date)}`
          : `${upper(number(at.departures.length))} departure${at.departures.length > 1 ? 's' : ''} from ${name} on ${shortDate(date)}`,
      line: !leaving.length
        ? removedBy.length
          ? `The card shows what calendar.txt alone would send; ${list(removedBy)} ${removedBy.length > 1 ? 'are' : 'is'} removed.`
          : 'No trip runs that day, so no stop_times row counts.'
        : at.headways.length
          ? 'Headways with exact_times empty: the card gives gaps, not times.'
          : 'Each is a stop_times row here that is not its trip’s last.',
      // frequencies: reference.md:657 ("operators attempt to strictly maintain predetermined headways"),
      // :665 (end_time: when "service changes to a different headway (or ceases)"), :667 (exact_times empty).
      caption: !leaving.length
        ? `A departure is a stop_times row at the stop that is not its trip’s last. On ${shortDate(date)} no trip runs, so no row counts.${
            removedBy.length
              ? ` The card lists what calendar.txt alone would send from ${name} on a ${upper(day)}; calendar_dates.txt removes ${list(removedBy)} for the day.`
              : ''
          }`
        : at.headways.length
          ? `A departure is a stop_times row at the stop that is not its trip’s last. ${list(at.headways.map((h) => h.tripId))} start here, on headways with exact_times empty: operators keep the gap, not a timetable. The reference does not say whether a vehicle leaves at end_time, so the card gives gaps.${ending}`
          : `A departure is a stop_times row at the stop that is not its trip’s last. On ${shortDate(date)} ${list(at.departures.map((d) => `${d.tripId} leaves at ${clock(d.time)}`))}.${ending}`,
    });
    await s.clear();
    const note = leaving.length ? (x: string) => x : (x: string) => `${x}, removed`;
    const rows: [string, string][] = [
      ...shown.departures.map(
        (d) => [`${clock(d.time)}  ${d.tripId}, route ${routeOf(d.tripId)}`, note(d.headsign)] as [string, string],
      ),
      ...shown.headways.flatMap((h) =>
        h.bands.map(
          (b) => [`${h.tripId}  ${clock(b.start)} to ${clock(b.end)}`, note(headwayWords([b]))] as [string, string],
        ),
      ),
      ...(at.ending.length ? [['Ends here', list(at.ending)] as [string, string]] : []),
    ];
    await s.card(
      rows.length
        ? rows
        : [
            [name, 'no departures'],
            ['Routes stopping here', `${list(servedBy)}, on other days`],
          ],
      {
        at: [-7.55, -4.0, 7.55, 3.0],
        width: 11,
        fontSize: 0.3,
        title: leaving.length
          ? `Leaving ${name}, ${shortDate(date)}`
          : `What calendar.txt alone would send, ${shortDate(date)}`,
      },
    );
    this.state.departures = at;
    this.state.usual = leaving.length ? null : usual;
  }
}
