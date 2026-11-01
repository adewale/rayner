import { Group } from '../../../../src/index.ts';
import { readFeed, servicesOn, tripsOn, stopDay, clock, shortDate } from '../gtfs.ts';
import { SAMPLE_FEED } from '../../gtfs/feed.ts';
import { flow, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(date: string, stopId: string): ReaderFrame[] {
  const feed = readFeed(SAMPLE_FEED),
    services = servicesOn(feed, date),
    trips = tripsOn(feed, date),
    stop = stopDay(feed, stopId, date),
    full = services.find((s) => s.serviceId === 'FULLW')!;
  return [
    {
      id: 'reader-date',
      title: 'Why is a route missing today?',
      line: `Google’s sample feed: ${shortDate(date)}.`,
      caption: `Trips refer to a service_id that decides whether they run on a date. FULLW’s calendar ${full.weekday ? 'allows' : 'excludes'} this weekday; ${full.exception === 2 ? 'a date exception removes the service' : full.exception === 1 ? 'a date exception adds the service' : 'there is no date exception'}. The result is ${full.runs ? 'service runs' : 'no service'}, even though the route remains in the feed.`,
      values: { date, service: full, trips: trips.length },
      draw: (s) =>
        new Group(
          flow(s, ['Route', 'Trip', 'Service date']),
          table(
            ['FULLW', 'Calendar', 'Exception', 'Final'],
            [
              [
                'decision',
                full.byCalendar ? 'yes' : 'no',
                full.exception === 2 ? 'remove' : full.exception === 1 ? 'add' : 'none',
                full.runs ? 'runs' : 'no service',
              ],
            ],
            s,
            { y: -0.7, gap: 1.3, xs: [-5.6, -1.8, 2.1, 5.7], size: 0.66 },
          ),
        ),
    },
    {
      id: 'reader-stop',
      title: 'What can leave this stop?',
      line: stopId === 'BEATTY_AIRPORT' ? 'Nye County Airport' : 'Stagecoach Hotel & Casino',
      caption: `The stop has ${stop.departures.length} fixed departure${stop.departures.length === 1 ? '' : 's'} and ${stop.headways.length} frequency-based trip pattern${stop.headways.length === 1 ? '' : 's'} on this date. Frequency rows specify intervals between trips, rather than exact departure times. A trip that ends here contributes no departure.`,
      values: { date, stopId, fixed: stop.departures.length, frequency: stop.headways.length },
      draw: (s) =>
        new Group(
          table(
            ['Departure type', 'Count'],
            [
              ['Fixed times', stop.departures.length],
              ['Headway patterns', stop.headways.length],
            ],
            s,
            { xs: [-3.5, 4.6], y: 2, gap: 1.5 },
          ),
          label(
            stop.departures[0]
              ? `First fixed departure: ${clock(stop.departures[0].time)}`
              : 'No fixed departure on this date',
            0,
            -3,
            s.palette.ink,
            0.65,
            'first-departure',
          ),
        ),
    },
  ];
}
