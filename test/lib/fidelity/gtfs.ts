import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { SAMPLE_FEED } from '../../../scenes/explainers/gtfs/feed.ts';
import { readFeed, servicesOn, tripsOn, stopDay, ganttEdits, addDays, stopTimesOf, bandsOf, weekGrid } from '../../../scenes/explainers/lib/gtfs.ts';

const STOPS: Record<string, string> = { airport: 'BEATTY_AIRPORT', stagecoach: 'STAGECOACH' };

/** Every scenario's step state equals the model's answers for its date and stop, over the vendored feed. */
export function check(trace: Trace, values: Record<string, string>): void {
  const feed = readFeed(SAMPLE_FEED);
  const date = values.date!.replace(/-/g, ''),
    before = addDays(date, -1),
    stop = STOPS[values.stop!];
  assert.ok(stop, `unknown stop ${values.stop}`);

  assertStepState(trace, 'route-trip', {
    tripsByRoute: Object.fromEntries(feed.routes.map((r) => [r.route_id, feed.trips.filter((t) => t.route_id === r.route_id).map((t) => t.trip_id)])),
  });
  assertStepState(trace, 'trip-stops', {
    stopTimes: {
      AB1: stopTimesOf(feed, 'AB1').map((r) => [r.stop_id, r.arrival_time, r.departure_time]),
      CITY1: stopTimesOf(feed, 'CITY1').length,
      frequencyRows: { STBA: bandsOf(feed, 'STBA').length, CITY1: bandsOf(feed, 'CITY1').length },
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
  assertStepState(trace, 'week', { week: weekGrid(feed, date) });
  assertStepState(trace, 'day-before', { dayBefore: { date: before, running: tripsOn(feed, before).map((t) => t.trip_id) } });
  const running = tripsOn(feed, date);
  assertStepState(trace, 'day', { day: { date, running: running.map((t) => t.trip_id), edits: ganttEdits(feed, before, date).length } });
  const day = stopDay(feed, stop, date);
  const leaves = day.departures.length + day.headways.length > 0;
  assertStepState(trace, 'departures', { departures: day, usual: leaves ? null : stopDay(feed, stop, date, { byCalendar: true }) });

  // The headings say the model's counts.
  const title = (step: string) => String(trace.steps.find((s) => s.step === step)!.meta.title);
  const n = feed.trips.length;
  assert.match(title('day'), running.length === n ? new RegExp(`all ${n} trips`) : running.length ? new RegExp(`${running.length} of the ${n}`) : /none of the/);
  assert.match(
    title('departures'),
    !leaves ? /^Nothing leaves/ : day.headways.length ? /frequency trips leave/ : new RegExp(['', 'One', 'Two', 'Three'][day.departures.length] + ' departure'),
  );
}
