import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { SAMPLE_FEED } from './feed.ts';
import { readFeed, servicesOn, tripsOn, stopDay, ganttEdits, addDays, stopTimesOf, bandsOf, weekGrid } from './model.ts';

const STOPS: Record<string, string> = { airport: 'BEATTY_AIRPORT', stagecoach: 'STAGECOACH' };

/** Every scenario's step state equals the model's answers for its date and stop, over the vendored feed. */
export function check(trace: Trace, values: Record<string, string>): void {
  const feed = readFeed(SAMPLE_FEED);
  const date = values.date!.replace(/-/g, ''),
    before = addDays(date, -1),
    stop = STOPS[values.stop!];
  assert.ok(stop, `unknown stop ${values.stop}`);

  // The right column is a view of the state, so it also holds the trip it follows, AB1, as trips.txt has it.
  const ab1 = feed.trips.find((t) => t.trip_id === 'AB1')!;
  assertStepState(trace, 'route-trip', {
    tripsByRoute: Object.fromEntries(feed.routes.map((r) => [r.route_id, feed.trips.filter((t) => t.route_id === r.route_id).map((t) => t.trip_id)])),
    ab1: { route_id: ab1.route_id, service_id: ab1.service_id },
  });
  assertStepState(trace, 'trip-stops', {
    stopTimes: {
      AB1: stopTimesOf(feed, 'AB1').map((r) => [r.stop_id, r.arrival_time, r.departure_time]),
      CITY1: stopTimesOf(feed, 'CITY1').length,
      frequencyRows: { STBA: bandsOf(feed, 'STBA').length, CITY1: bandsOf(feed, 'CITY1').length },
      // The frequencies.txt rows the column gives as headways.
      bands: { STBA: bandsOf(feed, 'STBA'), CITY1: bandsOf(feed, 'CITY1') },
    },
  });
  assertStepState(trace, 'service', {
    services: ['FULLW', 'WE'].map((id) => ({
      id,
      trips: feed.trips.filter((t) => t.service_id === id).length,
      calendar: feed.calendar.some((r) => r.service_id === id),
      dates: feed.calendarDates.filter((r) => r.service_id === id).length,
    })),
  });
  assertStepState(trace, 'evaluate', { today: servicesOn(feed, date) });
  // The week grid: each service's cell per date and each date's trips.
  // A staged step drawn from its state alone: the grid, and the date it frames.
  assertStepState(trace, 'week', { week: weekGrid(feed, date), date });
  assertStepState(trace, 'day-before', { dayBefore: { date: before, running: tripsOn(feed, before).map((t) => t.trip_id) } });
  const running = tripsOn(feed, date);
  assertStepState(trace, 'day', { day: { date, running: running.map((t) => t.trip_id), edits: ganttEdits(feed, before, date).length } });
  const day = stopDay(feed, stop, date);
  const leaves = day.departures.length + day.headways.length > 0;
  // A staged step drawn from its state alone, so it also holds the date the card is titled with.
  assertStepState(trace, 'departures', { departures: day, usual: leaves ? null : stopDay(feed, stop, date, { byCalendar: true }), date });

  // The headings say the model's counts.
  const title = (step: string) => String(trace.steps.find((s) => s.step === step)!.meta.title);
  const n = feed.trips.length;
  assert.match(title('day'), running.length === n ? new RegExp(`all ${n} trips`) : running.length ? new RegExp(`${running.length} of the ${n}`) : /none of the/);
  assert.match(
    title('departures'),
    !leaves ? /^Nothing leaves/ : day.headways.length ? /frequency trips leave/ : new RegExp(['', 'One', 'Two', 'Three'][day.departures.length] + ' departure'),
  );
}
