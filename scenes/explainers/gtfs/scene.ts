import { Scene, Text, Group, Rectangle, view } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf, Card, mermaid } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { stagedStep } from '../../../explain/index.ts';
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
  weekGrid,
} from '../lib/gtfs.ts';
import type { Band, Cell, GtfsDate, Row, ServiceDay, StopDay, WeekGrid } from '../lib/gtfs.ts';
import { listed } from '../lib/format.ts';

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
const ER = `${mermaid.frontMatter({ er: { rankSpacing: 40, nodeSpacing: 30 } })}
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

/** The script's one-sentence answer (script.md); the service step's caption states it. */
const ANSWER = 'A route has departures only on dates its trips’ service runs';

// The diagram takes the left of the stage, words the right; the day's chart takes the whole stage.
const LEFT: Box = [-7.55, -4.25, 1.75, 2.95];
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
const number = (n: number) =>
  ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][n] ?? String(n);
const upper = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** The sample feed with one more calendar_dates.txt row, for the check questions. */
const plus = (row: string) =>
  readFeed({ ...SAMPLE_FEED, 'calendar_dates.txt': SAMPLE_FEED['calendar_dates.txt'] + '\n' + row });
const ADD_WE = 'WE,20070604,1',
  CUT_WE = 'WE,20070609,2',
  ADDED = tripsOn(plus(ADD_WE), '20070604').map((t) => t.trip_id!),
  CUT_DAY = tripsOn(plus(CUT_WE), '20070609').length,
  CUT_NEXT = tripsOn(plus(CUT_WE), '20070616').length,
  TUESDAY = tripsOn(plus('FULLW,20070605,2'), '20070605').length;

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
    // The script's answer, stated by the service step, and three questions that ask the reader to edit the
    // feed: each answer is the model's result on the sample feed with one more calendar_dates.txt row.
    answer: ANSWER,
    checks: [
      {
        question:
          'Route 50’s four trips run only at weekends. Which one row, in which file, would make them run on Monday 4 June 2007 as well?',
        answer: `calendar_dates.txt: ${ADD_WE}. exception_type 1 adds service WE on that date, so ${listed(ADDED)} run, ${ADDED.length} of the ${FEED.trips.length} trips; routes.txt, trips.txt and stop_times.txt stay as they are.`,
      },
      {
        question:
          'To cancel route 50 on Saturday 9 June 2007 only, why not delete its row from routes.txt, and what row would do it instead?',
        answer: `Deleting the route would remove it from every date and leave four trips whose route_id names nothing. The row ${CUT_WE} in calendar_dates.txt removes WE on that one date: ${CUT_DAY} of the ${FEED.trips.length} trips still run, and the next Saturday keeps all ${CUT_NEXT}.`,
      },
      {
        question: 'If calendar_dates.txt also had the row FULLW,20070605,2, what would Tuesday 5 June look like?',
        answer: `Like Monday: FULLW would be removed for the day and WE does not run on Tuesdays, so ${TUESDAY ? `${TUESDAY} trips would run` : `none of the ${FEED.trips.length} trips would run`}, though all ${FEED.routes.length} routes stay in routes.txt.`,
      },
    ],
    // The sentences that reach beyond the scenario on screen, and the tests that hold them.
    claims: [
      { says: 'A route has departures only on dates its trips’ service runs', test: 'test/explain-gtfs.test.ts: a route has departures only on dates' },
      { says: 'AB1 runs only on the dates its service', test: 'test/explain-gtfs.test.ts: a route has departures only on dates' },
      { says: 'only FULLW runs', shown: true as const },
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

    /** Lines of text in the right column, wrapped to its width, from its top down; heads in bold. */
    const columnText = (rows: readonly (string | { head: string })[]) => {
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
      return new Group(...out);
    };
    /** The right column as a view of the step's state: check compares its words with the state at each step's end. */
    const column = async (rows: (st: Record<string, unknown>) => readonly (string | { head: string })[]) => {
      await s.enter(view(this, (st) => columnText(rows(st)), { place: false }));
    };

    // ------------------------------------------------------------------ day-before
    const tripsToday = tripsOn(FEED, date);
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
      title: `On ${longDate(before)}, the sample feed runs ${of(was.length)}`,
      line: `Predict: which of these bars still run the next day, ${longDate(date)}?`,
      caption: `Google publishes a sample GTFS feed, the CSV files a transit agency gives trip planners, for an invented Demo Transit Authority with ${FEED.routes.length} bus routes. Here is its day: one bar per trip, labelled with its route and grouped under its service_id, the feed’s name for the timetable a trip follows: FULLW or WE. A trip that runs once spans its first departure to its last arrival; a trip that repeats on a fixed gap spans the hours its vehicles leave the first stop. Bars marked “no service” do not run that day. On ${shortDate(before)} ${
        wasServices.length === 2 ? 'both timetables run' : wasServices.length ? `only ${wasServices[0]} runs` : 'neither runs'
      }.`,
    });
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
      title: `${longDate(date)} runs ${of(tripsToday.length)}`,
      line: tripsToday.length
        ? 'Predict: nothing in routes.txt changed overnight. What decides which trips run?'
        : `Predict: all ${FEED.routes.length} routes are still in routes.txt. Why does none run?`,
      caption: `The date is now ${shortDate(date)}. The route list has not changed, but the active trips have: ${
        started.length
          ? `${number(started.length)} trips under ${listed(services2(started))} start, on route${routesOf(started).length > 1 ? 's' : ''} ${listed(routesOf(started))}.`
          : ''
      }${
        stopped.length
          ? `${started.length ? ' ' + upper(number(stopped.length)) : number(stopped.length)} trips under ${listed(services2(stopped))} stop.${tripsToday.length ? '' : ` All ${FEED.routes.length} routes are still in routes.txt, and none has a trip running: a rider asking for today’s departures gets nothing.`}`
          : ''
      } To see why, follow one trip, AB1, from its route to its dates.`,
    });
    await chart.morph({ source: ganttSource(FEED, date) }, { ops: edits });
    this.state.day = { date, running: tripsToday.map((t) => t.trip_id), edits: edits.length };

    // ------------------------------------------------------------------ route-trip
    const tripsByRoute = FEED.routes.map(
      (r) => [r.route_id!, FEED.trips.filter((t) => t.route_id === r.route_id).map((t) => t.trip_id!)] as const,
    );
    const ab1Row = FEED.trips.find((t) => t.trip_id === 'AB1')!;
    await this.step('route-trip', {
      title: 'A route has no times; its trips do',
      line: `Follow AB1: route ${route(ab1Row.route_id!).route_short_name}’s trip ${ab1Row.trip_headsign}, service_id ${ab1Row.service_id}.`,
      // reference.md:120 and :260.
      caption:
        'routes.txt gives a route its names, vehicle type, colours and web page, and nothing about when it runs. Each row of trips.txt names one route in route_id, so a route has zero or more trips, and names in service_id the timetable the trip follows. A route groups journeys that riders see as one service. It does not itself promise a dated departure. The diagram shows the feed’s tables and the ID columns that join them; the marks at a line’s ends say how many rows can match.',
    });
    await s.clear();
    const er = await s.show({ source: ER }, { box: LEFT });
    // The calendar the trip's service_id points to is in view too, whole, for the next step.
    await er.focus(['entity:ROUTE', 'entity:TRIP', 'entity:CALENDAR'], { zoom: ZOOM });
    await er.mark(['rel:ROUTE-TRIP#0']);
    // `ab1`: the trip the column follows, as trips.txt has it.
    this.state.tripsByRoute = Object.fromEntries(tripsByRoute);
    this.state.ab1 = { route_id: ab1Row.route_id, service_id: ab1Row.service_id };
    await column((st) => {
      const ab1 = st.ab1 as { route_id: string; service_id: string };
      return [
        { head: 'AB1 in trips.txt' },
        `route_id ${ab1.route_id}, service_id ${ab1.service_id}`,
        { head: 'Trips by route_id' },
        ...Object.entries(st.tripsByRoute as Record<string, string[]>).map(
          ([id, trips]) =>
            `Route ${route(id).route_short_name}: ${trips.length > 3 ? `${trips[0]} to ${trips.at(-1)}` : listed(trips)}`,
        ),
        { head: 'Line ends' },
        'Bar: one; circle: or none; crow’s foot: many',
      ];
    });

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
      title: `AB1 runs only on the dates its service, ${ab1Row.service_id}, runs`,
      line: `Predict: which rows of the two tables decide ${longDate(date)}?`,
      // reference.md:261, :356-357, :361, :363.
      caption: `A trip’s service_id must match a row of calendar.txt, of calendar_dates.txt, or both. calendar.txt supplies a weekday pattern within a date range; calendar_dates.txt adds or removes a particular date, overriding that pattern. The same service_id can be shared by several trips, so one exception can stop them together without deleting their route. ${ANSWER}: a route row promises nothing by itself. Here ${services
        .map((x) => `${x.id} (${x.trips} trips) is in ${where(x).replace(' only', ' alone')}`)
        .join(', and ')}.`,
    });
    await s.clearOverlays();
    await er.unmark();
    await er.focus(['entity:CALENDAR', 'entity:CALENDAR_DATE', 'entity:TRIP'], { zoom: ZOOM });
    await er.mark(['rel:CALENDAR-TRIP#0', 'rel:CALENDAR_DATE-TRIP#0'], { as: 'either table' });
    this.state.services = services;
    await column((st) => (st.services as typeof services).flatMap((x) => [{ head: `${x.id}, ${x.trips} trips` }, `In ${where(x)}`]));

    // ------------------------------------------------------------------ evaluate
    const today = servicesOn(FEED, date);
    const running = today.filter((x) => x.runs).map((x) => x.serviceId);
    const day = weekday(date);
    const removed = today.filter((x) => x.exception === 2);
    await this.step('evaluate', {
      title: running.length
        ? `On ${longDate(date)}, ${listed(running)} ${running.length > 1 ? 'run' : 'runs'}`
        : `On ${longDate(date)}, no service runs`,
      line: removed.length
        ? `An exception_type 2 row removes ${listed(removed.map((x) => x.serviceId))}, overriding the ${day} column.`
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
    this.state.today = today;
    // Each service's verdict for the date, and the trips that run: the date and trips are the day step's, still in the state.
    const verdicts = view(
      this,
      (st) => {
        const { date: on, running: trips } = st.day as { date: GtfsDate; running: string[] };
        return new Card(
          this,
          s.palette,
          [
            ...(st.today as ServiceDay[]).map((x) => [x.serviceId, verdict(x, on)] as [string, string]),
            ['Trips that run', `${trips.length} of ${FEED.trips.length}`],
          ],
          { at: [-7.55, -4.25, 7.55, -0.85], width: 10.5, fontSize: 0.28 },
        );
      },
      { place: false },
    );
    await s.enter(verdicts, { runTime: 0.35, shift: [0, -0.08] });

    // ------------------------------------------------------------------ week: the services' dates as a grid
    const grid = weekGrid(FEED, date);
    const col = grid.dates.indexOf(date);
    const empties = grid.dates.filter((_, i) => grid.trips[i] === 0);
    const pattern = (cells: readonly Cell[]) => {
      const days = grid.dates.filter((_, i) => cells[i] !== 'off').map((d) => upper(weekday(d)));
      return days.length === 7 ? 'every day' : days.length ? listed(days) : 'no day';
    };
    const removedCells = grid.services.flatMap((x) =>
      grid.dates.flatMap((d, i) => (x.cells[i] === 'removed' ? [{ serviceId: x.serviceId, date: d }] : [])),
    );
    const runningHere = grid.services.filter((x) => x.cells[col] === 'runs').map((x) => x.serviceId);
    const emptyWords = empties.length === 1 ? `${longDate(empties[0]!)} is the week’s one empty column` : empties.length ? `the week has ${number(empties.length)} empty columns` : 'no column of the week is empty';
    /** The week grid, drawn from the step's state alone: each service's cell per date, each date's trips, and the date asked about framed. */
    const weekPicture = (st: { week: WeekGrid; date: GtfsDate }, s: Stage) => {
      const { week: g, date: asked } = st;
      const at = g.dates.indexOf(asked);
      const GX0 = -5.6,
        CW = 13 / 7,
        CH = 0.75,
        TOP = 0.95;
      const SERVICE_COLORS = ['#0969da', '#8250df', '#1a7f37'];
      const rowY = (r: number) => TOP - r * (CH + 0.12) - CH / 2;
      const colX = (i: number) => GX0 + i * CW + CW / 2;
      const words = (t: string, opts: { color?: string; size?: number; bold?: boolean } = {}) =>
        new Text(t, { fontSize: opts.size ?? 0.28, color: opts.color ?? s.palette.ink, weight: opts.bold ? 'bold' : 'normal' });
      const cellOf = (r: number, i: number) => {
        const x = g.services[r]!,
          kind = x.cells[i]!,
          color = SERVICE_COLORS[r]!,
          where: [number, number] = [colX(i), rowY(r)];
        const frame = new Rectangle({
          width: CW - 0.14,
          height: CH,
          fill: kind === 'runs' ? color : 'none',
          stroke: kind === 'off' ? '#d0d7de' : color,
          strokeWidth: kind === 'removed' ? 0.04 : 0.02,
        }).moveTo(where);
        if (kind === 'removed') frame.style.dashArray = '0.12 0.08';
        const cell = new Group(frame);
        if (kind === 'runs') cell.add(words(x.serviceId, { color: s.palette.paper, bold: true }).moveTo(where));
        if (kind === 'removed')
          cell.add(words(x.serviceId, { color }).moveTo([where[0], where[1] + 0.16]), words('removed', { color }).moveTo([where[0], where[1] - 0.18]));
        cell.key = `gtfs-week:${x.serviceId}:${g.dates[i]}`;
        return cell;
      };
      const totalY = rowY(g.services.length) + 0.2;
      const dayColumn = (i: number) => {
        const d = g.dates[i]!;
        const column = new Group(
          words(upper(weekday(d)).slice(0, 3), { bold: i === at }).moveTo([colX(i), TOP + 0.72]),
          words(shortDate(d)).moveTo([colX(i), TOP + 0.3]),
          ...g.services.map((_, r) => cellOf(r, i)),
          words(String(g.trips[i]), { size: 0.34, bold: true }).moveTo([colX(i), totalY]),
        );
        column.key = i === at ? 'gtfs-week:day' : `gtfs-week:column:${d}`;
        return column;
      };
      const columns = g.dates.map((_, i) => dayColumn(i));
      // The date asked about, framed from its weekday down to its count.
      const frameTop = TOP + 0.92,
        frameBottom = totalY - 0.25;
      if (at >= 0)
        columns[at]!.add(
          new Rectangle({ width: CW, height: frameTop - frameBottom, fill: 'none', stroke: s.emphasis, strokeWidth: 0.05 }).moveTo([
            colX(at),
            (frameTop + frameBottom) / 2,
          ]),
        );
      const labelX = GX0 - 0.15;
      const rowLabels = new Group(
        ...g.services.map((x, r) =>
          new Group(
            words(x.serviceId, { bold: true, color: SERVICE_COLORS[r] }).moveTo([labelX, rowY(r) + 0.17], [1, 0]),
            words(`${x.trips} trips`).moveTo([labelX, rowY(r) - 0.19], [1, 0]),
          ),
        ),
        words('Trips', { bold: true }).moveTo([labelX, totalY], [1, 0]),
      );
      rowLabels.key = 'gtfs-week:rows';
      return new Group(rowLabels, ...columns);
    };
    // A staged step: the stage is cleared and the grid drawn from `week` and `date`, the date it frames.
    // A phone opens on the date asked about, with its neighbours either side as room allows.
    await s.steps([
      stagedStep({
        id: 'week',
      title:
        grid.trips[col] === 0 && empties.length === 1
          ? `${longDate(date)} is the week’s one empty column`
          : `${upper(weekday(date))} ${shortDate(date)} has ${runningHere.length === grid.services.length ? 'every service' : listed(runningHere)}; ${emptyWords.replace(/ is the week’s one empty column$/, ' is the empty one')}`,
      line: 'Filled: the service runs. Dashed: calendar_dates.txt removes it. Blank: not that weekday.',
      caption:
        `Each row is a service and each column a date, ${longDate(grid.dates[0]!)} to ${longDate(grid.dates[6]!)}; the number under a column counts the trips that run that day. ` +
        `${listed(grid.services.map((x) => `${x.serviceId}’s weekly pattern covers ${pattern(x.cells)}`))}. ` +
        (removedCells.length
          ? `${upper(number(removedCells.length))} calendar_dates.txt row${removedCells.length > 1 ? 's' : ''}, ${listed(removedCells.map((r) => `${r.serviceId},${r.date},2`))}, ${removedCells.length > 1 ? 'empty' : 'empties'} ${listed(removedCells.map((r) => `${r.serviceId}’s ${upper(weekday(r.date))} cell`))}. `
          : '') +
        (empties.length === 1
          ? `With no other service on that weekday, ${shortDate(empties[0]!)}’s column is empty: 0 trips. `
          : '') +
        'routes.txt and trips.txt are the same in each column; the service cells are what change.',
        state: { week: grid, date },
        draw: weekPicture,
        opening: ['gtfs-week:day'],
      }),
    ]);

    // ------------------------------------------------------------------ trip-stops
    const ab1 = stopTimesOf(FEED, 'AB1'),
      city1 = stopTimesOf(FEED, 'CITY1');
    const ab1First = ab1[0]!,
      ab1Last = ab1.at(-1)!;
    const city1Bands = bandsOf(FEED, 'CITY1'),
      stbaBands = bandsOf(FEED, 'STBA');
    await this.step('trip-stops', {
      title: 'What leaves a stop: rows of stop_times.txt',
      line: 'One row per stop a trip makes, in stop_sequence order.',
      // reference.md:121, :306, :309; frequencies :657, :664-667.
      caption: `Which of the running trips leave a given stop? stop_times.txt joins trips to stops: one row for each stop a trip makes, in stop_sequence order, with its times. AB1 leaves ${stopName(ab1First.stop_id!)} at ${clock(seconds(ab1First.departure_time!))} and reaches ${stopName(ab1Last.stop_id!)} at ${clock(seconds(ab1Last.arrival_time!))}. A trip listed in frequencies.txt instead repeats on a headway between the start and end times of its rows there.`,
    });
    await s.clear();
    const er2 = await s.show({ source: ER }, { box: LEFT });
    await er2.focus(['entity:TRIP', 'entity:STOP_TIME', 'entity:STOP', 'entity:FREQUENCY'], { zoom: ZOOM });
    await er2.mark(['rel:TRIP-STOP_TIME#0', 'rel:STOP-STOP_TIME#0']);
    // `bands`: the frequencies.txt rows of the two repeating trips, which the column gives as headways.
    this.state.stopTimes = {
      AB1: ab1.map((r) => [r.stop_id, r.arrival_time, r.departure_time]),
      CITY1: city1.length,
      frequencyRows: { STBA: stbaBands.length, CITY1: city1Bands.length },
      bands: { STBA: stbaBands, CITY1: city1Bands },
    };
    await column((st) => {
      const times = st.stopTimes as { AB1: [string, string, string][]; bands: Record<'STBA' | 'CITY1', Band[]> },
        [first, last] = [times.AB1[0]!, times.AB1.at(-1)!],
        { STBA: stba, CITY1: city } = times.bands;
      return [
        { head: 'AB1 in stop_times.txt' },
        `1: ${stopName(first[0])}, leaves ${clock(seconds(first[2]))}`,
        `2: ${stopName(last[0])}, arrives ${clock(seconds(last[1]))}`,
        { head: 'In frequencies.txt' },
        `STBA: ${headwayWords(stba)}, ${clock(stba[0]!.start)} to ${clock(stba.at(-1)!.end)}`,
        `CITY1: ${headwayWords(city)}, in ${city.length} periods`,
      ];
    });

    // ------------------------------------------------------------------ departures
    const at = stopDay(FEED, stopId, date);
    const name = stopName(stopId);
    const leaving = [...at.departures.map((d) => d.tripId), ...at.headways.map((h) => h.tripId)];
    const routeOf = (tripId: string) =>
      route(FEED.trips.find((t) => t.trip_id === tripId)!.route_id!).route_short_name!;
    const ending = at.ending.length
      ? ` ${listed(at.ending)} end${at.ending.length > 1 ? '' : 's'} here and ${at.ending.length > 1 ? 'do' : 'does'} not count.`
      : '';
    /** The routes whose trips stop at a stop, on any day. */
    const servedBy = (stop: string) =>
      FEED.routes
        .filter((r) =>
          FEED.trips.some((t) => t.route_id === r.route_id && stopTimesOf(FEED, t.trip_id!).some((x) => x.stop_id === stop)),
        )
        .map((r) => r.route_short_name!);
    // On a date an exception empties, show what calendar.txt alone would have sent from the stop.
    const usual = stopDay(FEED, stopId, date, { byCalendar: true });
    const removedBy = today.filter((x) => x.exception === 2).map((x) => x.serviceId);
    /**
     * The departures card, drawn from the step's state alone: what leaves the stop on the date, or on a date with
     * nothing, what calendar.txt alone would have sent from it, each marked removed.
     */
    const departuresPicture = (st: { departures: StopDay; usual: StopDay | null; date: GtfsDate }, s: Stage) => {
      const { departures: here, usual: byCalendar, date: on } = st;
      const going = here.departures.length + here.headways.length > 0,
        shown = byCalendar ?? here,
        stop = stopName(here.stopId);
      const note = going ? (x: string) => x : (x: string) => `${x}, removed`;
      const rows: [string, string][] = [
        ...shown.departures.map(
          (d) => [`${clock(d.time)}  ${d.tripId}, route ${routeOf(d.tripId)}`, note(d.headsign)] as [string, string],
        ),
        ...shown.headways.flatMap((h) =>
          h.bands.map(
            (b) => [`${h.tripId}  ${clock(b.start)} to ${clock(b.end)}`, note(headwayWords([b]))] as [string, string],
          ),
        ),
        ...(here.ending.length ? [['Ends here', listed(here.ending)] as [string, string]] : []),
      ];
      return new Card(
        this,
        s.palette,
        rows.length
          ? rows
          : [
              [stop, 'no departures'],
              ['Routes stopping here', `${listed(servedBy(here.stopId))}, on other days`],
            ],
        {
          at: [-7.55, -4.0, 7.55, 3.0],
          width: 11,
          fontSize: 0.3,
          title: going ? `Leaving ${stop}, ${shortDate(on)}` : `What calendar.txt alone would send, ${shortDate(on)}`,
        },
      );
    };
    // A staged step: the stage is cleared and the card drawn from the stop's day, the calendar-only day when that
    // is empty, and the date the card is titled with.
    await s.steps([
      stagedStep({
        id: 'departures',
      title: !leaving.length
        ? `Nothing leaves ${name} on ${shortDate(date)}`
        : at.headways.length && !at.departures.length
          ? `${upper(number(at.headways.length))} frequency trips leave ${name} on ${shortDate(date)}`
          : `${upper(number(at.departures.length))} departure${at.departures.length > 1 ? 's' : ''} from ${name} on ${shortDate(date)}`,
      line: !leaving.length
        ? removedBy.length
          ? 'The card shows what calendar.txt alone would have sent from here.'
          : 'No trip runs that day, so no stop_times row counts.'
        : at.headways.length
          ? 'Headways with exact_times empty: the card gives gaps, not times.'
          : 'Each is a stop_times row here that is not its trip’s last.',
      // frequencies: reference.md:657 ("operators attempt to strictly maintain predetermined headways"),
      // :665 (end_time: when "service changes to a different headway (or ceases)"), :667 (exact_times empty).
      caption: !leaving.length
        ? `A departure is a stop_times row at the stop that is not its trip’s last. On ${shortDate(date)} no trip runs, so no row counts.${
            removedBy.length
              ? ` The card lists what calendar.txt alone would have sent from ${name} on a ${upper(day)}, each marked removed.`
              : ''
          }`
        : at.headways.length
          ? `A departure is a stop_times row at the stop that is not its trip’s last. ${listed(at.headways.map((h) => h.tripId))} start here, on headways with exact_times empty: operators keep the gap, not a timetable. The reference does not say whether a vehicle leaves at end_time, so the card gives gaps.${ending}`
          : `A departure is a stop_times row at the stop that is not its trip’s last. On ${shortDate(date)} ${listed(at.departures.map((d) => `${d.tripId} leaves at ${clock(d.time)}`))}.${ending}`,
        state: { departures: at, usual: leaving.length ? null : usual, date },
        draw: departuresPicture,
      }),
    ]);
  }
}
