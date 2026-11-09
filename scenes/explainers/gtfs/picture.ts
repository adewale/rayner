// How the gtfs explainer draws one state: the right column of words beside the ER diagram, the week
// grid of services by date, and the card of what leaves a stop. Each takes the state it draws and the
// stage colours, so the scene reads as its steps.
import { Text, Group, Rectangle, keyed } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { card } from '../../../explain/drawing.ts';
import { clock, headwayWords, shortDate, stopTimesOf, weekday } from './model.ts';
import type { Feed, GtfsDate, StopDay, WeekGrid } from './model.ts';
import { listed, upperFirst } from '../lib/format.ts';

/** The words' column: the right of the stage, beside the diagram on the left. */
const RIGHT: Box = [2.05, -4.25, 7.55, 3.05];
const SIZE = 0.26;

/** A stop's name without the feed's " (Demo)". */
export const stopNameIn = (feed: Feed, id: string) => feed.stops.find((s) => s.stop_id === id)!.stop_name!.replace(/ \(Demo\)$/, '');

/** Lines of text in the right column, wrapped to its width, from its top down; heads in bold. */
export function drawColumn(rows: readonly (string | { head: string })[], { ink, emphasis }: { ink: string; emphasis: string }): Group {
  const out: Text[] = [];
  let y = RIGHT[3] - SIZE * 0.6;
  for (const row of rows) {
    const head = typeof row !== 'string';
    let line = '';
    const flush = () => {
      out.push(
        new Text(line, {
          fontSize: SIZE,
          color: head ? emphasis : ink,
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
}

/** The week grid, drawn from the step's state alone: each service's cell per date, each date's trips, and the date asked about framed. */
export function drawWeek(st: { week: WeekGrid; date: GtfsDate }, s: Stage): Group {
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
    new Text(t, { fontSize: opts.size ?? 0.28, color: opts.color ?? s.look.ink, weight: opts.bold ? 'bold' : 'normal' });
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
    if (kind === 'runs') cell.add(words(x.serviceId, { color: s.look.paper, bold: true }).moveTo(where));
    if (kind === 'removed')
      cell.add(words(x.serviceId, { color }).moveTo([where[0], where[1] + 0.16]), words('removed', { color }).moveTo([where[0], where[1] - 0.18]));
    keyed(cell, `gtfs-week:${x.serviceId}:${g.dates[i]}`);
    return cell;
  };
  const totalY = rowY(g.services.length) + 0.2;
  const dayColumn = (i: number) => {
    const d = g.dates[i]!;
    const column = new Group(
      words(upperFirst(weekday(d)).slice(0, 3), { bold: i === at }).moveTo([colX(i), TOP + 0.72]),
      words(shortDate(d)).moveTo([colX(i), TOP + 0.3]),
      ...g.services.map((_, r) => cellOf(r, i)),
      words(String(g.trips[i]), { size: 0.34, bold: true }).moveTo([colX(i), totalY]),
    );
    keyed(column, i === at ? 'gtfs-week:day' : `gtfs-week:column:${d}`);
    return column;
  };
  const columns = g.dates.map((_, i) => dayColumn(i));
  // The date asked about, framed from its weekday down to its count.
  const frameTop = TOP + 0.92,
    frameBottom = totalY - 0.25;
  if (at >= 0)
    columns[at]!.add(
      new Rectangle({ width: CW, height: frameTop - frameBottom, fill: 'none', stroke: s.look.emphasis, strokeWidth: 0.05 }).moveTo([
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
  keyed(rowLabels, 'gtfs-week:rows');
  return new Group(rowLabels, ...columns);
}

/**
 * The departures card for `feed`, drawn from the step's state alone: what leaves the stop on the date, or on a date
 * with nothing, what calendar.txt alone would have sent from it, each marked removed. A frequency row spans the hours
 * vehicles leave the trip's first stop; it is not one vehicle travelling continuously.
 */
export function departuresPicture(feed: Feed) {
  const route = (id: string) => feed.routes.find((r) => r.route_id === id)!;
  const routeOf = (tripId: string) =>
    route(feed.trips.find((t) => t.trip_id === tripId)!.route_id!).route_short_name!;
  /** The routes whose trips stop at a stop, on any day. */
  const servedBy = (stop: string) =>
    feed.routes
      .filter((r) =>
        feed.trips.some((t) => t.route_id === r.route_id && stopTimesOf(feed, t.trip_id!).some((x) => x.stop_id === stop)),
      )
      .map((r) => r.route_short_name!);
  return (st: { departures: StopDay; usual: StopDay | null; date: GtfsDate }, s: Stage) => {
    const { departures: here, usual: byCalendar, date: on } = st;
    const going = here.departures.length + here.headways.length > 0,
      shown = byCalendar ?? here,
      stop = stopNameIn(feed, here.stopId);
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
    return card(
      s,
      rows.length
        ? rows
        : [
            [stop, 'no departures'],
            ['Routes stopping here', `${listed(servedBy(here.stopId))}, on other days`],
          ],
      {
        at: [-7.55, -4.0, 7.55, 3.0],
        width: 11,
        size: 0.3,
        title: going ? `Leaving ${stop}, ${shortDate(on)}` : `What calendar.txt alone would send, ${shortDate(on)}`,
      },
    );
  };
}
